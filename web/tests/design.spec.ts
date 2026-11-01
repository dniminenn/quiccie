import {test,expect} from './fixtures';
for(const phone of [false,true])test(`colour roles and readable controls (${phone?'phone':'desktop'})`,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
 await page.locator(phone?'[data-phone-tab=notes]':'[data-filter=all]').click();
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await expect(page.locator('.note-card').first()).toBeVisible();
  const contrast=await page.evaluate(phone=>{
   const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number);
   const luminance=(v:number[])=>v.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
   const checks=phone?['.note-title','.note-excerpt','#phone-new','.phone-nav button[aria-current=page]']:['.note-title','.note-excerpt','#new-note','.sidebar nav button.active'];
   return checks.map(selector=>{const el=document.querySelector(selector)!;const fg=luminance(rgb(getComputedStyle(el).color));let node:Element|null=el,bg='';while(node){bg=getComputedStyle(node).backgroundColor;if(!bg.endsWith(', 0)')&&bg!=='transparent')break;node=node.parentElement;}const back=luminance(rgb(bg));return {selector,ratio:(Math.max(fg,back)+.05)/(Math.min(fg,back)+.05)};});
  },phone);
  for(const item of contrast)expect(item.ratio,`${theme} ${item.selector}`).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:`../.private/design-${phone?'phone':'desktop'}-${theme}.png`});
 }
 await page.locator('.note-card').first().click();await expect(page.locator('#reader')).toBeVisible();
 const colors=await page.locator('.page-scroll').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,paper:getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()}));
 expect(colors.bg).toBe('rgb(30, 34, 45)');expect(colors.paper).toBe('#1e222d');
 await page.screenshot({path:`../.private/design-reader-${phone?'phone':'desktop'}.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(phone?390:1440);
});
test('Android reader uses the shared reading surfaces',async({page})=>{
 await page.goto('/editor.html');
 for(const dark of [false,true]){
  await page.evaluate(dark=>{const w=window as any;w.setTheme(dark);w.setNote('# Heading\n\nA [link](https://example.com).\n\n> A quotation.\n\n```text\nCode\n```\n\n| Item | Value |\n| --- | --- |\n| One | Two |');},dark);
  const expected=dark?'rgb(30, 34, 45)':'rgb(255, 255, 255)';
  await expect(page.locator('#android-reader')).toHaveCSS('background-color',expected);
  await expect(page.locator('#android-reader td').first()).toHaveCSS('background-color',expected);
  await expect(page.locator('#android-reader a')).toHaveCSS('text-decoration-line','underline');
 }
});
