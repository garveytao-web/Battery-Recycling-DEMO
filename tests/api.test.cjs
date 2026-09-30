'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/index.cjs');
const original = require('../server/data/catalog.json');
const env = { NODE_ENV:'test',HOST:'127.0.0.1',ALLOW_DEV_AUTH:'true' };
const estimateInput = { chemistry:'lfp',goods:'pack',form:'unspecified',condition:'normal',basis:'energy',quantity:60 };
async function start(options={}) {
  const app = createApp({ env,dbPath:':memory:',getCatalog:()=>original,...options });
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:'+app.server.address().port;
  return { ...app, async call(route,method='GET',data,token) { const r = await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)}); return { status:r.status,body:await r.json() }; }, async stop() { await new Promise(resolve=>app.server.close(resolve)); } };
}
async function login(app,identity) { const r = await app.call('/api/auth/dev','POST',{identity,privacyAccepted:true}); assert.equal(r.status,200); return r.body.token; }
test('报告端到端：登录、估价、历史、快照不变、权限隔离',async()=> {
  const catalog=structuredClone(original); const app=await start({getCatalog:()=>catalog});
  try {
    assert.equal((await app.call('/api/estimates','POST',estimateInput)).status,401);
    assert.equal((await app.call('/api/auth/dev','POST',{})).status,400);
    const a=await login(app,'a'),b=await login(app,'b');
    const created=await app.call('/api/estimates','POST',estimateInput,a); assert.equal(created.status,201);
    const report=created.body; assert.ok(report.result);
    catalog.quotes.forEach(r=>r.price=99999);
    assert.deepEqual((await app.call('/api/reports/'+report.id,'GET',undefined,a)).body,report);
    assert.equal((await app.call('/api/reports/'+report.id,'GET',undefined,b)).status,404);
    assert.equal((await app.call('/api/reports','GET',undefined,b)).body.items.length,0);
    assert.equal((await app.call('/api/reports','GET',undefined,a)).body.items[0].id,report.id);
    assert.equal((await app.call('/api/estimates','POST',{...estimateInput,quantity:'bad'},a)).status,400);
    assert.equal((await app.call('/api/estimates','POST',{...estimateInput,extra:'x'.repeat(70000)},a)).status,413);
    await app.call('/api/logout','POST',{},a);
    assert.equal((await app.call('/api/reports','GET',undefined,a)).status,401);
  } finally { await app.stop(); }
});
test('供需端到端：审核后公开，报价私有，单位不可篡改，撤下与删除生效',async()=> {
  const app=await start();
  try {
    const a=await login(app,'a'),b=await login(app,'b'),c=await login(app,'c');
    const report=(await app.call('/api/estimates','POST',estimateInput,a)).body;
    const input={title:'测试电池包',region:'济南',kind:'supply',chemistry:'lfp',quantity:60,quantityUnit:'kWh',priceUnit:'CNY/kWh',reportId:report.id,description:'测试用'};
    assert.equal((await app.call('/api/trades','POST',input,b)).status,404);
    assert.equal((await app.call('/api/trades','POST',{...input,quantityUnit:'kg'},a)).status,400);
    const created=await app.call('/api/trades','POST',input,a); assert.equal(created.status,201); const trade=created.body;
    assert.equal((await app.call('/api/trades','GET',undefined,b)).body.items.length,0);
    assert.equal((await app.call('/api/trades/'+trade.id,'GET',undefined,b)).status,404);
    assert.equal((await app.call('/api/trades?mine=1','GET',undefined,a)).body.items[0].status,'pending');
    app.db.prepare("UPDATE trades SET status='approved' WHERE id=?").run(trade.id);
    assert.equal((await app.call('/api/trades','GET',undefined,b)).body.items.length,1);
    const offer={price:100,priceUnit:'CNY/kg',contact:'仅测试联系方式',message:'现场验货',contactConsent:true};
    assert.equal((await app.call('/api/trades/'+trade.id+'/offers','POST',offer,a)).status,400);
    assert.equal((await app.call('/api/trades/'+trade.id+'/offers','POST',{...offer,contactConsent:false},b)).status,400);
    const offered=await app.call('/api/trades/'+trade.id+'/offers','POST',offer,b); assert.equal(offered.status,201); assert.equal(offered.body.priceUnit,'CNY/kWh');
    assert.equal((await app.call('/api/trades/'+trade.id,'GET',undefined,a)).body.offers[0].contact,offer.contact);
    assert.equal((await app.call('/api/trades/'+trade.id,'GET',undefined,b)).body.offers.length,1);
    assert.equal((await app.call('/api/trades/'+trade.id,'GET',undefined,c)).body.offers.length,0);
    assert.equal((await app.call('/api/offers/mine','GET',undefined,b)).body.items.length,1);
    assert.equal((await app.call('/api/trades/'+trade.id,'DELETE',undefined,b)).status,403);
    assert.equal((await app.call('/api/trades/'+trade.id,'DELETE',undefined,a)).status,200);
    assert.equal((await app.call('/api/trades','GET',undefined,b)).body.items.length,0);
    assert.equal((await app.call('/api/trades/'+trade.id+'/offers','POST',offer,b)).status,404);
    assert.equal((await app.call('/api/account','DELETE',undefined,a)).status,200);
    assert.equal((await app.call('/api/reports','GET',undefined,a)).status,401);
    assert.equal((await app.call('/api/offers/mine','GET',undefined,b)).body.items.length,0);
  } finally { await app.stop(); }
});
test('SQLite重启后保留报告与会话',async()=> {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xundian-test-')); const dbPath=path.join(dir,'test.sqlite');
  let app=await start({dbPath});
  try { const token=await login(app,'persist'); const report=(await app.call('/api/estimates','POST',estimateInput,token)).body; await app.stop(); app=await start({dbPath}); const loaded=await app.call('/api/reports/'+report.id,'GET',undefined,token); assert.equal(loaded.status,200); assert.deepEqual(loaded.body,report); }
  finally { await app.stop(); fs.rmSync(dir,{recursive:true,force:true}); }
});
test('微信登录code仅在后端交换，openid和session_key不泄露',async()=> {
  let fetched=''; const app=await start({env:{...env,ALLOW_DEV_AUTH:'false',WECHAT_APP_ID:'wx0000000000000000',WECHAT_APP_SECRET:'server-test-secret'},fetch:async url=> { fetched=url; return {ok:true,json:async()=>({openid:'private-openid',session_key:'private-session-key'})}; }});
  try { assert.equal((await app.call('/api/auth/dev','POST',{privacyAccepted:true})).status,403); const result=await app.call('/api/auth/wechat','POST',{privacyAccepted:true,code:'one-use-code'}); assert.equal(result.status,200); assert.ok(fetched.startsWith('https://api.weixin.qq.com/sns/jscode2session?')); assert.ok(fetched.includes('one-use-code')); assert.doesNotMatch(JSON.stringify(result.body),/private-|server-test-secret/); assert.equal((await app.call('/api/reports','GET',undefined,result.body.token)).status,200); }
  finally { await app.stop(); }
});
test('生产环境不允许开发登录或缺少运营配置',()=> { assert.throws(()=>createApp({env:{NODE_ENV:'production',ALLOW_DEV_AUTH:'true'},dbPath:':memory:'})); assert.throws(()=>createApp({env:{NODE_ENV:'test',ALLOW_DEV_AUTH:'true',HOST:'0.0.0.0'},dbPath:':memory:'})); });
