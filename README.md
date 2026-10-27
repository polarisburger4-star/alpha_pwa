# 从零开始阿尔法男人的修炼指南（阿尔法修炼）

纯前端、无需构建的离线 PWA：每日打卡、积分自动结算、连续成就、里程碑、破戒申报、统计图表、日志导出与 JSON 备份。所有数据保存在本机浏览器 IndexedDB，无云同步、无服务器、无追踪。

## 本地运行

Service Worker 与「添加到桌面」要求 **HTTPS 或 localhost**，不能直接双击打开 `index.html`（file:// 下无法注册 SW）。

```bash
cd alpha-pwa
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/
```

也可用 `npx serve .` 等任意静态服务器。

## 运行测试

```bash
node tests/scoring.test.mjs     # 或 npm test（Node ≥ 18）
```

测试覆盖：计分、按时/超时/漏打卡、今日待打卡、破戒扣分与连续中断、四类连续成就（不设 30 天重置，节点每轮只奖励一次）、新增任务与每日减分项、v1.1.0 旧数据向后兼容（对比 tests/legacy-v1.1.0 原版引擎）、精神连续低落扣分、两类预警、历史最高分、里程碑首次解锁、备份校验与合并、睡眠时长自动计算、按日期快照（周报周初/周末快照）。

## 部署

整个目录就是站点根目录，直接上传即可（站点必须是 HTTPS）。

### GitHub Pages
1. 新建仓库，把本目录全部文件推送到仓库根目录（或 `docs/` 目录）。
2. 仓库 Settings → Pages → Source 选择 `Deploy from a branch`，分支 `main`，目录 `/ (root)`（或 `/docs`）。
3. 访问 `https://<用户名>.github.io/<仓库名>/`。本项目全部使用相对路径，子路径部署无需修改。

### Netlify
- 方式一：登录 Netlify → Add new site → Deploy manually，把本文件夹（或 zip 解压后的文件夹）拖进去。
- 方式二：连接 Git 仓库，Build command 留空，Publish directory 填 `.`（或本目录路径）。

## 安装到手机 / 桌面
- Android Chrome：菜单 →「添加到主屏幕 / 安装应用」。
- iOS Safari：分享 →「添加到主屏幕」（iOS 16.4+ 的主屏幕应用才支持网页通知）。
- 桌面 Chrome / Edge：地址栏右侧安装图标。

## 更新版本
修改代码后，请同时修改 `sw.js` 中的 `VERSION` 与 `js/version.js` 中的 `APP_VERSION`，用户下次打开时会自动更新缓存（缓存优先 + 后台更新，第二次打开生效）。

## 目录结构

```
index.html              单页入口
manifest.json           PWA 清单
sw.js                   Service Worker（离线缓存 + 提醒）
css/style.css           暗色样式
vendor/chart.umd.min.js Chart.js 4.4.6（本地，离线可用）
icons/                  192 / 512 / maskable / apple-touch 图标
js/app.js               路由、全局状态、重算
js/db.js                IndexedDB 封装
js/dateutil.js          本地日期工具
js/rules.js             积分规则常量（单一事实来源）
js/scoring.js           确定性计分引擎（逐日账本）
js/streaks.js           连续成就状态机、早睡早起判定
js/milestones-config.js 里程碑文案（可直接替换）
js/milestones.js        里程碑判定
js/export.js            TXT / JSON 导出、导入校验与合并
js/charts.js            图表封装
js/reminder.js          19:30 提醒（尽力而为）
js/ui/*.js              各页面
tests/scoring.test.mjs  Node 测试
```

## 修改里程碑文案
编辑 `js/milestones-config.js`。`id` 用于记录已解锁状态，请勿修改已有 id；修改 `score/days/title/line1/percent` 即可。

## 数据与提醒的限制
- 数据只存在当前浏览器。清除站点数据、卸载 PWA、换设备都会丢失，请定期在「备份与设置」导出 JSON。
- 19:30 提醒：需授予通知权限、需添加到桌面；浏览器完全关闭或系统杀掉后台进程时无法触发，这是浏览器底层限制，无法做到系统原生日历/闹钟级别的强制唤醒。应用会在每次打开/切回时补发未发出的提醒。
