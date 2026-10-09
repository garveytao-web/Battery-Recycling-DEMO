const config = require('../config');
let loginTask = null;
function request(path, method = 'GET', data, authenticated = true) {
  return new Promise((resolve, reject) => {
    const version = wx.getAccountInfoSync().miniProgram.envVersion;
    if (version !== 'develop' && (!config.apiBase.startsWith('https://') || config.useDevAuth)) return reject(new Error('发布配置未完成，请联系运营方'));
    wx.request({ url: config.apiBase + path, method, data,
      header: { 'content-type': 'application/json', ...(authenticated ? { Authorization: 'Bearer ' + (wx.getStorageSync('xd-token') || '') } : {}) }, timeout: 12000,
      success(res) { if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else { if (res.statusCode === 401) clearSession(); reject(new Error((res.data && res.data.error) || '请求失败，请重试')); } },
      fail() { reject(new Error('暂时无法连接服务，请检查网络或服务地址')); }
    });
  });
}
function clearSession() { wx.removeStorageSync('xd-token'); wx.removeStorageSync('xd-expiry'); }
function hasSession() { return Boolean(wx.getStorageSync('xd-token')) && Number(wx.getStorageSync('xd-expiry')) > Date.now() + 10000; }
function getDevIdentity() {
  const identity = wx.getStorageSync('xd-dev-identity');
  return identity === 'B' ? 'B' : 'A';
}
function saveSession(session) {
  wx.setStorageSync('xd-token', session.token);
  wx.setStorageSync('xd-expiry', session.expiresAt);
}
async function createDevSession(identity = getDevIdentity()) {
  if (!config.useDevAuth || wx.getAccountInfoSync().miniProgram.envVersion !== 'develop') throw new Error('当前版本禁止开发身份切换');
  const value = identity === 'B' ? 'B' : 'A';
  const session = await request('/api/auth/dev', 'POST', { identity: value === 'B' ? 'buyer-b' : 'local-developer', privacyAccepted: true }, false);
  wx.setStorageSync('xd-dev-identity', value);
  saveSession(session);
  return session;
}
async function switchDevIdentity(identity) {
  if (hasSession()) {
    try { await request('/api/logout', 'POST', {}); } catch (_) {}
  }
  clearSession();
  return createDevSession(identity);
}
async function login() {
  if (hasSession()) return;
  const consent = await new Promise(resolve => wx.showModal({ title: '登录循电', content: '登录将生成账户，保存你的估价报告与供需信息。请先阅读「我的 → 隐私说明」。是否同意该说明并登录？', confirmText: '同意登录', cancelText: '查看说明', success: resolve, fail: () => resolve({ confirm: false }) }));
  if (!consent.confirm) { wx.navigateTo({ url: '/pages/privacy/index' }); throw new Error('尚未同意登录'); }
  let session;
  if (config.useDevAuth) {
    session = await createDevSession();
  } else {
    const result = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: () => reject(new Error('微信登录失败')) }));
    session = await request('/api/auth/wechat', 'POST', { code: result.code, privacyAccepted: true }, false);
  }
  saveSession(session);
}
async function ensureLogin() { if (!loginTask) loginTask = login().finally(() => { loginTask = null; }); return loginTask; }
async function api(path, method = 'GET', data) { await ensureLogin(); return request(path, method, data); }
const date = iso => (iso || '').replace('T', ' ').slice(0, 16) + ' UTC';
const prices = { 'CNY/batch': '元/批', 'CNY/kg': '元/kg', 'CNY/kWh': '元/kWh' };
const chemistryNames = { lfp: '磷酸铁锂', ncm: '三元锂', small_ncm: '小三元' };
const formNames = { prismatic: '方形', pouch: '软包', cylindrical: '圆柱形' };
const statusNames = { active: '已公开', withdrawn: '已撤下' };
module.exports = { api, request, ensureLogin, switchDevIdentity, getDevIdentity, clearSession, hasSession, date, prices, chemistryNames, formNames, statusNames };
