# ChatGPT 网页导出 / ChatGPT web exports

将官方导出 ZIP 直接导入，或选择整个解压目录。单独对话 JSON 按 `mapping` 结构识别，不要求固定文件名。通过「追加分包」混合 Claude 和 ChatGPT；「打开新档案」清理当前档案。侧栏来源筛选和探索分析来源多选可分别查看两个平台。

Import the official ZIP or its extracted folder. Individual conversation JSON is recognized by its `mapping` structure. Add packages to mix Claude and ChatGPT; open a new archive to clear the current archive. Source filters are available in the conversation sidebar and analytics explorer.

| 内容 / Content | 支持级别 / Fidelity | 行为 / Behavior |
|---|---|---|
| 消息树、角色、时间、明确的逐消息模型 / Tree, roles, times, explicit message models | 可还原 / Reconstructed | 默认当前节点祖先路径；可切换分支和完整树；无消息根不计数。缺失当前节点显示警告并使用共享回退规则 / Current ancestry by default; branches/full tree retained; empty roots excluded; invalid current node warns and falls back |
| Markdown、代码、表格 / Markdown, code, tables | 可还原 / Reconstructed | 共享安全渲染、搜索和导出 / Shared safe rendering, search and export |
| Thoughts、reasoning recap | 仅摘要／实际导出正文 / Exported summaries and text only | 默认折叠；不生成缺失推理 / Collapsed; missing reasoning is never generated |
| 网页与文件引用 / Web and file citations | 可还原或数据缺失 / Reconstructed or unavailable | 编号链接、附件入口和已导出行号；缺失数据有显式占位和有界原始信息。代码内标记不解释 / Numbered links, file entry points and exported line ranges; explicit bounded missing-data fallback; code markers remain literal |
| `.dat` 图片、Markdown 附件 / Images and Markdown attachments | 可还原 / Reconstructed | 文件库 ID 精确关联；检查文件头，图片按需读取；文本预览转义，提供下载 / Exact library IDs; header checking and lazy images; escaped text preview and download |
| 远程图片组、实体 / Remote image groups, entities | 仅导出信息 / Exported metadata only | 图片切换和外部链接；不自动请求远程图 / Image navigation and external links, no automatic remote image requests |
| 地图 / Maps | 仅地点和坐标 / Places and coordinates only | 本地坐标分布图，不加载地图瓦片或定位服务 / Local coordinate plot, no tiles or location services |
| 声明式上传组件 / Declarative upload controls | 仅摘要 / Summary only | 已知标签与禁用按钮，不运行表达式、事件动作或 `dil_url` / Known labels and disabled buttons; expressions, actions and `dil_url` never run |
| 未知组件 / Unknown components | 有界原文 / Bounded original data | 转义查看，不推断可执行行为 / Escaped inspection; no inferred actions |
| GPT 测验 / GPT quizzes | 导出样本未包含 / Absent from verified sample | 不从普通 JSON 猜题；现有明确 Claude 测验适配保持兼容 / No quiz inference from ordinary JSON; existing explicit Claude quiz support remains |
| 账户、设置、广告 / Account, settings, ads | 账户只读，其余不执行 / Read-only account; other configuration inert | 不计入对话数量 / Excluded from conversation counts |

GPT `export_manifest.json` 与 Claude 下载清单是不同格式。GPT 分片严格按 manifest 明确列出的顺序读取；缺片、重复路径和路径穿越拒绝导入，已有档案保持不变。同平台账户继续校验，不跨平台比较账户 ID。对话 ID 使用 GPT 命名空间，原始 ID 独立保存。

GPT `export_manifest.json` is distinct from Claude download manifests. Explicit shard order is preserved; missing/duplicate/unsafe paths reject the transaction without changing the current archive. Accounts are validated within each platform. GPT conversation IDs are namespaced and original IDs are retained separately.

Markdown 将引用和组件转成可读正文，PDF 使用本地卡片。新增可见字符串通过共享脱敏扫描；安全 PDF 继续隔离原始附件像素。附件预览最多读取 1 MiB；完整附件仍可下载。没有 OCR 或在线恢复功能。

Markdown contains readable citation/component summaries; PDF uses local cards. New visible strings use shared redaction and safe PDF continues to isolate original attachment pixels. Text previews read at most 1 MiB; original attachments remain downloadable. No OCR or online reconstruction is performed.

## 验证 / Validation

2026-11-20 授权本地包核验：10 条对话，226 条消息（104 text、84 thoughts、38 reasoning_recap），全部可打开，统计计数为 226，177 条助手消息保留明确模型；3 张 PNG 与 1 个 Markdown 附件按文件库关联。样本中 6 处 business 引用未携带可关联来源，明确显示数据缺失。一次本机导入观测为 218 ms（非跨设备性能承诺）；新增 10k GPT 节点在 4× CPU 测试中保持元数据优先和窗口渲染，导入阈值为 20 秒。私有包、正文、附件、账户信息和凭据不提交。

Authorized local archive checked on 2026-11-20: all 10 conversations open, with 226 messages (104 text, 84 thoughts, 38 reasoning_recap), matching the statistics count; 177 assistant messages retain explicit models. Three PNGs and one Markdown attachment are linked through the file library. Six business citations lack associated source metadata and show explicit missing-data placeholders. One local import observation was 218 ms, not a cross-device guarantee. A 10k-node GPT test at 4× CPU preserves metadata-first/window rendering with a 20-second import threshold. Private archives, chats, files, account data and credentials are excluded from commits.

Synthetic regression coverage: `tests/gpt-format.test.mjs`, `tests/gpt-exports.spec.mjs`. Run `npm run test:worker-core`, `npm run test:smoke`, `npm run test:offline`, `npm run validate`, `npm run privacy`, `npm run policy`, and `npm run docs`.
