import {parseDocument,isMap} from 'yaml';
import {splitFrontmatter} from './editor';
export const escapeHTML=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function propertyDocument(content:string){
 const {front}=splitFrontmatter(content);
 if(!front&&/^---\r?\n/.test(content))throw Error('The properties have no closing delimiter. Use Markdown source to repair them.');
 const doc=parseDocument(front?front.replace(/^---\r?\n/,'').replace(/(?:^|\r?\n)---(?:\r?\n)?$/,''):'{}',{intAsBigInt:true});
 if(!doc.contents&&!doc.errors.length)doc.contents=parseDocument('{}').contents;
 if(doc.errors.length||!isMap(doc.contents))throw Error('The properties must contain unique names and valid YAML. Use Markdown source to repair them.');
 return doc;
}
export function propertyValues(content:string):Record<string,unknown>{return propertyDocument(content).toJS({maxAliasCount:20})}
const text=(v:unknown)=>typeof v==='number'&&!Number.isFinite(v)?Number.isNaN(v)?'.nan':v>0?'.inf':'-.inf':String(v??'');
function propertyValue(value:unknown,depth=0):string{
 if(depth>8)return '<span>Open Markdown source to view this value.</span>';
 if(Array.isArray(value))return '<ul class="property-list">'+value.map(v=>'<li>'+propertyValue(v,depth+1)+'</li>').join('')+'</ul>';
 if(value&&typeof value==='object')return '<dl class="property-nested">'+Object.entries(value).map(([k,v])=>'<dt>'+escapeHTML(k)+'</dt><dd>'+propertyValue(v,depth+1)+'</dd>').join('')+'</dl>';
 if(typeof value==='boolean')return `<input type="checkbox" disabled aria-label="${value?'True':'False'}" ${value?'checked':''}>`;
 if(value===null)return '<span class="property-empty">Empty</span>';
 const str=text(value);
 const wiki=str.match(/^\[\[([^\]]+)\]\]$/);
 if(wiki){const [target,label]=wiki[1].split('|');return `<a href="#" data-wiki="${escapeHTML(target)}">${escapeHTML(label||target)}</a>`;}
 if(/^https?:\/\//i.test(str))return `<a href="${escapeHTML(str)}" rel="noopener noreferrer">${escapeHTML(str)}</a>`;
 return escapeHTML(str);
}
export function propertiesHTML(content:string){
 const {front}=splitFrontmatter(content);
 try{
  const data=propertyValues(content);const historical=/^> Historical (?:project |shared )?memory\b/m.test(content);
  const rows=Object.entries(data).map(([key,value])=>{
   const nested=key==='metadata'&&value&&typeof value==='object'&&!Array.isArray(value);
   const label=nested&&historical?'Imported source properties':key;
   return `<dt>${escapeHTML(label)}</dt><dd>${nested&&historical?'<p class="property-help">Original source values. These can differ from current properties.</p>':''}${propertyValue(value)}<button type="button" class="property-edit" data-property-edit="${escapeHTML(key)}" aria-label="Edit ${escapeHTML(label)}">Edit</button></dd>`;
  }).join('');
  return `<details class="properties"><summary>Properties</summary><dl>${rows}</dl><button type="button" data-property-add>Add property</button></details>`;
 }catch{return `<details class="properties"><summary>Properties: check the Markdown source</summary><pre>${escapeHTML(front)}</pre></details>`;}
}
export type PropertyType='text'|'list'|'number'|'checkbox'|'date'|'datetime'|'yaml';
export function setProperty(content:string,key:string,type:PropertyType,value:string,remove=false){
 if(!key.trim())throw Error('Enter a property name.');
 const {body,front}=splitFrontmatter(content),doc=propertyDocument(content);
 let result:unknown=value;
 if(type==='checkbox')result=value==='true';
 if(type==='list')result=value.split('\n').filter(v=>v.trim().length);
 if(type==='number'){
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))throw Error('Enter a number.');
  const node=parseDocument(value,{intAsBigInt:true});if(node.errors.length)throw Error('Enter a number.');result=node.contents;
 }
 if(type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('Enter a date in YYYY-MM-DD format.');
 if(type==='datetime'&&Number.isNaN(Date.parse(value)))throw Error('Enter a date and time.');
 if(type==='yaml'){
  const parsed=parseDocument(value,{intAsBigInt:true});if(parsed.errors.length)throw Error('Enter valid YAML.');parsed.toJS({maxAliasCount:20});result=parsed.contents;
 }
 if(remove)doc.delete(key);else doc.set(key,result);
 const updated='---\n'+doc.toString()+'---\n'+(front?'':'\n')+body;
 propertyValues(updated);return updated;
}
export function bindProperties(host:HTMLElement,read:()=>string,commit:(s:string)=>void|Promise<void>,open?:(dialog:HTMLDialogElement)=>void){
 host.querySelectorAll<HTMLElement>('[data-property-edit],[data-property-add]').forEach(button=>button.onclick=()=>{
  const before=read(),key=button.dataset.propertyEdit;let data:Record<string,unknown>;
  try{data=propertyValues(before)}catch{return}
  const value=key===undefined?null:data[key];
  const dialog=document.createElement('dialog');dialog.className='property-dialog';dialog.setAttribute('aria-label',key===undefined?'Add property':'Edit property');
  dialog.innerHTML='<form><h2></h2><label>Property name<input name="key" required></label><label>Type<select name="type"><option value="text">Text</option><option value="list">List</option><option value="number">Number</option><option value="checkbox">Checkbox</option><option value="date">Date</option><option value="datetime">Date and time</option><option value="yaml">Structured YAML</option></select></label><label class="property-value-label">Value<textarea name="value" rows="5"></textarea><input name="checked" type="checkbox" hidden><input name="date" type="date" hidden></label><p class="property-help">For a list, put one value on each line. Structured YAML keeps nested properties.</p><p role="alert"></p><div class="property-actions"><button type="button" data-cancel>Cancel</button><button type="button" data-remove>Delete property</button><button type="submit">Save property</button></div></form>';
  const form=dialog.querySelector('form')!,name=form.elements.namedItem('key') as HTMLInputElement,type=form.elements.namedItem('type') as HTMLSelectElement,input=form.elements.namedItem('value') as HTMLTextAreaElement;
  dialog.querySelector('h2')!.textContent=key===undefined?'Add property':'Edit property';name.value=key||'';name.readOnly=key!==undefined;
  type.value=typeof value==='boolean'?'checkbox':typeof value==='number'||typeof value==='bigint'?'number':Array.isArray(value)&&value.every(v=>typeof v==='string')?'list':value&&typeof value==='object'?'yaml':'text';
  input.value=type.value==='yaml'?String(propertyDocument(before).get(key!,true)?.toString()):type.value==='list'?(value as string[]).join('\n'):text(value);
  if(type.value==='yaml'){const doc=propertyDocument(before);const v=doc.get(key!,true);const single=parseDocument('{}');single.contents=v as any;input.value=single.toString();}
  const check=form.elements.namedItem('checked') as HTMLInputElement,date=form.elements.namedItem('date') as HTMLInputElement;
  check.checked=value===true;
  const updateType=()=>{check.hidden=type.value!=='checkbox';date.hidden=!['date','datetime'].includes(type.value);input.hidden=!check.hidden||!date.hidden;date.type=type.value==='datetime'?'datetime-local':'date';if(!date.hidden)date.value=input.value;};type.onchange=updateType;updateType();
  const close=()=>{dialog.close();dialog.remove()};dialog.querySelector('[data-cancel]')!.addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
  dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
  const save=async(remove=false)=>{try{if(read()!==before)throw Error('This note changed. Close this dialog and try again.');if(key===undefined&&Object.hasOwn(data,name.value))throw Error('This property already exists.');await commit(setProperty(before,name.value,type.value as PropertyType,type.value==='checkbox'?String(check.checked):!date.hidden?date.value:input.value,remove));close()}catch(e){dialog.querySelector('[role=alert]')!.textContent=(e as Error).message}};
  form.onsubmit=e=>{e.preventDefault();void save()};const remove=dialog.querySelector<HTMLButtonElement>('[data-remove]')!;remove.hidden=key===undefined;remove.onclick=()=>void save(true);
  document.body.append(dialog);if(open)open(dialog);else dialog.showModal();
 });
}

