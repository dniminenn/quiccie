import {test,expect} from './fixtures';
for(const phone of [false,true])test(`dark folder navigation and scope restore (${phone?'phone':'desktop'})`,async({page,context})=>{
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
 const base='Dark regression '+Date.now();
 for(const [tail,content] of [['Direct.md','# Direct'],['Child/Deep.md','# Deep']])await context.request.put('/api/notes',{headers:{'X-Quiccie-Request':'1'},data:{path:base+'/'+tail,content}});
 await page.evaluate(()=>{localStorage.setItem('quiccie-theme','dark');window.dispatchEvent(new Event('online'));});
 await expect(page.locator('#note-items')).toContainText('Direct');
 await page.reload();await expect(page.locator('#sync-state')).toHaveText('Synced');
 if(phone){await page.locator('[data-phone-tab=browse]').click();await page.locator('[data-phone-tab=files]').click();}
 await page.locator(`[data-folder="${base}"]`).click();
 await expect(page.locator('.folder-card')).toContainText('Child');
 await expect(page.locator('.note-card')).toHaveCount(1);
 await expect(page.locator('.note-card')).toContainText('Direct');
 if(!phone)await expect(page.locator(`[data-folder="${base}/Child"]`)).toBeVisible();
 await page.locator('.folder-card').click();
 await expect(page.locator('.note-card')).toContainText('Deep');
 await page.reload();await expect(page.locator('.note-card')).toContainText('Deep');
 await expect(page.locator('.folder-crumbs')).toContainText('Child');
 if(phone){
  const nav=page.locator('.phone-nav');expect(await nav.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(19, 22, 30)');
  expect(await nav.evaluate(el=>getComputedStyle(el).gap)).toBe('8px');
  await page.locator('.phone-header [data-add-space]').click();await expect(page.locator('#space-dialog')).toBeVisible();await page.goBack();await expect(page.locator('#space-dialog')).toBeHidden();await expect(page.locator('.folder-crumbs')).toContainText('Child');
 }
 await page.screenshot({path:`../.private/dark-built-${phone?'phone':'desktop'}.png`});
});
