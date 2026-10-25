"""Private LAN content editor. Standard-library HTTP + SQLite; no website passwords."""
import base64
import copy
from contextlib import closing
import datetime as dt
import html
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from sections import migrate, validate_sections, render_sections, editor_schema

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('CMS_DATA_DIR', str(Path.home() / '.local/share/robfin-cms'))).resolve()
BIND = os.environ.get('CMS_BIND', '127.0.0.1')
PORT = int(os.environ.get('CMS_PORT', '8765'))
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.RLock()
LANGS = ('en', 'no', 'sv')
SEED = json.loads((ROOT / 'seed/content.json').read_text(encoding='utf-8'))
MAX_BODY = 9 * 1024 * 1024

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')

class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try: return super().__exit__(*args)
        finally: self.close()

def connect():
    db = sqlite3.connect(DATA / 'content.sqlite3', timeout=15, factory=ClosingConnection)
    db.execute('PRAGMA foreign_keys=ON')
    return db

def dump(value):
    return json.dumps(value, ensure_ascii=False)

def safe_json(value):
    return dump(value).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

def text(value, limit=10000):
    if not isinstance(value, str) or len(value) > limit or '\x00' in value:
        raise ValueError('Text is missing or too long.')
    return value

def url(value):
    text(value, 2048)
    if value and (re.search(r'[\x00-\x20\\]', value) or not (re.match(r'^https?://[^/]+', value, re.I) or re.match(r'^/(?!/)', value) or re.match(r'^mailto:[^@]+@', value) or value.startswith('#'))):
        raise ValueError('Use an https:// link, a /local/path, mailto: address, or #anchor.')
    return value

def validate(doc):
    if not isinstance(doc, dict) or set(doc.get('pages', {})) != set(SEED['pages']):
        raise ValueError('Invalid website content.')
    doc = migrate(doc, SEED)
    clean = copy.deepcopy(SEED)
    for page_id, base in SEED['pages'].items():
        source = doc['pages'][page_id]
        target = clean['pages'][page_id]
        validate_sections(source, target, text, url)
        for field_id, spec in base['fields'].items():
            value = source['fields'][field_id]['value']
            if spec['type'] == 'boolean':
                if type(value) is not bool: raise ValueError('Visibility must be on or off.')
            elif spec['type'] == 'percent':
                if type(value) not in (int, float) or not 0 <= value <= 100: raise ValueError('Levels must be between 0 and 100.')
            elif spec['type'] in ('url', 'image'): url(value)
            else: text(value)
            target['fields'][field_id]['value'] = value
        for lang in LANGS:
            for key in base['translations'].get(lang, {}):
                target['translations'][lang][key] = text(source['translations'][lang].get(key, ''))
        if base['positions'] is not None:
            positions = source['positions']
            if not isinstance(positions, list) or len(positions) > 100: raise ValueError('Too many positions.')
            target['positions'] = []
            for p in positions:
                entry = {'title': text(p['title'], 500), 'start': text(p['start'], 10)}
                dt.date.fromisoformat(entry['start'])
                if p.get('end'):
                    entry['end'] = text(p['end'], 10)
                    if dt.date.fromisoformat(entry['end']) < dt.date.fromisoformat(entry['start']): raise ValueError('End date precedes start date.')
                for lang in ('no', 'sv'): entry[lang] = text(p.get(lang, ''), 500)
                target['positions'].append(entry)
        if base['tiers'] is not None:
            target['tiers'] = {}
            lengths = []
            for lang in LANGS:
                rows = source['tiers'][lang]
                if not isinstance(rows, list) or not 1 <= len(rows) <= 40: raise ValueError('Use between 1 and 40 hosting tiers.')
                target['tiers'][lang] = [{k: text(row[k], 120) for k in ('ram', 'price', 'players')} for row in rows]
                lengths.append(len(rows))
            if len(set(lengths)) != 1: raise ValueError('Each language needs the same number of hosting tiers.')
        cards = source.get('cards', [])
        if not isinstance(cards, list) or len(cards) > 100: raise ValueError('Too many cards.')
        target['cards'] = []
        for card in cards:
            if card.get('type') not in ('link', 'text', 'certificate'): raise ValueError('Unknown card type.')
            entry = {'type': card['type'], 'visible': card.get('visible', True) is True, 'url': url(card.get('url', '')), 'image': url(card.get('image', ''))}
            for key in ('title', 'description', 'button'):
                entry[key] = {lang: text(card.get(key, {}).get(lang, ''), 3000) for lang in LANGS}
            target['cards'].append(entry)
    return clean

