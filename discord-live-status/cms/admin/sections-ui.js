/* Editors for real website content, rather than individual HTML text nodes. */
function translatedEditor(label,values,area=false){
 const primary=field(label,values.en||'',v=>values.en=v,area?'textarea':'text');
 const translations=element('details',{class:'translation-details'},element('summary',{},'Norwegian & Swedish translations'),element('div',{class:'field-grid'},['no','sv'].map(lang=>field(languages[lang],values[lang]||'',v=>values[lang]=v,area?'textarea':'text','Blank uses English for new collection entries.'))));
 return element('div',{class:'editor-field'},primary,translations);
}
function defaultTab(id){return id==='Hosting'?'tiers':'fields';}
function collectionHeading(description,label,add){return element('div',{class:'row-tools'},element('p',{class:'section-description'},description),element('button',{class:'primary',onclick:()=>{add();changed();render();}},label));}
function renderStructuredContent(page){
 const container=element('div',{}),schema=state.editor?.[pageId]||{fields:Object.keys(page.fields),translations:Object.keys(page.translations.en)};
 if(pageId==='setup'){
  const labels={f2:'Processor (CPU)',f3:'Motherboard',f4:'Memory (RAM)',f5:'Graphics card (GPU)',f6:'Storage',f7:'Power supply',f8:'Operating system'};
  const caseValues={};
  for(const lang of Object.keys(languages))Object.defineProperty(caseValues,lang,{enumerable:true,get:()=>page.translations[lang]['spec-case-val']||'',set:v=>page.translations[lang]['spec-case-val']=v});
  const specFields=Object.entries(labels).map(([id,label])=>field(label,page.fields[id].value,v=>page.fields[id].value=v));
  specFields.push(translatedEditor('Case',caseValues));
  container.append(panel('Current PC specifications',element('div',{class:'field-grid'},specFields)));
 }
 const groups=new Map();
 const excluded=pageId==='setup'?new Set(['spec-case-val','spec-cpu','spec-mobo','spec-ram','spec-gpu','spec-storage','spec-psu','spec-os','spec-case']):new Set();
 const names={page:'Page introduction',pricing:'Pricing calculator text',games:'Games section text',srv:'Hosting service',print:'3D printing service',cert:'Certificate details',certs:'Certifications heading',experience:'Experience heading',skills:'Skills section',skill:'Skills',values:'Values',val:'Values & explanations',issue:'Key issues & explanations',issues:'Key issues',lang:'Languages',section:'Section headings',setup:'PC setup link',footer:'Footer',twitch:'Twitch link card',github:'GitHub link card',discord:'Discord link card',honeygain:'Honeygain link card',contact:'Contact section',email:'Contact labels',payment:'Payments',panel:'Server control panel',norway:'Hosting location',support:'Support',billing:'Billing',how:'How printing works',step:'Printing process',safe:'Payment safety',rating:'Rating',cat:'Printing categories',location:'Location'};
 for(const key of schema.translations){
  if(excluded.has(key)||['back-btn','present','just-started'].includes(key)||key.startsWith('status-'))continue;
  const value=page.translations.en[key];if(!matches(key,value))continue;
  const group=names[key.split('-')[0]]||'Website text';if(!groups.has(group))groups.set(group,[]);
  const short=key.replace(/^(page|srv|print|pricing|games)-/,'');
  const label=({title:'Heading',subtitle:'Introduction',desc:'Description',btn:'Button text',li1:'Feature 1',li2:'Feature 2',li3:'Feature 3',note:'Additional note'})[short]||short.replace(/-/g,' ').replace(/^./,s=>s.toUpperCase());
  const values={};Object.keys(languages).forEach(lang=>Object.defineProperty(values,lang,{enumerable:true,get:()=>page.translations[lang][key]||'',set:v=>page.translations[lang][key]=v}));
  groups.get(group).push(translatedEditor(label,values,String(value).length>90));
 }
 for(const [title,rows]of groups)container.append(panel(title,element('div',{class:'field-grid'},rows)));
 const fields=[];const appearance=[];
 const namedFields={home:{f1:'Discord status caption',f2:'Profile display name',f9:'Certificate title',f10:'Certificate issuer / course details',f12:'Footer name',f13:'Profile picture',f16:'Certificate issuer logo',f17:'Certificate verification URL'},setup:{f25:'Footer name'},Hosting:{f22:'Contact email address',f24:'Discord username',f25:'Payment method 1',f26:'Payment method 1 country restriction',f27:'Payment method 2',f28:'Payment method 3',f29:'Payment method 3 country restriction',f31:'Footer name'},'3dprint':{f8:'Finn.no rating',f15:'Contact email address',f17:'Discord username',f20:'Footer name',f22:'Finn.no profile URL',f23:'Contact email link'}};
 for(const [id,spec]of Object.entries(page.fields)){
  if(!schema.fields.includes(id)||(pageId==='setup'&&/^f[2-8]$/.test(id)))continue;
  if(!matches(spec.label,spec.value))continue;
  const group=spec.label.split(' · ')[0].replace(/^[^\p{L}\p{N}]+/u,'');
  if(spec.type==='boolean'){appearance.push(checkbox('Show '+group,spec.value,v=>spec.value=v));continue;}
  if(spec.type==='url'&&spec.value==='/'){appearance.push(field('Back navigation URL',spec.value,v=>spec.value=v,'url'));continue;}
  if(!/[\p{L}\p{N}]/u.test(String(spec.value))||(pageId==='3dprint'&&['f2','f3','f4','f5'].includes(id))){appearance.push(field(group+' · Decoration',spec.value,v=>spec.value=v));continue;}
  const label=namedFields[pageId]?.[id]||(spec.type==='url'?group+' · Destination URL':spec.type==='image'?group+' · Image':spec.type==='percent'?group+' · Level (%)':group+' · Text');
  fields.push(field(label,spec.value,v=>spec.value=v,spec.type==='text'&&String(spec.value).length>90?'textarea':spec.type));
 }
 if(fields.length)container.append(panel('Other content, images & links',element('div',{class:'field-grid'},fields)));
 if(appearance.length)container.append(element('details',{class:'panel'},element('summary',{},'Appearance & section visibility'),element('div',{class:'field-grid'},appearance)));
 return container;
}
function renderUpgrades(page){
 const container=element('div',{});
 container.append(collectionHeading('Your future upgrades, in priority order. Numbering follows the list automatically. Each plan can have any number of product links.','+ Add upgrade plan',()=>page.upgrades.push({title:{en:'New upgrade',no:'',sv:''},description:{en:'',no:'',sv:''},price:'',links:[]})));
 page.upgrades.forEach((plan,index)=>{
  if(!matches(...Object.values(plan.title),...Object.values(plan.description)))return;
  const box=element('section',{class:'panel collection-card'},tools((index+1)+'. '+(plan.title.en||'New upgrade'),page.upgrades,index),element('div',{class:'field-grid'},translatedEditor('Plan title',plan.title),field('Estimated cost · optional',plan.price,v=>plan.price=v)),translatedEditor('What you plan to change',plan.description,true));
  box.append(element('h3',{},'Product links'));
  plan.links.forEach((link,linkIndex)=>box.append(element('div',{class:'link-editor'},field('Link label',link.label,v=>link.label=v),field('Product URL',link.url,v=>link.url=v,'url'),element('div',{class:'inline-tools'},element('button',{'aria-label':'Move link up',onclick:()=>move(plan.links,linkIndex,-1)},'↑'),element('button',{'aria-label':'Move link down',onclick:()=>move(plan.links,linkIndex,1)},'↓'),element('button',{class:'danger',onclick:()=>{plan.links.splice(linkIndex,1);changed();render();}},'Remove link')))));
  box.append(element('button',{onclick:()=>{plan.links.push({label:'View product',url:''});changed();render();}},'+ Add product link'));container.append(box);
 });
 if(!page.upgrades.length)container.append(element('div',{class:'empty'},'No future upgrades listed. Add a plan when you have one.'));
 return container;
}
function renderGames(page){
 const container=element('div',{});container.append(collectionHeading('Manage every game shown on the hosting page. Add, remove, reorder, and set availability.','+ Add game',()=>page.games.push({name:{en:'New game',no:'',sv:''},description:{en:'',no:'',sv:''},icon:'🎮',status:'available'})));
 page.games.forEach((game,index)=>{
  const status=element('select',{'aria-label':'Availability'},...Object.entries({available:'Available',soon:'Coming soon',unavailable:'Unavailable'}).map(([value,label])=>element('option',{value},label)));status.value=game.status;status.onchange=()=>{game.status=status.value;changed();};
  container.append(element('section',{class:'panel collection-card'},tools(game.name.en||'New game',page.games,index),element('div',{class:'field-grid'},translatedEditor('Game name',game.name),element('label',{},element('span',{},'Availability'),status)),translatedEditor('Supported editions / description',game.description,true),element('details',{},element('summary',{},'Game icon'),field('Icon',game.icon,v=>game.icon=v))));
 });return container;
}
function renderHostingTiers(page){
 const container=element('div',{});
 container.append(collectionHeading('Every slider position is a plan below. Prices and RAM update all languages together; player counts can be translated separately.','+ Add hosting tier',()=>{for(const lang of Object.keys(languages))page.tiers[lang].push({ram:'1 GB',price:'0',players:''});}));
 page.tiers.en.forEach((tier,index)=>{
  const moveTier=delta=>{const other=index+delta;if(other<0||other>=page.tiers.en.length)return;for(const lang of Object.keys(languages))[page.tiers[lang][index],page.tiers[lang][other]]=[page.tiers[lang][other],page.tiers[lang][index]];changed();render();};
  const heading=element('div',{class:'row-tools'},element('h2',{},'Tier '+(index+1)+' · '+tier.ram),element('div',{},element('button',{'aria-label':'Move tier up',onclick:()=>moveTier(-1)},'↑'),element('button',{'aria-label':'Move tier down',onclick:()=>moveTier(1)},'↓'),element('button',{class:'danger',onclick:()=>{if(page.tiers.en.length===1)return notice('Keep at least one hosting tier.',true);if(confirm('Remove this hosting tier?')){for(const lang of Object.keys(languages))page.tiers[lang].splice(index,1);changed();render();}}},'Remove')));
  const price=field('Monthly price (NOK)',tier.price.replace(',','.'),v=>{for(const lang of Object.keys(languages))page.tiers[lang][index].price=lang==='en'?v.replace(',','.'):v.replace('.',',');});
  price.querySelector('input').inputMode='decimal';
  const players=field('Player estimate',tier.players,v=>{const count=v.replace(/\s*(players|spillere|spelare)$/i,'');for(const lang of Object.keys(languages))page.tiers[lang][index].players=/^[\d\s–\-+]+$/.test(count)?count+' '+{en:'players',no:'spillere',sv:'spelare'}[lang]:v;});
  container.append(element('section',{class:'panel'},heading,element('div',{class:'tier-grid'},field('RAM size',tier.ram,v=>{for(const lang of Object.keys(languages))page.tiers[lang][index].ram=v;}),price,players),element('details',{class:'translation-details'},element('summary',{},'Translated player estimates'),element('div',{class:'field-grid'},['no','sv'].map(lang=>field(languages[lang],page.tiers[lang][index].players,v=>page.tiers[lang][index].players=v))))));
 });return container;
}
