'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimate } = require('../server/engine.cjs');
const { loadCatalog } = require('../server/index.cjs');
const { parseCSV, validateRecords } = require('../server/catalog-import.cjs');

const catalog = loadCatalog();
const now = new Date('2026-10-08T08:00:00Z');
const manual = { mode: 'manual', chemistry: 'lfp', form: 'prismatic', massKg: 400, energyKwh: 55, mileageKm: 50000, region: '武汉' };

test('车型与价格数据覆盖达到当前冻结版本', () => {
  assert.equal(catalog.vehicleMap.searchableModelCount, 651);
  assert.equal(catalog.vehicleMap.searchableConfigurationCount, 683);
  assert.equal(catalog.vehicleMap.priceReadyConfigurationCount, 667);
  assert.equal(catalog.pricing.weightRates.length, 9);
});
test('重量主算法复现动力再生线性样本', () => {
  const report = estimate(manual, catalog, now);
  assert.equal(report.weightEstimate.rate, 12.691);
  assert.equal(report.weightEstimate.center, 5076.4);
  assert.equal(report.result.center, 5076.4);
  assert.equal(report.result.primaryMethod, '电池包总重量 × 动力再生分类基准价');
});

test('地区与里程只进入快照，不改变价格', () => {
  const a = estimate(manual, catalog, now);
  const b = estimate({ ...manual, region: '上海', mileageKm: 180000 }, catalog, now);
  assert.deepEqual(b.result, a.result);
  assert.equal(b.input.region, '上海');
  assert.equal(b.input.mileageKm, 180000);
});

test('容量沿用重量价格体系交叉校验，不覆盖重量主估值', () => {
  const report = estimate(manual, catalog, now);
  assert.equal(report.energyCheck.available, true);
  assert.equal(report.energyCheck.massPerKwh, 7.2606);
  assert.ok(report.energyCheck.differencePercent >= 0);
  assert.match(report.energyCheck.conclusion, /不自动修改/);
});

test('车辆候选配置由服务端快照覆盖客户端伪造字段', () => {
  const vehicle = catalog.vehicles.find(row => row.priceReady && row.energyKwh);
  const report = estimate({ mode: 'vehicle', vehicleConfigId: vehicle.id, chemistry: 'lfp', form: 'pouch', massKg: 1, energyKwh: 1, mileageKm: 0, region: '北京' }, catalog, now);
  assert.equal(report.input.massKg, vehicle.massKg);
  assert.equal(report.input.energyKwh, vehicle.energyKwh);
  assert.equal(report.input.chemistry, vehicle.chemistry);
  assert.equal(report.vehicle.id, vehicle.id);
});

test('歧义车型配置保留但不能静默进入估价', () => {
  const ambiguous = catalog.vehicles.find(row => !row.priceReady);
  assert.ok(ambiguous);
  assert.throws(() => estimate({ mode: 'vehicle', vehicleConfigId: ambiguous.id, mileageKm: 0, region: '武汉' }, catalog, now), /铭牌参数/);
});

test('拒绝缺失、负数与非法枚举，已删除的旧表单字段不起作用', () => {
  assert.throws(() => estimate({ ...manual, massKg: 0 }, catalog, now));
  assert.throws(() => estimate({ ...manual, energyKwh: '' }, catalog, now));
  assert.throws(() => estimate({ ...manual, mileageKm: -1 }, catalog, now));
  assert.throws(() => estimate({ ...manual, chemistry: 'lead' }, catalog, now));
  const report = estimate({ ...manual, condition: 'burned', capacityAh: 280, goods: 'cell' }, catalog, now);
  assert.equal(report.result.center, 5076.4);
});

test('报告附静态材料行情但不计算理论金属贡献', () => {
  const report = estimate(manual, catalog, now);
  assert.ok(report.materialReferences.length >= 2);
  assert.equal(Object.hasOwn(report.result, 'metalContribution'), false);
  assert.match(report.scope, /不构成最终收购承诺/);
});

test('CSV导入工具继续支持中文、BOM、换行与严格单位', () => {
  assert.deepEqual(parseCSV('\uFEFFid,note\r\na,"甲,乙\n丙"\r\n'), [{ id: 'a', note: '甲,乙\n丙' }]);
  const row = { id: 'a', chemistry: 'lfp', source: 'PDF1', form: 'prismatic', goods: 'pack', price: '10', unit: 'CNY/kg', minWeightKg: '200', maxWeightKg: '200', validFrom: '2026-09-30', validUntil: '2026-09-30' };
  assert.equal(validateRecords('weightRates', [row])[0].price, 10);
  assert.throws(() => validateRecords('weightRates', [{ ...row, unit: 'CNY/t' }]));
});
