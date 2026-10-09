'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCatalog } = require('../server/index.cjs');
const { estimate } = require('../server/engine.cjs');
const catalog = loadCatalog();

function page(name, utils, wx = {}) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages', name, 'index.js'), 'utf8'), { Page(value) { definition = value; }, require() { return utils; }, wx });
  definition.data = structuredClone(definition.data); definition.setData = function (data) { Object.assign(this.data, data); }; return definition;
}

test('铭牌估价表单只发送确认后的核心字段', async () => {
  let saved; let route;
  const p = page('estimate', { api: async (url, method, payload) => { assert.equal(url, '/api/estimates'); saved = estimate(payload, catalog, new Date('2026-10-08')); return saved; }, request: async () => ({ items: [] }) }, { redirectTo(value) { route = value.url; } });
  p.setData({ mode: 'manual', massKg: '400', energyKwh: '55', mileageKm: '50000', region: '武汉' }); await p.submit();
  assert.equal(saved.input.massKg, 400); assert.equal(saved.input.energyKwh, 55); assert.equal(saved.input.mode, 'manual');
  assert.equal(Object.hasOwn(saved.input, 'capacityAh'), false); assert.equal(route, '/pages/report/index?id=' + saved.id);
});

test('公告车型检索保留多个候选并提交所选配置ID', async () => {
  const model = catalog.vehicleMap.models.find(item => item.configurations.length > 1);
  let payload;
  const p = page('estimate', { request: async () => ({ items: [model] }), api: async (url, method, body) => { payload = body; return { id: 'XR-1' }; } }, { redirectTo() {} });
  p.setData({ vehicleQuery: model.publicModel, mileageKm: '0', region: '北京' }); await p.searchVehicle();
  p.selectConfig({ currentTarget: { dataset: { id: model.configurations[1].id } } }); await p.submit();
  assert.equal(payload.vehicleConfigId, model.configurations[1].id); assert.equal(payload.mode, 'vehicle');
});

test('估价失败保留输入并显示错误，报告页只读取保存快照', async () => {
  const estimatePage = page('estimate', { api: async () => { throw new Error('缺少总重量'); } });
  estimatePage.setData({ mode: 'manual', massKg: '' }); await estimatePage.submit(); assert.equal(estimatePage.data.error, '缺少总重量');
  const saved = estimate({ mode: 'manual', chemistry: 'lfp', form: 'prismatic', massKg: 400, energyKwh: 55, mileageKm: 0, region: '武汉' }, catalog, new Date('2026-10-08'));
  let called = '';
  const reportPage = page('report', { api: async url => { called = url; return saved; }, date: value => value, chemistryNames: { lfp: '磷酸铁锂' }, formNames: { prismatic: '方形' } });
  reportPage.reportId = saved.id; await reportPage.load(); assert.equal(called, '/api/reports/' + saved.id); assert.equal(reportPage.data.report, saved);
});

test('客户界面不暴露底库规模、计算公式、来源或版本', () => {
  const read = relative => fs.readFileSync(path.join(__dirname, '../miniprogram', relative), 'utf8');
  const report = read('pages/report/index.wxml') + read('pages/report/index.js');
  const home = read('pages/home/index.wxml') + read('pages/home/index.js');
  const estimatePage = read('pages/estimate/index.wxml');
  for (const text of ['价格计算', '容量交叉校验', '来源与版本', '动力再生', 'algorithmVersion', 'pricingVersion', 'report.warnings']) assert.doesNotMatch(report, new RegExp(text));
  assert.doesNotMatch(home, /当前数据覆盖|vehicleCount|ConfigurationCount/);
  assert.doesNotMatch(estimatePage, /不参与价格计算|重量主估值|电量用于交叉校验/);
  assert.match(report, /主要金属含量参考/);
});

test('开发版提供双身份供需联调入口', () => {
  const me = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/me/index.wxml'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/api.js'), 'utf8');
  assert.match(me, /身份 A · 发布方/);
  assert.match(me, /身份 B · 报价方/);
  assert.match(api, /identity: value === 'B' \? 'buyer-b' : 'local-developer'/);
});
