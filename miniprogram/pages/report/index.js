const { api, date, chemistryNames } = require('../../utils/api');
Page({ data: { report: null, error: '', loading: true, showSources: false, chemistry: '', goods: '', form: '', created: '' },
 onLoad(options) { this.reportId = options.id; this.load(); },
 async load() { this.setData({ error: '', loading: true }); try { const r = await api('/api/reports/' + encodeURIComponent(this.reportId || '')); this.setData({ report: r, chemistry: chemistryNames[r.input.chemistry], goods: { pack: '完整电池包', cell: '电芯', module: '模组' }[r.input.goods], form: { prismatic: '方壳', pouch: '软包', cylindrical: '圆柱', unspecified: '不清楚' }[r.input.form], created: date(r.createdAt) }); } catch(e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); } },
 toggleSources() { this.setData({ showSources: !this.data.showSources }); },
 publish() { wx.navigateTo({ url: '/pages/publish/index?reportId=' + this.reportId }); },
 again() { wx.redirectTo({ url: '/pages/estimate/index' }); },
 copy() { const r = this.data.report; wx.setClipboardData({ data: `循电报告 ${r.id}\n${r.title}\n${r.statusLabel}\n${r.result ? r.result.low + '—' + r.result.high + ' 元/批' : '暂无自动估价'}\n${r.scope}\n算法 ${r.algorithmVersion}；数据 ${r.catalogVersion}` }); }
});
