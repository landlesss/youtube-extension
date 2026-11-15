import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {build}=createRequire(new URL('../extension/package.json',import.meta.url))('esbuild');
const result=await build({entryPoints:[new URL('../extension/src/content/ui.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'panelLib'});
const browser=await chromium.launch({headless:true});
try{
for(const width of [260,320,480]){
const page=await browser.newPage({viewport:{width,height:600}});
await page.setContent('<body style="margin:0"></body>');
await page.evaluate(()=>{
 const attach=Element.prototype.attachShadow;
 Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'});};
 window.chrome={i18n:{getMessage:key=>key==='reviewToastText'?'Нравится расширение?':key},runtime:{getURL:x=>x}};
});
await page.addScriptTag({content:result.outputFiles[0].text});
await page.evaluate(()=>{const panel=new panelLib.SubtitlePanel({});panel.renderEmpty();panel.showReviewToast();});
await page.waitForTimeout(400);
const bounds=await page.evaluate(()=>{
 const s=document.querySelector('#yt-subs-downloader-host').shadowRoot;
 const toast=s.querySelector('.review-toast').getBoundingClientRect();
 const panel=s.querySelector('.panel').getBoundingClientRect();
 return {left:toast.left,right:toast.right,bottom:toast.bottom,top:toast.top,panelBottom:panel.bottom,stars:[...s.querySelectorAll('.star-btn')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};})};
});
assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.bottom<=600);
assert.ok(bounds.panelBottom<=bounds.top);
assert.equal(bounds.stars.length,5);
for(const star of bounds.stars)assert.ok(star.left>=bounds.left&&star.right<=bounds.right);
await page.locator('.review-toast-close').click();
assert.equal(await page.locator('.review-toast').count(),0);
await page.close();
}
console.log('Review card fits at 260/320/480px, keeps five stars visible, does not overlap panel and closes.');
}finally{await browser.close();}
