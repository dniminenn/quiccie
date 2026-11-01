// Read a private corpus snapshot. Do not change the service or source notes.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {parseDocument}=require('yaml');
const {chromium}=require('@playwright/test');
const input=process.env.QUICCIE_AUDIT_CORPUS;
if(!input)throw new Error('Set QUICCIE_AUDIT_CORPUS to a private JSON note array.');
const notes=JSON.parse(fs.readFileSync(input,'utf8')).filter(n=>n.path.endsWith('.md'));
const report={notes:notes.length,frontmatter:0,valid:0,invalid:[],fields:{},issues:[],features:{},duplicates:[]};
const permalinks=new Map();
for(const n of notes){
 const match=n.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 for(const [name,re] of Object.entries({wiki:/\[\[[^\]\n]+\]\]/,embed:/!\[\[/,callout:/^>\s*\[!\w+\]/m,block:/\^[-\w]+\s*$/m,comment:/%%/,highlight:/==[^=\n]+==/,math:/\$\$[\s\S]+?\$\$/,markdownImage:/!\[[^\]]*\]\(/}))if(re.test(n.content))report.features[name]=(report.features[name]||0)+1;
 if(!match)continue;report.frontmatter++;
 const doc=parseDocument(match[1]);
 if(doc.errors.length){report.invalid.push({path:n.path,codes:doc.errors.map(e=>e.code)});continue;}
 let data;try{data=doc.toJS({maxAliasCount:50})}catch{report.invalid.push({path:n.path,codes:['CONVERSION']});continue;}
 if(!data||typeof data!=='object'||Array.isArray(data)){report.invalid.push({path:n.path,codes:['NOT_MAPPING']});continue;}
 report.valid++;n.auditPermalink=data.permalink;
 for(const [key,value] of Object.entries(data)){
  const type=value===null?'null':Array.isArray(value)?'list':typeof value;
  report.fields[key]??={};report.fields[key][type]=(report.fields[key][type]||0)+1;
  if(['tags','aliases','cssclasses'].includes(key)&&!Array.isArray(value))report.issues.push({path:n.path,key,issue:'Default list property has another type',type});
  if(['title','name','description'].includes(key)&&typeof value!=='string')report.issues.push({path:n.path,key,issue:'Display text has another type',type});
 }
 if(typeof data.permalink==='string'){const paths=permalinks.get(data.permalink)||[];paths.push(n.path);permalinks.set(data.permalink,paths)}
}
for(const paths of permalinks.values())if(paths.length>1)report.duplicates.push(paths);
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(process.env.QUICCIE_AUDIT_WEB||'http://127.0.0.1:8091/');
 report.render=await page.evaluate(async notes=>{
  const {renderNote,canEditRich}=await import('/src/render.ts');
  const {splitFrontmatter,makeEditor}=await import('/src/editor.ts');
  const host=document.createElement('div');document.body.append(host);const editor=makeEditor(host,()=>{});
  const result={rendered:0,failures:[],sourceRequired:0,links:{total:0,unresolved:0,permalinkMatches:0,examples:[]},fixtures:{}};
  for(const n of notes){try{const node=document.createElement('div');node.innerHTML=renderNote(n.content);if(node.querySelector('script,iframe,object,[onerror],[onclick]'))throw Error('Active HTML');for(const link of node.querySelectorAll('a[data-wiki]')){
 const raw=link.getAttribute('data-wiki');if(raw.startsWith('#'))continue;result.links.total++;
 let target;try{target=decodeURIComponent(raw.split('#')[0])}catch{continue}
 const parent=n.path.split('/').slice(0,-1).join('/');const relative=new URL(target,'https://notes.invalid/'+parent+'/').pathname.slice(1);
 const candidates=notes.filter(x=>x.path.split('/').pop()===target.replace(/\.md$/,'')+'.md');
 const found=notes.find(x=>x.path===target||x.path===target+'.md'||x.path===relative||x.path===relative+'.md')||(candidates.length===1?candidates[0]:null);
 if(!found){result.links.unresolved++;if(notes.some(x=>x.auditPermalink===target))result.links.permalinkMatches++;if(result.links.examples.length<8)result.links.examples.push({path:n.path,target});}
 }
 const {front,body}=splitFrontmatter(n.content);editor.commands.setContent(body,{contentType:'markdown',emitUpdate:false});if(!canEditRich(n.content,front+editor.getMarkdown()))result.sourceRequired++;result.rendered++}catch(e){result.failures.push({path:n.path,error:String(e)})}}
  const fixtures={types:'---\ntags: [alpha, beta]\naliases: [Alternate]\ncomplete: true\ncount: 3\nlink: "[[Other]]"\n---\nBody',embed:'![[photo.png|120]]',callout:'> [!warning] Careful\n> Text',block:'A paragraph. ^block-id\n\n[[#^block-id]]',comment:'Visible %%secret%% text',highlight:'==marked==',bigint:'---\nid: 9007199254740993\n---\nBody',precision:'---\nvalue: .inf\n---\nBody'};
  for(const [key,value] of Object.entries(fixtures)){const node=document.createElement('div');node.innerHTML=renderNote(value);result.fixtures[key]={text:node.textContent,images:node.querySelectorAll('img').length,propertyLinks:node.querySelectorAll('.properties a').length,checkboxes:node.querySelectorAll('.properties input[type=checkbox]').length};}
  editor.destroy();host.remove();return result;
 },notes);
}finally{await browser.close()}
const output=process.env.QUICCIE_AUDIT_OUTPUT||'.private/properties-audit.json';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({...report,invalid:report.invalid.length,issues:report.issues.length,duplicates:report.duplicates.length,render:{...report.render,failures:report.render.failures.length,links:{...report.render.links,examples:undefined}}},null,2));
