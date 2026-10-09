const { request } = require('../../utils/api');

Page({
  data: {
    loading: true,
    error: '',
    catalog: null,
    banners: [
      { image: '/assets/banner-1.png', eyebrow: 'SMART VALUATION', title: '智能估价', subtitle: '从公告车型或铭牌参数开始' },
      { image: '/assets/banner-2.png', eyebrow: 'CLEAR BASIS', title: '价格有依据', subtitle: '重量主估值 · 电量交叉校验' },
      { image: '/assets/banner-3.png', eyebrow: 'COMPLIANT RECYCLING', title: '规范回收', subtitle: '信息清晰 · 来源透明' },
      { image: '/assets/banner-4.png', eyebrow: 'CIRCULAR VALUE', title: '让材料回到循环', subtitle: '聚焦合规处置与资源再生' },
      { image: '/assets/banner-5.png', eyebrow: 'RECYCLING MARKET', title: '轻量供需对接', subtitle: '发布 · 意向 · 私密联系' }
    ]
  },
  onLoad() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ catalog: await request('/api/catalog', 'GET', null, false) }); }
    catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  estimate() { wx.navigateTo({ url: '/pages/estimate/index' }); },
  history() { wx.navigateTo({ url: '/pages/history/index' }); },
  market() { wx.switchTab({ url: '/pages/market/index' }); },
  privacy() { wx.navigateTo({ url: '/pages/privacy/index' }); }
});
