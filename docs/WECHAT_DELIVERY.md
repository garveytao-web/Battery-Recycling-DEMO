# 循电微信小程序 v0.3.0 交付与运行

本版是在原 `Battery-Recycling-DEMO` 仓库中新增的原生微信小程序及服务端。原 `dist/` H5 保留作为历史演示，仍有 Mock 公式，不是新小程序的生产前端。新代码不依赖原H5的车型、金属比例或里程折扣。

## 当前可以运行的内容

| 部分 | 实现 |
|---|---|
| 微信前端 | 首页、估价、报告、历史、供需、详情、发布、我的、隐私说明，9个原生页面 |
| 用户 | 微信code后端换取身份、7天会话、退出、账户删除；本机开发登录单独受限 |
| 估价 | 电量参考、重量基准匹配、异常状态转人工核验、缺失数据明确提示 |
| 报告 | SQLite持久化、价格来源快照、历史不重算、仅本人可读 |
| 供需 | 真实持久化、人工审核后公开、意向报价、私有联系方式、撤下 |
| 数据 | 200条电池之家归档；当前50条，其中1条异常隔离；12条原材料归档 |
| 维护 | CSV基准/车型导入、审核CLI、生产配置检查、Windows/Nginx配置 |

当前没有已核实的元/kg基准和车辆配置。对应流程会提示待补数据。电池之家价格的kWh分母与整包/电芯边界未核实，所以当前金额明确标为行情参考。NEB页面未成功取得，不把先前工作簿里的暂定成分当真实数据。Mysteel原材料不是整包收购价，不直接乘包重。

本版不含付款、有效竞拍、物流交割、检测结论、自动VIN解析、报告PDF导出或在线运营管理后台。已有人工审核CLI可用于首批小规模运营。

## 1. 本机跑起来

需要 Node.js **24或更高版本**。不需要安装 npm 运行依赖。服务器代码使用Node自带SQLite。

在仓库根目录打开PowerShell：

```powershell
Copy-Item .env.example .env
node scripts/configure-mini.cjs dev
npm start
```

若已有 `.env`，不要覆盖。也可双击 `start-api.bat`，它只在没有 `.env` 时复制示例。

访问 `http://127.0.0.1:8082/health`，应返回 `ok: true`。

用微信开发者工具导入**仓库根目录**，工具读取 `project.config.json` 中的 `miniprogramRoot`。本地开发使用测试AppID；游客模式若不支持当前工具功能，填入自己的开发AppID。开发者工具本地设置中临时关闭域名校验，只用于连接本机HTTP API。

开发版使用本机测试账户，数据保存在 `server/storage/xundian.sqlite`。它不是微信真实登录验收。不要把开启 `ALLOW_DEV_AUTH=true` 的服务暴露给公网，也不要用开发库存放真实客户数据。

先验证：开始估价 → 磷酸铁锂 → 完整电池包 → 按电量 → 60kWh → 生成报告 → 查看来源 → 回到历史打开同一报告 → 携带参数发布。

## 2. 切换微信真实登录与HTTPS

