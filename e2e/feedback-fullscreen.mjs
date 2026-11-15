import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const out='/Users/macbookpro/.codex/visualizations/2026/10/31/01a19246-d474-7910-b074-7746fe7c889f';
const browser=await chromium.launch({headless:false,args:['--start-fullscreen']});
try{
const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.goto('https://downloadsubtitles.online/uninstall/?lang=ru&version=0.2.8',{waitUntil:'networkidle',timeout:45000});
assert.equal(await page.locator('html').getAttribute('lang'),'ru');
await page.locator('input[value=not_working]').check();
await page.locator('#comment').fill('Проверка отображения формы на полном экране.');
await page.locator('#comment').blur();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
for(const field of ['.reasons','#comment','#email','button[type=submit]']){
 const rect=await page.locator(field).boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=1920);
}
await page.screenshot({path:`${out}/feedback-fullscreen-1920.png`});
await page.screenshot({path:`${out}/feedback-fullpage-1920.png`,fullPage:true});
console.log('Published RU feedback form passed at 1920x1080. No submission.');
await page.setViewportSize({width:1366,height:768});
await page.locator('button[type=submit]').scrollIntoViewIfNeeded();
assert.equal(await page.locator('button[type=submit]').isVisible(),true);
await page.screenshot({path:`${out}/feedback-fullscreen-1366.png`});
console.log('Submit remains reachable at 1366x768.');
}finally{await browser.close();}
