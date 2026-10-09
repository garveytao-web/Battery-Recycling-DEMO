'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCatalog } = require('../server/index.cjs');
const { estimate } = require('../server/engine.cjs');
const validation = require('../miniprogram/utils/validation');
const catalog = loadCatalog();

function page(name, utils, wx = {}) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages', name, 'index.js'), 'utf8'), { Page(value) { definition = value; }, require() { return utils; }, wx });
  definition.data = structuredClone(definition.data); definition.setData = function (data) { Object.assign(this.data, data); }; return definition;
}

test('铭牌估价表单只发送确认后的核心字段', async () => {
  let saved; let route;
  const p = page('estimate', { ...validation, api: async (url, method, payload) => { assert.equal(url, '/api/estimates'); saved = estimate(payload, catalog, new Date('2026-10-08')); return saved; }, request: async () => ({ items: [] }) }, { redirectTo(value) { route = value.url; } });
  p.setData({ mode: 'manual', massKg: '400', energyKwh: '55', mileageKm: '50000', region: '湖北省' }); await p.submit();
  assert.equal(saved.input.massKg, 400); assert.equal(saved.input.energyKwh, 55); assert.equal(saved.input.mode, 'manual');
  assert.equal(Object.hasOwn(saved.input, 'capacityAh'), false); assert.equal(route, '/pages/report/index?id=' + saved.id);
});

test('公告车型检索保留多个候选并提交所选配置ID', async () => {
  const model = catalog.vehicleMap.models.find(item => item.configurations.length > 1);
  let payload;
  const p = page('estimate', { ...validation, request: async () => ({ items: [model] }), api: async (url, method, body) => { payload = body; return { id: 'XR-1' }; } }, { redirectTo() {} });
  p.setData({ vehicleQuery: model.publicModel, mileageKm: '0', region: '北京市' }); await p.searchVehicle();
  p.selectConfig({ currentTarget: { dataset: { id: model.configurations[1].id } } }); await p.submit();
  assert.equal(payload.vehicleConfigId, model.configurations[1].id); assert.equal(payload.mode, 'vehicle');
});

test('估价失败保留输入并显示错误，报告页只读取保存快照', async () => {
  const estimatePage = page('estimate', { ...validation, api: async () => { throw new Error('不应发送请求'); } });
  estimatePage.setData({ mode: 'manual', region: '湖北省', mileageKm: '0', massKg: '', energyKwh: '55' }); await estimatePage.submit(); assert.equal(estimatePage.data.error, '电池包总重量只能填写数字且须大于0');
  const saved = estimate({ mode: 'manual', chemistry: 'lfp', form: 'prismatic', massKg: 400, energyKwh: 55, mileageKm: 0, region: '湖北省' }, catalog, new Date('2026-10-08'));
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
  assert.match(report, /相关回收材料行情/);
  assert.doesNotMatch(report, /主要金属含量参考|metalContentEstimates|整包占比/);
});

test('四项界面调整保留单行操作、小三元简称与轮播图增深层', () => {
  const read = relative => fs.readFileSync(path.join(__dirname, '../miniprogram', relative), 'utf8');
  const estimateMarkup = read('pages/estimate/index.wxml');
  const estimateScript = read('pages/estimate/index.js');
  const homeMarkup = read('pages/home/index.wxml');
  const homeScript = read('pages/home/index.js');
  const styles = read('app.wxss');
  assert.match(estimateMarkup, /class="config-action"/);
  assert.match(styles, /\.config-action\s*\{[^}]*white-space:nowrap/);
  assert.match(estimateScript, /'小三元'/);
  assert.doesNotMatch(estimateScript + estimateMarkup, /小三元（来源分类）/);
  assert.match(homeScript, /banner-3\.png', tone: 'deep'/);
  assert.match(homeMarkup, /class="banner-tint"/);
  assert.match(styles, /\.banner-tint\s*\{/);
});

test('省份下拉、数字字段、11位手机号与估价标签单行校验已接入', async () => {
  const read = relative => fs.readFileSync(path.join(__dirname, '../miniprogram', relative), 'utf8');
  const estimateMarkup = read('pages/estimate/index.wxml');
  const publishMarkup = read('pages/publish/index.wxml');
  const tradeMarkup = read('pages/trade/index.wxml');
  const historyMarkup = read('pages/history/index.wxml');
  const styles = read('app.wxss');
  assert.match(estimateMarkup, /range="\{\{provinces\}\}"/);
  assert.match(publishMarkup, /range="\{\{provinces\}\}"/);
  assert.doesNotMatch(estimateMarkup + publishMarkup, /车辆所在城市|<text class="label">城市/);
  assert.match(tradeMarkup, /type="number"[^>]*maxlength="11"/);
  assert.match(historyMarkup, /history-title/);
  assert.match(styles, /\.tag\s*\{[^}]*white-space:nowrap/);
  assert.equal(validation.provinces.length, 31);
  assert.equal(validation.isPositiveNumber('420.5'), true);
  assert.equal(validation.isPositiveNumber('4e2'), false);
  assert.equal(validation.isPhone('13800138000'), true);
  assert.equal(validation.isPhone('1380013800x'), false);
});

test('开发版提供双身份供需联调入口', () => {
  const me = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/me/index.wxml'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/api.js'), 'utf8');
  assert.match(me, /身份 A · 发布方/);
  assert.match(me, /身份 B · 报价方/);
  assert.match(api, /identity: value === 'B' \? 'buyer-b' : 'local-developer'/);
});
