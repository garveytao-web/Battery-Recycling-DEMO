'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, loadCatalog } = require('../server/index.cjs');

const original = loadCatalog();
const env = { NODE_ENV: 'test', HOST: '127.0.0.1', ALLOW_DEV_AUTH: 'true' };
const estimateInput = { mode: 'manual', chemistry: 'lfp', form: 'prismatic', massKg: 400, energyKwh: 55, mileageKm: 50000, region: '武汉' };

async function start(options = {}) {
  const app = createApp({ env, dbPath: ':memory:', getCatalog: () => original, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  return { ...app, async call(route, method = 'GET', data, token) { const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) }); return { status: response.status, body: await response.json() }; }, async stop() { await new Promise(resolve => app.server.close(resolve)); } };
}
async function login(app, identity) { const result = await app.call('/api/auth/dev', 'POST', { identity, privacyAccepted: true }); assert.equal(result.status, 200); return result.body.token; }

test('公开目录与车型检索返回分组候选配置', async () => {
  const app = await start();
  try {
    const catalog = await app.call('/api/catalog'); assert.equal(catalog.body.vehicleCount, 651);
    const exact = await app.call('/api/vehicles?q=i7%20xDrive60L%2051EJ'); assert.equal(exact.body.items[0].publicModel, 'i7 xDrive60L 51EJ');
    assert.ok(exact.body.items[0].configurations.length >= 1);
    assert.equal((await app.call('/api/vehicles?q=x')).body.items.length, 0);
  } finally { await app.stop(); }
});
test('报告端到端：登录、估价、历史、快照不变、权限隔离', async () => {
  const catalog = structuredClone(original); const app = await start({ getCatalog: () => catalog });
  try {
    assert.equal((await app.call('/api/estimates', 'POST', estimateInput)).status, 401);
    const a = await login(app, 'a'), b = await login(app, 'b');
    const created = await app.call('/api/estimates', 'POST', estimateInput, a); assert.equal(created.status, 201);
    const report = created.body; assert.equal(report.result.center, 5076.4);
    catalog.pricing.weightRates[0].price = 99999;
    assert.deepEqual((await app.call('/api/reports/' + report.id, 'GET', undefined, a)).body, report);
    assert.equal((await app.call('/api/reports/' + report.id, 'GET', undefined, b)).status, 404);
    assert.equal((await app.call('/api/reports', 'GET', undefined, a)).body.items[0].id, report.id);
  } finally { await app.stop(); }
});

test('供需发布通过自动文本安全检查后立即公开，报价保持私有', async () => {
  const checks = [];
  const app = await start({ checkText: async input => { checks.push(input.content); return { pass: !input.content.includes('拦截词') }; } });
  try {
    const a = await login(app, 'a'), b = await login(app, 'b'), c = await login(app, 'c');
    const report = (await app.call('/api/estimates', 'POST', estimateInput, a)).body;
    const input = { title: '测试电池包', region: '武汉', kind: 'supply', chemistry: 'lfp', quantity: 400, quantityUnit: 'kg', priceUnit: 'CNY/kg', reportId: report.id, description: '现场核对铭牌' };
    assert.equal((await app.call('/api/trades', 'POST', { ...input, title: '拦截词' }, a)).status, 400);
    const created = await app.call('/api/trades', 'POST', input, a); assert.equal(created.status, 201); assert.equal(created.body.status, 'active');
    assert.equal(checks.length, 2);
    const trade = created.body;
    assert.equal((await app.call('/api/trades', 'GET', undefined, b)).body.items.length, 1);
    const offer = { price: 11, contact: '仅测试联系方式', message: '现场验货', contactConsent: true };
    assert.equal((await app.call('/api/trades/' + trade.id + '/offers', 'POST', offer, a)).status, 400);
    assert.equal((await app.call('/api/trades/' + trade.id + '/offers', 'POST', offer, b)).status, 201);
    assert.equal((await app.call('/api/trades/' + trade.id, 'GET', undefined, a)).body.offers.length, 1);
    assert.equal((await app.call('/api/trades/' + trade.id, 'GET', undefined, c)).body.offers.length, 0);
    assert.equal((await app.call('/api/trades/' + trade.id, 'DELETE', undefined, a)).status, 200);
    assert.equal((await app.call('/api/trades', 'GET', undefined, b)).body.items.length, 0);
  } finally { await app.stop(); }
});

test('SQLite重启后保留报告与会话', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xundian-test-')); const dbPath = path.join(dir, 'test.sqlite');
  let app = await start({ dbPath });
  try { const token = await login(app, 'persist'); const report = (await app.call('/api/estimates', 'POST', estimateInput, token)).body; await app.stop(); app = await start({ dbPath }); assert.deepEqual((await app.call('/api/reports/' + report.id, 'GET', undefined, token)).body, report); }
  finally { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('微信登录只在后端交换code且生产配置受约束', async () => {
  let fetched = '';
  const app = await start({ env: { ...env, ALLOW_DEV_AUTH: 'false', WECHAT_APP_ID: 'wx0000000000000000', WECHAT_APP_SECRET: 'secret' }, fetch: async url => { fetched = url; return { ok: true, json: async () => ({ openid: 'private-openid', session_key: 'private-session-key' }) }; } });
  try { const result = await app.call('/api/auth/wechat', 'POST', { privacyAccepted: true, code: 'one-use-code' }); assert.equal(result.status, 200); assert.match(fetched, /jscode2session/); assert.doesNotMatch(JSON.stringify(result.body), /private-openid|session_key/); }
  finally { await app.stop(); }
  assert.throws(() => createApp({ env: { NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true' }, dbPath: ':memory:' }));
});