def render(doc, page_id):
    page = migrate(doc, SEED)['pages'][page_id]
    template = (ROOT / 'templates' / (page_id + '.html')).read_text(encoding='utf-8')
    translations = page['translations']
    cards, certs = [], []
    for i, card in enumerate(page['cards']):
        if not card['visible']: continue
        def phrase(name):
            key = 'cms-card-' + str(i) + '-' + name
            for lang in LANGS: translations.setdefault(lang, {})[key] = card[name][lang] or card[name]['en']
            return ' data-i18n="' + key + '"'
        title = '<h2 class="text-xl font-semibold mb-2"' + phrase('title') + '>' + html.escape(card['title']['en']) + '</h2>'
        image = '<img loading="lazy" alt="" style="max-height:96px;max-width:100%;object-fit:contain;margin:0 auto 12px" src="' + html.escape(card['image'], quote=True) + '">' if card['image'] else ''
        description = '<p class="text-sm opacity-70 mb-4" style="white-space:pre-line"' + phrase('description') + '>' + html.escape(card['description']['en']) + '</p>'
        button = '<a class="link-btn text-sm" target="_blank" rel="noopener noreferrer" href="' + html.escape(card['url'], quote=True) + '"' + phrase('button') + '>' + html.escape(card['button']['en'] or 'View →') + '</a>' if card['url'] else ''
        if card['type'] == 'certificate' and page_id == 'home': certs.append('<li class="pb-4">' + image + title + description + button + '</li>')
        else: cards.append('<div class="glass-card p-6 md:p-8 text-center">' + image + title + description + button + '</div>')
    values = { 'EXTRA_CARDS': ''.join(cards), 'EXTRA_CERTIFICATES': ''.join(certs) }
    values.update(render_sections(page))
    for key, field in page['fields'].items():
        value = field['value']
        values['FIELD_' + key] = html.escape(str(value).lower() if type(value) is bool else str(value), quote=True)
    values['CMS_translations'] = safe_json(translations)
    positions = page['positions']
    if positions is not None:
        for entry in positions:
            for key in ('title', 'no', 'sv'):
                if key in entry: entry[key] = html.escape(entry[key], quote=True)
        values['CMS_positions'] = safe_json(positions)
        template = template.replace('${pos.title}', '${pos[currentLang] || pos.title}')
    values['CMS_tierData'] = safe_json(page['tiers'])
    template = re.sub(r'@@([A-Za-z0-9_]+)@@', lambda m: values.get(m[1], m[0]), template)
    if re.search(r'@@(?:FIELD_|CMS_|EXTRA_)[A-Za-z0-9_]*@@', template): raise ValueError('Template contains an unrecognized content field.')
    return template

def publish_files(doc, version):
    folder = DATA / 'published' / str(version)
    folder.mkdir(parents=True, exist_ok=True)
    for page_id in SEED['pages']:
        (folder / (page_id + '.html')).write_text(render(doc, page_id), encoding='utf-8')
    pointer = DATA / 'published/CURRENT.tmp'
    pointer.write_text(str(version), encoding='ascii')
    os.replace(pointer, DATA / 'published/CURRENT')

def backup(db):
    folder = DATA / 'backups'
    folder.mkdir(exist_ok=True)
    destination = folder / (dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(3) + '.sqlite3')
    with closing(sqlite3.connect(destination)) as target: db.backup(target)
    for old in sorted(folder.glob('*.sqlite3'))[:-30]: old.unlink()