declare global {interface Window {closePropertyDialog:()=>boolean}}
window.closePropertyDialog=()=>{const dialog=document.querySelector<HTMLDialogElement>(".property-dialog[open]");if(!dialog)return false;dialog.close();dialog.remove();return true;};
export const hasPropertyQuery=(query:string)=>/\[[^\[\]:]+(?::[^\]]*)?\]/.test(query);
export function matchesPropertyQuery(content:string,path:string,query:string){
 let fields:Record<string,unknown>;try{fields=propertyValues(content)}catch{fields={}}
 let matches=true;
 const rest=query.replace(/\[([^\[\]:]+)(?::([^\]]*))?\]/g,(_,key:string,wanted:string|undefined)=>{
  key=key.trim();let value:unknown=fields;
  if(Object.hasOwn(fields,key))value=fields[key];else for(const part of key.split('.'))value=value&&typeof value==='object'?Object.hasOwn(value,part)?(value as Record<string,unknown>)[part]:undefined:undefined;
  const values=Array.isArray(value)?value:[value];
  if(value===undefined || wanted!==undefined&&!values.some(v=>text(v).toLowerCase()===wanted.trim().replace(/^"(.*)"$/,'$1').toLowerCase()))matches=false;
  return '';
 }).trim();
 return matches&&(!rest||(path+' '+content).toLowerCase().includes(rest.toLowerCase()));
}
