const { api, chemistryNames, prices, statusNames } = require('../../utils/api');
Page({ data: { items: [], mine: false, error: '', loading: false },
 onShow() { this.load(); },
 async load() { this.setData({ loading: true, error: '' }); try { const r = await api('/api/trades' + (this.data.mine ? '?mine=1' : '')); this.setData({ items: r.items.map(v => ({ ...v, chemistryLabel: chemistryNames[v.chemistry], unitLabel: prices[v.priceUnit], statusLabel: statusNames[v.status] })) }); } catch(e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); } },
 tab(e) { this.setData({ mine: e.currentTarget.dataset.mine === 'true', items: [] }); this.load(); },
 open(e) { wx.navigateTo({ url: '/pages/trade/index?id=' + e.currentTarget.dataset.id }); },
 publish() { wx.navigateTo({ url: '/pages/publish/index' }); }
});
