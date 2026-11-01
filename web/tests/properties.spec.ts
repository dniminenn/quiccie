import {test,expect} from './fixtures';
test('property types, source values, YAML edits and Obsidian constructs retain meaning',async({page})=>{
 await page.goto((process.env.QUICCIE_SOURCE_URL || 'http://127.0.0.1:18091/'));
 const result=await page.evaluate(async()=>{
  const {renderNote,canEditRich}=await import('/src/render.ts');
  const {setProperty,propertyValues,matchesPropertyQuery}=await import('/src/properties.ts');
  const {notePresentation}=await import('/src/organization.ts');
  const {resolveNote}=await import('/src/links.ts');
  const body='\n    code\n\nText with spaces.  \n';
  const source='---\ntitle: Human title\ntype: note\nmetadata:\n  type: project\nlarge: 9007199254740993\nlimit: .inf\ncomplete: true\nlink: "[[Other]]"\ntags: [one, two]\n---'+body;
  const changed=setProperty(source,'complete','checkbox','false');const p=propertyValues(changed);
  const node=document.createElement('div');node.innerHTML=renderNote(source);
  const linked=[{path:'Other.md',content:'---\naliases: [Alternate]\n---\n# Target\n\nEmbedded text.\n\nA block. ^id\n'}];
  const rich=document.createElement('div');rich.innerHTML=renderNote('![[photo.png|120]]\n\n![[Other#^id]]\n\n> [!warning] Careful\n> Body\n\n==marked== %%secret%%\n\nA block. ^b',{path:'Folder/Note.md',attachments:['Assets/photo.png'],lookup:(target,from)=>resolveNote(target,from,linked)});
  return {body:changed.slice(changed.indexOf('\n---\n')+5),expectedBody:body.slice(1),complete:p.complete,large:String(p.large),limit:node.textContent?.includes('.inf'),numeric:node.textContent?.includes('9007199254740993'),tags:node.querySelectorAll('.property-list li').length,checkbox:node.querySelector('input')?.checked,link:node.querySelector('.properties a')?.getAttribute('data-wiki'),image:rich.querySelector('img')?.getAttribute('src'),width:rich.querySelector('img')?.getAttribute('width'),embed:rich.querySelector('.embed-body')?.textContent,callout:rich.querySelector('.callout-title')?.textContent,mark:rich.querySelector('mark')?.textContent,hidden:!rich.textContent?.includes('secret'),block:!!rich.querySelector('#user-content-block-b'),safe:canEditRich('%%secret%%',''),match:matchesPropertyQuery(source,'n.md','[metadata.type:project]'),alias:resolveNote('Alternate','Home.md',linked)?.path,presentation:notePresentation('Agent Memory/projects/p/n.md','---\nname: "Human # title" # comment\ndescription: >\n  Folded\n  description\n---\nBody')};
 });
 expect(result.body).toBe(result.expectedBody);expect(result.complete).toBe(false);expect(result.large).toBe('9007199254740993');expect(result.numeric).toBe(true);expect(result.limit).toBe(true);expect(result.tags).toBe(2);expect(result.checkbox).toBe(true);expect(result.link).toBe('Other');expect(result.image).toBe('/api/attachment?path=Assets%2Fphoto.png');expect(result.width).toBe('120');expect(result.embed).toContain('A block.');expect(result.callout).toBe('Careful');expect(result.mark).toBe('marked');expect(result.hidden).toBe(true);expect(result.block).toBe(true);expect(result.safe).toBe(false);expect(result.match).toBe(true);expect(result.alias).toBe('Other.md');expect(result.presentation.title).toBe('Human # title');expect(result.presentation.excerpt).toBe('Folded description');
});
for(const phone of [false,true])test(`edit properties and cancel safely (${phone?'phone':'desktop'})`,async({page,context})=>{
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
 const path='Tests/Properties '+Date.now()+'.md';const body='\n    code stays indented\n\nTrailing spaces.  \n';const content='---\ntitle: Property fixture\ncomplete: false\nmetadata:\n  type: project\n---\n'+body;
 await context.request.put('/api/notes',{headers:{'X-Quiccie-Request':'1'},data:{path,content}});await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 if(phone)await page.locator('[data-phone-tab=search]').click();
 await page.locator('#search').fill(path);await page.locator('.note-card').click();
 await page.locator('#reader .properties summary').click();await page.getByRole('button',{name:'Edit complete',exact:true}).click();
 await page.locator('.property-dialog input[type=checkbox]').check();await page.getByRole('button',{name:'Save property',exact:true}).click();await expect(page.locator('.property-dialog')).toHaveCount(0);
 await expect.poll(async()=>{const d=await(await context.request.get('/api/notes?path='+encodeURIComponent(path))).json();return d.content}).toContain('complete: true');
 const saved=await(await context.request.get('/api/notes?path='+encodeURIComponent(path))).json();expect(saved.content.slice(saved.content.indexOf('\n---\n')+5)).toBe(body);
 await page.locator('#reader .properties summary').click();await page.getByRole('button',{name:'Edit title',exact:true}).click();await page.locator('.property-dialog textarea').fill('Unwanted');
 if(phone)await page.goBack();else await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.property-dialog[open]')).toHaveCount(0);
 const unchanged=await(await context.request.get('/api/notes?path='+encodeURIComponent(path))).json();expect(unchanged.content).toBe(saved.content);
});

