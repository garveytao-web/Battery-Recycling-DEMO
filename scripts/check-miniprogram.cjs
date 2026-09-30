'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'../miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
let failures = [];
function checkJS(file) { const content = fs.readFileSync(file,'utf8'); try { new vm.Script(content,{filename:file}); } catch(e) { failures.push(e.message); } if (/\b(document|localStorage|window)\./.test(content)) failures.push(file + '包含浏览器专用API'); }
for (const page of app.pages) {
  const file = path.join(root,page); let pageDef;
  try {
    checkJS(file+'.js');
    vm.runInNewContext(fs.readFileSync(file+'.js','utf8'), { Page(p) { pageDef = p; }, require() { return {}; } }, {filename:file+'.js'});
    const wxml = fs.readFileSync(file+'.wxml','utf8');
    for (const m of wxml.matchAll(/wx:(?:if|elif|for)="([^"]*)"/g)) if (!m[1].startsWith('{{') || !m[1].endsWith('}}')) failures.push(`${page}: 条件或循环没有使用WXML动态表达式`);
    for (const m of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) { try { new vm.Script('(' + m[1] + ')'); } catch(e) { failures.push(`${page}: 表达式语法错误 ${m[1]}`); } }
    const stack = [];
    for (const m of wxml.replace(/\{\{[\s\S]*?\}\}/g,'EXPR').matchAll(/<(\/?)([\w-]+)\b[^>]*>/g)) {
      if (m[1]) { const open = stack.pop(); if (open !== m[2]) failures.push(`${page}: 标签嵌套错误 ${open}/${m[2]}`); }
      else if (!m[0].endsWith('/>')) stack.push(m[2]);
    }
    if (stack.length) failures.push(`${page}: 未闭合标签 ${stack.join(',')}`);
    for (const m of wxml.matchAll(/(?:bind|catch)(?:\w+|:\w+)="([A-Za-z]\w*)"/g)) if (typeof pageDef[m[1]] !== 'function') failures.push(`${page}: 缺少事件方法${m[1]}`);
    for (const m of wxml.matchAll(/<(\/?)([a-zA-Z-]+)\b/g)) if (!['view','text','button','block','picker','input','textarea','checkbox','checkbox-group','label'].includes(m[2])) failures.push(`${page}: 非白名单原生组件${m[2]}`);
  } catch(e) { failures.push(`${page}: ${e.message}`); }
}
for (const f of ['app.js','config.js','utils/api.js']) checkJS(path.join(root,f));
for (const tab of app.tabBar.list) if (!app.pages.includes(tab.pagePath)) failures.push('tabBar页面未注册');
if (failures.length) { console.error(failures.join('\n')); process.exitCode=1; } else console.log(`通过：${app.pages.length}个原生页面的JS语法、事件绑定、组件和路由静态检查。微信编译/真机检查仍需开发者工具。`);
