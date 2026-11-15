import {chromium} from 'playwright';
import path from 'node:path';
import assert from 'node:assert/strict';
const videoId=process.argv[2]||'3Stflj2whx8';
const out='/Users/macbookpro/.codex/visualizations/2026/10/31/01a19246-d474-7910-b074-7746fe7c889f';
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,viewport:{width:360,height:850},recordVideo:{dir:'/tmp/yt-review-real',size:{width:480,height:850}},args:[`--disable-extensions-except=${path.resolve(import.meta.dirname,'../extension/dist')}`,`--load-extension=${path.resolve(import.meta.dirname,'../extension/dist')}`]});
try{
const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
await worker.evaluate(()=>chrome.storage.local.set({downloadCount:2,reviewPromptShown:false}));
const yt=await context.newPage();
await yt.goto(`https://www.youtube.com/watch?v=${videoId}`,{waitUntil:'domcontentloaded',timeout:45000});
const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({url:'https://www.youtube.com/*'}))[0].id);
const page=await context.newPage();
await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html?tabId=${tabId}`);
const cdp=await context.newCDPSession(page);
let button;
for(let i=0;i<25;i++){
 const tree=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
 const find=node=>{
  if(node.nodeName==='BUTTON'&&node.attributes?.includes('Download subtitles as a file'))return node;
  for(const child of [...(node.children??[]),...(node.shadowRoots??[])]){const found=find(child);if(found)return found;}
 };
 button=find(tree.root);
 const snap=await cdp.send('DOMSnapshot.captureSnapshot',{computedStyles:[]});
 if(button&&snap.strings.includes('transcript-row'))break;
 button=null;
 await page.waitForTimeout(1000);
}
if(!button){
 const snap=await cdp.send('DOMSnapshot.captureSnapshot',{computedStyles:[]});
 console.log('REAL FLOW BLOCKED:',snap.strings.filter(s=>/transcript|subtitle|YouTube|error|failed|provide/i.test(s)&&s.length<250));
 await page.screenshot({path:`${out}/review-real-blocked.png`});
 process.exitCode=2;
}else{
 const remote=await cdp.send('DOM.resolveNode',{nodeId:button.nodeId});
 const download=page.waitForEvent('download',{timeout:30000});
 await cdp.send('Runtime.callFunctionOn',{objectId:remote.object.objectId,functionDeclaration:'function(){this.click()}'});
 const file=await download;console.log('Real file downloaded:',file.suggestedFilename());
 await page.waitForTimeout(1500);
 const snap=await cdp.send('DOMSnapshot.captureSnapshot',{computedStyles:[]});
 assert.ok(snap.strings.includes('review-toast'),'Review must appear after successful download');
 const counter=await worker.evaluate(()=>chrome.storage.local.get(['downloadCount','reviewPromptShown']));
 assert.equal(counter.downloadCount,3);assert.equal(counter.reviewPromptShown,true);
 await page.screenshot({path:`${out}/review-real-success.png`});
 console.log('REAL FLOW PASSED: YouTube transcript -> actual download -> automatic review card. No feedback sent.');
}
const video=page.video();await page.close();await video.saveAs(`${out}/review-real-download.webm`);
}finally{await context.close();}
