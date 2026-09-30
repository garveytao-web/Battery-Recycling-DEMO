const { request } = require('../../utils/api');
Page({
  data: { loading: true, error: '', catalog: null, quoteCount: 0 },
  onLoad() { this.load(); },
  async load() { this.setData({ loading: true, error: '' }); try { const catalog = await request('/api/catalog', 'GET', null, false); this.setData({ catalog, quoteCount: catalog.quotes.filter(r => r.reviewStatus === 'usable_reference').length }); } catch(e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); } },
  estimate() { wx.navigateTo({ url: '/pages/estimate/index' }); },
  history() { wx.navigateTo({ url: '/pages/history/index' }); },
  market() { wx.switchTab({ url: '/pages/market/index' }); },
  privacy() { wx.navigateTo({ url: '/pages/privacy/index' }); }
});
