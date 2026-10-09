const { api, request } = require('../../utils/api');
const { provinces, isPositiveNumber, isNonNegativeInteger } = require('../../utils/validation');

const chemistryKeys = ['lfp', 'ncm', 'small_ncm'];
const formKeys = ['prismatic', 'pouch', 'cylindrical'];

Page({
  data: {
    mode: 'vehicle', vehicleQuery: '', vehicleResults: [], selectedConfig: null, searching: false,
    producer: '', chemistryIndex: 0, chemistryLabels: ['磷酸铁锂', '三元锂', '小三元'],
    formIndex: 0, formLabels: ['方形', '软包', '圆柱形'], massKg: '', energyKwh: '',
    mileageKm: '', region: '', provinces, provinceIndex: 0, error: '', busy: false
  },
  switchMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, error: '' }); },
  input(e) { this.setData({ [e.currentTarget.dataset.name]: e.detail.value, error: '' }); },
  change(e) { this.setData({ [e.currentTarget.dataset.name + 'Index']: Number(e.detail.value), error: '' }); },
  changeProvince(e) {
    const provinceIndex = Number(e.detail.value);
    this.setData({ provinceIndex, region: this.data.provinces[provinceIndex], error: '' });
  },
  async searchVehicle() {
    if (this.data.vehicleQuery.trim().length < 2) {
      this.setData({ error: '请输入至少2个字符的公告车型，例如 BJ7000。', vehicleResults: [] }); return;
    }
    this.setData({ searching: true, error: '', selectedConfig: null });
    try {
      const result = await request('/api/vehicles?q=' + encodeURIComponent(this.data.vehicleQuery), 'GET', null, false);
      this.setData({ vehicleResults: result.items });
      if (!result.items.length) this.setData({ error: '车型库暂未找到该公告车型，请切换到“铭牌参数估价”。' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ searching: false }); }
  },
  selectConfig(e) {
    const id = e.currentTarget.dataset.id; let selected = null;
    this.data.vehicleResults.forEach(model => model.configurations.forEach(config => { if (config.id === id) selected = config; }));
    if (!selected) return;
    this.setData({ selectedConfig: selected, error: selected.priceReady ? '' : '该配置仍有材料或外形歧义，请改用铭牌参数估价。' });
  },
  clearConfig() { this.setData({ selectedConfig: null, vehicleResults: [], error: '' }); },
  async submit() {
    if (this.data.busy) return;
    const data = this.data;
    if (!data.provinces.includes(data.region)) return this.setData({ error: '请选择车辆所在省份' });
    if (!isNonNegativeInteger(data.mileageKm)) return this.setData({ error: '行驶里程只能填写非负整数' });
    if (data.mode === 'manual' && !isPositiveNumber(data.massKg)) return this.setData({ error: '电池包总重量只能填写数字且须大于0' });
    if (data.mode === 'manual' && !isPositiveNumber(data.energyKwh)) return this.setData({ error: '电池包总电量只能填写数字且须大于0' });
    this.setData({ busy: true, error: '' });
    try {
      const payload = { mode: data.mode, region: data.region, mileageKm: data.mileageKm, producer: data.producer };
      if (data.mode === 'vehicle') payload.vehicleConfigId = data.selectedConfig ? data.selectedConfig.id : '';
      else Object.assign(payload, { chemistry: chemistryKeys[data.chemistryIndex], form: formKeys[data.formIndex], massKg: data.massKg, energyKwh: data.energyKwh });
      const report = await api('/api/estimates', 'POST', payload);
      wx.redirectTo({ url: '/pages/report/index?id=' + report.id });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  }
});
