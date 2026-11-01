import {test as base,expect} from '@playwright/test';

// The tests share one server and one source IP. Keep successful test logins
// below the production limit of 20 attempts per minute.
let nextTestStart=0;
export const test=base.extend<{loginPace:void}>({
 loginPace:[async({},use)=>{
  const delay=Math.max(0,nextTestStart-Date.now());
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  nextTestStart=Date.now()+3300;
  await use();
 },{auto:true}],
});
export {expect};
export type {Page} from '@playwright/test';