在服务端 `.env` 配置：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8082
ALLOW_DEV_AUTH=false
WECHAT_APP_ID=你的真实AppID
WECHAT_APP_SECRET=只在服务器本机填写
OPERATOR_NAME=实际运营主体全称
OPERATOR_CONTACT=公开的隐私联系邮箱或电话
DATA_FILE=server/data/catalog.json
DB_FILE=server/storage/xundian-production.sqlite
```

AppSecret不要发到聊天、前端、截图或Git。`.env`和数据库均已加入忽略列表。

Windows Server安装Node24，将代码放在独立目录。在服务器上先 `npm start` 确认 `/health`。用已有Nginx新建独立HTTPS API虚拟主机，参考 `deploy/nginx-api.conf.example`；替换域名、证书路径后使用 `nginx -t` 检查，再重载。不需要改现有8081端口的H5。

小程序配置命令（替换示例值）：

```powershell
node scripts/configure-mini.cjs production wx你的16位AppID https://你的API域名
```

微信后台设置对应的request合法域名；检查AppID与服务端一致。重新开启开发者工具域名校验。按微信后台要求填写类目、主体、隐私保护指引与发布资料。小程序里已提供隐私说明，但不能替代微信后台配置。

服务持续运行可在Windows任务计划程序中设置专用服务账户，启动时执行 `powershell.exe -File C:\你的路径\deploy\run-api.ps1`。工作目录为仓库根目录。该脚本进程退出后重启；取消任务会停止托管。数据库只允许一个API实例使用，勿复制成多个独立节点。

## 3. 数据维护

模板在 `data/templates/`。用Excel编辑CSV时保持UTF-8，数值不带千分位或单位。

```powershell
node --env-file-if-exists=.env scripts/import-catalog.cjs weightRates 你的重量数据.csv --confirm-sources
node --env-file-if-exists=.env scripts/import-catalog.cjs vehicles 你的车型数据.csv --confirm-sources
```

导入按ID更新/追加，保留其他数据，并在 `server/storage/catalog-backups/` 备份原目录。API每次请求读取当前目录，不需要重启。历史报告已保存引用快照，不随新目录变动。

材料枚举：`lfp`、`ncm`、`small_ncm`。封装：`prismatic`、`pouch`、`cylindrical`、`unspecified`。货物：`pack`、`module`、`cell`。

重量记录：单位固定 `CNY/kg`，必须给出有效日期和适用质量范围。如果只核实了200kg这一个样本，则 `minWeightKg=maxWeightKg=200`。不能未经验证就扩成0至无限大。若取得报告总价，先核实是否含拆车、运输、税费，再按报告原重量计算元/kg；原报告文件名和条件写入source/note。

车型记录：label应含品牌、车型、年款、配置；batteryPackModel为包型号，不可把车型名称或电芯商品名代替包型号。电量为kWh，重量为**电池包重量**而非整备质量。至少核实其中一项；缺失项留空。选中配置后须确认没有换包，才自动填参。

`scripts/import-benchmarks.py`仅用于对原始200条工作簿首次建档；为防止误覆盖已有维护结果，目标已存在时会拒绝运行。后续电池之家新截图应先核对并生成新目录版本，再保留旧记录并更新current标记，不应覆盖历史记录或随意修改已出报告。

## 4. 审核供需

在服务器仓库根目录执行：

```powershell
node --env-file-if-exists=.env scripts/review-trade.cjs list
node --env-file-if-exists=.env scripts/review-trade.cjs approve T-实际ID
node --env-file-if-exists=.env scripts/review-trade.cjs reject T-实际ID
```

审核标题、描述、联系方式暴露、货物事实与明显异常信息。批准后其他用户才能看到并提交意向。报价联系方式只提供给报价本人和发布者，不提供给第三个用户。没有付款和自动履约。

## 5. 验收与上线门槛

```powershell
npm test
npm run check:mini
node check.cjs
node --env-file=.env scripts/check-release.cjs
```

已运行的自动验证：18项测试，覆盖计价单位、数据缺失、异常电池、来源追溯、期限、身份隔离、联系方式权限、报告快照、重启持久化、供需审核、客户端提交与报告复用；9页静态检查；原H5回归检查。

本环境没有微信开发者工具和真实AppID，**尚未完成官方开发者工具编译、真机登录、真机布局及后台提审**。不能把静态检查当作这些验收。

实际执行以下流程并记录证据：

1. 开发者工具编译全部9页，无编译错误和控制台异常。
2. 真机登录后产生报告，退出并重新进入后可从历史读取同一报告。
3. 第二微信账户不能读取第一个账户的报告；第三账户看不到他人的意向联系方式。
4. 发布→审核→另一账户报价→发布者查看→撤下，完整通过。
5. 泡水/过火、无重量基准、小三元未覆盖等场景不能输出正常报价。
6. 确认运营主体、隐私指引、行情来源使用权及参考口径。

把 `deploy/release-acceptance.example.json` 复制到 `server/storage/release-acceptance.json`，只将已实际完成的项置true，写入日期、人员和证据位置。`check-release` 默认会失败，这是当前真实状态，不能通过删除检查绕过。

数据库运维：先停止API再备份SQLite文件及同目录WAL/SHM（如仍存在），记录备份日期。仅限运营授权人员访问。若启用业务备份，最长保留30天，并在恢复后重放期间发生的删除请求。备份和删除恢复流程须由运营方落实；本版没有自动备份任务。不要把数据库、环境文件或客户记录提交到Git。

## 文件入口

- `miniprogram/`：微信原生代码；`project.config.json`：工具入口。
- `server/index.cjs`：HTTP、微信身份与SQLite业务API。
- `server/engine.cjs`：唯一的新估价引擎。
- `server/data/catalog.json`：有来源、有版本的报价目录。
- `docs/DATA_COLLECTION.md`：发给数据采集人员的具体任务。
- `docs/CODEX_HANDOFF.md`：下一位Codex继续执行的边界与命令。

代码在原仓库分支上实现，未推送远端、未部署服务器、未上传微信。取得实际配置和验收结果后再完成发布。
