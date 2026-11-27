[中文](README.md) | [English](README.en.md)

# Multi-AI Web Export Reader

**纯本地多 AI 对话导出查看器 — 支持 Claude · ChatGPT · Grok (Beta) · Perplexity (Beta)**

把各大 AI 平台导出的 ZIP、解压目录或独立 JSON，在浏览器本机变成可混合阅读、全文搜索、统计分析与隐私脱敏导出的统一工作区。

> 🔒 **纯本地运行 · 零上传 · 零后端**：所有解析、搜索、统计与脱敏都在当前浏览器完成。普通版默认关闭远程图片与地图请求（可在首页第一步或顶部栏一键开启）；完整离线版无需任何网络。

[![Latest release](https://img.shields.io/github/v/release/Kisara-Lab/Muti-AI-Web-Export-reader?label=release)](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/releases/latest)
[![Viewer Validation](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/viewer-validation.yml/badge.svg?branch=main)](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/viewer-validation.yml)
[![Browser Smoke](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/browser-smoke.yml/badge.svg?branch=main)](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/browser-smoke.yml)
[![Privacy Guard](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/privacy-guard.yml/badge.svg?branch=main)](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/privacy-guard.yml)
[![Offline bundle](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/actions/workflows/release-verify.yml/badge.svg)](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

**[⬇ 下载单文件版 `viewer.html`](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/releases/latest/download/viewer.html)** · **[🔌 下载完整离线版](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/releases/latest/download/claude-rescue-reader-offline.zip)** · **[🧪 合成演示 ZIP](docs/demo/claude-rescue-reader-synthetic-demo.zip)** · **[🌐 English](README.en.md)**

![Multi-AI Web Export Reader 界面总览](docs/images/viewer-overview.png)

<sub>截图使用“北辰咖啡订阅服务”虚构历史生成；人物、品牌、文件与数值均为合成演示数据。</sub>

---

## 支持的 AI 平台

支持在同一个工作区**按任意顺序追加导入**多个平台的历史导出，自动隔离账户并按平台筛选、混合搜索与对比统计：

| 平台 | 状态 | 导出入口 | 支持的格式与解析能力 | 说明 |
|---|---|---|---|---|
| **Claude** | 稳定 | `Settings → Account → Export Data` | 新版 `manifest-*.json` + 分包 ZIP、旧版单包 ZIP / 目录；对话分支、Thinking 状态、工具调用、Artifact 历史版本、项目与三层关联、全局/项目记忆、Design、账户与登录记录 | [新版导入说明](docs/new-export-import.md) |
| **ChatGPT** | 稳定 | `Settings → Data controls → Export data` | 完整 ZIP（分片 `conversations-*.json`、`export_manifest.json`）及独立 JSON；分支路径、引文、DIL 交互组件、图表、地图、`.dat` 本地图片/Markdown 附件、账户信息 | [GPT 支持范围](docs/gpt-export.md) · [组件说明](docs/gpt-components.md) |
| **Grok (xAI)** | **Beta Test** | `accounts.x.ai → Data → Download Account Data` | 官方导出 ZIP（`prod-grok-backend.json`、`prod-mc-auth-mgmt-api.json`、`prod-mc-asset-server` 附件）及独立 JSON；`leaf_response_id` 分支、思考/工具步骤、内联引文、工作区精确关联 | 早期测试中，部分新字段或媒体格式仍在适配 |
| **Perplexity.ai** | **Beta Test** | `Settings → Account → Export Data` | 官方导出 ZIP（`conversations-*.json`、`user-data-*.xlsx`）及独立 JSON；多轮问答链、`user-data` 账户/偏好/Space 工作簿 | 早期测试中，官方正文 `[n]` 引文暂不含 URL，部分字段仍在适配 |

> ⚠️ **Beta Test 说明**：**Grok** 与 **Perplexity.ai** 解析目前处于早期测试阶段，受限于官方导出格式变动及样本覆盖范围，部分特殊字段、引文来源、多媒体附件或交互卡片可能尚不完善，欢迎提交脱敏样本反馈。

---

## 30 秒上手

1. **打开查看器**：下载单文件版 [`viewer.html`](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/releases/latest/download/viewer.html)（或使用[离线包](#离线模式)），双击用 Chrome / Edge / Firefox 打开。
2. **第一步 · 确认远程资源策略**：首页默认**仅本地模式**（不主动请求任何外部图片或 OpenStreetMap 地图）；如需查看 ChatGPT 导出中的远程图片/底图，可在首页或顶部栏一键开启。
3. **第二步 · 导入或拖入导出包**：
   - **直接导入 ZIP / 文件夹**：点击「选择 ZIP 压缩包」或直接把一个或多个 ZIP / 解压目录拖入页面（**免解压**，可连续追加不同平台）。
   - **Claude 新版分包清单**：进入「导入中心 / Claude 清单」导入 `manifest-*.json`，在官方页面下载各分包 ZIP 后批量追加。
4. **阅读、搜索与安全分享**：按平台胶囊筛选、全文检索、切换分支，或使用「安全导出 Markdown / PDF」完成本地隐私脱敏后分享。

![拖入 ZIP、打开对话、检查项目关系图、浏览统计并进行安全导出的完整闭环](docs/images/workflow-demo.gif)

---

## 核心功能

### 💬 多平台忠实阅读与分支还原
- **统一时间线与平台徽章**：侧栏列表、对话标题栏、项目卡片与统计总览均带独立平台色标与实时计数，支持在「全部 / Claude / ChatGPT / Grok β / Perplexity β」间一键切换。
- **富文本与技术块**：完整 Markdown（表格、代码语法高亮 + 一键复制）、可折叠 **Thinking 思考过程**（含耗时、截断/隐藏状态）、**工具调用与结果**、内联引文、网页搜索面板。
- **交互与多媒体**：对话分支树默认走最长路径（或平台记录的 `leaf_response_id` / `current_node`），支持就地切换分支；支持 Artifact 隔离沙箱预览（SVG / Mermaid / HTML）、ChatGPT DIL 交互组件与本地 `.dat` / `/content` 附件查看。

### 🧭 项目、工作区与记忆重建
- **多平台项目/工作区统一视图**：集中浏览 Claude Projects、Grok Workspaces 与 Perplexity Spaces。
  - **Claude**：官方导出不含归属字段，查看器通过**唯一项目文件 → 知识搜索词 → 项目记忆独有关键词**三层高置信度证据自动关联，并支持本地手动修正与关系图展示。
  - **Grok / Perplexity**：支持读取官方 `workspace_id` / Space 关联字段与自定义指令。
- **记忆管理**：支持 Claude 全局记忆（4 分区）与项目记忆（6 分区），以及新版独立 Markdown 记忆 ZIP 的多版本切换。

### 📊 统计分析与 🧪 行为实验室
- **探索分析与全档案总览**：按时间范围、平台来源、项目、模型、角色组合筛选；查看趋势图、7/30 日移动平均、**平台对话/消息分布对比**、使用画像、词频云、最长对话与点击下钻；[统计口径与协议](docs/analytics.md)。
- **行为实验室**：本地按需审计工具调用配对率、审批与 MCP 来源、隐藏结构化结果、Thinking 完整性与回答健康度（注：导出状态标记仅反映归档内容，不用于推断后台策略）。

### 🛡️ 隐私安全导出（Markdown / PDF / SCP 模式）
- 导出前在本地自动扫描密钥/凭据、邮箱、手机号、证件号、IP/URL 令牌及上下文隐私词（姓名、地址、单位、社媒账号等），提供**标准 / 强力**两档过滤、一致化名替换与自定义敏感词。
- 支持 **SCP 机密档案模式**（`[数据删除]` 黑条 + `CONFIDENTIAL` 水印），所有命中均展示脱敏预览、位置与原因；[脱敏规则与说明](docs/redaction.md)。

---

## 大型导出性能与架构

- **流式分块与懒解析**：大文件以 4 MiB 分块通过 Transferable `ArrayBuffer` 送入持久 Data Worker；初始导入只扫描顶层元数据，打开对话时才按窗口渲染消息，代码高亮 / Mermaid / ZIP 图片按需加载。
- **五类按需 Worker**：Data、Import、Task、Reader、Analytics 核心逻辑均在 [`src/`](src/) 维护，并通过受控内联同步到单文件 [`viewer.html`](viewer.html)；详见 [Worker 性能管线](docs/worker-pipelines.md)。

| 合成 `conversations.json` | CPU 限速 | 初始列表 | 打开 100 条消息对话 | 全文搜索 |
|---:|---:|---:|---:|---:|
| 50 MiB | 4× | 0.55 秒 | 0.65 秒 | 0.04 秒 |
| 150 MiB | 6× | 1.69 秒 | 0.90 秒 | 0.10 秒 |
| 300 MiB | 6× | 3.19 秒 | 1.02 秒 | 0.23 秒 |

<sub>取 3 次全新浏览器运行中位数（Chromium `150.0.7871.187`、Playwright `1.62.0`（旧脚本硬编码，实际版本未记录）），由 [`npm run benchmark:readme`](scripts/benchmark-readme-performance.mjs) 生成本地合成 ASCII 夹具并实测，[原始报告](docs/benchmarks/readme-performance.json)。单行超大导出曾是社区痛点（如[这条 ClaudeAI 讨论](https://www.reddit.com/r/ClaudeAI/comments/1oee39d/built_a_tool_to_view_claude_conversation_exports/)）。</sub>

---

## 离线模式

下载 [`claude-rescue-reader-offline.zip`](https://github.com/Kisara-Lab/Muti-AI-Web-Export-reader/releases/latest/download/claude-rescue-reader-offline.zip) 并解压，保持 `vendor/` 与 `viewer.html` 位于同一目录即可完全断网运行（已内置 `marked`、`highlight.js`、`JSZip`、`mermaid`）。

从源码构建离线版（需要 Node.js `>= 22.12.0`）：

```bash
npm ci
npm run build:offline
```

构建产物位于 `dist/offline/viewer.html`。

---

## 隐私、本地存储与安全边界

- **无服务器通信**：不会上传对话或统计数据。仅当用户主动点击开启「远程资源」时，浏览器才会按需请求 ChatGPT 导出中的外部图片或 OpenStreetMap 底图；完整离线包已禁用所有外部资源加载。
- **本地解析缓存**：原始对话文本与搜索索引会缓存在本机 IndexedDB（`claude-rescue-reader-data-v1`），以便刷新后秒开；**共用设备离开前请点击侧栏「清除本地解析缓存」**。
- **界面偏好**：主题（`cv-theme`）、语言（`cv-lang`）、侧栏折叠状态与手动项目归属（`claude-rescue-reader-project-overrides-v1`）保存在 `localStorage`。
- **Artifact 安全沙箱**：HTML / SVG 预览运行在禁用联网的隔离沙箱中，不会在主页面上下文执行导入脚本。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|---|---|
| `↑` / `K` | 上一条对话 |
| `↓` / `J` | 下一条对话 |
| `Ctrl+B` / `Cmd+B` | 收起 / 展开左侧边栏 |
| `Ctrl+E` / `Cmd+E` | 导出当前对话为 Markdown |

---

## 参与开发与社区

修改 `src/*.js` 后运行 `node scripts/update-viewer-policy.mjs` 同步到 `viewer.html`，并通过 `npm run validate`、`npm run privacy`、`npm run docs` 与 `npm run test:worker-core` 验证。

- [贡献指南](CONTRIBUTING.md) · [社区行为准则](CODE_OF_CONDUCT.md) · [安全策略](SECURITY.md) · [MIT License](LICENSE)

---

## 更新日志

- **v2.0 — Multi-AI 与全套阅读体验升级**：更名为 **Multi-AI Web Export Reader**；新增 **ChatGPT** 完整支持（分片、DIL 组件、图表、地图、`.dat` 附件）及 **xAI Grok (Beta)**、**Perplexity.ai (Beta)** 解析支持；推出全新 **Atelier 暖纸 / Obsidian 深色** 双主题与内置离线语法高亮、**Steps 执行时间线**聚合、域名来源胶囊、可折叠侧边栏与悬浮问题大纲。

<details>
<summary>历史版本（v1.0 – v1.5）</summary>

- **v1.5** *(2026-10-21)*：适配 Claude 新版 `manifest-*.json` 分包导出、独立记忆 ZIP 多版本、Artifact 历史版本与账户/登录记录。
- **v1.4** *(2026-07-30)*：增强图片补挂载、可解释脱敏命中细则、强力隐私过滤、SCP 机密 PDF 水印与 50/150/300 MiB CPU 限速基准。
- **v1.3** *(2026-07-29)*：新增行为实验室、持久 Data Worker、项目关联解释与关系图、预打包离线发行版。
- **v1.2** *(2026-07-28)*：新增 ZIP 直读与拖拽、分支切换、对话内搜索、Artifact/Mermaid 渲染与高精度项目归属推断。
- **v1.1** *(2026-07-17)*：修复分支最长路径、附件兜底、暗色主题、全文搜索与排序。
- **v1.0** *(2026-07-16)*：初始版本，支持加载 Claude 导出文件夹并渲染对话。

</details>
