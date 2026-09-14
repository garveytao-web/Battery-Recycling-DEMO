const fs=require('fs'),vm=require('vm'),assert=require('assert');
const nodes={};const listeners={};let registered;
const context={console,structuredClone,Date,Math,Number,String,JSON,setTimeout:()=>0,clearTimeout:()=>{},FormData:class{},localStorage:{getItem:()=>null,setItem:()=>{}},window:{scrollY:0,scrollTo:()=>{},print:()=>{}},document:{querySelector:s=>s==='#quick'||s==='#quick-home'||s==='#condition'?null:(nodes[s]??={innerHTML:'',style:{},showModal(){},close(){}}),addEventListener:(e,fn)=>listeners[e]=fn,modelContext:{registerTool:t=>{registered=t}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
vm.runInContext(`
quick={car:packs[0].car,pack:'a1',region:'湖北',km:'80000'};createQuick();
if(db.reports.length!==2)throw Error('report pair missing');
if(db.reports[0].material!==4140)throw Error('material formula');
if(Math.abs(db.reports[0].ladder-7031.34)>0.01)throw Error('ladder formula');
var firstId=db.reports[0].id,firstJSON=JSON.stringify(db.reports[0]);
go('history');go('report',{id:firstId});if(JSON.stringify(db.reports[0])!==firstJSON)throw Error('history mutated');
quick.km='';createQuick();if(db.reports[0].ladder!==null)throw Error('blank distance');
var before=db.reports.length;quick.pack='not-found';createQuick();if(db.reports.length!==before)throw Error('invalid pack generated report');
cond={purpose:'两者',maker:'sample',material:'磷酸铁锂',shape:'方壳',ah:'100',v:'3.2',kg:'2.5',count:'100',soh:'80',kwh:'36'};
createCondition();if(db.reports[0].material!==4000||db.reports[0].ladder!==5184)throw Error('conditional formula');
before=db.reports.length;cond.count='1.2';createCondition();if(db.reports.length!==before)throw Error('fractional count accepted');
cond.count='100';cond.soh='101';createCondition();if(db.reports.length!==before)throw Error('invalid percentage accepted');
for(const page of ['home','quick','condition','market','history','me','publish','my-posts','my-quotes'])go(page);
for(const t of db.trades){go('trade',{id:t.id});if(t.method==='竞拍展示'&&$('#app').innerHTML.includes('data-a="quote"'))throw Error('auction submit exists');}
for(const r of db.reports)go('report',{id:r.id});
if(esc('<img src=x onerror=x>')!=='&lt;img src=x onerror=x&gt;')throw Error('escaping');
`,context);
assert.equal(registered.name,'open_battery_demo_report');const id=vm.runInContext('db.reports[0].id',context);assert.equal(registered.execute({reportId:id}).reportId,id);assert.throws(()=>registered.execute({reportId:'unknown'}));
for(const f of ['style.css','app.js'])assert(fs.existsSync('dist/'+f));
console.log('PASS: sample calculations, input bounds, report identity, all views, auction read-only, HTML escaping, report tool actions.');
