'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const [mode, appid, url] = process.argv.slice(2);
try {
  let config;
  const project = JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
  if (mode === 'dev') { config = { apiBase: 'http://127.0.0.1:8082', useDevAuth: true }; project.appid = appid || 'touristappid'; }
  else if (mode === 'production') {
    if (!/^wx[a-f0-9]{16}$/i.test(appid || '')) throw new Error('请提供真实微信小程序AppID（不是AppSecret）');
    const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('请提供不含路径、账号或查询串的HTTPS API域名');
    config = { apiBase: parsed.origin, useDevAuth: false }; project.appid = appid;
  } else throw new Error('用法：node scripts/configure-mini.cjs dev [AppID] 或 production AppID https://api.example.com');
  fs.writeFileSync(path.join(root,'miniprogram/config.js'), 'module.exports = ' + JSON.stringify(config,null,2) + ';\n');
  fs.writeFileSync(path.join(root,'project.config.json'), JSON.stringify(project,null,2) + '\n');
  console.log(`小程序已配置为${mode}。AppSecret仅配置在服务端环境变量。`);
} catch(e) { console.error(e.message); process.exitCode = 1; }
