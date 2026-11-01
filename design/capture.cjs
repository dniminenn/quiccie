const { chromium } = require('../web/node_modules/playwright');
const { expect } = require('../web/node_modules/@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
 const base = process.env.QUICCIE_DEMO_URL || 'http://127.0.0.1:18090';
 const url = new URL(base);
 if (!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Use the local synthetic demo.');
 const directory=path.join(__dirname,'../docs/images');fs.mkdirSync(directory,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try {
  for(const phone of [false,true]){
   const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:phone,hasTouch:phone});
   const page=await context.newPage();
   await page.addInitScript(dark=>localStorage.setItem('quiccie-theme',dark?'dark':'light'),phone);
   await page.goto(base);
   await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await expect(page.locator('#sync-state')).toHaveText('Synced',{timeout:30000});
   await page.evaluate(dark=>{document.documentElement.dataset.theme=dark?'dark':'light';},phone);
   if(phone){await page.locator('[data-phone-tab=search]').click();await page.locator('#search').fill('Home Lab/Overview/Service Map.md');await page.locator('.note-card').first().click();}
   else {await page.locator('[data-toggle="Home Lab"]').click();await page.locator('[data-toggle="Home Lab/Overview"]').click();await page.locator('[data-tree-note="Home Lab/Overview/Service Map.md"]').click();}
   await expect(page.locator('#reader table')).toBeVisible();
   await page.screenshot({path:path.join(directory,phone?'phone-dark.png':'desktop-light.png')});
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
