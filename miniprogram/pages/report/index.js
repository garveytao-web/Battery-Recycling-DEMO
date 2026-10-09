const { api, date, chemistryNames, formNames } = require('../../utils/api');

Page({
  data: { report: null, error: '', loading: true, showSources: false, chemistry: '', form: '', created: '' },
  onLoad(options) { this.reportId = options.id; this.load(); },
  async load() {
    this.setData({ error: '', loading: true });
    try {
      const report = await api('/api/reports/' + encodeURIComponent(this.reportId || ''));
      this.setData({ report, chemistry: chemistryNames[report.input.chemistry], form: formNames[report.input.form], created: date(report.createdAt) });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  toggleSources() { this.setData({ showSources: !this.data.showSources }); },
  publish() { wx.navigateTo({ url: '/pages/publish/index?reportId=' + this.reportId }); },
  again() { wx.redirectTo({ url: '/pages/estimate/index' }); },
  copy() {
    const report = this.data.report;
    wx.setClipboardData({ data: `循电报告 ${report.id}\n${report.title}\n参考价 ¥${report.result.low}—${report.result.high}\n重量主估值 ¥${report.weightEstimate.center}\n${report.scope}\n算法 ${report.algorithmVersion}；价格基准 ${report.pricingVersion}` });
  }
});
