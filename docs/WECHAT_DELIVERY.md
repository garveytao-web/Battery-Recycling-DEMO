# 循电微信小程序 v0.4.0 交付与运行

本版在原 `Battery-Recycling-DEMO` 仓库中继续实现。`dist/` 保留第一版H5作为视觉和历史演示；实际业务入口是 `miniprogram/`，服务端是 Node 24 + SQLite。

## 已实现范围

| 部分 | 当前实现 |
|---|---|
| 估价入口 | 公告车型检索；铭牌参数手填 |
| 核心字段 | 化学体系、单体外形、整包重量、整包总电量；车型入口另存城市与里程 |
| 车型库 | 651个公告车型、683条候选配置；同车型多配置由用户选择，不静默取第一条 |
| 价格算法 | 9组动力再生分类基准；重量主估值；电量换算等效重量后交叉校验 |
| 报告 | 输入、算法、来源和行情快照持久化；历史报告不自动改价 |
| 材料行情 | 展示静态回收材料规格和价格快照，不计算虚假的整包金属价值贡献 |
| 供需 | 文本安全检查通过后即时公开、私密意向报价、撤下；无人工审核后台 |
| 用户 | 微信code在后端交换、7天会话、退出和账户删除；开发登录仅限回环地址 |

地区和里程确定为信息字段，不参与计价。水泡、火烧等异常电池自动估价、剩余容量、单体Ah、单体数量和材料/梯次利用模式均不在当前估价表单中。

## 本地运行

需要 Node.js 24 或更高版本。

```powershell
Copy-Item .env.example .env
node scripts/configure-mini.cjs dev
npm start
```

健康检查：`http://127.0.0.1:8082/health`。微信开发者工具导入仓库根目录，读取 `project.config.json` 的 `miniprogramRoot`。`configure-mini.cjs dev` 会关闭开发工具的合法域名校验；切换生产模式时会自动恢复校验并要求HTTPS。

建议验证两条路径：

1. 公告车型：检索型号 → 选择候选配置 → 填城市和里程 → 生成报告。
2. 铭牌参数：选择材料和单体外形 → 填整包重量、总电量、城市和里程 → 生成报告。

## 价格与车型数据

- `server/data/pricing-baseline.json`：用户提供的27条动力再生样本形成的9组元/kg基准。
- `server/data/vehicles-v04.json`：651个公告车型、683条候选电池配置；未公开的包型号保持空值。
- `server/data/catalog.json`：历史报价和静态材料市场行情。
- `scripts/build-vehicle-catalog.cjs`：从研究JSON重建车型服务端目录。

重量结果上下限暂按中心值±8%展示，这是演示假设，不是统计置信区间。容量校验使用车型库同分类质量/电量中位数换算等效重量，再沿用相同元/kg基准。一致性阈值尚未完成业务标定，因此当前展示差异但不自动修正重量主估值。

## 供需发布

供需没有会员、付费、图片、人工审核角色或运营后台。生产环境发布时服务端调用微信 `msg_sec_check`：通过后立即写入 `active`；未通过要求用户修改；安全服务不可用时不发布。意向联系方式只对报价者和发布者可见。大厅在进入和下拉刷新时加载，不轮询、不自动刷新。

## 生产配置

服务端 `.env` 至少配置：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8082
ALLOW_DEV_AUTH=false
WECHAT_APP_ID=真实AppID
WECHAT_APP_SECRET=仅保存在服务器
OPERATOR_NAME=实际运营主体
OPERATOR_CONTACT=公开联系渠道
DATA_FILE=server/data/catalog.json
VEHICLE_DATA_FILE=server/data/vehicles-v04.json
PRICING_DATA_FILE=server/data/pricing-baseline.json
DB_FILE=server/storage/xundian-production.sqlite
```

小程序端配置：

```powershell
node scripts/configure-mini.cjs production wx你的16位AppID https://你的API域名
```

AppSecret、数据库和 `.env` 不得提交Git。微信后台仍需配置request合法域名、类目、隐私保护指引和发布资料。

## 验收

```powershell
npm test
npm run check:mini
node check.cjs
node --env-file=.env scripts/check-release.cjs
```

当前自动测试覆盖算法、车型多候选、报告快照、权限隔离、SQLite持久化、即时发布和私密意向；静态检查覆盖9个原生页面。微信开发者工具编译、真实AppID登录、真机布局、两/三账户测试和平台提审仍必须在用户电脑与微信环境完成，不能用本地测试替代。

本版不含付款、有效竞拍、物流、检测结论、自动VIN、图片上传、PDF导出或定时数据爬取。用户明确授权后才能推送远端、部署或提审。
