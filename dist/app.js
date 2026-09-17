'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const money = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits:0});
const date = value => new Date(value).toLocaleString('zh-CN', {hour12:false});
const uid = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

// 全部为产品演示用 Mock 数据。锂统一采用“折金属锂当量”口径和对应的元/kg参考单价。
const materialCatalog = {
  lfp: [
    {name:'锂', scope:'折金属锂当量', ratio:.011, price:76, recovery:.78},
    {name:'镍', ratio:0, price:82, recovery:.82},
    {name:'钴', ratio:0, price:168, recovery:.84},
    {name:'锰', ratio:.002, price:8.2, recovery:.70},
    {name:'铜', ratio:.082, price:56, recovery:.91},
    {name:'铝', ratio:.14, price:13.2, recovery:.88},
    {name:'铁', ratio:.18, price:1.8, recovery:.90}
  ],
  ncm: [
    {name:'锂', scope:'折金属锂当量', ratio:.013, price:76, recovery:.80},
    {name:'镍', ratio:.075, price:82, recovery:.84},
    {name:'钴', ratio:.022, price:168, recovery:.86},
    {name:'锰', ratio:.034, price:8.2, recovery:.76},
    {name:'铜', ratio:.09, price:56, recovery:.92},
    {name:'铝', ratio:.12, price:13.2, recovery:.89},
    {name:'铁', ratio:.08, price:1.8, recovery:.90}
  ]
};

const packs = [
  {id:'ABCD1', brand:'比亚迪', model:'海豚', year:'2024', chemistry:'磷酸铁锂', chemistryKey:'lfp', kg:340, kwh:44.9, maker:'Demo 电池企业 A', voltage:332.8, capacity:135, confidence:.94},
  {id:'EFGH2', brand:'蔚来', model:'ET5', year:'2023', chemistry:'三元锂', chemistryKey:'ncm', kg:480, kwh:75, maker:'Demo 电池企业 B', voltage:400, capacity:187.5, confidence:.91},
  {id:'IJKL3', brand:'广汽埃安', model:'AION Y', year:'2022', chemistry:'磷酸铁锂', chemistryKey:'lfp', kg:405, kwh:63.9, maker:'Demo 电池企业 C', voltage:355.2, capacity:180, confidence:.88}
];

const seedTrades = () => [
  {id:'T-1001', title:'磷酸铁锂动力电池包 · 整包回收', kind:'出售', method:'普通报价', category:'电池包', qty:12, unit:'包', price:5200, priceUnit:'元/包', region:'湖北', desc:'来源于演示库存，参数和价格仅用于平台流程展示，具体状态需线下检测。', status:'报价中', owner:'华中循环 · 演示企业', icon:'▥'},
  {id:'T-1002', title:'三元锂电池模组 · 回收采购需求', kind:'求购', method:'普通报价', category:'电池模组', qty:5, unit:'吨', price:31800, priceUnit:'元/吨', region:'广东', desc:'三元锂电池模组采购需求，数量及报价均为 Demo 模拟数据。', status:'报价中', owner:'湾区再生 · 演示企业', icon:'▤'},
  {id:'T-1003', title:'退役动力电池拆解料 · 第 03 批', kind:'出售', method:'竞拍演示', category:'拆解料', qty:1, unit:'批', price:18500, priceUnit:'元/批', region:'湖北', desc:'竞拍流程展示样例。仅展示预置记录和状态，不接受真实竞价、付款或交割。', status:'进行中', owner:'绿色再生 · 演示企业', icon:'◈'},
  {id:'T-1004', title:'磷酸铁锂电芯 · 库存处置', kind:'出售', method:'竞拍演示', category:'电芯', qty:1, unit:'批', price:23600, priceUnit:'元/批', region:'湖南', desc:'已结束标的展示样例，成交金额为预置演示数据。', status:'已结束', owner:'湘江循环 · 演示企业', icon:'▥'},
  {id:'T-1005', title:'新能源物流车电池包求购', kind:'求购', method:'普通报价', category:'电池包', qty:20, unit:'包', price:4600, priceUnit:'元/包', region:'河南', desc:'用于演示供求信息浏览与普通报价保存。', status:'报价中', owner:'中原循环 · 演示企业', icon:'▥'}
];

