'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../server/data/catalog.json');
const { estimate } = require('../server/engine.cjs');
function page(name, utils, wx={}) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages',name,'index.js'),'utf8'),{Page(p){definition=p;},require(){return utils;},wx});
  definition.data=structuredClone(definition.data); definition.setData=function(data){Object.assign(this.data,data);}; return definition;
}
test('小程序估价表单发出正确单位参数，并跳转到已保存报告ID',async()=> {
  let saved; let route;
  const p=page('estimate',{request:async()=>({quotes:catalog.quotes.filter(r=>r.current)}),api:async(url,method,payload)=>{assert.equal(url,'/api/estimates'); saved=estimate(payload,catalog,new Date('2026-09-30')); return saved;}},{redirectTo(v){route=v.url;}});
  await p.load(); p.setData({quantity:'60',region:'济南'}); await p.submit();
  assert.equal(saved.input.quantity,60); assert.equal(saved.input.basis,'energy'); assert.equal(saved.input.goods,'pack'); assert.equal(p.data.busy,false); assert.equal(route,'/pages/report/index?id='+saved.id);
});
test('估价失败保留用户输入并显示错误，不能假成功',async()=> { const p=page('estimate',{api:async()=>{throw new Error('缺少数量');}}); p.setData({quantity:''}); await p.submit(); assert.equal(p.data.error,'缺少数量'); assert.equal(p.data.busy,false); });
test('报告页只读取保存的报告，不触发重新估价',async()=> { const saved=estimate({chemistry:'lfp',goods:'pack',form:'unspecified',condition:'normal',basis:'energy',quantity:60},catalog,new Date('2026-09-30')); let called=''; const p=page('report',{api:async(url)=>{called=url;return saved;},date:v=>v,chemistryNames:{lfp:'磷酸铁锂'}}); p.reportId=saved.id; await p.load(); assert.equal(called,'/api/reports/'+saved.id); assert.equal(p.data.report,saved); });
