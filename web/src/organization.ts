import {propertyValues} from './properties';
import type {Space} from './spaces';
export type Crumb={label:string;path:string;space?:string};
const categories:Record<string,string>={projects:'Project notes',project:'Project records',feedback:'Agent guidance',references:'References',reference:'Reference records',indexes:'Imported indexes',derived:'Derived notes',user:'User preferences'};
export function location(path:string,spaces:Space[]){
 const space=spaces.filter(s=>s.prefix&&path.startsWith(s.prefix.replace(/\/$/,'')+'/')).sort((a,b)=>b.prefix.length-a.prefix.length)[0] || spaces.find(s=>s.prefix&&path===s.prefix.replace(/\/$/,'')) || spaces.find(s=>s.id==='personal');
 const prefix=space?.prefix||'';
 const relative=path===prefix.replace(/\/$/,'')?'':path.startsWith(prefix)?path.slice(prefix.length):path;
 return {space,prefix,parts:relative?relative.split('/'):[]};
}
export function breadcrumbs(path:string,spaces:Space[]):Crumb[]{
 const {space,prefix,parts}=location(path,spaces);
 const result:Crumb[]=[{label:space?.name||'Personal',path:prefix.replace(/\/$/,''),space:space?.id}];
 for(let i=0;i<parts.length;i++){
  if(parts[0]==='Agent Memory'&&i===1&&parts[i]==='projects')continue;
  let label=parts[i];
  if(i===0&&label==='Agent Memory')label='Agent memory';
  if(parts[0]==='Agent Memory'&&i===1&&label==='global')label='Shared memory';
  if(parts[0]==='Agent Memory'&&((parts[1]==='projects'&&i===3)||(parts[1]==='global'&&i===2)))label=categories[label]||label;
  result.push({label,path:prefix+parts.slice(0,i+1).join('/')});
 }
 return result;
}
export function folderLabel(path:string,spaces:Space[]){return breadcrumbs(path,spaces).at(-1)?.label||'All folders';}
export function displayPath(path:string,spaces:Space[]){return breadcrumbs(path,spaces).map(c=>c.label).join(' / ');}
export function parentFolder(path:string,spaces:Space[]){const crumbs=breadcrumbs(path,spaces);return crumbs.length>1?crumbs[crumbs.length-2].path:'';}
export function childFolder(path:string,parent:string,spaces:Space[]):string|undefined{
 const prefix=parent?parent+'/':'';if(!path.startsWith(prefix))return;
 const rest=path.slice(prefix.length);if(!rest.includes('/'))return;
 const normal=prefix+rest.split('/')[0];
 const {parts}=location(parent,spaces);
 // The registry wrapper is not a second project collection.
 if(parts.length===1&&parts[0]==='Agent Memory'&&rest.startsWith('projects/')){
  const tail=rest.slice('projects/'.length);if(!tail.includes('/'))return;
  const project=tail.split('/')[0];return prefix+'projects/'+project;
 }
 return normal;
}
const plain=(value:string)=>value.replace(/<[^>]*>/g,'').replace(/!?(\[([^\]]+)\])\([^)]*\)/g,'$2').replace(/[#*`>]/g,'').replace(/\s+/g,' ').trim();
export function notePresentation(path:string,content:string){
 let body=content,fields:Record<string,unknown>={};
 const front=content.match(/^---\r?\n((?:[\s\S]*?\r?\n)?)---(?:\r?\n|$)/);
 if(front){body=content.slice(front[0].length);try{fields=propertyValues(content)}catch{}}
 const scalar=(key:string)=>typeof fields[key]==='string'?(fields[key] as string).replace(/\s+/g,' ').trim():'';
 const memory=path.split('/').includes('Agent Memory');
 const file=path.split('/').pop()!.replace(/\.md$/i,'');
 const name=scalar('name'),title=scalar('title');
 const heading=body.match(/^#\s+(.+)$/m)?.[1]||'';
 const readable=(v:string)=>v&&!/^(project|feedback|reference|user)_/.test(v)&&!(v===file&&v.includes('_'));
 const chosen=readable(name)?name:readable(title)?title:memory&&heading&&readable(heading)?plain(heading):memory?file.replace(/^(project|feedback|reference|user)_/,'').replace(/[_-]+/g,' '):file;
 const historical=memory&&/^> Historical (?:project |shared )?memory\b/m.test(body);
 const excerpt=scalar('description')||plain(body.replace(/^> Historical (?:project |shared )?memory[^\n]*(?:\n>[^\n]*)*/gm,'').split(/^## Original source provenance/m)[0].replace(/^# .+\r?\n/m,'')).slice(0,180);
 const displayTitle=memory?(chosen||file).replace(/^[0-9a-f]{8}[- ][0-9a-f]{4}[- ][0-9a-f]{4}[- ][0-9a-f]{4}[- ][0-9a-f]{12}[- _]+/i,'').replace(/[_]+/g,' '):chosen||file;
 return {title:displayTitle,excerpt,historical};
}

export function importedIndex(path:string,spaces:Space[]){
 const {parts}=location(path,spaces);if(parts[0]!=='Agent Memory')return false;
 const category=parts[1]==='projects'?parts[3]:parts[1]==='global'?parts[2]:'';
 return category==='indexes'||/^memory(?:[_-]summary)?\.md$/i.test(parts.at(-1)||'');
}
// Overview.md marks a project root. Parent notes do not change that root.
export function noteProjects(paths:string[],spaces:Space[]):string[]{
 const roots=new Set<string>(),marked=new Set<string>();
 for(const path of paths){const {prefix,parts}=location(path,spaces);if(parts[0]==='Agent Memory'||parts.length<2)continue;
  roots.add(prefix+parts[0]);
  if(parts.at(-1)?.toLowerCase()==='overview.md')marked.add(path.split('/').slice(0,-1).join('/'));
 }
 const projects=[...marked].filter(p=>![...marked].some(parent=>parent!==p&&p.startsWith(parent+'/')));
 return [...projects,...[...roots].filter(root=>!projects.some(p=>p===root||p.startsWith(root+'/')))].sort();
}
