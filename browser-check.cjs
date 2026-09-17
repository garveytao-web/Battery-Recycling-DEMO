'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const debugPort = process.env.CODEX_DEMO_DEBUG_PORT || '9222';
const outputDir = process.argv[2] || path.join(process.cwd(), '.visual-check');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt=0; attempt<30; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response=>response.json());
      const target = targets.find(item=>item.type==='page');
      if (target) return target;
    } catch {}
    await delay(200);
  }
  throw new Error('Chrome DevTools target unavailable');
}

(async()=>{
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const browserErrors = [];
  let nextId = 1;
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const {resolve,reject} = pending.get(message.id); pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
    if (message.method==='Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
    if (message.method==='Log.entryAdded' && message.params.entry.level==='error') browserErrors.push(message.params.entry.text);
  };
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const send = (method,params={}) => new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot = async name => {
    fs.mkdirSync(outputDir,{recursive:true});
    const {data} = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(outputDir,name),Buffer.from(data,'base64'));
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:8080'}); await delay(800);

  const home = await evaluate(`(()=>{const p=document.querySelector('#phone').getBoundingClientRect();const m=document.querySelector('main');return {width:p.width,center:Math.abs((p.left+p.width/2)-innerWidth/2),overflow:document.body.scrollWidth<=innerWidth,mainOverflow:getComputedStyle(m).overflowY,banners:[...document.images].filter(i=>i.src.includes('banner-')).every(i=>i.complete&&i.naturalWidth>0)};})()`);
  assert(home.width>=390&&home.width<=430,'desktop phone width'); assert(home.center<2,'phone not centered'); assert(home.overflow,'horizontal overflow'); assert.equal(home.mainOverflow,'auto'); assert(home.banners,'banner load failure');

  await evaluate(`document.querySelector('[data-a="sample"]').click()`); await delay(100);
  assert(await evaluate(`current.page==='estimate' && document.querySelector('#packId').value==='ABCD1'`),'sample form failed');
  await evaluate(`document.querySelector('#estimate-form').requestSubmit()`); await delay(700);
  assert(await evaluate(`current.page==='report' && document.querySelectorAll('.material-row').length===7 && document.querySelector('#app').innerText.includes('材料回收总估值')`),'report generation failed');
  await screenshot('report-desktop.png');

  const generatedId = await evaluate(`current.id`);
  await evaluate(`go('history')`); await delay(80);
  await evaluate(`document.querySelector('[data-id="${generatedId}"]').click()`); await delay(80);
  assert(await evaluate(`current.page==='report' && current.id==='${generatedId}'`),'history did not reuse report route');
  await evaluate(`document.querySelector('[data-a="share"]').click()`); await delay(80);
  const shareBounds = await evaluate(`(()=>{const p=document.querySelector('#phone').getBoundingClientRect(),o=document.querySelector('.overlay').getBoundingClientRect(),m=document.querySelector('.modal').getBoundingClientRect();return {inside:o.left>=p.left&&o.right<=p.right&&o.top>=p.top&&o.bottom<=p.bottom,modal:m.left>=p.left&&m.right<=p.right&&m.top>=p.top&&m.bottom<=p.bottom};})()`);
  assert(shareBounds.inside&&shareBounds.modal,'share overlay escaped phone');
  await evaluate(`closeOverlay();go('market');go('trade',{id:'T-1001'})`); await delay(80);
  await evaluate(`document.querySelector('[data-a="quote"]').click()`); await delay(80);
  const quoteBounds = await evaluate(`(()=>{const p=document.querySelector('#phone').getBoundingClientRect(),o=document.querySelector('.overlay').getBoundingClientRect(),m=document.querySelector('.modal').getBoundingClientRect();return {inside:o.left>=p.left&&o.right<=p.right&&o.top>=p.top&&o.bottom<=p.bottom,modal:m.left>=p.left&&m.right<=p.right&&m.top>=p.top&&m.bottom<=p.bottom};})()`);
  assert(quoteBounds.inside&&quoteBounds.modal,'quote overlay escaped phone');
  await screenshot('quote-modal-desktop.png');
  await evaluate(`document.querySelector('#quote-price').value='5350';document.querySelector('#quote-form').requestSubmit()`); await delay(100);
  assert(await evaluate(`db.quotes.some(item=>item.tradeId==='T-1001'&&item.price===5350)`),'quote save failed');

  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`trail=[];go('home')`); await delay(120); await screenshot('home-mobile.png');
  const mobile = await evaluate(`(()=>{const p=document.querySelector('#phone').getBoundingClientRect();return {width:p.width,height:p.height,overflow:document.body.scrollWidth<=innerWidth};})()`);
  assert.equal(mobile.width,390); assert.equal(mobile.height,844); assert(mobile.overflow,'mobile horizontal overflow');
  const fallbackOK = await evaluate(`fetch('/report/demo').then(r=>r.text()).then(t=>t.includes('<title>循电'))`);
  assert(fallbackOK,'SPA fallback failed');
  assert.deepEqual(browserErrors,[],'browser console/runtime errors');
  console.log(`PASS: real-browser valuation flow, report reuse, quote save, responsive bounds, phone-root overlays and SPA fallback. Screenshots: ${outputDir}`);
  await send('Browser.close');
})().catch(error=>{console.error(error);process.exitCode=1;});
