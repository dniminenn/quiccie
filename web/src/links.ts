import {propertyValues} from './properties';
export type LinkedNote={path:string;content:string};
import {pathSpace as noteSpace,pathSpaceInfo} from './space-paths';
export {pathSpace as noteSpace} from './space-paths';
export function resolveNote(target:string,from:string,notes:LinkedNote[]):LinkedNote|undefined{
 if(!noteSpace(from))return;
 notes=notes.filter(n=>noteSpace(n.path)===noteSpace(from));
 let name:string;try{name=decodeURIComponent(target.split('#')[0])}catch{return}
 if(!name)return notes.find(n=>n.path===from);
 if(/^[a-z][a-z0-9+.-]*:/i.test(name)||name.startsWith('//'))return;
 const parent=from.split('/').slice(0,-1).join('/');
 const relative=new URL(name,'https://notes.invalid/'+parent+'/').pathname.slice(1);
 const prefix=pathSpaceInfo(from)?.prefix||'';
 const direct=notes.find(n=>n.path===name||n.path===name+'.md'||n.path===prefix+name||n.path===prefix+name+'.md')??notes.find(n=>n.path===relative||n.path===relative+'.md');if(direct)return direct;
 const candidates=notes.filter(n=>n.path.split('/').pop()===name.replace(/\.md$/,'')+'.md');if(candidates.length===1)return candidates[0];
 if(candidates.length)return;
 const aliases=notes.filter(n=>{try{const p=propertyValues(n.content);return Array.isArray(p.aliases)&&p.aliases.includes(name)}catch{return false}});
 return aliases.length===1?aliases[0]:undefined;
}
export function scrollToNoteAnchor(host:HTMLElement,fragment:string){
 let key=fragment.replace(/^#/,'');try{key=decodeURIComponent(key)}catch{}
 const wanted=key.startsWith('^')?'block-'+key.slice(1):key;
 const target=[...host.querySelectorAll<HTMLElement>('[id]')].find(e=>e.id===wanted||e.id==='user-content-'+wanted)??[...host.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].find(h=>h.textContent?.trim().toLowerCase()===key.toLowerCase()||h.textContent?.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')===key.toLowerCase());
 target?.scrollIntoView({block:'start'});
}
