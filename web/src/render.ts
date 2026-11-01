import {noteSpace} from "./links";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import {propertiesHTML,escapeHTML} from "./properties";
export {escapeHTML} from "./properties";
import { splitFrontmatter } from "./editor";
const md = new MarkdownIt({html:true,linkify:false,breaks:false}).use(taskLists);
md.inline.ruler.before("image", "obsidian", (state, silent) => {
 const source=state.src.slice(state.pos);
 const comment=source.match(/^%%([\s\S]*?)%%/);
 if(comment){state.pos+=comment[0].length;return true;}
 const highlight=source.match(/^==([^=]+)==/);
 if(highlight){if(!silent){const token=state.push("html_inline","",0);token.content='<mark>'+escapeHTML(highlight[1])+'</mark>';}state.pos+=highlight[0].length;return true;}
 const match=source.match(/^(!?)\[\[([^\]\n]+)\]\]/);if(!match)return false;
 if(!silent){
  const [target,label]=match[2].split('|');const token=state.push('html_inline','',0);
  if(match[1]){
   if(/\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:#|$)/i.test(target)){
    const size=label?.match(/^(\d+)(?:x(\d+))?$/);const width=size?` width="${Math.min(Number(size[1]),4096)}"`:'';const height=size?.[2]?` height="${Math.min(Number(size[2]),4096)}"`:'';
    token.content=`<img src="${escapeHTML(target.split('#')[0])}" alt="${escapeHTML(size?'':label||target)}"${width}${height}>`;
   }else token.content=`<section class="note-embed" data-embed="${escapeHTML(target)}"><a href="#" data-wiki="${escapeHTML(target)}">${escapeHTML(label||target)}</a></section>`;
  }else token.content=`<a href="#" data-wiki="${escapeHTML(target)}">${escapeHTML(label||target)}</a>`;
 }
 state.pos+=match[0].length;return true;
});
export type RenderContext={path?:string;lookup?:(target:string,from:string)=>{path:string;content:string}|undefined;attachments?:string[];visited?:string[]};
export function renderNote(content: string,context:RenderContext={}) {
  const { front, body } = splitFrontmatter(content);
  const properties = propertiesHTML(content);
  const html = DOMPurify.sanitize(properties + md.render(body), {ADD_ATTR:["data-wiki","data-embed"],FORBID_TAGS:["style","form","iframe","object","embed"],FORBID_ATTR:["style","name"],SANITIZE_NAMED_PROPS:true});
  const container = document.createElement("div"); container.innerHTML = html;
  for(const quote of container.querySelectorAll('blockquote')){
   const first=quote.querySelector('p');const callout=first?.textContent?.match(/^\[!(\w+)\]([+-])?\s*(.*)/);if(!first||!callout)continue;
   const title=document.createElement('strong');title.className='callout-title';title.textContent=callout[3]||callout[1];
   // Remove only the marker line. Keep the body and nested formatting.
   const html=first.innerHTML;const breakAt=html.indexOf('\n');first.innerHTML=breakAt>=0?html.slice(breakAt+1):'';
   quote.classList.add('callout');quote.setAttribute('data-callout',callout[1].toLowerCase());
   if(callout[2]){const details=document.createElement('details');details.className='callout';details.open=callout[2]==='+';const summary=document.createElement('summary');summary.textContent=title.textContent;details.append(summary);while(quote.firstChild)details.append(quote.firstChild);quote.replaceWith(details)}else quote.prepend(title);
  }
  for(const block of container.querySelectorAll<HTMLElement>('p,li')){
   const last=block.lastChild;if(last?.nodeType!==Node.TEXT_NODE)continue;
   const match=last.textContent?.match(/(?:^|\s)\^([a-zA-Z0-9-]+)\s*$/);if(!match)continue;
   last.textContent=last.textContent!.slice(0,match.index);let target:Element=block;
   if(!block.textContent?.trim()&&block.previousElementSibling){target=block.previousElementSibling;block.remove()}
   target.id='user-content-block-'+match[1];
  }
  for (const img of container.querySelectorAll('img')) {
   const src=img.getAttribute('src')||'';
   if(src.startsWith('data:image/'))continue;
   if(src.startsWith('/api/attachment?path=')){
    const path=new URL(src,'https://notes.invalid').searchParams.get('path')||'';
    if(context.path&&noteSpace(path)!==noteSpace(context.path))img.replaceWith(document.createTextNode('Attachment belongs to another space.'));
    continue;
   }
   if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)){img.replaceWith(document.createTextNode(img.alt||'External image'));continue;}
   let decoded=src;try{decoded=decodeURIComponent(src)}catch{}
   const parent=(context.path||'').split('/').slice(0,-1).join('/');
   const relative=new URL(decoded,'https://notes.invalid/'+parent+'/').pathname.slice(1);
   const attachments=context.attachments?.filter(p=>!context.path||noteSpace(p)===noteSpace(context.path));
   const matches=attachments?.filter(p=>p.split('/').pop()===decoded);
   const resolved=attachments?.includes(decoded)?decoded:attachments?.includes(relative)?relative:matches?.length===1?matches[0]:relative;
   if(context.path&&noteSpace(resolved)!==noteSpace(context.path)){img.replaceWith(document.createTextNode('Attachment belongs to another space.'));continue;}
   img.src='/api/attachment?path='+encodeURIComponent(resolved);
  }
  for(const link of container.querySelectorAll<HTMLElement>('a')){if(context.path)link.dataset.noteSource=context.path;}
  for(const embed of container.querySelectorAll<HTMLElement>('[data-embed]')){
   const target=embed.dataset.embed!,note=context.lookup?.(target,context.path||'');
   const visited=context.visited||[context.path||''];
   if(note&&!visited.includes(note.path)&&visited.length<5){
    const rendered=document.createElement('div');rendered.innerHTML=renderNote(note.content,{...context,path:note.path,visited:[...visited,note.path]});rendered.querySelectorAll('.properties').forEach(e=>e.remove());
    const fragment=target.split('#')[1];let selected:Element|null=null;
    if(fragment){let key=fragment;try{key=decodeURIComponent(fragment)}catch{};selected=key.startsWith('^')?[...rendered.querySelectorAll('[id]')].find(e=>e.id==='user-content-block-'+key.slice(1))||null:[...rendered.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(h=>h.textContent?.trim().toLowerCase()===key.toLowerCase())||null;}
    if(fragment&&!selected)continue;
    const body=document.createElement('div');body.className='embed-body';
    if(selected){body.append(selected.cloneNode(true));if(!fragment.startsWith('^')){let next=selected.nextElementSibling;while(next&&!/^H[1-6]$/.test(next.tagName)){body.append(next.cloneNode(true));next=next.nextElementSibling;}}}else while(rendered.firstChild)body.append(rendered.firstChild);
    embed.append(body);
   }
  }
  return container.innerHTML;
}

export function documentSignature(content: string) {
  const node=document.createElement("div");node.innerHTML=renderNote(content);
  node.querySelectorAll(".properties").forEach(e=>e.remove());
  return JSON.stringify({
    text:node.textContent?.replace(/\s+/g," ").trim(),
    structure:[...node.querySelectorAll("h1,h2,h3,h4,h5,h6,li,table,pre,blockquote,hr")].map(e=>e.tagName),
    links:[...node.querySelectorAll("a")].map(e=>[e.getAttribute("href"),e.getAttribute("data-wiki")]),
    images:[...node.querySelectorAll("img")].map(e=>[e.getAttribute("src"),e.getAttribute("alt")]),
  });
}
export function canEditRich(original:string, serialized:string) {
  return !/(?:%%|==|!\[\[|\[!\w+\]|\^[a-zA-Z0-9-]+\s*$)/m.test(splitFrontmatter(original).body) && !/<\/?[a-z][^>]*>/i.test(splitFrontmatter(original).body) && documentSignature(original)===documentSignature(serialized);
}
