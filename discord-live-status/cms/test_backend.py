import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

temporary = tempfile.TemporaryDirectory()
os.environ['CMS_DATA_DIR'] = temporary.name
spec = importlib.util.spec_from_file_location('cms', Path(__file__).with_name('server.py'))
cms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cms)

class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cms.initialize()
        cls.server = cms.ThreadingHTTPServer(('127.0.0.1', 0), cms.Handler)
        cms.PORT = cls.server.server_port
        cls.base = f'http://127.0.0.1:{cms.PORT}'
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        temporary.cleanup()

    def state(self):
        return json.load(urllib.request.urlopen(self.base + '/api/state'))

    def post(self, route, body, token=True, origin=None):
        headers={'Content-Type':'application/json','Origin':origin or self.base}
        if token: headers['X-CMS-Token']=cms.TOKEN
        request=urllib.request.Request(self.base+route,json.dumps(body).encode(),headers)
        return json.load(urllib.request.urlopen(request))

    def test_01_complete_initial_render(self):
        for page in cms.SEED['pages']:
            result=cms.render(cms.SEED,page)
            self.assertNotIn('@@FIELD_',result)
            self.assertNotIn('@@CMS_',result)
            self.assertNotIn('@@EXTRA_',result)
            self.assertIn('setLang',result)

    def test_02_draft_publish_restore_and_restart(self):
        state=self.state()
        content=state['content']
        key=next(k for k,v in content['pages']['setup']['fields'].items() if v['type']=='text')
        content['pages']['setup']['fields'][key]['value']='Database test <safe>'
        before=(cms.DATA/'published/CURRENT').read_text()
        saved=self.post('/api/save',{'revision':state['revision'],'content':content})
        self.assertEqual(before,(cms.DATA/'published/CURRENT').read_text())
        with self.assertRaises(urllib.error.HTTPError) as stale:
            self.post('/api/save',{'revision':state['revision'],'content':content})
        self.assertEqual(stale.exception.code,409)
        result=self.post('/api/publish',{'revision':saved['revision'],'content':content})
        current=(cms.DATA/'published/CURRENT').read_text()
        self.assertIn('Database test &lt;safe&gt;',(cms.DATA/'published'/current/'setup.html').read_text(encoding='utf-8'))
        cms.initialize()
        self.assertEqual(self.state()['content']['pages']['setup']['fields'][key]['value'],'Database test <safe>')
        restored=self.post('/api/restore',{'revision':result['revision'],'id':1})
        self.assertGreater(restored['revision'],result['revision'])
        self.assertTrue(list((cms.DATA/'backups').glob('*.sqlite3')))

    def test_03_write_protection(self):
        for options in ({'token':False},{'origin':'https://attacker.example'}):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.post('/api/save',{},**options)
            self.assertEqual(error.exception.code,403)
        request=urllib.request.Request(self.base+'/api/state',headers={'Host':'www.robfin.no'})
        with self.assertRaises(urllib.error.HTTPError) as error: urllib.request.urlopen(request)
        self.assertEqual(error.exception.code,403)

    def test_04_content_and_script_safety(self):
        content=copy.deepcopy(cms.SEED)
        key=next(k for k,v in content['pages']['home']['fields'].items() if v['type']=='url')
        content['pages']['home']['fields'][key]['value']='javascript:alert(1)'
        with self.assertRaises(ValueError): cms.validate(content)
        content=copy.deepcopy(cms.SEED)
        content['pages']['home']['positions'][0]['title']='</script><img src=x onerror=alert(1)>'
        result=cms.render(cms.validate(content),'home')
        self.assertNotIn('</script><img src=x',result)
        content['pages']['home']['positions'][0]['end']='2000-01-01'
        with self.assertRaises(ValueError): cms.validate(content)

    def test_05_uploads(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.post('/api/upload',{'data':'PHN2Zz48L3N2Zz4='})
        self.assertEqual(error.exception.code,400)

    def test_06_real_peer_address_is_required(self):
        handler=object.__new__(cms.Handler)
        handler.client_address=('203.0.113.10',12345)
        handler.headers={'Host':f'127.0.0.1:{cms.PORT}','X-Forwarded-For':'10.0.0.10'}
        with self.assertRaises(PermissionError): handler.check_access()
        handler.client_address=('10.0.0.109',12345)
        handler.check_access()

if __name__=='__main__': unittest.main(verbosity=2)
