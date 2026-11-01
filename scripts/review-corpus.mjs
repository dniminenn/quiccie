import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const root=process.env.QUICCIE_CORPUS;
if(!root)throw new Error('Set QUICCIE_CORPUS to the vault mirror.');
async function walk(dir){let out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.name.endsWith('.md'))out.push({path:path.relative(root,p),content:await fs.readFile(p,'utf8')});}return out;}
const corpus=await walk(root);
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8091/');
 const result=await page.evaluate(async notes=>{
  const {renderNote,canEditRich}=await import('/src/render.ts');
  const {makeEditor,splitFrontmatter}=await import('/src/editor.ts');
  const holder=document.createElement('div');document.body.append(holder);
  const editor=makeEditor(holder,()=>{});
  const failures=[],richDifferences=[];
  let rendered=0,tables=0,lists=0,wikis=0,properties=0,sourceRequired=0;
  const signature=html=>{
   const node=document.createElement('div');node.innerHTML=html;node.querySelectorAll('.properties').forEach(e=>e.remove());
   return {text:node.textContent.replace(/\s+/g,' ').trim(),tables:node.querySelectorAll('table').length,lists:node.querySelectorAll('li').length,links:node.querySelectorAll('a').length,code:node.querySelectorAll('pre').length};
  };
  for(const n of notes){
   try{
    const html=renderNote(n.content);const node=document.createElement('div');node.innerHTML=html;
    if(node.querySelector('script,iframe,object,[onerror],[onclick]'))throw new Error('Active HTML');
    if(!node.textContent.trim() && n.content.trim())throw new Error('Empty output');
    tables+=node.querySelectorAll('table').length;lists+=node.querySelectorAll('li').length;wikis+=node.querySelectorAll('[data-wiki]').length;properties+=node.querySelectorAll('.properties').length;
    const parts=splitFrontmatter(n.content);
    editor.commands.setContent(parts.body,{contentType:'markdown',emitUpdate:false});
    const again=parts.front+editor.getMarkdown();
    const before=signature(html),after=signature(renderNote(again));
    const safe=canEditRich(n.content,again);if(!safe)sourceRequired++;
    if(safe && JSON.stringify(before)!==JSON.stringify(after))throw new Error("Unsafe rich edit allowed");
    if(JSON.stringify(before)!==JSON.stringify(after))richDifferences.push({path:n.path,before:{...before,text:undefined},after:{...after,text:undefined},textChanged:before.text!==after.text});
    rendered++;
   }catch(e){failures.push({path:n.path,error:String(e)})}
  }
  editor.destroy();holder.remove();return {notes:notes.length,rendered,tables,lists,wikis,properties,sourceRequired,failures,richDifferences};
 },corpus);
 await fs.writeFile('.private/corpus-browser-review.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({...result,failures:result.failures.length,richDifferences:result.richDifferences.length}));
 if(result.failures.length)process.exitCode=1;
}finally{await browser.close();}
