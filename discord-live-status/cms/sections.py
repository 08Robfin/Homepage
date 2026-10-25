"""Structured collections and lossless migration from the original field editor."""
import copy
import html
import re
from html.parser import HTMLParser

LANGS = ('en', 'no', 'sv')

def migrate(document, seed):
    doc = copy.deepcopy(document)
    p = doc['pages']['setup']
    value = lambda key: p['fields'][key]['value']
    if 'upgrades' not in p:
        p['upgrades'] = []
        for title, price, description, links in [
            ('step2-name','f10','f11',[('f12','f27')]),
            ('step3-name','f14','f15',[('f16','f28'),('f17','f29'),('f18','f30'),('f19','f31')]),
            ('step5-name','f21','f22',[('f23','f32')]),
        ]:
            p['upgrades'].append({'title':{lang:p['translations'][lang].get(title,'') for lang in LANGS},
                'price':str(value(price)), 'description':{lang:str(value(description)) if lang=='en' else '' for lang in LANGS},
                'links':[{'label':str(value(label)), 'url':value(url)} for label,url in links]})
    p = doc['pages']['Hosting']
    if 'games' not in p:
        # Honor edits made through the old, misleading initial-display controls
        # when the corresponding real tier was never edited.
        defaults=seed['pages']['Hosting']
        for old_key,tier_key in [('f9','price'),('f12','players')]:
            legacy=str(p['fields'][old_key]['value'])
            if legacy!=str(defaults['fields'][old_key]['value']) and p['tiers']['en'][0][tier_key]==defaults['tiers']['en'][0][tier_key]:
                for lang in LANGS:
                    p['tiers'][lang][0][tier_key]=legacy.replace('.',',') if tier_key=='price' and lang!='en' else legacy
        p['games'] = [
            {'name':{lang:str(p['fields']['f14']['value']) for lang in LANGS},'icon':str(p['fields']['f13']['value']),
             'description':{lang:p['translations'][lang].get('minecraft-desc','') for lang in LANGS},'status':'available'},
            {'name':{lang:p['translations'][lang].get('more-games-title','') for lang in LANGS},'icon':str(p['fields']['f15']['value']),
             'description':{lang:p['translations'][lang].get('more-games-desc','') for lang in LANGS},'status':'soon'},
        ]
    # The calculator no longer assumes every tier has the same per-GB rate.
    for lang, replacement in {'en':'Choose a RAM size to see its monthly price.','no':'Velg RAM-størrelse for å se månedsprisen.','sv':'Välj RAM-storlek för att se månadspriset.'}.items():
        if p['translations'][lang].get('pricing-subtitle') == seed['pages']['Hosting']['translations'][lang].get('pricing-subtitle'):
            p['translations'][lang]['pricing-subtitle'] = replacement
    return doc

def validate_sections(source, target, text, url):
    def localized(values):
        if not isinstance(values,dict): raise ValueError('Translated text must contain language fields.')
        return {lang:text(values.get(lang,''),3000) for lang in LANGS}
    if 'upgrades' in source:
        rows=source['upgrades']
        if not isinstance(rows,list) or len(rows)>100: raise ValueError('Use at most 100 upgrade plans.')
        target['upgrades']=[]
        for row in rows:
            links=row.get('links',[])
            if not isinstance(links,list) or len(links)>100: raise ValueError('Use at most 100 links per upgrade plan.')
            target['upgrades'].append({'title':localized(row['title']),'description':localized(row['description']),
                'price':text(row.get('price',''),120), 'links':[{'label':text(link.get('label',''),200),'url':url(link.get('url',''))} for link in links]})
    if 'games' in source:
        rows=source['games']
        if not isinstance(rows,list) or len(rows)>100: raise ValueError('Use at most 100 games.')
        target['games']=[]
        for row in rows:
            if row.get('status') not in ('available','soon','unavailable'): raise ValueError('Choose a valid game status.')
            target['games'].append({'name':localized(row['name']),'description':localized(row['description']),
                'icon':text(row.get('icon','🎮'),40),'status':row['status']})