test('links stay in their source space and embedded links keep their source path',async({page})=>{
 await page.goto((process.env.QUICCIE_SOURCE_URL || 'http://127.0.0.1:18091/'));
 const r=await page.evaluate(async()=>{
  const {resolveNote}=await import('/src/links.ts');const {renderNote}=await import('/src/render.ts');const {propertyValues,setProperty,matchesPropertyQuery}=await import('/src/properties.ts');
  const notes=[{path:'Secret.md',content:'---\naliases: [Private]\n---\nPrivate body'},{path:'Work/Folder/Other.md',content:'[[sibling]]'},{path:'Work/Folder/sibling.md',content:'Work body'}];
  const host=document.createElement('div');host.innerHTML=renderNote('![[Other]]',{path:'Work/Home.md',lookup:(target,from)=>resolveNote(target,from,notes)});
  let malformed=false;try{setProperty('---\nname: Broken','new','text','value')}catch{malformed=true}
  return {basename:resolveNote('Secret','Work/Home.md',notes)?.path,alias:resolveNote('Private','Work/Home.md',notes)?.path,source:host.querySelector('.embed-body a')?.getAttribute('data-note-source'),nullPresent:matchesPropertyQuery('---\nflag: null\n---\n','n.md','[flag]'),malformed};
 });
 expect(r.basename).toBeUndefined();expect(r.alias).toBeUndefined();expect(r.source).toBe('Work/Folder/Other.md');expect(r.nullPresent).toBe(true);expect(r.malformed).toBe(true);
});

test('empty properties are valid and attachments stay in their source space',async({page})=>{
 await page.goto((process.env.QUICCIE_SOURCE_URL || 'http://127.0.0.1:18091/'));
 const r=await page.evaluate(async()=>{
  const {renderNote}=await import('/src/render.ts');const {setProperty,propertyValues}=await import('/src/properties.ts');
  const value=setProperty('---\n---\nBody','done','checkbox','true');
  const host=document.createElement('div');host.innerHTML=renderNote('![[photo.png]]\n\n![x](../../Private/photo.png)\n\n![x](/api/attachment?path=Private%2Fphoto.png)',{path:'Work/Folder/Note.md',attachments:['Private/photo.png']});
  return {done:propertyValues(value).done,sources:[...host.querySelectorAll('img')].map(x=>x.getAttribute('src')),text:host.textContent};
 });
 expect(r.done).toBe(true);expect(r.sources).toEqual(['/api/attachment?path=Work%2FFolder%2Fphoto.png']);expect(r.text).toContain('Attachment belongs to another space.');
});
