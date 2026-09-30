'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseCSV, validateRecords } = require('../server/catalog-import.cjs');
try {
  const [kind, file, ...args] = process.argv.slice(2);
  if (!['weightRates','vehicles'].includes(kind) || !file) throw new Error('用法：node scripts/import-catalog.cjs weightRates|vehicles 文件.csv --confirm-sources');
  if (!args.includes('--confirm-sources')) throw new Error('请先核对来源、单位、适用条件，再用 --confirm-sources 确认导入');
  const records = validateRecords(kind, parseCSV(fs.readFileSync(file,'utf8')));
  const catalogPath = path.resolve(__dirname,'..',process.env.DATA_FILE || 'server/data/catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath,'utf8'));
  const merged = new Map(catalog[kind].map(r => [r.id,r])); records.forEach(r => merged.set(r.id,r));
  catalog[kind] = [...merged.values()]; catalog.version = `manual-${new Date().toISOString()}`;
  const backupDir = path.resolve(__dirname,'../server/storage/catalog-backups'); fs.mkdirSync(backupDir,{recursive:true});
  fs.copyFileSync(catalogPath, path.join(backupDir, `catalog-${Date.now()}.json`));
  fs.writeFileSync(catalogPath + '.tmp',JSON.stringify(catalog,null,2)+'\n'); fs.renameSync(catalogPath + '.tmp',catalogPath);
  console.log(`已导入${records.length}条${kind}；原目录已备份。旧报告快照不受影响。`);
} catch(e) { console.error(e.message); process.exitCode = 1; }
