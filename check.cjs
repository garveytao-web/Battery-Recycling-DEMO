const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const nodes = {};
const listeners = {};
let registeredTool;
const node = selector => nodes[selector] ||= {innerHTML:'',textContent:'',style:{},scrollTop:0,classList:{toggle(){}}};
class MockFormData {
  constructor(target={}) { this.data = target._data || {}; }
  get(key) { return this.data[key] ?? null; }
  *[Symbol.iterator]() { yield* Object.entries(this.data); }
}
const context = {
  console, Date, Math, Number, String, JSON,
  structuredClone: value => JSON.parse(JSON.stringify(value)),
  setTimeout: callback => { callback(); return 1; }, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
  FormData:MockFormData,
  localStorage:{getItem:()=>null,setItem(){}},
  document:{
    querySelector:node, querySelectorAll:()=>[],
    addEventListener:(name,callback)=>{listeners[name]=callback;},
    modelContext:{registerTool:tool=>{registeredTool=tool;}}
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/app.js','utf8'), context);

vm.runInContext(`
if (packs.length !== 3) throw Error('three demo packs required');
const lfp = calculateMaterials(packs[0]);
const ncm = calculateMaterials(packs[1]);
if (lfp.find(x=>x.name==='镍').ratio !== 0 || lfp.find(x=>x.name==='钴').ratio !== 0) throw Error('LFP nickel/cobalt must be zero');
if (ncm.find(x=>x.name==='镍').ratio <= 0 || ncm.find(x=>x.name==='钴').ratio <= 0 || ncm.find(x=>x.name==='锰').ratio <= 0) throw Error('NCM composition missing');
const r = createReport(packs[0], {region:'湖北',km:'68000'}, 1, 'TEST-1');
const sum = r.materials.reduce((total,item)=>total+item.value,0);
if (Math.abs(r.total-sum) > .01) throw Error('material total formula mismatch');
for (const item of r.materials) {
  if (Math.abs(item.weight - Number((r.pack.kg*item.ratio).toFixed(2))) > .001) throw Error('weight formula mismatch');
  if (Math.abs(item.value - Number((item.weight*item.price*item.recovery).toFixed(2))) > .001) throw Error('value formula mismatch');
}
if (r.range.low >= r.total || r.range.high <= r.total) throw Error('valuation range invalid');
db.reports.unshift(r); go('report',{id:r.id});
if (!document.querySelector('#app').innerHTML.includes('金属材料构成')) throw Error('report detail not rendered');
go('history'); if (!document.querySelector('#app').innerHTML.includes('TEST-1')) throw Error('history missing report');
for (const page of ['home','estimate','market','history','me','quotes','publish']) go(page);
for (const trade of db.trades) { go('trade',{id:trade.id}); }
openModal('测试弹窗','<button>确认</button>');
if (!document.querySelector('#overlay-root').innerHTML.includes('class="overlay')) throw Error('overlay not mounted in phone root');
if (esc('<img onerror=x>') !== '&lt;img onerror=x&gt;') throw Error('HTML escaping failed');
`, context);

assert.equal(registeredTool.name, 'open_battery_demo_report');
const firstId = vm.runInContext('db.reports[0].id', context);
assert.equal(registeredTool.execute({reportId:firstId}).reportId, firstId);
assert.throws(()=>registeredTool.execute({reportId:'missing'}));

const searchable = ['dist/app.js','dist/index.html','dist/style.css','README.md','check.cjs'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
const removedChineseTerm = String.fromCharCode(26799,27425);
const removedLegacyKey = 'lad' + 'der';
assert(!searchable.includes(removedChineseTerm), 'removed feature wording remains');
assert(!searchable.includes(removedLegacyKey), 'removed feature logic remains');
const overlaySource = ['dist/app.js','dist/index.html','dist/style.css'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
assert(!/showModal|<dialog|::backdrop|position\s*:\s*fixed/.test(overlaySource), 'viewport-level overlay implementation remains');
for (const file of ['logo-mark.svg','banner-1.svg','banner-2.svg','banner-3.svg','banner-4.svg','banner-5.svg']) assert(fs.existsSync(`dist/assets/${file}`), `missing asset ${file}`);
console.log('PASS: material formulas, chemistry differences, report reuse, all views, phone-root overlays, escaping and local assets.');
