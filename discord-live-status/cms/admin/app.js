'use strict';
let state, pageId='home',tab='fields',dirty=false,query='',busy=false;
const $=s=>document.querySelector(s),languages={en:'English',no:'Norsk',sv:'Svenska'};
function element(tag,attrs={},...children){const node=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k.startsWith('on'))node.addEventListener(k.slice(2),v);else if(k==='class')node.className=v;else if(k==='text')node.textContent=v;else if(k==='checked')node.checked=v;else node.setAttribute(k,v);}for(const c of children.flat()){if(c!=null)node.append(c instanceof Node?c:document.createTextNode(String(c)));}return node;}
function notice(message,error=false){$('#notice').hidden=false;$('#notice').textContent=message;$('#notice').classList.toggle('error',error);}
function changed(){dirty=true;$('#status').textContent='● Unsaved changes';}
function field(label,value,update,type='text',help=''){
 const input=element(type==='textarea'?'textarea':'input',type==='textarea'?{}:{type:type==='percent'?'number':type==='url'||type==='image'?'text':type});input.value=value??'';
 if(type==='percent'){input.min=0;input.max=100;}
 input.addEventListener('input',()=>{update(type==='percent'?Number(input.value):input.value);changed();});
 const wrap=element('label',{},element('span',{},label),input,help?element('small',{},help):null);
 if(type==='image'){
  const file=element('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Upload image'});
  file.addEventListener('change',async()=>{if(!file.files[0])return;try{if(file.files[0].size>5*1024*1024)throw Error('Choose an image smaller than 5 MB.');const bytes=new Uint8Array(await file.files[0].arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=await request('/api/upload',{data:btoa(raw)});input.value=result.url;update(result.url);changed();notice('Image uploaded. Save or publish to use it.');}catch(e){notice(e.message,true);}});
  wrap.append(element('div',{class:'upload'},file,element('small',{},'PNG / JPEG / WebP · up to 5 MB')));
 }
 return wrap;
}
function checkbox(label,value,update){const input=element('input',{type:'checkbox',checked:!!value});input.addEventListener('change',()=>{update(input.checked);changed();});return element('label',{class:'check'},input,element('span',{},label));}
function languageFields(title,values,update,area=false){return element('div',{class:'language-grid'},Object.entries(languages).map(([lang,name])=>field(title+' · '+name,values[lang]||'',v=>update(lang,v),area?'textarea':'text',lang!=='en'&&!values[lang]?'Leave blank to use English':'')));}
function panel(title,...children){return element('section',{class:'panel'},element('h2',{},title),...children);}
function tools(title,array,index){return element('div',{class:'row-tools'},element('h3',{},title),element('div',{},element('button',{onclick:()=>move(array,index,-1)},'↑'),element('button',{onclick:()=>move(array,index,1)},'↓'),element('button',{class:'danger',onclick:()=>{if(confirm('Remove this entry from the draft?')){array.splice(index,1);changed();render();}}},'Remove')));}
function move(array,index,delta){const target=index+delta;if(target<0||target>=array.length)return;[array[index],array[target]]=[array[target],array[index]];changed();render();}
function matches(...values){return !query||values.some(v=>String(v).toLowerCase().includes(query));}
function render(){
 const page=state.content.pages[pageId];$('#page-title').textContent=page.title;$('#pages').replaceChildren(...Object.entries(state.content.pages).map(([id,p])=>element('button',{class:id===pageId?'active':'',onclick:()=>{pageId=id;tab=defaultTab(id);query='';$('#search').value='';render();}},p.title)));
 const tabs=[...(page.tiers?[['tiers','Hosting tiers']]:[]),['fields',pageId==='setup'?'PC specs & page text':'Page content'],...(page.upgrades?[['upgrades','Upgrade plans']]:[]),...(page.games?[['games','Available games']]:[]),...(page.positions?[['positions','Experience']]:[]),['cards','New cards'],['translations','All translations'],['history','Version history']];
 $('#tabs').replaceChildren(...tabs.map(([id,label])=>element('button',{class:id===tab?'active':'',onclick:()=>{tab=id;render();}},label)));
 const content=$('#content');content.replaceChildren();
 if(tab==='fields')content.append(renderStructuredContent(page));
 if(tab==='upgrades')content.append(renderUpgrades(page));
 if(tab==='games')content.append(renderGames(page));
 if(tab==='translations'){
  const rows=[];for(const key of (state.editor?.[pageId]?.translations||Object.keys(page.translations.en||{}))){const values=Object.fromEntries(Object.keys(languages).map(lang=>[lang,page.translations[lang]?.[key]||'']));if(!matches(key,...Object.values(values)))continue;rows.push(element('div',{class:'translation'},element('h3',{},values.en.slice(0,100)||key),languageFields('Text',values,(lang,v)=>{page.translations[lang][key]=v;},true),element('small',{class:'muted'},key)));}
  content.append(panel('Three languages, one place',element('p',{class:'help'},'Edit each translation directly. Existing page translations are independent; new cards and experience titles fall back to English.'),...rows));
 }
 if(tab==='positions'){
  content.append(element('div',{class:'row-tools'},element('p',{class:'section-description'},'Keep your roles and dates up to date. Leave the end date empty for a current role.'),element('button',{class:'primary',onclick:()=>{page.positions.push({title:'New role',no:'',sv:'',start:new Date().toISOString().slice(0,10),end:''});changed();render();}},'+ Add experience')));
  page.positions.forEach((p,i)=>{if(!matches(p.title,p.no,p.sv))return;content.append(element('section',{class:'panel'},tools(p.title||'New role',page.positions,i),languageFields('Role',{en:p.title,no:p.no,sv:p.sv},(lang,v)=>p[lang==='en'?'title':lang]=v),element('div',{class:'field-grid'},field('Start date',p.start,v=>p.start=v,'date'),field('End date · optional',p.end,v=>p.end=v,'date'))));});
 }
 if(tab==='tiers')content.append(renderHostingTiers(page));
 if(tab==='cards'){
  const picker=element('select',{'aria-label':'New card type'},element('option',{value:'link'},'Link card'),element('option',{value:'text'},'Text card'),...(pageId==='home'?[element('option',{value:'certificate'},'Certificate')]:[]));
  content.append(element('div',{class:'row-tools'},element('p',{class:'section-description'},'Add reusable cards without editing HTML. Certificates appear in Certifications; other cards appear above the footer.'),element('div',{},picker,element('button',{class:'primary',onclick:()=>{page.cards.push({type:picker.value,visible:true,url:'',image:'',title:{en:'New '+picker.value,no:'',sv:''},description:{en:'',no:'',sv:''},button:{en:'View →',no:'Se →',sv:'Visa →'}});changed();render();}},'+ Add card'))));
  page.cards.forEach((card,i)=>{if(!matches(...Object.values(card.title),...Object.values(card.description)))return;content.append(element('section',{class:'panel'},tools(card.title.en||'New card',page.cards,i),checkbox('Show on website',card.visible,v=>card.visible=v),element('p',{class:'badge'},card.type),languageFields('Title',card.title,(lang,v)=>card.title[lang]=v),languageFields('Description',card.description,(lang,v)=>card.description[lang]=v,true),element('div',{class:'field-grid'},field('Destination / verification link',card.url,v=>card.url=v,'url'),field('Image',card.image,v=>card.image=v,'image')),languageFields('Button text',card.button,(lang,v)=>card.button[lang]=v)));});
  if(!page.cards.length)content.append(element('div',{class:'empty'},'Your new cards will appear here. Existing cards can be edited in Page content and Translations.'));
 }
 if(tab==='history'){
  content.append(panel('Published versions',element('p',{class:'help'},'Restore a published version into your draft, preview it, then publish when ready. Download database backups from the sidebar.'),...state.history.map(h=>element('div',{class:'row-tools'},element('span',{},new Date(h.created).toLocaleString()),element('button',{onclick:async()=>{if(confirm('Replace your current draft with this published version?'))await perform('/api/restore',{id:h.id});}},'Restore to draft'))),element('button',{class:'danger',onclick:async()=>{if(confirm('Discard all draft changes and restore the currently published content?'))await perform('/api/discard',{});}},'Discard draft changes')));
 }
}
async function request(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CMS-Token':state.token},body:JSON.stringify({...body,revision:state.revision})});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');return result;}
async function load(){const response=await fetch('/api/state');if(!response.ok)throw Error('Could not load the editor. Connect from your 10.0.0.x network.');state=await response.json();dirty=false;$('#status').textContent=state.hasDraft?'● Draft saved':'● Published';render();}
async function perform(path,body){if(busy)return false;busy=true;document.querySelectorAll('.actions button').forEach(b=>b.disabled=true);try{const result=await request(path,body);await load();notice(result.message);return true;}catch(e){notice(e.message,true);return false;}finally{busy=false;document.querySelectorAll('.actions button').forEach(b=>b.disabled=false);}}
$('#save').onclick=()=>perform('/api/save',{content:state.content});
$('#publish').onclick=()=>{if(confirm('Publish these changes to www.robfin.no now?'))perform('/api/publish',{content:state.content});};
$('#preview').onclick=async()=>{if(dirty&&!(await perform('/api/save',{content:state.content})))return;$('#preview-frame').src='/preview/'+pageId+'?t='+Date.now();$('#preview-dialog').showModal();};
$('#close-preview').onclick=()=>{$('#preview-dialog').close();$('#preview-frame').src='about:blank';};
$('#search').oninput=e=>{query=e.target.value.toLowerCase();render();};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
load().catch(error=>notice(error.message,true));
