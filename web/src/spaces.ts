import {api} from './sync';
import {escapeHTML as esc} from './render';
import {Space,defaultSpaces,setSpaceCatalog,pathSpace} from './space-paths';
export type {Space} from './space-paths';
export {pathSpace} from './space-paths';
export let spaces:Space[]=defaultSpaces;
try {const saved=JSON.parse(localStorage.getItem('quiccie-spaces')||'null');if(Array.isArray(saved)&&saved.length)spaces=saved;}catch{}
setSpaceCatalog(spaces);
export let activeSpace=localStorage.getItem('quiccie-space')||'personal';
export let contentKind=localStorage.getItem('quiccie-kind')==='memory'?'memory':'notes';

export function inSpace(path:string){return activeSpace==='*'||pathSpace(path)===activeSpace;}
export function inKind(path:string){return contentKind==='all'||path.split('/').includes('Agent Memory')===(contentKind==='memory');}
export function chooseSpace(id:string,kind=contentKind){activeSpace=id;contentKind=kind==='memory'?'memory':'notes';localStorage.setItem('quiccie-space',id);localStorage.setItem('quiccie-kind',contentKind);paint();}
export function notePath(path:string){
 const space=spaces.find(s=>s.id===activeSpace);if(!space)throw new Error('Select one space before creating a note.');
 const prefix=space.prefix+(contentKind==='memory'?'Agent Memory/global/':'');
 if(space.prefix && !path.startsWith(space.prefix))path=prefix+path;
 else if(contentKind==='memory'&&!path.includes('Agent Memory/'))path=prefix+path;
 if(pathSpace(path)!==space.id)throw new Error('The note path belongs to another space. Select that space first.');
 if(contentKind==='notes'&&path.split('/').includes('Agent Memory'))throw new Error('Select Agent memory before creating a memory note.');
 return path;
}
let changed:()=>Promise<void>=async()=>{};
function paint(){
 for(const el of document.querySelectorAll<HTMLSelectElement>('[data-space-select]')){el.innerHTML=spaces.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')+'<option value="*">All spaces</option>';el.value=activeSpace;}
 for(const el of document.querySelectorAll<HTMLSelectElement>('[data-kind-select]'))el.value=contentKind;
}
export async function loadSpaces(){try{const next:Space[]=await api('spaces');if(JSON.stringify(next)!==JSON.stringify(spaces)){spaces=next;setSpaceCatalog(spaces);localStorage.setItem('quiccie-spaces',JSON.stringify(spaces));paint();}}catch{/* Keep the last catalog for offline use. */}}
export function mountSpaces(onChange:()=>Promise<void>,openDialog:(id:string)=>Promise<void>,closeDialog:(dialog:HTMLDialogElement)=>Promise<void>){
 changed=onChange;
 const html=`<div class="space-controls"><label>Space<select data-space-select aria-label="Space"></select></label><button data-add-space aria-label="Add space">＋</button></div>`;
 document.querySelector('.sidebar .brand')?.insertAdjacentHTML('afterend',html);
 document.querySelector('.phone-title-row')?.insertAdjacentHTML('beforebegin',html);
 const dialog=document.createElement('dialog');dialog.id='space-dialog';dialog.setAttribute('aria-labelledby','space-title');dialog.innerHTML=`<form><h2 id="space-title">Add space</h2><p>Each space has its own notes, projects, and agent memory.</p><label>Name<input id="space-name" required maxlength="80" placeholder="Side gig"></label><label>Space ID<input id="space-id" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="48" placeholder="side-gig"></label><p>The ID stays fixed. An internet connection is required.</p><p id="space-error" role="alert"></p><div class="dialog-actions"><button type="button" id="cancel-space">Cancel</button><button id="create-space" class="primary">Create space</button></div></form>`;document.body.append(dialog);
 const name=dialog.querySelector<HTMLInputElement>('#space-name')!,id=dialog.querySelector<HTMLInputElement>('#space-id')!;
 name.oninput=()=>{id.value=name.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');};
 dialog.querySelector<HTMLButtonElement>('#cancel-space')!.onclick=()=>void closeDialog(dialog);
 document.querySelectorAll<HTMLButtonElement>('[data-add-space]').forEach(b=>b.onclick=async()=>{dialog.querySelector('form')!.reset();dialog.querySelector('#space-error')!.textContent='';await openDialog("#space-dialog");name.focus();});
 dialog.querySelector('form')!.onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector<HTMLButtonElement>('#create-space')!;button.disabled=true;try{const created:Space=await api('spaces',{method:'POST',body:JSON.stringify({id:id.value,name:name.value})});await loadSpaces();chooseSpace(created.id,'notes');await changed();await closeDialog(dialog);}catch(error){dialog.querySelector('#space-error')!.textContent=(error as Error).message;}finally{button.disabled=false;}};
 document.querySelectorAll<HTMLSelectElement>('[data-space-select]').forEach(el=>el.onchange=async()=>{chooseSpace(el.value);await changed();});
 document.querySelectorAll<HTMLSelectElement>('[data-kind-select]').forEach(el=>el.onchange=async()=>{chooseSpace(activeSpace,el.value);await changed();});paint();void loadSpaces();
}
