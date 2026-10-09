const { api, chemistryNames, prices, statusNames, date } = require('../../utils/api');
const { isPositiveNumber, isPhone } = require('../../utils/validation');
Page({ data: { trade: null, error: '', price: '', message: '', contact: '', consent: false, busy: false },
 onLoad(q) { this.tradeId = q.id; this.load(); },
 async load() { this.setData({ error: '' }); try { const r = await api('/api/trades/' + this.tradeId); this.setData({ trade: { ...r, chemistryLabel: chemistryNames[r.chemistry], unitLabel: prices[r.priceUnit], statusLabel: statusNames[r.status], offers: r.offers.map(o => ({ ...o, displayDate: date(o.createdAt) })) } }); } catch(e) { this.setData({ error: e.message }); } },
 input(e) { this.setData({ [e.currentTarget.dataset.name]: e.detail.value }); },
 consent(e) { this.setData({ consent: e.detail.value.length > 0 }); },
 async offer() { if (this.data.busy) return; if (!isPositiveNumber(this.data.price)) return this.setData({ error: '价格只能填写数字且须大于0' }); if (!isPhone(this.data.contact)) return this.setData({ error: '手机号须为11位纯数字' }); if (!this.data.consent) return this.setData({ error: '请确认将手机号提供给发布者' }); this.setData({ busy: true, error: '' }); try { await api('/api/trades/' + this.tradeId + '/offers', 'POST', { price: this.data.price, message: this.data.message, contact: this.data.contact, contactConsent: this.data.consent }); this.setData({ price: '', message: '', contact: '', consent: false }); wx.showToast({ title: '意向报价已提交', icon: 'success' }); await this.load(); } catch(e) { this.setData({ error: e.message }); } finally { this.setData({ busy: false }); } },
 async withdraw() { const r = await new Promise(resolve => wx.showModal({ title: '撤下供需信息', content: '撤下后将不再对外公开，也不能继续接收报价。', success: resolve })); if (!r.confirm) return; try { await api('/api/trades/' + this.tradeId, 'DELETE'); await this.load(); } catch(e) { this.setData({ error: e.message }); } }
});
