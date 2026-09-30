const { request } = require('../../utils/api');
Page({ data: { config: null, error: '' }, async onLoad() { try { this.setData({ config: await request('/api/config','GET',null,false) }); } catch(e) { this.setData({ error: e.message }); } } });
