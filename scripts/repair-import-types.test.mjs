import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repair,makePlan} from './repair-import-types.mjs';
const path='Work/Agent Memory/projects/example/feedback/n.md';
const content='---\ntitle: Keep title\ntype: note # Keep comment\nmetadata:\n  type: feedback\n  originSessionId: keep\n---\n\n    code\n\nBody.  \n';
test('only the current scalar changes; rerun has no change',()=>{
 const fix=repair({path,content});assert.equal(fix.content,content.replace('type: note #','type: feedback #'));assert.equal(repair({path,content:fix.content}),null);
});
test('ordinary notes, mismatched folders and explicit current types stay intact',()=>{
 for(const p of ['Work/Notes/feedback/n.md','Work/Agent Memory/projects/example/projects/n.md'])assert.equal(repair({path:p,content}),null);
 assert.equal(repair({path,content:content.replace('type: note #','type: reference #')}),null);
 assert.equal(repair({path,content,deleted:true}),null);
});
test('quoted values and CRLF keep their syntax',()=>{
 const original=content.replace('type: note #','type: "note" #').replaceAll('\n','\r\n');
 assert.equal(repair({path,content:original}).content,original.replace('type: "note" #','type: "feedback" #'));
});
test('plan requires checksums and rejects duplicate YAML keys',()=>{
 assert.throws(()=>makePlan([{path,content}]));
 assert.throws(()=>repair({path,content:content.replace('title: Keep title','type: note\ntitle: Keep title')}));
});
