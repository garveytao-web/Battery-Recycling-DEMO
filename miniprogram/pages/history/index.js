const { api, date } = require('../../utils/api');
Page({ data: { items: [], error: '', loading: false, nextOffset: 0 },
 onLoad() { this.load(); },
 async load(e) { if (this.data.loading) return; const append = e && e.currentTarget && e.currentTarget.dataset.more; const offset = append ? this.data.nextOffset : 0; if (offset === null) return; this.setData({ loading: true, error: '' }); try { const r = await api('/api/reports?offset=' + offset); const rows = r.items.map(v => ({ ...v, displayDate: date(v.createdAt) })); this.setData({ items: append ? this.data.items.concat(rows) : rows, nextOffset: r.nextOffset }); } catch(e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); } },
 open(e) { wx.navigateTo({ url: '/pages/report/index?id=' + e.currentTarget.dataset.id }); },
 estimate() { wx.redirectTo({ url: '/pages/estimate/index' }); }
});