def render_sections(page):
    translations=page['translations']
    def translated(tag,classes,key,values):
        for lang in LANGS: translations[lang][key]=values.get(lang) or values.get('en','')
        return f'<{tag} class="{classes}" data-i18n="{key}">{html.escape(values.get("en",""))}</{tag}>'
    result={}
    if 'upgrades' in page:
        plans=[]
        for index,row in enumerate(page['upgrades']):
            title=translated('p','font-semibold text-sm',f'upgrade-{index}-title',row['title'])
            description=translated('p','text-xs opacity-55 mb-2',f'upgrade-{index}-description',row['description'])
            price=f'<span class="price-tag">{html.escape(row["price"])}</span>' if row['price'] else ''
            links=''.join(f'<a href="{html.escape(link["url"],quote=True)}" target="_blank" rel="noopener noreferrer" class="shop-link">{html.escape(link["label"] or "View →")}</a>' for link in row['links'] if link['url'])
            plans.append(f'<div class="step-row"><div class="step-num">{index+1}</div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2 mb-1">{title}{price}</div>{description}<div class="flex flex-wrap gap-1">{links}</div></div></div>')
        result['UPGRADE_PLANS']=''.join(plans)
    if 'games' in page:
        games=[]
        labels={'available':{'en':'Available','no':'Tilgjengelig','sv':'Tillgänglig'},'soon':{'en':'Coming soon','no':'Kommer snart','sv':'Kommer snart'},'unavailable':{'en':'Unavailable','no':'Utilgjengelig','sv':'Ej tillgänglig'}}
        for index,row in enumerate(page['games']):
            title=translated('p','font-semibold text-base leading-snug',f'game-{index}-name',row['name'])
            description=translated('p','text-xs opacity-60 mt-0.5',f'game-{index}-description',row['description'])
            status_values={lang:translations[lang].get('status-'+row['status'],labels[row['status']][lang]) for lang in LANGS}
            status=translated('span','text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0',f'game-{index}-status',status_values)
            games.append(f'<div class="game-card" data-game-status="{row["status"]}"><div class="text-3xl flex-shrink-0">{html.escape(row["icon"])}</div><div class="flex-1 min-w-0">{title}{description}</div>{status}</div>')
        result['HOSTING_GAMES']=''.join(games)
    if page.get('tiers'):
        result['HOSTING_LABELS']=''.join('<span>'+html.escape(row['ram'])+'</span>' for row in page['tiers']['en'])
        first=page['tiers']['en'][0]
        result.update({'HOSTING_PRICE':html.escape(first['price']),'HOSTING_RAM':html.escape(first['ram']+' RAM'),'HOSTING_PLAYERS':html.escape(first['players'])})
    return result

class VisibleFields(HTMLParser):
    def __init__(self):
        super().__init__();self.ignore=0;self.fields=set();self.translations=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.ignore+=1
        if self.ignore:return
        for key,value in attrs:
            self.fields.update(re.findall(r'@@FIELD_(\w+)@@',value or ''))
            if key=='data-i18n' and value not in self.translations:self.translations.append(value)
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.ignore=max(0,self.ignore-1)
    def handle_data(self,data):
        if not self.ignore:self.fields.update(re.findall(r'@@FIELD_(\w+)@@',data))

def editor_schema(root,seed):
    result={}
    for page in seed['pages']:
        template=(root/'templates'/(page+'.html')).read_text(encoding='utf-8')
        parser=VisibleFields();parser.feed(template)
        for _,key in re.findall(r't\[([\'"])([^\'"]+)\1\]',template):
            if key in seed['pages'][page]['translations']['en'] and key not in parser.translations:parser.translations.append(key)
        if page=='Hosting':parser.translations.extend(['status-available','status-soon'])
        result[page]={'fields':sorted(parser.fields),'translations':parser.translations}
    return result
