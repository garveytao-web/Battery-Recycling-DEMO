'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { estimate, InputError, text, positive, chemistries, forms } = require('./engine.cjs');
const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
function loadCatalog(env = process.env) {
  const base = JSON.parse(fs.readFileSync(path.resolve(root, env.DATA_FILE || 'server/data/catalog.json'), 'utf8'));
  const vehicleMap = JSON.parse(fs.readFileSync(path.resolve(root, env.VEHICLE_DATA_FILE || 'server/data/vehicles-v04.json'), 'utf8'));
  const pricing = JSON.parse(fs.readFileSync(path.resolve(root, env.PRICING_DATA_FILE || 'server/data/pricing-baseline.json'), 'utf8'));
  return {
    ...base,
    version: `${base.version}+${vehicleMap.version}`,
    vehicleMap,
    vehicles: vehicleMap.models.flatMap(model => model.configurations),
    pricing
  };
}

function searchVehicles(catalog, query) {
  const q = text(query, 80).toLowerCase();
  if (q.length < 2) return [];
  return catalog.vehicleMap.models
    .map(model => {
      const modelText = `${model.publicModel} ${model.commonName} ${model.vehicleMaker}`.toLowerCase();
      const rank = model.publicModel.toLowerCase() === q ? 0 : model.publicModel.toLowerCase().startsWith(q) ? 1 : modelText.includes(q) ? 2 : 99;
      return { ...model, rank };
    })
    .filter(model => model.rank < 99)
    .sort((a, b) => a.rank - b.rank || a.publicModel.localeCompare(b.publicModel))
    .slice(0, 20)
    .map(({ rank, ...model }) => model);
}
function createApp(options = {}) {
  const env = options.env || process.env;
  const production = env.NODE_ENV === 'production';
  const allowDev = env.ALLOW_DEV_AUTH === 'true';
  const host = env.HOST || '127.0.0.1';
  if (production && (allowDev || !env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET || !env.OPERATOR_NAME || !env.OPERATOR_CONTACT)) {
    throw new Error('生产环境必须关闭开发登录，并配置微信凭据、运营主体和隐私联系渠道');
  }
  if (allowDev && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('开发登录只允许绑定本机回环地址');
  const filename = options.dbPath || path.resolve(root, env.DB_FILE || 'server/storage/xundian.sqlite');
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, openid TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS reports_owner ON reports(user_id,created_at);
    CREATE INDEX IF NOT EXISTS offers_trade ON offers(trade_id);
    CREATE INDEX IF NOT EXISTS trades_status ON trades(status,created_at);`);
  db.prepare("UPDATE trades SET status='active' WHERE status='approved'").run();
  const getCatalog = options.getCatalog || (() => loadCatalog(env));
  const fetchImpl = options.fetch || fetch;
  let wxToken = null;
  const buckets = new Map();
  const limiter = setInterval(() => { const now = Date.now(); for (const [key,b] of buckets) if (b.until < now) buckets.delete(key); }, 60000);
  limiter.unref();
  function rateLimit(key, max) {
    const now = Date.now(); let b = buckets.get(key);
    if (!b || b.until < now) { b = { count: 0, until: now + 60000 }; buckets.set(key, b); }
    if (++b.count > max) throw new InputError('操作频繁，请稍后再试', 429);
  }
  function auth(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!/^[a-f0-9]{64}$/.test(token)) throw new InputError('请先登录', 401);
    const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires>?').get(hash(token), Date.now());
    if (!session) throw new InputError('登录已过期，请重新登录', 401);
    return session.user_id;
  }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new InputError('提交内容过大', 413); chunks.push(chunk); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch { throw new InputError('JSON参数格式错误'); }
  }
  async function checkPublicText(content, userId) {
    const openid = db.prepare('SELECT openid FROM users WHERE id=?').get(userId)?.openid;
    if (options.checkText) {
      const checked = await options.checkText({ content, openid });
      if (!checked || checked.pass !== true) throw new InputError('公开内容未通过安全检查，请修改后重试');
      return checked;
    }
    if (!production) return { pass: true, provider: 'development-bypass' };
    try {
      if (!wxToken || wxToken.expiresAt < Date.now() + 60000) {
        const params = new URLSearchParams({ grant_type: 'client_credential', appid: env.WECHAT_APP_ID, secret: env.WECHAT_APP_SECRET });
        const tokenResponse = await fetchImpl(`https://api.weixin.qq.com/cgi-bin/token?${params}`, { signal: AbortSignal.timeout(8000) });
        const tokenBody = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenBody.access_token) throw new Error('token');
        wxToken = { value: tokenBody.access_token, expiresAt: Date.now() + Math.max(300, tokenBody.expires_in - 120) * 1000 };
      }
      const response = await fetchImpl(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(wxToken.value)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, version: 2, scene: 2, openid }),
        signal: AbortSignal.timeout(8000)
      });
      const result = await response.json();
      if (!response.ok || result.errcode || !result.result) throw new Error('check');
      if (result.result.suggest !== 'pass') throw new InputError('公开内容未通过微信内容安全检查，请修改后重试');
      return { pass: true, provider: 'wechat' };
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError('内容安全服务暂不可用，当前未发布，请稍后重试', 503);
    }
  }
  const reportFor = (reportId, user) => {
    const row = db.prepare('SELECT body FROM reports WHERE id=? AND user_id=?').get(reportId, user);
    if (!row) throw new InputError('报告不存在', 404);
    return JSON.parse(row.body);
  };
  const tradeFor = (tradeId, user) => {
    const row = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
    if (!row || (row.status !== 'active' && row.user_id !== user)) throw new InputError('供需信息不存在或未公开', 404);
    return row;
  };
  function publicTrade(row, user) {
    return { ...JSON.parse(row.body), id: row.id, createdAt: row.created_at, status: row.status, isMine: row.user_id === user };
  }
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);
    function send(value, status = 200) { res.writeHead(status); res.end(JSON.stringify(value)); }
    try {
      const url = new URL(req.url, 'http://localhost'); const route = url.pathname; const method = req.method;
      // nginx部署另有限流；不信任客户端伪造的转发IP。
      rateLimit(`ip:${req.socket.remoteAddress}`, 600);
      if (method === 'GET' && route === '/health') return send({ ok: true, version: '0.4.0' });
      if (method === 'GET' && route === '/api/config') return send({ devAuth: allowDev, operator: env.OPERATOR_NAME || '开发环境：运营主体待配置', contact: env.OPERATOR_CONTACT || '开发环境：隐私联系渠道待配置', privacyVersion: '2026-09-30' });
      if (method === 'GET' && route === '/api/catalog') {
        const c = getCatalog(); return send({
          version: c.version,
          pricingVersion: c.pricing.version,
          chemistries,
          forms,
          weightRateCount: c.pricing.weightRates.length,
          vehicleCount: c.vehicleMap.searchableModelCount,
          vehicleConfigurationCount: c.vehicleMap.searchableConfigurationCount,
          priceReadyConfigurationCount: c.vehicleMap.priceReadyConfigurationCount,
          materials: c.materials,
          sourceNotes: c.sourceNotes
        });
      }
      if (method === 'GET' && route === '/api/vehicles') {
        return send({ items: searchVehicles(getCatalog(), url.searchParams.get('q')) });
      }
      if (method === 'POST' && ['/api/auth/wechat','/api/auth/dev'].includes(route)) {
        rateLimit(`login:${req.socket.remoteAddress}`, 30);
        const data = await body(req);
        if (data.privacyAccepted !== true) throw new InputError('请先阅读并同意隐私说明');
        let openid;
        if (route.endsWith('/dev')) {
          if (!allowDev || production || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new InputError('开发登录已关闭', 403);
          openid = `dev:${text(data.identity, 40) || 'local-developer'}`;
        } else {
          if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) throw new InputError('服务端尚未配置微信登录', 503);
          const code = text(data.code, 512); if (!code) throw new InputError('缺少微信登录code');
          const params = new URLSearchParams({ appid: env.WECHAT_APP_ID, secret: env.WECHAT_APP_SECRET, js_code: code, grant_type: 'authorization_code' });
          let wx;
          try { const response = await fetchImpl(`https://api.weixin.qq.com/sns/jscode2session?${params}`, { signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error(); wx = await response.json(); }
          catch { throw new InputError('微信登录服务暂不可用，请重试', 503); }
          if (!wx.openid || wx.errcode) throw new InputError('微信登录凭证无效，请重试', 401);
          openid = wx.openid;
        }
        let user = db.prepare('SELECT id FROM users WHERE openid=?').get(openid);
        if (!user) { user = { id: id('U') }; db.prepare('INSERT INTO users VALUES (?,?,?)').run(user.id, openid, new Date().toISOString()); }
        db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
        const token = crypto.randomBytes(32).toString('hex'); const expiresAt = Date.now() + 7 * 86400000;
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, expiresAt);
        return send({ token, expiresAt, userId: user.id });
      }
      const user = auth(req); rateLimit(`user:${user}`, 120);
      if (method === 'POST' && route === '/api/logout') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(req.headers.authorization.slice(7))); return send({ ok: true }); }
      if (method === 'POST' && route === '/api/estimates') {
        const report = estimate(await body(req), getCatalog());
        db.prepare('INSERT INTO reports VALUES (?,?,?,?)').run(report.id, user, report.createdAt, JSON.stringify(report));
        return send(report, 201);
      }
      if (method === 'GET' && route === '/api/reports') {
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new InputError('分页参数错误');
        const rows = db.prepare('SELECT body FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 50 OFFSET ?').all(user, offset);
        return send({ items: rows.map(r => { const v = JSON.parse(r.body); return { id: v.id, title: v.title, createdAt: v.createdAt, statusLabel: v.statusLabel, result: v.result }; }), nextOffset: rows.length === 50 ? offset + 50 : null });
      }
      let match = route.match(/^\/api\/reports\/([\w-]+)$/);
      if (method === 'GET' && match) return send(reportFor(match[1], user));
      if (method === 'GET' && route === '/api/trades') {
        const mine = url.searchParams.get('mine') === '1';
        const rows = mine ? db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(user) : db.prepare("SELECT * FROM trades WHERE status='active' ORDER BY created_at DESC LIMIT 100").all();
        return send({ items: rows.map(r => publicTrade(r, user)) });
      }
      if (method === 'POST' && route === '/api/trades') {
        const raw = await body(req); const title = text(raw.title, 80); const region = text(raw.region, 40);
        if (title.length < 2 || !region) throw new InputError('请填写标题和所在城市');
        if (!['supply','demand'].includes(raw.kind)) throw new InputError('供需类型错误');
        if (!['CNY/batch','CNY/kg','CNY/kWh'].includes(raw.priceUnit)) throw new InputError('请选择报价单位');
        const chemistry = text(raw.chemistry); if (!Object.hasOwn(chemistries, chemistry)) throw new InputError('请选择电池类型');
        const report = raw.reportId ? reportFor(text(raw.reportId), user) : null;
        if (report && report.input.chemistry !== chemistry) throw new InputError('供需材料类型与关联报告不一致');
        const v = { title, region, kind: raw.kind, chemistry, priceUnit: raw.priceUnit, quantity: positive(raw.quantity, '数量'), quantityUnit: text(raw.quantityUnit), description: text(raw.description, 1000), reportId: report?.id || null };
        if (!['kg','kWh','批'].includes(v.quantityUnit)) throw new InputError('数量单位不支持');
        if ((v.priceUnit === 'CNY/kg' && v.quantityUnit !== 'kg') || (v.priceUnit === 'CNY/kWh' && v.quantityUnit !== 'kWh')) throw new InputError('单价单位须与数量单位一致');
        await checkPublicText(`${v.title}\n${v.description}`, user);
        const tradeId = id('T'); const createdAt = new Date().toISOString();
        db.prepare('INSERT INTO trades VALUES (?,?,?,?,?)').run(tradeId, user, createdAt, 'active', JSON.stringify(v));
        return send({ ...v, id: tradeId, status: 'active', isMine: true, createdAt }, 201);
      }
      match = route.match(/^\/api\/trades\/([\w-]+)(\/offers)?$/);
      if (match) {
        const row = tradeFor(match[1], user); const trade = publicTrade(row, user);
        if (method === 'GET' && !match[2]) {
          const offers = (row.user_id === user ? db.prepare('SELECT * FROM offers WHERE trade_id=? ORDER BY created_at DESC').all(row.id) : db.prepare('SELECT * FROM offers WHERE trade_id=? AND user_id=? ORDER BY created_at DESC').all(row.id, user)).map(o => ({ id: o.id, createdAt: o.created_at, ...JSON.parse(o.body) }));
          return send({ ...trade, offers });
        }
        if (method === 'DELETE' && !match[2]) {
          if (row.user_id !== user) throw new InputError('无权撤下此信息', 403);
          db.prepare("UPDATE trades SET status='withdrawn' WHERE id=?").run(row.id); return send({ ok: true });
        }
        if (method === 'POST' && match[2]) {
          if (row.status !== 'active') throw new InputError('当前信息未开放报价');
          if (row.user_id === user) throw new InputError('不能向自己的信息提交报价');
          const raw = await body(req); const offer = { price: positive(raw.price, '意向单价/总价', 100000000), priceUnit: trade.priceUnit, message: text(raw.message, 500), contact: text(raw.contact, 80), tradeTitle: trade.title };
          if (!offer.contact) throw new InputError('请填写供发布者联系的方式');
          if (raw.contactConsent !== true) throw new InputError('请确认将联系方式提供给发布者');
          const offerId = id('O'); const createdAt = new Date().toISOString();
          db.prepare('INSERT INTO offers VALUES (?,?,?,?,?)').run(offerId, row.id, user, createdAt, JSON.stringify(offer));
          return send({ id: offerId, createdAt, ...offer }, 201);
        }
      }
      if (method === 'GET' && route === '/api/offers/mine') return send({ items: db.prepare('SELECT * FROM offers WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(user).map(o => ({ id: o.id, tradeId: o.trade_id, createdAt: o.created_at, ...JSON.parse(o.body) })) });
      if (method === 'DELETE' && route === '/api/account') { db.prepare('DELETE FROM users WHERE id=?').run(user); return send({ ok: true }); }
      throw new InputError('接口不存在', 404);
    } catch (err) {
      const status = err instanceof InputError ? err.status : 500;
      if (status === 500) console.error(`[${requestId}] ${err.name}: internal error`);
      if (!res.headersSent) send({ error: status === 500 ? '服务暂不可用，请稍后重试' : err.message, requestId }, status);
      else res.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('close', () => { clearInterval(limiter); db.close(); });
  return { server, db };
}
if (require.main === module) {
  const { server } = createApp();
  server.listen(Number(process.env.PORT || 8082), process.env.HOST || '127.0.0.1', () => console.log(`循电 API 已启动，端口 ${process.env.PORT || 8082}`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
module.exports = { createApp, loadCatalog, searchVehicles };
