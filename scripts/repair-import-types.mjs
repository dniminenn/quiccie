// Repair an imported memory category. Default operations do not contact a service.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {parseDocument,isMap,isScalar}=require('yaml');
const categories={feedback:'feedback',projects:'project',project:'project',references:'reference',reference:'reference',user:'user'};
export function repair(note){
 const path=note.path;
 const root=path.match(/^(?:Work\/|Spaces\/[^/]+\/)?Agent Memory\/(?:projects\/[^/]+\/|global\/)([^/]+)\//);
 if(!root||note.deleted)return null;
 const front=note.content.match(/^---\r?\n((?:[\s\S]*?\r?\n)?)---(?:\r?\n|$)/);if(!front)return null;
 const doc=parseDocument(front[1]);if(doc.errors.length||!isMap(doc.contents))throw Error('Invalid properties in a memory note.');
 const outer=doc.get('type',true),metadata=doc.get('metadata',true);
 if(!isScalar(outer)||outer.value!=='note'||!isMap(metadata))return null;
 const source=metadata.get('type');if(typeof source!=='string'||source!==categories[root[1]])return null;
 const start=note.content.indexOf('\n')+1+outer.range[0],end=note.content.indexOf('\n')+1+outer.range[1];
 const raw=note.content.slice(start,end);const value=raw.startsWith('"')?JSON.stringify(source):raw.startsWith("'")?"'"+source+"'":source;
 return {content:note.content.slice(0,start)+value+note.content.slice(end),type:source,start,end};
}
export function makePlan(notes){
 const changes=[];const counts={};
 for(const note of notes){const fix=repair(note);if(!fix)continue;if(!note.checksum)throw Error('The snapshot must include read checksums.');
 changes.push({path:note.path,before:note.content,after:fix.content,before_checksum:note.checksum,type:fix.type,operation_id:crypto.randomUUID()});counts[fix.type]=(counts[fix.type]||0)+1;
 }
 return {version:1,created:new Date().toISOString(),policy:'Promote an explicit source category only when the generic current type and folder agree.',counts,changes};
}
async function main(){
 const [mode,input,output]=process.argv.slice(2);if(!input||!output)throw Error('Use: plan SNAPSHOT PLAN, apply PLAN JOURNAL, or rollback PLAN JOURNAL.');
 if(mode==='plan'){
  const plan=makePlan(JSON.parse(fs.readFileSync(input,'utf8')));fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({planned:plan.changes.length,counts:plan.counts}));return;
 }
 if(!['apply','rollback'].includes(mode))throw Error('Unknown operation.');
 const plan=JSON.parse(fs.readFileSync(input,'utf8'));if(plan.version!==1)throw Error('Unsupported plan.');
 for(const item of plan.changes){const fix=repair({path:item.path,content:item.before});if(!fix||fix.content!==item.after)throw Error('The plan contains a change outside the repair policy.');}
 const host=process.env.QUICCIE_REPAIR_HOST,password=process.env.QUICCIE_PASSWORD;if(!host||!password)throw Error('Set QUICCIE_REPAIR_HOST and QUICCIE_PASSWORD.');
 const {request}=require('@playwright/test');const api=await request.newContext({baseURL:host,extraHTTPHeaders:{'X-Quiccie-Request':'1'}});
 const prior=fs.existsSync(output)?fs.readFileSync(output,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const journal=fs.openSync(output,'a',0o600);const totals={changed:0,already:0,conflicts:0};
 const record=value=>{fs.writeSync(journal,JSON.stringify({...value,at:new Date().toISOString()})+'\n');fs.fsyncSync(journal)};
 try{
  const login=await api.post('/api/login',{data:{username:process.env.QUICCIE_USER||'owner',password}});if(!login.ok())throw Error('Sign-in failed: '+login.status());
  for(const item of plan.changes){
   const last=prior.filter(r=>r.path===item.path&&r.mode==='apply'&&r.status==='changed'&&r.after_checksum).at(-1);
   if(mode==='rollback'&&!last)continue;
   const get=await api.get('/api/notes?path='+encodeURIComponent(item.path));if(!get.ok()){totals.conflicts++;record({mode,path:item.path,status:'read-conflict'});continue;}
   const current=await get.json(),expected=mode==='apply'?item.before_checksum:last.after_checksum;
   const before=mode==='apply'?item.before:item.after,after=mode==='apply'?item.after:item.before;
   if(current.content===after){totals.already++;record({mode,path:item.path,status:'already',before_checksum:expected,after_checksum:current.checksum});continue;}
   if(current.checksum!==expected||current.content!==before){totals.conflicts++;record({mode,path:item.path,status:'changed-since-plan'});continue;}
   const response=await api.put('/api/notes',{data:{path:item.path,content:after,expected_checksum:current.checksum,operation_id:mode==='apply'?item.operation_id:crypto.randomUUID()}});
   if(response.status()===409){totals.conflicts++;record({mode,path:item.path,status:'write-conflict'});continue;}
   if(!response.ok())throw Error('Write failed: '+response.status());
   const saved=await response.json();if(saved.content!==after)throw Error('The write response differs from the planned content.');
   record({mode,path:item.path,status:'changed',before_checksum:current.checksum,after_checksum:saved.checksum});totals.changed++;
  }
  console.log(JSON.stringify({mode,...totals}));if(totals.conflicts)process.exitCode=2;
 }finally{fs.closeSync(journal);await api.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1});
