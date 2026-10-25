const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
import fs from 'node:fs/promises';
await fs.mkdir('test/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.MONITOR_URL || 'http://127.0.0.1:4287');await page.getByText('Local monitor is ready.',{exact:false}).waitFor();
await page.screenshot({path:'test/screenshots/desktop.png',fullPage:true});
await page.getByText('Other ways to test',{exact:true}).click();await page.getByRole('button',{name:'Run test signal',exact:true}).click();
await page.waitForFunction(()=>{const video=document.querySelector('video');return video && video.videoWidth>0 && video.currentTime>0;},{},{timeout:30000});
console.log('video',await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,paused:v.paused})));
await page.screenshot({path:'test/screenshots/playback.png',fullPage:true});await page.getByRole('button',{name:'Stop live view',exact:true}).click();await page.getByRole('heading',{name:'Bring your doorbell into view'}).waitFor();
await page.getByRole('button',{name:'APK findings',exact:true}).click();await page.getByRole('heading',{name:'Recovered command IDs'}).waitFor();
if(await page.locator('table').getByText('40003',{exact:true}).count()!==1)throw new Error('RTSP command evidence missing');
await page.getByRole('button',{name:'Cameras',exact:false}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test/screenshots/mobile.png',fullPage:true});
await page.getByRole('button',{name:'APK findings',exact:true}).click();await page.getByRole('heading',{name:'Recovered command IDs'}).waitFor();await page.getByRole('button',{name:'Cameras',exact:false}).click();
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw new Error('Mobile layout overflows');
if(errors.length)throw new Error(errors.join('\n'));console.log('PASS: page load, decoded moving video, stop, evidence, mobile navigation/overflow, no page errors');
await page.route('**/api/state',async route=>{const response=await route.fetch();const data=await response.json();data.account={status:'captcha',devices:[],challenge:{kind:'captcha',image:null}};await route.fulfill({response,json:data});});await page.reload();await page.getByText('Captcha required',{exact:true}).waitFor();await page.screenshot({path:'test/screenshots/mobile-captcha-fixture.png',fullPage:true});
await page.unroute('**/api/state');await page.route('**/api/state',async route=>{const response=await route.fetch();const data=await response.json();data.account={status:'connected',devices:[{sn:'fixture-unsupported',name:'Unsupported fixture device',model:'TEST',canLive:false}],challenge:null};await route.fulfill({response,json:data});});await page.reload();await page.getByRole('heading',{name:'Live view is unavailable',exact:true}).waitFor();await page.screenshot({path:'test/screenshots/mobile-unsupported-fixture.png',fullPage:true});console.log('PASS: captcha status and unsupported-device guidance (intercepted fixtures, no Eufy login)');await browser.close();

