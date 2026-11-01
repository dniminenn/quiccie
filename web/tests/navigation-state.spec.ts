import {test,expect} from './fixtures';
for(const phone of [false,true])test(`stable navigation and search scope (${phone?'phone':'desktop'})`,async({page,context})=>{
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
 const id='route-'+Date.now(),prefix='Spaces/'+id+'/';
 expect((await context.request.post('/api/spaces',{headers:{'X-Quiccie-Request':'1'},data:{id,name:id}})).ok()).toBeTruthy();
 const put=async(path:string,content:string)=>expect((await context.request.put('/api/notes',{headers:{'X-Quiccie-Request':'1'},data:{path:prefix+path,content}})).ok()).toBeTruthy();
 for(const [path,content] of [['Collections/A/Overview.md','# Alpha'],['Collections/A/Deep/Guide.md','# Guide'],['Collections/B/Overview.md','# Beta'],['Other/Loose.md','# Loose'],['Agent Memory/projects/a/projects/Fact.md','# needle fact'],['Agent Memory/projects/a/indexes/MEMORY.md','# needle index']])await put(path,content);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const controls=page.locator(phone?'.phone-header':'.sidebar');await expect(controls.locator('[data-space-select] option[value="'+id+'"]').first()).toBeAttached();await controls.locator('[data-space-select]').selectOption(id);
 const destination=async(kind:string)=>page.locator(phone?`[data-phone-tab=${kind==='memory'?'memory':'notes'}]`:`[data-filter=${kind==='memory'?'memory':'all'}]`).click();
 const browse=async(mode:string)=>{if(phone)await page.locator('[data-phone-tab=browse]').click();await page.locator(phone?`[data-phone-tab=${mode}]`:`#${mode}-tab`).click();};
 await destination('notes');await expect(page.locator('.note-card')).toHaveCount(4);
 await page.locator(phone?'[data-phone-filter=recent]':'[data-filter=recent]').click();await expect(page.locator('.note-card')).toHaveCount(0);
 await destination('notes');await page.locator('.note-card').first().click();if(phone)await page.locator('#phone-back').click();await destination('notes');await expect(page.locator('.note-card')).toHaveCount(4);
 await browse('projects');await expect(page.locator('#list-title')).toHaveText('Projects');
 await page.locator('[data-folder="'+prefix+'Collections/A"]').click();await expect(page.locator('#list-title')).toHaveText('A');
 await expect(page.locator('.folder-crumbs')).not.toContainText('Collections');
 if(phone){await expect(page.locator('#phone-folder-back')).toHaveText('Back to projects');await page.locator('#phone-folder-back').click();await expect(page.locator('#phone-title')).toHaveText('Projects');}
 await browse('files');await expect(page.locator('#list-title')).toHaveText('Folders');await page.locator('[data-folder="'+prefix+'Other"]').click();
 if(phone)await page.locator('[data-phone-tab=search]').click();await page.locator('#search').fill('Guide');await expect(page.locator('#search-scope')).toContainText(id+' · Notes · All folders');
 await browse('files');await expect(page.locator('#list-title')).toHaveText('Other');await expect(page.locator('.note-card')).toHaveCount(1);
 await put('Collections/Readme.md','# Collection information');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await browse('projects');
 // Project roots survive an unrelated note in their parent collection.
 if(phone&&await page.locator('#phone-folder-back').isVisible())await page.locator('#phone-folder-back').click();
 if(!phone)await page.locator('[data-enter-folder=""]').click();
 await expect(page.locator('[data-folder="'+prefix+'Collections/A"]')).toBeVisible();
 await destination('memory');await page.locator(phone?'[data-phone-filter=indexes]':'[data-filter=indexes]').click();await expect(page.locator('.note-card')).toHaveCount(1);
 if(phone)await page.locator('[data-phone-tab=search]').click();await page.locator('#search').fill('needle');await expect(page.locator('.note-card')).toHaveCount(1);await expect(page.locator('.note-card')).toHaveAttribute('data-path',prefix+'Agent Memory/projects/a/projects/Fact.md');await expect(page.locator('#search-scope')).toContainText('Agent memory');
 if(phone){
  let response=page.waitForResponse(r=>r.url().includes('/api/search?'));await page.locator('#search').fill('fact needle');await response;await expect(page.locator('.note-card')).toHaveCount(1);
  await page.locator('[data-phone-tab=browse]').click();response=page.waitForResponse(r=>r.url().includes('/api/search?'));await page.locator('[data-phone-tab=search]').click();await response;await expect(page.locator('.note-card')).toHaveCount(1);
 }
 if(phone)expect(await page.locator('.phone-nav button').count()).toBe(4);
});
