const { api, date, chemistryNames, formNames } = require('../../utils/api');

Page({
  data: { report: null, error: '', loading: true, chemistry: '', form: '', created: '' },
  onLoad(options) { this.reportId = options.id; this.load(); },
  async load() {
    this.setData({ error: '', loading: true });
    try {
      const report = await api('/api/reports/' + encodeURIComponent(this.reportId || ''));
      this.setData({ report, chemistry: chemistryNames[report.input.chemistry], form: formNames[report.input.form], created: date(report.createdAt) });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  publish() { wx.navigateTo({ url: '/pages/publish/index?reportId=' + this.reportId }); },
  again() { wx.redirectTo({ url: '/pages/estimate/index' }); },
  copy() {
    const report = this.data.report;
    const metals = (report.metalContentEstimates || []).map(item => `${item.name}约 ${item.massLowKg}—${item.massHighKg} kg`).join('；');
    wx.setClipboardData({ data: `循电报告 ${report.id}\n${report.title}\n回收参考价 ¥${report.result.low}—${report.result.high}\n参考中位价 ¥${report.result.center}\n${metals ? `主要金属参考：${metals}\n` : ''}${report.scope}` });
  }
});
