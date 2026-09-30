'use strict';
const crypto = require('node:crypto');
const VERSION = 'XUNDIAN-REFERENCE-3.0';
const chemistries = { lfp: '磷酸铁锂', ncm: '三元', small_ncm: '小三元（来源分类）' };
const forms = { prismatic: '方壳', pouch: '软包', cylindrical: '圆柱', unspecified: '不清楚' };
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function text(value, max = 100) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function positive(value, label, max = 1000000) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw new InputError(`请填写${label}`);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new InputError(`${label}须大于0且不超过${max}`);
  return n;
}
const money = n => Math.round(n * 100) / 100;
function estimate(raw, catalog, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('估价参数格式错误');
  let input = { chemistry: text(raw.chemistry), basis: text(raw.basis), form: text(raw.form) || 'unspecified',
    goods: text(raw.goods), condition: text(raw.condition), brand: text(raw.brand, 40), region: text(raw.region, 40),
    vehicleId: text(raw.vehicleId), vehicleDescription: text(raw.vehicleDescription, 100) };
  let vehicle = null;
  if (input.vehicleId) {
    vehicle = catalog.vehicles.find(v => v.id === input.vehicleId && v.verified === true);
    if (!vehicle) throw new InputError('车辆配置未核实，请使用电池参数估价');
    if (raw.originalBatteryConfirmed !== true) throw new InputError('请确认当前为该配置原装电池；更换过电池请按实际参数估价');
    input.chemistry = vehicle.chemistry; input.vehicleDescription = vehicle.label;
  }
  if (!Object.hasOwn(chemistries, input.chemistry)) throw new InputError('请选择电池材料体系');
  if (!Object.hasOwn(forms, input.form)) throw new InputError('封装类型不支持');
  if (!['pack', 'cell', 'module'].includes(input.goods)) throw new InputError('请选择完整电池包、电芯或模组');
  if (!['normal', 'damaged', 'flooded', 'burned', 'missing', 'unknown'].includes(input.condition)) throw new InputError('请选择电池状态');
  if (!['energy', 'weight'].includes(input.basis)) throw new InputError('请选择按电量或按重量估价');
  input.quantity = positive(vehicle ? (input.basis === 'energy' ? vehicle.energyKwh : vehicle.massKg) : raw.quantity,
    input.basis === 'energy' ? '额定电量（kWh）' : '电池重量（kg）');
  input.capacityAh = raw.capacityAh === '' || raw.capacityAh == null ? null : positive(raw.capacityAh, '单体容量Ah', 10000);
  const base = { id: `XR-${crypto.randomUUID()}`, createdAt: now.toISOString(), algorithmVersion: VERSION,
    catalogVersion: catalog.version, input, vehicle: vehicle ? structuredClone(vehicle) : null,
    title: input.vehicleDescription || `${chemistries[input.chemistry]} · ${input.goods === 'pack' ? '电池包' : input.goods === 'cell' ? '电芯' : '模组'}`,
    basisUnit: input.basis === 'energy' ? 'kWh' : 'kg', priceUnit: '元/批', warnings: [],
    status: 'needs_review', statusLabel: '待补充数据', result: null, references: [],
    scope: '材料回收参考，不含另行约定的拆车、物流与异常处理费用，不是最终收购承诺' };
  if (input.condition !== 'normal') return { ...base, statusLabel: '需人工核验', warnings: ['当前状态不能使用正常电池行情自动报价，请提供状态说明并申请核验。'] };
  let rows;
  if (input.basis === 'weight') {
    rows = catalog.weightRates.filter(r => r.verified && r.chemistry === input.chemistry && r.form === input.form && r.goods === input.goods
      && r.unit === 'CNY/kg' && r.validFrom <= now.toISOString().slice(0, 10) && r.validUntil >= now.toISOString().slice(0, 10)
      && input.quantity >= r.minWeightKg && input.quantity <= r.maxWeightKg);
    if (!rows.length) return { ...base, warnings: ['尚无该货物形态和封装的有效元/kg基准；不会用黑粉价格或虚构系数替代。'] };
    base.matchLevel = '重量分类匹配';
    base.warnings.push('重量基准仅适用于已核实的质量区间与交付条件；平台评估报告不代表实际成交。');
  } else {
    rows = catalog.quotes.filter(r => r.current && r.reviewStatus === 'usable_reference' && r.chemistry === input.chemistry);
    if (input.form !== 'unspecified') rows = rows.filter(r => r.form === input.form || r.form === 'unspecified');
    if (input.brand) rows = rows.filter(r => r.brand === input.brand);
    if (input.capacityAh !== null) rows = rows.filter(r => r.capacityAh === input.capacityAh);
    if (!rows.length) return { ...base, warnings: ['当前报价库无匹配规格。请检查品牌和单体Ah；系统不会自动套用其他品牌或材料的价格。'] };
    base.matchLevel = rows.length === 1 ? '来源规格匹配（不是唯一型号识别）' : '同类规格样本范围';
    base.warnings.push('电池之家截图的额定/实测电量分母、整包/电芯交付范围尚待确认；以下是行情参考乘算。');
    if (rows.some(r => !r.periodConfirmed)) base.warnings.push('当前截图没有显示报价周期，2026-09-29是截图采集日，不是确认的行情发布日期。');
    if (input.form !== 'unspecified' && rows.some(r => r.form === 'unspecified')) base.warnings.push('部分来源未标明封装，当前无法据此核实封装匹配。');
  }
  const rates = rows.map(r => r.price).sort((a,b) => a-b);
  const median = rates.length % 2 ? rates[(rates.length-1)/2] : (rates[rates.length/2-1]+rates[rates.length/2])/2;
  base.result = { low: money(rates[0] * input.quantity), high: money(rates.at(-1) * input.quantity),
    center: money(median * input.quantity), rateLow: rates[0], rateHigh: rates.at(-1), rateMedian: median,
    count: rows.length, intervalMeaning: rates.length === 1 ? '单条来源参考值；未人为扩张区间' : '匹配规格的最低至最高参考值，不是统计置信区间' };
  base.references = rows.map(r => structuredClone(r));
  base.status = 'reference'; base.statusLabel = '行情参考测算';
  if (input.basis === 'energy') {
    const oldestCapture = rows.map(r => r.capturedAt).sort()[0];
    const age = Math.floor((now - new Date(`${oldestCapture}T00:00:00+08:00`)) / 86400000);
    if (age > 14) { base.status = 'stale_reference'; base.statusLabel = '历史行情参考'; base.warnings.push('行情采集已超过14天，请更新数据后再用于当前交易决策。'); }
  }
  return base;
}
module.exports = { estimate, InputError, positive, text, VERSION, chemistries, forms };
