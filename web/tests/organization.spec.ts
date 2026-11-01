import {test,expect} from './fixtures';
for(const phone of [false,true])test(`memory uses a logical tree and readable metadata (${phone?'phone':'desktop'})`,async({page,context})=>{
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
 const id='tree-audit-'+Date.now(),spaceId='company-'+Date.now(),spaceName='Team '+Date.now(),root=`Spaces/${spaceId}/Agent Memory/projects/${id}`,path=root+'/projects/project_sample_architecture.md';
 expect((await context.request.post('/api/spaces',{headers:{'X-Quiccie-Request':'1'},data:{id:spaceId,name:spaceName}})).ok()).toBeTruthy();
 const content='---\ntitle: project_sample_architecture\nname: Sample HA pair architecture\ndescription: How the pair keeps the service available.\n---\n\n> Historical project memory for this project. Old context only.\n\nKeep the source text.\n';
 for(const [p,c] of [[path,content],[root+'/references/Reference.md','# Actual reference'],[`Agent Memory/projects/${id}/projects/Personal.md`,'# Personal only']])await context.request.put('/api/notes',{headers:{'X-Quiccie-Request':'1'},data:{path:p,content:c}});
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const controls=page.locator(phone?'.phone-header':'.sidebar');
 await expect(controls.locator(`[data-space-select] option[value="${spaceId}"]`).first()).toBeAttached();await controls.locator('[data-space-select]').selectOption(spaceId);await page.locator(phone?'[data-phone-tab=memory]':'[data-filter=memory]').click();
 if(phone)await page.locator('[data-phone-tab=browse]').click();await page.locator(phone?'[data-phone-tab=projects]':'#projects-tab').click();
 await page.locator(`[data-folder="${root}"]`).click();
 await expect(page.locator('.folder-card')).toContainText(['Project notes','References']);
 await page.locator(`[data-enter-folder="${root}/projects"]`).click();
 const crumbs=page.locator('.folder-crumbs');await expect(crumbs).toContainText(spaceName);await expect(crumbs).toContainText('Agent memory');await expect(crumbs).toContainText('Project notes');await expect(crumbs).not.toContainText('Spaces/');await expect(crumbs).not.toContainText(spaceId);
 await expect(page.locator('.note-title')).toHaveText('Sample HA pair architecture');await expect(page.locator('.note-excerpt')).toHaveText('How the pair keeps the service available.');await expect(page.locator('.note-meta')).toContainText('Historical memory');
 await page.locator('.note-card').click();await expect(page.locator('#note-path')).toHaveAttribute('title',path);await expect(page.locator('#reader')).toContainText('Old context only.');
 const saved=await(await context.request.get('/api/notes?path='+encodeURIComponent(path))).json();expect(saved.content).toBe(content);
});
test('presentation preserves unknown paths, category boundaries and malformed text',async({page})=>{
 await page.goto((process.env.QUICCIE_SOURCE_URL || 'http://127.0.0.1:18091/'));
 const result=await page.evaluate(async()=>{
  const {breadcrumbs,notePresentation,childFolder,parentFolder}=await import('/src/organization.ts');
  const spaces=[{id:'personal',name:'Personal',prefix:'',shared_project:'global'},{id:'work',name:'Work',prefix:'Work/',shared_project:'work'},{id:'gig',name:'Side gig',prefix:'Spaces/gig/',shared_project:'gig'}];
  return {personal:breadcrumbs('',spaces)[0].space,orphan:childFolder('Work/Agent Memory/projects/orphan.md','Work/Agent Memory',spaces),orphanParent:parentFolder('Work/Agent Memory/projects/orphan.md',spaces),slug:notePresentation('Agent Memory/projects/p/projects/project_sample_architecture.md','# project_sample_architecture').title,ordinary:breadcrumbs('Work/Plans/projects',spaces).map(c=>c.label),custom:breadcrumbs('Spaces/gig/Agent Memory/projects/same/projects',spaces).map(c=>c.label),unknown:childFolder('Work/Agent Memory/unusual/X.md','Work/Agent Memory',spaces),root:childFolder('Work/Agent Memory/Root.md','Work/Agent Memory',spaces),malformed:notePresentation('Agent Memory/projects/p/projects/project_fallback.md','---\nname: [broken\n---\n\nKeep this quote.\n'),quoted:notePresentation('Agent Memory/projects/p/projects/x.md','> Keep this historical observation.\n\nBody.')};
 });
 expect(result.personal).toBe('personal');expect(result.orphan).toBeUndefined();expect(result.orphanParent).toBe('Work/Agent Memory');expect(result.slug).toBe('sample architecture');expect(result.ordinary).toEqual(['Work','Plans','projects']);expect(result.custom).toEqual(['Side gig','Agent memory','same','Project notes']);expect(result.unknown).toBe('Work/Agent Memory/unusual');expect(result.root).toBeUndefined();expect(result.malformed.title).toBe('fallback');expect(result.quoted.excerpt).toContain('Keep this historical observation.');
});