def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    if os.name != 'nt': DATA.chmod(0o700)
    (DATA / 'uploads').mkdir(exist_ok=True)
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), draft TEXT NOT NULL, published TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created TEXT NOT NULL);')
        if not db.execute('SELECT id FROM state').fetchone():
            content = dump(validate(SEED))
            db.execute('INSERT INTO state VALUES (1,?,?,1,?)', (content, content, now()))
            db.execute('INSERT INTO history(content,created) VALUES (?,?)', (content, now()))
        else:
            backup(db)
            # Deploys add missing fields without overwriting content already edited in SQLite.
            for column in ('draft', 'published'):
                stored = json.loads(db.execute('SELECT ' + column + ' FROM state').fetchone()[0])
                for page_id, base in SEED['pages'].items():
                    p = stored['pages'].setdefault(page_id, copy.deepcopy(base))
                    for key, value in base['fields'].items(): p['fields'].setdefault(key, value)
                    for lang, entries in base['translations'].items():
                        for key, value in entries.items(): p['translations'].setdefault(lang, {}).setdefault(key, value)
                db.execute('UPDATE state SET ' + column + '=? WHERE id=1', (dump(validate(stored)),))
        row = db.execute('SELECT published,revision FROM state WHERE id=1').fetchone()
    publish_files(json.loads(row[0]), str(row[1]) + '-boot-' + secrets.token_hex(3))

