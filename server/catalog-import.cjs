'use strict';
const { InputError, positive, text, chemistries, forms } = require('./engine.cjs');
function parseCSV(source) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const src = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') { if (quoted && src[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && src[i+1] === '\n') i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new InputError('CSV引号未闭合');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  if (!rows.length) throw new InputError('CSV为空');
  const headers = rows.shift().map(v => v.trim());
  if (new Set(headers).size !== headers.length) throw new InputError('CSV表头重复');
  return rows.map((r,i) => { if (r.length !== headers.length) throw new InputError(`CSV第${i+2}行列数不一致`); return Object.fromEntries(headers.map((h,j) => [h,r[j].trim()])); });
}
function validDate(v, name) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '') || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) throw new InputError(`${name}日期格式错误`); return v; }
function validateRecords(kind, rows) {
  if (!rows.length) throw new InputError('没有数据行，模板不能直接作为真实数据导入');
  const ids = new Set();
  return rows.map((r,i) => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id || '') || ids.has(r.id)) throw new InputError(`第${i+2}行ID缺失、格式错误或重复`);
    ids.add(r.id);
    if (!Object.hasOwn(chemistries, r.chemistry)) throw new InputError(`第${i+2}行材料分类错误`);
    if (!text(r.source, 500)) throw new InputError(`第${i+2}行缺少来源`);
    const base = { id: r.id, chemistry: r.chemistry, source: text(r.source,500), note: text(r.note,1000), verified: true };
    if (kind === 'weightRates') {
      if (!Object.hasOwn(forms, r.form) || !['pack','module','cell'].includes(r.goods) || r.unit !== 'CNY/kg') throw new InputError('重量基准必须标明封装、货物形态，单位必须为CNY/kg');
      const value = { ...base, form: r.form, goods: r.goods, price: positive(r.price,'元/kg单价'), unit: r.unit, validFrom: validDate(r.validFrom,'开始'), validUntil: validDate(r.validUntil,'结束'), minWeightKg: positive(r.minWeightKg,'适用最小重量'), maxWeightKg: positive(r.maxWeightKg,'适用最大重量') };
      if (value.validUntil < value.validFrom || value.minWeightKg > value.maxWeightKg) throw new InputError('适用范围前后顺序错误');
      return value;
    }
    if (kind === 'vehicles') {
      if (!r.label || !r.batteryPackModel) throw new InputError('车辆配置须提供完整年款配置名称和电池包型号');
      const value = { ...base, label: text(r.label,100), batteryPackModel: text(r.batteryPackModel,100), energyKwh: r.energyKwh ? positive(r.energyKwh,'额定kWh',10000) : null, massKg: r.massKg ? positive(r.massKg,'包重量kg',100000) : null, verifiedAt: validDate(r.verifiedAt,'核实') };
      if (!value.energyKwh && !value.massKg) throw new InputError('至少核实额定电量或电池包重量之一');
      return value;
    }
    throw new InputError('仅支持weightRates或vehicles导入');
  });
}
module.exports = { parseCSV, validateRecords };
