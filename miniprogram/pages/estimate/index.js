const { api, request, chemistryNames } = require('../../utils/api');
const keys = { chemistry: ['lfp','ncm','small_ncm'], basis: ['energy','weight'], goods: ['pack','module','cell'], form: ['unspecified','prismatic','pouch','cylindrical'], condition: ['normal','damaged','flooded','burned','missing','unknown'] };
Page({
  data: { chemistryLabels: ['磷酸铁锂','三元','小三元（来源分类）'], basisLabels: ['按额定电量（kWh）','按实际重量（kg）'], goodsLabels: ['完整电池包','模组','电芯'], formLabels: ['不清楚','方壳','软包','圆柱'], conditionLabels: ['外观完整、无已知事故','破损','泡水','过火','缺件','不清楚'], chemistryIndex: 0, basisIndex: 0, goodsIndex: 0, formIndex: 0, conditionIndex: 0, quantity: '', region: '', vehicleDescription: '', brandIndex: 0, brands: ['不限品牌'], ahIndex: 0, ahLabels: ['不清楚/不限'], ahValues: [''], quotes: [], error: '', busy: false, vehicleQuery: '', vehicles: [], selectedVehicle: null, originalBatteryConfirmed: false },
  onLoad() { this.load(); },
  async load() { try { const c = await request('/api/catalog','GET',null,false); this.setData({ quotes: c.quotes.filter(r => r.reviewStatus === 'usable_reference') }); this.refreshBrands(); } catch(e) { this.setData({ error: e.message }); } },
  refreshBrands() { const rows = this.data.quotes.filter(r => r.chemistry === keys.chemistry[this.data.chemistryIndex]); this.setData({ brands: ['不限品牌', ...new Set(rows.map(r => r.brand))], brandIndex: 0, ahIndex: 0, ahLabels: ['不清楚/不限'], ahValues: [''] }); },
  change(e) { const name = e.currentTarget.dataset.name; this.setData({ [name + 'Index']: Number(e.detail.value), error: '' }); if (name === 'chemistry') { this.setData({ selectedVehicle: null }); this.refreshBrands(); } if (name === 'brand') { const brand = this.data.brands[Number(e.detail.value)]; const values = [...new Set(this.data.quotes.filter(r => r.chemistry === keys.chemistry[this.data.chemistryIndex] && r.brand === brand).map(r => r.capacityAh))].sort((a,b) => a-b); this.setData({ ahIndex: 0, ahLabels: ['不清楚/不限', ...values.map(v => v + ' Ah')], ahValues: ['', ...values] }); } if (name === 'basis') this.applyVehicleQuantity(); },
  input(e) { this.setData({ [e.currentTarget.dataset.name]: e.detail.value }); },
  async searchVehicle() { this.setData({ error: '' }); try { const r = await request('/api/vehicles?q=' + encodeURIComponent(this.data.vehicleQuery),'GET',null,false); this.setData({ vehicles: r.items }); if (!r.items.length) this.setData({ error: '暂无已核实的对应配置，请直接填写电池参数。品牌、车型不是必填项。' }); } catch(e) { this.setData({ error: e.message }); } },
  selectVehicle(e) { const v = this.data.vehicles.find(v => v.id === e.currentTarget.dataset.id); if (!v) return; this.setData({ selectedVehicle: v, vehicles: [], chemistryIndex: keys.chemistry.indexOf(v.chemistry), vehicleDescription: v.label, originalBatteryConfirmed: false }); this.applyVehicleQuantity(); this.refreshBrands(); },
  applyVehicleQuantity() { const v = this.data.selectedVehicle; if (v) this.setData({ quantity: String(this.data.basisIndex === 0 ? (v.energyKwh || '') : (v.massKg || '')) }); },
  clearVehicle() { this.setData({ selectedVehicle: null, originalBatteryConfirmed: false, quantity: '', vehicleDescription: '' }); },
  confirmOriginal(e) { this.setData({ originalBatteryConfirmed: e.detail.value.length > 0 }); },
  async submit() {
    if (this.data.busy) return; this.setData({ busy: true, error: '' });
    try { const d = this.data; const payload = { quantity: d.quantity, region: d.region, vehicleDescription: d.vehicleDescription, brand: d.brandIndex ? d.brands[d.brandIndex] : '', capacityAh: d.ahValues[d.ahIndex], vehicleId: d.selectedVehicle ? d.selectedVehicle.id : '', originalBatteryConfirmed: d.originalBatteryConfirmed }; Object.keys(keys).forEach(key => { payload[key] = keys[key][d[key + 'Index']]; }); const r = await api('/api/estimates','POST',payload); wx.redirectTo({ url: '/pages/report/index?id=' + r.id }); }
    catch(e) { this.setData({ error: e.message }); } finally { this.setData({ busy: false }); }
  }
});
