const { api, request, ensureLogin, switchDevIdentity, getDevIdentity, clearSession, hasSession, prices, date } = require('../../utils/api');
const config = require('../../config');
Page({ data: { loggedIn: false, offers: [], showOffers: false, error: '', devMode: config.useDevAuth, devIdentity: 'A', switchingIdentity: false },
 onShow() { this.setData({ loggedIn: hasSession(), error: '', showOffers: false, offers: [], devIdentity: getDevIdentity() }); },
 async login() { try { await ensureLogin(); this.setData({ loggedIn: hasSession(), error: '' }); } catch(e) { this.setData({ error: e.message }); } },
 async switchIdentity(e) { const identity = e.currentTarget.dataset.identity; if (this.data.switchingIdentity || identity === this.data.devIdentity) return; this.setData({ switchingIdentity: true, error: '' }); try { await switchDevIdentity(identity); this.setData({ loggedIn: true, devIdentity: identity, showOffers: false, offers: [] }); wx.showToast({ title: `已切换身份${identity}`, icon: 'success' }); } catch(e) { this.setData({ error: e.message }); } finally { this.setData({ switchingIdentity: false }); } },
 history() { wx.navigateTo({ url: '/pages/history/index' }); },
 market() { wx.switchTab({ url: '/pages/market/index' }); },
 privacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
 async offers() { try { const r = await api('/api/offers/mine'); this.setData({ loggedIn: true, showOffers: true, error: '', offers: r.items.map(v => ({ ...v, unitLabel: prices[v.priceUnit], displayDate: date(v.createdAt) })) }); } catch(e) { this.setData({ error: e.message }); } },
 openOffer(e) { wx.navigateTo({ url: '/pages/trade/index?id=' + e.currentTarget.dataset.id }); },
 async logout() { try { if (hasSession()) await request('/api/logout','POST',{}); } catch(e) { this.setData({ error: '本机已退出；服务器凭证将在有效期结束后失效。' }); } finally { clearSession(); this.setData({ loggedIn: false, offers: [], showOffers: false }); } },
 async removeAccount() { const choice = await new Promise(resolve => wx.showModal({ title: '删除账户及业务数据', content: '将删除你的报告、发布、意向报价和登录凭证，相关发布收到的报价也会删除。此操作不能撤回。', confirmText: '确认删除', confirmColor: '#a33629', success: resolve })); if (!choice.confirm) return; try { await api('/api/account','DELETE'); clearSession(); this.setData({ loggedIn: false, offers: [], showOffers: false, error: '' }); wx.showToast({ title: '账户已删除' }); } catch(e) { this.setData({ error: e.message }); } }
});
