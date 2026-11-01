import {test,expect} from './fixtures';
for(const phone of [false,true])test(`Notes and memory have separate destinations (${phone?'phone':'desktop'})`,async({page,context})=>{
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
 const id='nav-'+Date.now(),prefix='Spaces/'+id+'/';
 expect((await context.request.post('/api/spaces',{headers:{'X-Quiccie-Request':'1'},data:{id,name:'Navigation '+id}})).ok()).toBeTruthy();
 const files=[['Projects/Alpha/Overview.md','# Alpha'],['Projects/Alpha/Deep/Guide.md','# Guide'],['Projects/Beta/Overview.md','# Beta'],['Loose.md','# Loose'],['Agent Memory/projects/alpha/projects/Fact.md','# Fact'],['Agent Memory/projects/alpha/indexes/MEMORY.md','# Imported index'],['Agent Memory/projects/alpha/derived/memory_summary.md','# Imported summary']];
 for(const [path,content] of files)expect((await context.request.put('/api/notes',{headers:{'X-Quiccie-Request':'1'},data:{path:prefix+path,content}})).ok()).toBeTruthy();
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const controls=page.locator(phone?'.phone-header':'.sidebar');await expect(controls.locator('[data-space-select] option[value="'+id+'"]').first()).toBeAttached();await controls.locator('[data-space-select]').selectOption(id);
 const destination=async(kind:string)=>page.locator(phone?`[data-phone-tab=${kind==='memory'?'memory':'notes'}]`:`[data-filter=${kind==='memory'?'memory':'all'}]`).click();
 await destination('memory');await expect(page.locator('.note-card')).toHaveCount(1);await expect(page.locator('#list-title')).toContainText('Agent memory');
 if(phone)await page.locator('[data-phone-filter=all]').click();
 await expect(page.locator('.note-card')).toHaveCount(1);await expect(page.locator('.note-card')).toContainText('Fact');
 await page.locator(phone?'[data-phone-filter=indexes]':'[data-filter=indexes]').click();await expect(page.locator('.note-card')).toHaveCount(2);await expect(page.locator('#list-title')).toHaveText('Imported indexes');
 await page.locator('.note-card').first().click();await expect(page.locator('#reader')).toBeVisible();
 if(phone)await page.locator('#phone-back').click();
 await destination('notes');await expect(page.locator('#reader')).toBeHidden();await expect(page.locator('.note-card')).toHaveCount(4);expect(await page.locator('.note-card').evaluateAll(rows=>rows.every(e=>!e.getAttribute('data-path')!.includes('Agent Memory/')))).toBe(true);
 if(phone)await page.locator('[data-phone-tab=browse]').click();await page.locator(phone?'[data-phone-tab=projects]':'#projects-tab').click();
 await expect(page.locator('[data-folder="'+prefix+'Projects/Alpha"]')).toBeVisible();await expect(page.locator('[data-folder="'+prefix+'Projects/Beta"]')).toBeVisible();await expect(page.locator('[data-folder="'+prefix+'Projects"]')).toHaveCount(0);
 await page.locator('[data-folder="'+prefix+'Projects/Alpha"]').click();await expect(page.locator('.folder-card')).toContainText('Deep');await expect(page.locator('.note-card')).toContainText('Overview');
 if(phone){await page.locator('[data-phone-tab=browse]').click();await page.locator('[data-phone-tab=files]').click();}else await page.locator('#files-tab').click();await expect(page.locator('[data-folder="'+prefix+'Projects"]')).toBeVisible();
 await destination('memory');await page.reload();await expect(page.locator('#list-title')).toContainText(/memory/i);await expect(page.locator('.note-card')).toHaveCount(1);
 if(phone){expect(await page.locator('.phone-nav button').count()).toBe(4);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);}
});
