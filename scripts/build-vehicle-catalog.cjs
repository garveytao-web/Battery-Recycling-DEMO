'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceFile = path.resolve(process.argv[2] || path.resolve(root, '../analysis_work/expanded_enriched_v04.json'));
const outputFile = path.resolve(process.argv[3] || path.resolve(root, 'server/data/vehicles-v04.json'));

function pricingChemistry(value) {
  if (value === '磷酸铁锂（LFP）') return 'lfp';
  if (/NCM|NCA/.test(value) && !value.includes('磷酸铁锂')) return 'ncm';
  return null;
}

function pricingForm(value) {
  if (value === '软包') return 'pouch';
  if (value.startsWith('圆柱')) return 'cylindrical';
  if ((value.includes('方形') || value.includes('刀') || value.includes('躺式')) && !value.includes('软包/')) return 'prismatic';
  return null;
}

const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const rows = source.activeRows.map(row => ({
  id: row.recordId,
  publicModel: row.publicModel,
  vehicleMaker: row.vehicleMaker,
  commonName: row.commonName,
  candidateLabel: row.candidateConfigLabel,
  exactPackModel: row.exactPackModel === '未公开' ? null : row.exactPackModel,
  packVariant: row.packVariant || null,
  massKg: row.packMassKg,
  energyKwh: row.packEnergyKWh || null,
  chemistry: pricingChemistry(row.chemistry),
  chemistryLabel: row.chemistry,
  chemistryConfidence: row.chemistryConfidence,
  form: pricingForm(row.cellShape),
  formLabel: row.cellShape,
  formConfidence: row.shapeConfidence,
  multiConfig: row.multiConfig === '是',
  priceReady: Boolean(pricingChemistry(row.chemistry) && pricingForm(row.cellShape)),
  sources: {
    mass: row.weightSource,
    chemistry: row.chemistrySource,
    form: row.shapeSource
  },
  warning: row.warning,
  checkedAt: row.checkedAt
}));

const models = new Map();
for (const row of rows) {
  if (!models.has(row.publicModel)) models.set(row.publicModel, {
    publicModel: row.publicModel,
    vehicleMaker: row.vehicleMaker,
    commonName: row.commonName,
    configurations: []
  });
  models.get(row.publicModel).configurations.push(row);
}

const output = {
  version: 'vehicle-map-v0.4-2026-10-08',
  checkedAt: '2026-10-08',
  sourceRecordCount: source.stats.totalConfigs,
  searchableConfigurationCount: rows.length,
  searchableModelCount: models.size,
  priceReadyConfigurationCount: rows.filter(row => row.priceReady).length,
  limitations: [
    '候选配置用于检索，不代表已识别唯一电池包；同一公告型号存在多配置时必须由用户选择。',
    'exactPackModel为空表示公开资料未披露，系统不会补造电池包型号。',
    '中低置信度字段必须在报告中保留来源、置信度和提示。'
  ],
  models: [...models.values()]
};

fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(`wrote ${output.searchableModelCount} models / ${output.searchableConfigurationCount} configurations to ${outputFile}`);

