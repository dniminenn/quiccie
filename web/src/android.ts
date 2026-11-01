import {setSpaceCatalog} from './space-paths';
import {scrollToNoteAnchor} from "./links";
import {bindProperties} from "./properties";
import { canEditRich, renderNote } from "./render";
import "./style.css";
import "./native-editor.css";
import designCSS from "./design.css?inline";
const designStyle=document.createElement("style");designStyle.textContent=designCSS;document.head.append(designStyle);
import { makeEditor, toolbar, splitFrontmatter } from "./editor";
declare global { interface Window {
 Quiccie?: {changed:(s:string)=>void;ready:()=>void;openNote?:(s:string,from:string)=>void;sourceRequired?:()=>void;resolveEmbed?:(target:string,from:string)=>string;spaceCatalog?:()=>string;attachmentPaths?:()=>string};
 setNote:(s:string,path?:string,fragment?:string)=>void;getNote:()=>string;setEditing:(value:boolean)=>void;setTheme:(dark:boolean)=>void;
} }
let front='',original='',currentPath='',dirty=false,editing=false,safe=true;
const container=document.querySelector<HTMLElement>('#editor')!;
const reader=document.createElement('article');reader.id='android-reader';reader.className='tiptap';document.body.append(reader);
const editor=makeEditor(container,text=>{if(!editing)return;dirty=true;window.Quiccie?.changed(front+text)});
toolbar(document.querySelector<HTMLElement>('#toolbar')!,editor);
function mode(){
 try{const catalog=window.Quiccie?.spaceCatalog?.();if(catalog)setSpaceCatalog(JSON.parse(catalog));}catch{}
 editor.setEditable(editing&&safe,false);container.hidden=!editing||!safe;reader.hidden=editing&&safe;
 document.querySelector<HTMLElement>('#toolbar')!.hidden=!editing||!safe;
 if(!reader.hidden){reader.innerHTML=renderNote(window.getNote(),{path:currentPath,lookup:(target,from)=>{try{return JSON.parse(window.Quiccie?.resolveEmbed?.(target,from)||'null')||undefined}catch{return undefined}},attachments:JSON.parse(window.Quiccie?.attachmentPaths?.()||'[]')});bindProperties(reader,()=>window.getNote(),value=>{window.setNote(value);window.Quiccie?.changed(value);});}
}
window.setNote=(content,path,fragment)=>{if(path!==undefined)currentPath=path;original=content;dirty=false;const p=splitFrontmatter(content);front=p.front;editor.commands.setContent(p.body,{contentType:'markdown',emitUpdate:false});safe=canEditRich(content,front+editor.getMarkdown());mode();if(fragment)requestAnimationFrame(()=>scrollToNoteAnchor(reader,fragment));};
window.getNote=()=>dirty?front+editor.getMarkdown():original;
window.setEditing=value=>{editing=value;if(value&&!safe){window.Quiccie?.sourceRequired?.();return;}mode();if(value)editor.commands.focus('end');else (document.activeElement as HTMLElement)?.blur();};
window.setTheme=dark=>document.documentElement.dataset.theme=dark?'dark':'light';
window.Quiccie?.ready();
document.addEventListener('click',e=>{const link=(e.target as HTMLElement).closest<HTMLAnchorElement>('a');if(!link)return;const href=link.dataset.wiki??link.getAttribute('href')??'';if(!href||/^(https?:|mailto:|\/api\/)/i.test(href))return;e.preventDefault();if(href.startsWith('#'))scrollToNoteAnchor(link.closest<HTMLElement>(".embed-body")||reader,href);else window.Quiccie?.openNote?.(href,link.dataset.noteSource||currentPath);});