class Handler(BaseHTTPRequestHandler):
    server_version = 'RobfinEditor'

    def log_message(self, fmt, *args):
        print(self.client_address[0], fmt % args, flush=True)

    def check_access(self, mutation=False):
        peer = ipaddress.ip_address(self.client_address[0])
        if not (peer.is_loopback or peer in ipaddress.ip_network('10.0.0.0/24')):
            raise PermissionError('Editor is restricted to 10.0.0.x.')
        host = self.headers.get('Host', '')
        allowed = {f'{BIND}:{PORT}', f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
        if host not in allowed: raise PermissionError('Invalid editor host.')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site': raise PermissionError('Cross-site requests are blocked.')
        if mutation:
            if self.headers.get('Origin') != 'http://' + host: raise PermissionError('A same-origin request is required.')
            if not secrets.compare_digest(self.headers.get('X-CMS-Token', ''), TOKEN): raise PermissionError('Refresh the editor and try again.')

    def send(self, status, body, kind='application/json; charset=utf-8', extra=None):
        if not isinstance(body, bytes): body = (dump(body) if kind.startswith('application/json') else body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        if kind.startswith('text/html') and not urlsplit(self.path).path.startswith('/preview/'):
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
        for key, value in (extra or {}).items(): self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            self.check_access()
            route = urlsplit(self.path).path
            if route == '/api/state':
                with connect() as db:
                    draft, published, revision, updated = db.execute('SELECT draft,published,revision,updated FROM state WHERE id=1').fetchone()
                    history = [{'id': i, 'created': t} for i,t in db.execute('SELECT id,created FROM history ORDER BY id DESC LIMIT 30')]
                return self.send(200, {'content': json.loads(draft), 'editor':editor_schema(ROOT,SEED), 'revision': revision, 'updated': updated, 'hasDraft': draft != published, 'token': TOKEN, 'history': history})
            if route == '/api/export':
                with connect() as db: data = db.execute('SELECT draft FROM state WHERE id=1').fetchone()[0]
                return self.send(200, data, 'application/octet-stream', {'Content-Disposition': 'attachment; filename="robfin-content.json"'})
            if route == '/api/backup':
                with LOCK, connect() as db:
                    backup(db)
                    with closing(sqlite3.connect(':memory:')) as snapshot:
                        db.backup(snapshot)
                        data = snapshot.serialize()
                return self.send(200, data, 'application/octet-stream', {'Content-Disposition': 'attachment; filename="robfin-content.sqlite3"'})
            if route.startswith('/preview/'):
                page_id = route.removeprefix('/preview/').strip('/') or 'home'
                if page_id not in SEED['pages']: return self.send(404, {'error': 'Unknown page'})
                with connect() as db: doc = json.loads(db.execute('SELECT draft FROM state WHERE id=1').fetchone()[0])
                result = render(doc, page_id)
                result = result.replace('<script src="/cms-client.js"></script>', '<script>' + (ROOT / 'public-client.js').read_text(encoding='utf-8') + '</script>')
                # Sandboxed preview has no admin-origin access or Discord connection.
                result = result.replace('<script src="/socket.io/socket.io.js"></script>', '<script>function io(){return {on:function(){}}}</script>')
                result = re.sub(r'(src|href)="/(?!/)', r'\1="https://www.robfin.no/', result)
                result = result.replace('url(\'/background.jpg\')', "url('https://www.robfin.no/background.jpg')").replace('url("/background.jpg")', 'url("https://www.robfin.no/background.jpg")')
                result = result.replace('<head>', '<head><base href="https://www.robfin.no/">', 1)
                return self.send(200, result, 'text/html; charset=utf-8')
            if route == '/preview-socket.js': return self.send(200, 'function io(){return {on:function(){}}}', 'text/javascript')
            files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js','text/javascript'), '/sections-ui.js': ('sections-ui.js','text/javascript'), '/style.css': ('style.css','text/css')}
            if route in files:
                name, kind = files[route]
                return self.send(200, (ROOT / 'admin' / name).read_bytes(), kind + '; charset=utf-8')
            return self.send(404, {'error': 'Not found'})
        except PermissionError as e: self.send(403, {'error': str(e)})
        except Exception as e:
            print('GET failed:', type(e).__name__, flush=True)
            self.send(500, {'error': 'Editor could not read content.'})

    def do_POST(self):
        try:
            self.check_access(mutation=True)
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_BODY: raise ValueError('Request is empty or too large.')
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json': raise ValueError('JSON required.')
            body = json.loads(self.rfile.read(size))
            route = urlsplit(self.path).path
            with LOCK, connect() as db:
                if route == '/api/upload':
                    data = base64.b64decode(body.get('data', ''), validate=True)
                    if len(data) > 5*1024*1024: raise ValueError('Images must be 5 MB or smaller.')
                    ext = 'png' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'jpg' if data.startswith(b'\xff\xd8\xff') else 'webp' if data[:4] == b'RIFF' and data[8:12] == b'WEBP' else None
                    if not ext: raise ValueError('Upload PNG, JPEG, or WebP images only.')
                    filename = secrets.token_hex(16) + '.' + ext
                    (DATA / 'uploads' / filename).write_bytes(data)
                    return self.send(200, {'url': '/cms-media/' + filename})
                row = db.execute('SELECT revision,published FROM state WHERE id=1').fetchone()
                if body.get('revision') != row[0]: return self.send(409, {'error': 'Content changed in another window. Reload before saving.'})
                if route == '/api/restore':
                    record = db.execute('SELECT content FROM history WHERE id=?', (body.get('id'),)).fetchone()
                    if not record: raise ValueError('That version no longer exists.')
                    document = validate(json.loads(record[0]))
                elif route == '/api/discard': document = validate(json.loads(row[1]))
                elif route in ('/api/save', '/api/publish'): document = validate(body['content'])
                else: return self.send(404, {'error': 'Not found'})
                # Render all pages before writing so malformed templates never become live.
                for page_id in SEED['pages']: render(document, page_id)
                backup(db)
                revision = row[0] + 1
                payload = dump(document)
                if route == '/api/publish':
                    publish_files(document, str(revision) + '-' + secrets.token_hex(3))
                    db.execute('UPDATE state SET draft=?,published=?,revision=?,updated=? WHERE id=1', (payload,payload,revision,now()))
                    db.execute('INSERT INTO history(content,created) VALUES (?,?)', (payload,now()))
                else: db.execute('UPDATE state SET draft=?,revision=?,updated=? WHERE id=1', (payload,revision,now()))
            return self.send(200, {'revision': revision, 'message': 'Published to the live website.' if route == '/api/publish' else 'Draft saved.'})
        except PermissionError as e: self.send(403, {'error': str(e)})
        except (ValueError, KeyError, TypeError) as e: self.send(400, {'error': str(e)})
        except Exception as e:
            print('POST failed:', type(e).__name__, flush=True)
            self.send(500, {'error': 'Save failed. Your existing published content is preserved.'})

if __name__ == '__main__':
    initialize()
    print(f'Private editor: http://{BIND}:{PORT}; database: {DATA / "content.sqlite3"}', flush=True)
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
