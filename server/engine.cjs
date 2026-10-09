'use strict';

const crypto = require('node:crypto');

const VERSION = 'XUNDIAN-WEIGHT-4.0';
const chemistries = {
  lfp: '磷酸铁锂',
  ncm: '三元锂',
  small_ncm: '小三元（来源分类）'
};
const forms = { prismatic: '方形', pouch: '软包', cylindrical: '圆柱形' };

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function positive(value, label, max = 1000000) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw new InputError(`请填写${label}`);
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) throw new InputError(`${label}须大于0且不超过${max}`);
  return number;
}

function nonNegative(value, label, max = 2000000) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw new InputError(`请填写${label}`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) throw new InputError(`${label}须为0至${max}之间的数字`);
  return number;
}

const money = value => Math.round(value * 100) / 100;
const percent = value => Math.round(value * 10) / 10;

function materialReferences(chemistry, catalog) {
  const wanted = chemistry === 'lfp'
    ? ['磷酸铁锂电池粉', '工业级碳酸锂']
    : ['三元电池粉', '电池级硫酸镍', '电池级硫酸钴', '工业级碳酸锂'];
  return wanted.map(name => catalog.materials.find(row => row.name === name)).filter(Boolean).map(row => structuredClone(row));
}

function estimate(raw, catalog, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('估价参数格式错误');
  const mode = text(raw.mode);
  if (!['vehicle', 'manual'].includes(mode)) throw new InputError('请选择公告车型估价或铭牌参数估价');

  const common = {
    mode,
    region: text(raw.region, 40),
    mileageKm: nonNegative(raw.mileageKm, '车辆里程（km）'),
    producer: text(raw.producer, 80)
  };
  if (!common.region) throw new InputError('请填写车辆所在城市');

  let vehicle = null;
  let chemistry;
  let form;
  let massKg;
  let energyKwh;
  if (mode === 'vehicle') {
    const configId = text(raw.vehicleConfigId, 40);
    vehicle = (catalog.vehicles || []).find(row => row.id === configId);
    if (!vehicle) throw new InputError('请选择检索到的电池候选配置');
    if (!vehicle.priceReady || !vehicle.chemistry || !vehicle.form) {
      throw new InputError('该候选配置的化学体系或单体外形仍有歧义，请改用铭牌参数估价');
    }
    chemistry = vehicle.chemistry;
    form = vehicle.form;
    massKg = positive(vehicle.massKg, '电池包总重量（kg）');
    energyKwh = vehicle.energyKwh == null ? null : positive(vehicle.energyKwh, '电池包总电量（kWh）');
  } else {
    chemistry = text(raw.chemistry);
    form = text(raw.form);
    if (!Object.hasOwn(chemistries, chemistry)) throw new InputError('请选择电池化学体系');
    if (!Object.hasOwn(forms, form)) throw new InputError('请选择单体外形');
    massKg = positive(raw.massKg, '电池包总重量（kg）');
    energyKwh = positive(raw.energyKwh, '电池包总电量（kWh）');
  }

  const baseline = catalog.pricing;
  if (!baseline) throw new InputError('估价基准尚未配置', 503);
  const rate = baseline.weightRates.find(row => row.chemistry === chemistry && row.form === form);
  if (!rate) throw new InputError('当前化学体系和单体外形尚无重量价格基准');
  const spread = baseline.priceRangePercent;
  const center = money(massKg * rate.price);
  const weightEstimate = {
    low: money(center * (1 - spread)),
    center,
    high: money(center * (1 + spread)),
    rate: rate.price,
    unit: 'CNY/kg',
    sampleCount: rate.sampleCount,
    source: baseline.source,
    intervalMeaning: `中心值上下浮动${Math.round(spread * 100)}%；为当前演示假设，不是统计置信区间`
  };

  const density = energyKwh == null ? null : baseline.massPerKwh.find(row => row.chemistry === chemistry && row.form === form);
  let energyCheck = null;
  if (density) {
    const equivalentMassKg = energyKwh * density.median;
    const energyCenter = money(equivalentMassKg * rate.price);
    energyCheck = {
      available: true,
      energyKwh,
      equivalentMassKg: money(equivalentMassKg),
      massPerKwh: density.median,
      sampleCount: density.sampleCount,
      center: energyCenter,
      differenceAmount: money(energyCenter - center),
      differencePercent: center ? percent(Math.abs(energyCenter - center) / center * 100) : null,
      conclusion: '仅作交叉校验；一致性阈值待业务标定，不自动修改重量主估值'
    };
  } else if (energyKwh != null) {
    energyCheck = {
      available: false,
      energyKwh,
      conclusion: '该化学体系与单体外形暂无足够车型样本，未生成容量校验价'
    };
  }

  const input = {
    ...common,
    chemistry,
    form,
    massKg,
    energyKwh,
    publicModel: vehicle?.publicModel || null,
    vehicleConfigId: vehicle?.id || null,
    vehicleMaker: vehicle?.vehicleMaker || null,
    commonName: vehicle?.commonName || null,
    exactPackModel: vehicle?.exactPackModel || null
  };
  const warnings = [
    '地区和里程仅作为报告与交易信息保存，不参与本次价格计算。',
    ...baseline.notes
  ];
  if (vehicle) {
    warnings.push('车型检索只定位候选电池配置，不代表识别到唯一实物电池包；交易前仍应核对铭牌。');
    if (vehicle.chemistryConfidence !== '高' || vehicle.formConfidence !== '高') warnings.push('当前候选配置含中低置信度字段，报告已保留来源与置信度。');
  }

  return {
    id: `XR-${crypto.randomUUID()}`,
    createdAt: now.toISOString(),
    algorithmVersion: VERSION,
    catalogVersion: catalog.version,
    pricingVersion: baseline.version,
    title: vehicle ? `${vehicle.publicModel} · ${vehicle.candidateLabel}` : `${chemistries[chemistry]} · ${forms[form]}电池包`,
    input,
    vehicle: vehicle ? structuredClone(vehicle) : null,
    status: 'reference',
    statusLabel: '回收参考估价',
    result: {
      low: weightEstimate.low,
      center: weightEstimate.center,
      high: weightEstimate.high,
      unit: 'CNY/batch',
      primaryMethod: '电池包总重量 × 动力再生分类基准价',
      intervalMeaning: weightEstimate.intervalMeaning
    },
    weightEstimate,
    energyCheck,
    materialReferences: materialReferences(chemistry, catalog),
    warnings,
    references: [
      { id: rate.id, type: 'weight_baseline', source: baseline.source, sampleCount: rate.sampleCount, price: rate.price, unit: rate.unit },
      ...(vehicle ? Object.entries(vehicle.sources).filter(([, url]) => url).map(([field, url]) => ({ type: `vehicle_${field}`, source: url })) : [])
    ],
    scope: '材料回收参考，不含拆车、物流、检测与异常处置费用，不构成最终收购承诺。报告是生成时点快照。'
  };
}

module.exports = { estimate, InputError, positive, nonNegative, text, VERSION, chemistries, forms };