function calculateMaterials(pack) {
  return materialCatalog[pack.chemistryKey].map(item => {
    const weight = round(pack.kg * item.ratio, 2);
    return {...item, weight, value:round(weight * item.price * item.recovery, 2)};
  });
}

function createReport(pack, input, time = Date.now(), id = uid('XR')) {
  const materials = calculateMaterials(pack);
  const total = round(materials.reduce((sum, item) => sum + item.value, 0), 2);
  const km = input.km === '' || input.km == null ? null : Number(input.km);
  const mileageFactor = km == null ? 1 : km <= 50000 ? 1 : km <= 100000 ? .97 : km <= 150000 ? .94 : .90;
  const regionFactor = ({'湖北':1,'湖南':.99,'河南':.98,'江西':.99,'广东':1.02})[input.region] || 1;
  const spread = pack.confidence >= .93 ? .08 : pack.confidence >= .90 ? .10 : .12;
  const center = total * mileageFactor * regionFactor;
  return {
    id, type:'material-report', time, dataDate:'2026-09-15', pack:clone(pack),
    input:{region:input.region || '', km:input.km ?? ''}, materials, total,
    range:{low:round(center * (1 - spread)), high:round(center * (1 + spread)), mileageFactor, regionFactor, spread},
    confidence:pack.confidence
  };
}

function seedReports() {
  return [
    createReport(packs[0], {region:'湖北',km:'68000'}, new Date('2026-09-15T10:18:00+08:00').getTime(), 'XR-DEMO-24091501'),
    createReport(packs[1], {region:'广东',km:'92000'}, new Date('2026-09-13T15:42:00+08:00').getTime(), 'XR-DEMO-23091302'),
    createReport(packs[2], {region:'湖南',km:'128000'}, new Date('2026-09-11T09:30:00+08:00').getTime(), 'XR-DEMO-22091103')
  ];
}

let storeOK = true;
let db;
try { db = JSON.parse(localStorage.getItem('battery-demo-v2') || 'null'); } catch { storeOK = false; }
if (!db || db.schema !== 2 || !Array.isArray(db.reports) || !Array.isArray(db.trades) || !Array.isArray(db.quotes)) {
  db = {schema:2, reports:seedReports(), trades:seedTrades(), quotes:[], draft:null};
}
function save() { try { localStorage.setItem('battery-demo-v2', JSON.stringify(db)); } catch { storeOK = false; toast('当前浏览器无法保存，关闭页面后记录可能丢失'); } }

let estimate = {brand:'',model:'',year:'',packId:'',region:'',km:''};
let filter = {kind:'全部',method:'全部',search:''};
let current = {page:'home'};
let trail = [];
let carouselIndex = 0;
let carouselStartX = null;
let carouselTimer = null;

function options(list, selected) { return list.map(value => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(value)}</option>`).join(''); }
function badge(value) { return `<span class="badge">${esc(value)}</span>`; }
function kv(rows) { return `<dl class="kv">${rows.map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`; }
function getSelectedPack() { return packs.find(pack => pack.id === estimate.packId); }
function unique(values) { return [...new Set(values)]; }

function go(page, data = {}, isBack = false) {
  if (!isBack) trail.push({...current, scroll:$('#app')?.scrollTop || 0});
  current = {page, ...data};
  render();
  if ($('#app')) $('#app').scrollTop = 0;
}
function back() {
  const previous = trail.pop() || {page:'home'};
  current = previous;
  render();
  if ($('#app')) $('#app').scrollTop = previous.scroll || 0;
}
function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.style.display = 'none'; }, 2800);
}
function closeOverlay() { const root = $('#overlay-root'); if (root) root.innerHTML = ''; }
function openModal(title, body, sheet = false) {
  $('#overlay-root').innerHTML = `<div class="overlay ${sheet ? 'sheet' : ''}" data-a="overlay-close"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-modal><div class="row"><h2>${esc(title)}</h2><button class="modal-close" data-a="close-overlay" aria-label="关闭">×</button></div>${body}</section></div>`;
}
function openLoading() {
  $('#overlay-root').innerHTML = '<div class="overlay"><section class="modal" role="status" style="text-align:center"><div style="font-size:38px;color:var(--green)">◌</div><h2>正在生成材料估价</h2><p class="muted">匹配 Demo 电池参数并计算材料构成…</p></section></div>';
}

function estimateFields() {
  const brands = unique(packs.map(pack => pack.brand));
  const models = unique(packs.filter(pack => !estimate.brand || pack.brand === estimate.brand).map(pack => pack.model));
  const years = unique(packs.filter(pack => (!estimate.brand || pack.brand === estimate.brand) && (!estimate.model || pack.model === estimate.model)).map(pack => pack.year));
  const candidates = packs.filter(pack => (!estimate.brand || pack.brand === estimate.brand) && (!estimate.model || pack.model === estimate.model) && (!estimate.year || pack.year === estimate.year));
  return `<label for="brand">汽车品牌 <span class="danger">*</span></label><select id="brand" name="brand" data-estimate-field required><option value="">请选择品牌</option>${options(brands,estimate.brand)}</select>
    <label for="model">车型 <span class="danger">*</span></label><select id="model" name="model" data-estimate-field required><option value="">请选择车型</option>${options(models,estimate.model)}</select>
    <div class="two-col"><div><label for="year">生产年份 <span class="danger">*</span></label><select id="year" name="year" data-estimate-field required><option value="">请选择</option>${options(years,estimate.year)}</select></div><div><label for="packId">电池型号 <span class="danger">*</span></label><select id="packId" name="packId" data-estimate-field required><option value="">请选择</option>${options(candidates.map(pack=>pack.id),estimate.packId)}</select></div></div>
    ${estimate.packId ? '<p class="sample-note">所选型号为 Demo 模拟型号，不对应实际车辆公告数据。</p>' : ''}
    <div class="two-col"><div><label for="region">所在省份 <span class="muted">选填</span></label><select id="region" name="region"><option value="">不修正</option>${options(['湖北','湖南','河南','江西','广东','其他'],estimate.region)}</select></div><div><label for="km">行驶里程 <span class="muted">选填</span></label><div class="field-unit"><input id="km" name="km" type="number" min="0" max="1000000" step="1" value="${esc(estimate.km)}" inputmode="numeric" placeholder="例如 68000"><span>km</span></div></div></div>`;
}

function homePage() {
  const banners = [1,2,3,4,5].map((number,index) => `<div class="slide"><img src="assets/banner-${number}.svg" alt="${['智能估价','材料价值拆解','规范回收','循环利用','回收交易'][index]}"></div>`).join('');
  return `<div class="demo-bar">Demo 模拟数据 · 不构成实际交易或回收报价</div><section class="hero"><div class="carousel" id="carousel"><div class="slides" style="transform:translateX(-${carouselIndex*100}%)">${banners}</div><div class="dots">${[0,1,2,3,4].map(index=>`<button class="dot ${index===carouselIndex?'active':''}" data-a="carousel" data-index="${index}" aria-label="第 ${index+1} 张"></button>`).join('')}</div></div></section>
    <div class="card quick-card"><div class="row"><div><div class="eyebrow">MATERIAL VALUATION</div><h2 style="margin:3px 0">金属材料构成估价</h2></div><button class="text-btn" data-a="sample">填入示例</button></div><p class="small muted">选择车辆与 Demo 电池型号，查看材料重量、参考单价、回收系数和估算价值。</p><button class="primary" data-a="start">开始评估　→</button></div>
    <div class="tile-grid"><button class="tile" data-a="go" data-page="history"><span class="glyph">▧</span><strong>历史报告 ↗</strong><small>统一查看材料估价报告</small></button><button class="tile" data-a="go" data-page="market"><span class="glyph">⇄</span><strong>回收交易 ↗</strong><small>浏览供求与竞拍演示</small></button></div>
    <section class="section" style="padding-top:0"><div class="row"><h2 class="section-title">最近报告</h2><button class="text-btn" data-a="go" data-page="history">全部 →</button></div>${reportCard(db.reports[0])}</section>`;
}

function estimatePage() {
  return `<section class="section"><div class="flow-steps"><b>01 车辆信息</b><span>—</span><span>02 材料计算</span><span>—</span><span>03 报告</span></div><div class="row"><h2 class="section-title">电池回收估价</h2><button class="text-btn" data-a="sample">填入主案例</button></div><form id="estimate-form" class="card">${estimateFields()}<button class="primary" style="margin-top:18px">开始评估</button></form><div class="disclaimer"><strong>重要说明</strong><br>所有车型匹配、材料比例、重量、单价、系数和金额均为 Demo 模拟数据，仅用于产品功能演示，不构成实际交易或回收报价。</div></section>`;
}

function materialRows(report) {
  const maxRatio = Math.max(...report.materials.map(item => item.ratio));
  return report.materials.map(item => `<div class="material-row"><div><span class="material-name">${esc(item.name)}</span><div class="bar-track"><i style="width:${item.ratio ? Math.max(5,item.ratio/maxRatio*100) : 0}%"></i></div></div><span>${(item.ratio*100).toFixed(1)}%</span><span>${item.weight.toFixed(2)} kg</span><span>¥${item.price}/kg</span><span>${(item.recovery*100).toFixed(0)}%</span><strong>¥${money(item.value)}</strong></div>`).join('');
}
function confidenceText(value) { return value >= .93 ? '高（车型与型号完整匹配）' : value >= .90 ? '较高（Demo 参数匹配）' : '中等（存在批次差异）'; }
function reportPage(report) {
  if (!report) return missingPage();
  const pack = report.pack;
  return `<section class="report-hero"><div class="eyebrow">MATERIAL VALUE REPORT</div><h1>材料回收估价报告</h1><div class="small">报告编号 ${esc(report.id)}<br>${date(report.time)}</div></section><div class="report-body">
    <div class="card valuation"><div class="small muted">材料回收总估值</div><div class="big-price"><small>¥</small>${money(report.total)}</div><div class="range">合理区间 ¥${money(report.range.low)} — ¥${money(report.range.high)}</div><span class="confidence">可信度 ${(report.confidence*100).toFixed(0)}%</span></div>
    <div class="card"><div class="row"><h2>识别结果</h2>${badge('Demo 模拟数据')}</div>${kv([['车辆信息',`${pack.brand} ${pack.model} · ${pack.year}`],['电池型号',`${pack.id}（Demo 模拟型号）`],['电池化学体系',pack.chemistry],['电池包质量',`${pack.kg} kg`],['电池包容量',`${pack.kwh} kWh`],['标称电压',`${pack.voltage} V`],['所在省份',report.input.region||'未提供'],['行驶里程',report.input.km===''?'未提供':`${Number(report.input.km).toLocaleString()} km`]])}</div>
    <div class="card"><div class="row"><h2>金属材料构成</h2><span class="small muted">共 ${report.materials.length} 项</span></div><div class="material-table"><div class="material-head"><span>材料</span><span>占比</span><span>重量</span><span>参考单价</span><span>系数</span><span>估算价值</span></div>${materialRows(report)}</div><p class="notice">未列部分包括电解液、石墨、隔膜、塑料、结构件及其他材料，占比不要求合计为 100%。磷酸铁锂体系的镍、钴占比按 0% 展示。</p></div>
    <div class="card"><h2>估价依据</h2><div class="formula">材料估算重量 = 电池包质量 × 材料占比<br>材料估算价值 = 材料估算重量 × 参考回收单价 × 回收系数<br>材料回收总估值 = 各项材料估算价值之和</div>${kv([['材料价值合计',`¥${money(report.total)}`],['车型匹配可信度',confidenceText(report.confidence)],['里程修正',`${(report.range.mileageFactor*100).toFixed(0)}%`],['地区修正',`${(report.range.regionFactor*100).toFixed(0)}%`],['区间浮动',`±${(report.range.spread*100).toFixed(0)}%`],['数据日期',report.dataDate],['规则版本','MOCK-MATERIAL-2']])}<p class="notice">区间以材料价值合计为基础，结合车型匹配可信度、里程和地区模拟修正形成。锂按“折金属锂当量”统一口径，不与碳酸锂或电池级碳酸锂价格混用。</p></div>
    <div class="disclaimer"><strong>Demo 免责声明</strong><br>仅用于产品功能演示，不构成实际交易或回收报价；未接入实时行情、权威数据库或真实检测系统。</div>
    <div class="actions"><button class="secondary" data-a="share" data-id="${report.id}">分享报告</button><button class="primary" data-a="publish-from" data-id="${report.id}">发起回收</button></div></div>`;
}

function reportCard(report) {
  if (!report) return '<div class="card empty">暂无报告</div>';
  return `<button class="record" data-a="report" data-id="${esc(report.id)}"><div class="row"><strong>${esc(report.pack.brand)} ${esc(report.pack.model)} · ${esc(report.pack.id)}</strong><span class="arrow">↗</span></div><p>${date(report.time)} · ${esc(report.pack.chemistry)}</p><div class="row"><span class="small muted">${esc(report.id)}</span><span style="color:var(--green);font-weight:700">¥${money(report.total)}</span></div></button>`;
}
function historyPage() { return `<section class="section"><h2 class="section-title">历史报告</h2><p class="small muted">评估完成与历史记录复用同一报告详情组件。</p>${db.reports.map(reportCard).join('') || '<div class="card empty">暂无报告</div>'}<p class="notice">历史报告保留生成时的 Mock 数据，打开时不会重新计算。</p></section>`; }

function tradeCard(trade) {
  return `<button class="transaction" data-a="trade" data-id="${trade.id}"><span class="material-icon">${trade.icon}</span><span class="info"><span class="tag">${esc(trade.kind)}</span><span class="tag warm">${esc(trade.method)}</span><h3>${esc(trade.title)}</h3><span class="money">¥${money(trade.price)} <small>${esc(trade.priceUnit)}</small></span><div class="small muted">${esc(trade.region)} · ${esc(trade.status)}</div></span></button>`;
}
function marketPage() {
  let trades = db.trades.filter(trade => (filter.kind==='全部'||trade.kind===filter.kind) && (filter.method==='全部'||trade.method===filter.method) && (!filter.search||trade.title.includes(filter.search)));
  return `<section class="section"><div class="row"><h2 class="section-title">回收交易</h2><button class="text-btn" data-a="publish">＋ 发布</button></div><form id="market-search" class="row" style="margin-bottom:12px"><input name="search" value="${esc(filter.search)}" placeholder="搜索电池包、模组或拆解料"><button class="secondary">搜索</button></form><div class="chips">${['全部','出售','求购'].map(value=>`<button class="chip ${filter.kind===value?'active':''}" data-a="market-kind" data-value="${value}">${value}</button>`).join('')}</div><div class="chips">${['全部','普通报价','竞拍演示'].map(value=>`<button class="chip ${filter.method===value?'active':''}" data-a="market-method" data-value="${value}">${value}</button>`).join('')}</div>${trades.map(tradeCard).join('')||'<div class="card empty">没有匹配的交易</div>'}<p class="notice">交易数据均为演示，不含实时竞价、支付、托管、物流和实际履约。</p></section>`;
}
function tradePage(trade) {
  if (!trade) return missingPage();
  const auction = trade.method === '竞拍演示';
  const quotes = db.quotes.filter(quote => quote.tradeId === trade.id);
  return `<section class="section"><div class="detail-art">${trade.icon}</div><div class="card"><div class="row">${badge(trade.kind)}<span class="small muted">${esc(trade.status)}</span></div><h2 style="margin:12px 0 4px">${esc(trade.title)}</h2><div class="money">¥${money(trade.price)} <small>${esc(trade.priceUnit)}</small></div><p class="small muted">Demo 参考价格</p><div class="soft-rule"></div>${kv([['交易方式',trade.method],['物料类别',trade.category],['数量',`${trade.qty} ${trade.unit}`],['交易地区',trade.region],['发布企业',trade.owner]])}</div><div class="card"><h2>物料说明</h2><p class="small muted">${esc(trade.desc)}</p></div>
    ${auction ? `<div class="card"><h2>历史竞拍</h2><div class="auction-steps"><span>已发布</span><span class="active">${esc(trade.status)}</span><span>结果公示</span></div>${kv([['演示竞买方 A',`¥${money(trade.price)} / 批`],['演示竞买方 B',`¥${money(trade.price-500)} / 批`]])}</div><button class="primary" data-a="auction-entry" data-id="${trade.id}">发起竞拍（演示入口）</button>` : `<div class="card"><h2>历史报价</h2>${quotes.length ? quotes.map(quote=>`<div class="row small" style="margin:7px 0"><span>演示用户 · ${date(quote.time)}</span><strong>¥${money(quote.price)}</strong></div>`).join('') : '<p class="small muted">暂无保存的报价</p>'}</div><button class="primary" data-a="quote" data-id="${trade.id}">提交普通报价（演示）</button>`}
    <p class="notice">本页不产生真实订单、资金或履约义务。</p></section>`;
}

function publishPage() {
  const draft = db.draft || {};
  return `<section class="section"><h2 class="section-title">发布回收信息</h2><form id="publish-form" class="card"><label for="pub-title">标题</label><input id="pub-title" name="title" required maxlength="50" value="${esc(draft.title||'')}" placeholder="例如：磷酸铁锂动力电池包出售"><div class="two-col"><div><label for="pub-kind">类型</label><select id="pub-kind" name="kind">${options(['出售','求购'],draft.kind||'出售')}</select></div><div><label for="pub-category">物料</label><select id="pub-category" name="category">${options(['电池包','电池模组','电芯','拆解料'],draft.category||'电池包')}</select></div></div><div class="two-col"><div><label for="pub-qty">数量</label><input id="pub-qty" name="qty" type="number" min="1" value="${esc(draft.qty||1)}" required></div><div><label for="pub-unit">单位</label><select id="pub-unit" name="unit">${options(['包','个','kg','吨','批'],draft.unit||'包')}</select></div></div><label for="pub-price">演示报价（元/单位）</label><input id="pub-price" name="price" type="number" min="0.01" step="0.01" value="${esc(draft.price||'')}" required><label for="pub-region">地区</label><select id="pub-region" name="region" required><option value="">请选择</option>${options(['湖北','湖南','河南','江西','广东','其他'],draft.region||'')}</select><label for="pub-desc">说明</label><textarea id="pub-desc" name="desc" required>${esc(draft.desc||'')}</textarea><div class="actions"><button type="button" class="secondary" data-a="save-draft">保存草稿</button><button class="primary">发布演示信息</button></div></form><div class="disclaimer">信息仅保存在本机浏览器，不会提交到真实交易平台。</div></section>`;
}
function mePage() {
  return `<section class="section"><div class="profile"><div class="row start"><div class="avatar">循</div><div style="flex:1"><strong>演示体验账号</strong><div class="small muted">客户演示环境 · 未连接真实用户体系</div></div></div></div><div class="card"><button class="menu-item" data-a="go" data-page="history"><span>历史报告</span><span>共 ${db.reports.length} 份　›</span></button><button class="menu-item" data-a="my-quotes"><span>历史报价</span><span>共 ${db.quotes.length} 条　›</span></button><button class="menu-item" data-a="about"><span>关于循电 Demo</span><span>›</span></button><button class="menu-item danger" data-a="reset"><span>重置演示数据</span><span>›</span></button></div></section>`;
}
function quoteHistoryPage() {
  return `<section class="section"><h2 class="section-title">历史报价</h2>${db.quotes.map(quote=>{const trade=db.trades.find(item=>item.id===quote.tradeId);return `<button class="record" data-a="trade" data-id="${quote.tradeId}"><strong>${esc(trade?.title||'交易记录')}</strong><p>${date(quote.time)}</p><span class="money">¥${money(quote.price)}</span></button>`;}).join('')||'<div class="card empty">暂无普通报价记录</div>'}</section>`;
}
function missingPage() { return '<section class="section"><div class="card empty">记录不存在或已被清除。</div></section>'; }

function render() {
  const page = current.page;
  const titles = {estimate:'开始评估',report:'评估报告详情',history:'历史报告',market:'回收交易',trade:'交易详情',publish:'发布信息',me:'我的',quotes:'历史报价'};
  $('#header').innerHTML = page === 'home' ? '<div class="brand-lockup"><img src="assets/logo-mark.svg" alt=""><span>循电<small>BATTERY CIRCULAR</small></span></div><span class="badge">DEMO 02</span>' : `<button class="back" data-a="back" aria-label="返回">‹</button><span class="header-title">${titles[page]||'循电'}</span><span class="badge">演示</span>`;
  const report = db.reports.find(item => item.id === current.id);
  const trade = db.trades.find(item => item.id === current.id);
  const pages = {home:homePage, estimate:estimatePage, report:()=>reportPage(report), history:historyPage, market:marketPage, trade:()=>tradePage(trade), publish:publishPage, me:mePage, quotes:quoteHistoryPage};
  $('#app').innerHTML = (pages[page] || homePage)();
  $('#nav').innerHTML = [['home','⌂','首页'],['market','⇄','交易'],['me','○','我的']].map(([target,icon,label])=>`<button data-a="nav" data-page="${target}" class="${page===target?'active':''}"><span>${icon}</span>${label}</button>`).join('');
  closeOverlay();
  updateCarouselTimer();
}

function captureEstimate(form) {
  if (!form) return;
  const data = new FormData(form);
  estimate = {brand:data.get('brand')||'',model:data.get('model')||'',year:data.get('year')||'',packId:data.get('packId')||'',region:data.get('region')||'',km:data.get('km')||''};
}
function useSample(openForm = false) {
  estimate = {brand:'比亚迪',model:'海豚',year:'2024',packId:'ABCD1',region:'湖北',km:'68000'};
  if (openForm) go('estimate'); else render();
  toast('已填入比亚迪海豚主案例');
}
function completeEstimate() {
  const pack = getSelectedPack();
  if (!pack) { closeOverlay(); toast('请选择完整的车辆与电池型号'); return; }
  if (estimate.km !== '' && (!Number.isFinite(+estimate.km) || +estimate.km < 0 || +estimate.km > 1000000)) { closeOverlay(); toast('行驶里程需在 0 至 100 万 km 之间'); return; }
  const report = createReport(pack, estimate);
  db.reports.unshift(report);
  save();
  closeOverlay();
  go('report',{id:report.id});
}
function updateCarouselTimer() {
  if (carouselTimer) clearInterval(carouselTimer);
  if (current.page === 'home' && typeof setInterval === 'function') carouselTimer = setInterval(()=>{ carouselIndex=(carouselIndex+1)%5; const slides=$('.slides'); if(slides) slides.style.transform=`translateX(-${carouselIndex*100}%)`; document.querySelectorAll?.('.dot').forEach?.((dot,index)=>dot.classList.toggle('active',index===carouselIndex)); },4200);
}

document.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'estimate-form') { captureEstimate(event.target); openLoading(); setTimeout(completeEstimate, 420); }
  if (event.target.id === 'market-search') { filter.search = String(new FormData(event.target).get('search')||'').trim(); render(); }
  if (event.target.id === 'quote-form') {
    const trade = db.trades.find(item=>item.id===event.target.dataset.id);
    const price = Number(new FormData(event.target).get('price'));
    if (!trade || trade.method !== '普通报价' || !Number.isFinite(price) || price <= 0) { toast('请输入有效报价'); return; }
    db.quotes.unshift({id:uid('Q'),tradeId:trade.id,price,time:Date.now()}); save(); closeOverlay(); toast('演示报价已保存'); render();
  }
  if (event.target.id === 'publish-form') {
    const data = Object.fromEntries(new FormData(event.target));
    if (!data.title.trim() || !data.desc.trim() || !(+data.qty>0) || !(+data.price>0)) { toast('请完整填写有效信息'); return; }
    const trade={...data,id:uid('T'),qty:+data.qty,price:+data.price,priceUnit:`元/${data.unit}`,method:'普通报价',status:'报价中',owner:'演示体验账号',icon:'▥',mine:true};
    db.trades.unshift(trade); db.draft=null; save(); toast('演示信息已保存到本机'); go('trade',{id:trade.id});
  }
});

document.addEventListener('change', event => {
  if (!event.target.matches?.('[data-estimate-field]')) return;
  captureEstimate(event.target.form);
  if (event.target.name === 'brand') { estimate.model=''; estimate.year=''; estimate.packId=''; }
  if (event.target.name === 'model') { estimate.year=''; estimate.packId=''; }
  if (event.target.name === 'year') estimate.packId='';
  render();
});

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-a]');
  if (!button) return;
  const action=button.dataset.a, id=button.dataset.id, value=button.dataset.value;
  if (action==='back') back();
  if (action==='go') go(button.dataset.page);
  if (action==='nav') { trail=[]; go(button.dataset.page); }
  if (action==='start') go('estimate');
  if (action==='sample') useSample(current.page==='home');
  if (action==='report') go('report',{id});
  if (action==='trade') go('trade',{id});
  if (action==='market-kind') { filter.kind=value; render(); }
  if (action==='market-method') { filter.method=value; render(); }
  if (action==='publish') go('publish');
  if (action==='my-quotes') go('quotes');
  if (action==='carousel') { carouselIndex=Number(button.dataset.index); render(); }
  if (action==='close-overlay') closeOverlay();
  if (action==='overlay-close' && event.target===button) closeOverlay();
  if (action==='share') openModal('分享报告（演示）',`<p>报告 ${esc(id)} 已生成演示分享卡片。本 Demo 不会上传数据或创建公开链接。</p><button class="primary" data-a="copy-share">复制演示分享文案</button>`);
  if (action==='copy-share') { closeOverlay(); toast('演示分享文案已复制（交互示意）'); }
  if (action==='quote') { const trade=db.trades.find(item=>item.id===id); if(trade) openModal('普通报价（演示）',`<p>${esc(trade.title)}</p><form id="quote-form" data-id="${trade.id}"><label for="quote-price">报价 · ${esc(trade.priceUnit)}</label><input id="quote-price" name="price" type="number" min="0.01" step="0.01" required placeholder="输入演示报价"><button class="primary" style="margin-top:15px">保存演示报价</button></form>`,true); }
  if (action==='auction-entry') openModal('竞拍演示状态','<p>该入口仅展示平台流程：标的发布 → 资质确认 → 竞价 → 结果公示。</p><div class="auction-steps"><span>标的发布</span><span class="active">演示中</span><span>结果公示</span></div><div class="disclaimer">不支持多人实时竞价、有效出价提交、支付、托管或交割。</div>');
  if (action==='publish-from') { const report=db.reports.find(item=>item.id===id); if(report){db.draft={kind:'出售',title:`${report.pack.brand}${report.pack.model} ${report.pack.id} 电池包回收`,category:'电池包',qty:1,unit:'包',region:report.input.region,price:Math.round(report.total),desc:`关联演示报告 ${report.id}，材料回收参考总估值 ¥${money(report.total)}。数据仅用于演示。`};save();go('publish');} }
  if (action==='save-draft') { db.draft={...db.draft,...Object.fromEntries(new FormData($('#publish-form')))}; save(); toast('草稿已保存'); }
  if (action==='about') openModal('循电 · 第二版演示','<p>面向动力电池回收场景的材料构成估价与轻量交易流程 Demo。</p><div class="disclaimer">全部车辆、电池、材料、价格和交易数据均为模拟；未接入实时行情或权威数据库。</div>');
  if (action==='reset') openModal('重置演示数据？','<p>将清除本机生成的报告、报价、发布与草稿，并恢复预置演示记录。</p><div class="actions"><button class="secondary" data-a="close-overlay">取消</button><button class="primary" data-a="reset-confirm">确认重置</button></div>');
  if (action==='reset-confirm') { db={schema:2,reports:seedReports(),trades:seedTrades(),quotes:[],draft:null}; save(); trail=[]; current={page:'home'}; render(); toast('已恢复初始演示数据'); }
});

document.addEventListener('touchstart', event => { if(event.target.closest?.('#carousel')) carouselStartX=event.touches[0].clientX; }, {passive:true});
document.addEventListener('touchend', event => { if(carouselStartX==null||!event.target.closest?.('#carousel')) return; const delta=event.changedTouches[0].clientX-carouselStartX; if(Math.abs(delta)>35){carouselIndex=(carouselIndex+(delta<0?1:4))%5;render();} carouselStartX=null; }, {passive:true});

if (document.modelContext?.registerTool) document.modelContext.registerTool({name:'open_battery_demo_report',description:'打开一份循电 Demo 材料回收估价报告',inputSchema:{type:'object',properties:{reportId:{type:'string'}},required:['reportId']},execute:({reportId})=>{const report=db.reports.find(item=>item.id===reportId);if(!report)throw new Error('报告不存在');go('report',{id:reportId});return {reportId,total:report.total};}});

render();
