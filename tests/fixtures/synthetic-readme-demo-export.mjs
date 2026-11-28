// Fictional, privacy-safe demo history used only for README screenshots.
const root='10000000-0000-4000-8000-';
const msg=(id,sender,time,parent,content,extra={})=>({uuid:root+id,sender,created_at:time,parent_message_uuid:parent,content,...extra});

export const demoConversations=[
  {
    uuid:root+'000000000101',name:'北辰咖啡订阅服务：秋季发布方案',summary:'**Conversation Overview**\n\nThis conversation was a focused product-launch collaboration for the fictional Beichen Coffee subscription service. The user asked Claude to synthesize the project brand guide and interview notes into a launch plan that a small team could execute within an ¥80,000 budget. Claude searched project knowledge, translated positioning into a staged acquisition and retention plan, built a Mermaid launch timeline, proposed an interactive landing-page concept, and finished with an operational launch-day checklist.\n\nThe working style emphasized restrained claims, explicit budgets, practical ownership, and clear separation between evidence from project files and new recommendations. The conversation also shows how the viewer preserves Thinking blocks, project knowledge calls, structured tool results, attachments, rich Markdown, generated interactive content, and follow-up revisions in one readable thread. All names, files, organizations, and numbers in this demo are synthetic.',created_at:'2026-06-18T01:20:00Z',updated_at:'2026-06-18T02:16:00Z',chat_messages:[
      msg('000000000201','human','2026-06-18T01:20:00Z','00000000-0000-4000-8000-000000000000',[{type:'text',text:'我们准备上线一个咖啡豆月度订阅服务。请结合项目资料，先给我一份适合小团队执行的秋季发布方案，预算控制在 8 万以内。'}]),
      msg('000000000202','assistant','2026-06-18T01:22:00Z',root+'000000000201',[
        {type:'thinking',thinking:'我需要先确认品牌定位、目标人群和现有渠道，再把预算拆成内容、投放、样品与预备金。项目知识中应该有品牌手册和用户访谈摘要。',start_timestamp:'2026-06-18T01:20:08Z',stop_timestamp:'2026-06-18T01:20:31Z'},
        {type:'tool_use',id:'demo-tool-1',name:'project_knowledge_search',message:'正在检索品牌定位与用户访谈',input:{query:'品牌定位 目标用户 订阅体验'}},
        {type:'text',text:'我先读取项目中的品牌手册与访谈摘要，再给出可执行版本。'}
      ]),
      msg('000000000203','assistant','2026-06-18T01:24:00Z',root+'000000000202',[
        {type:'tool_result',tool_use_id:'demo-tool-1',structured_content:{matches:2,files:['brand-guide.md','interview-notes.md']},display_content:'找到 2 份相关项目资料',is_error:false},
        {type:'text',text:'## 发布策略概览\n\n核心不是“更便宜的咖啡”，而是让忙碌的城市用户每月都能稳定喝到**有产地故事、但不需要研究参数**的豆子。\n\n| 阶段 | 时间 | 目标 | 预算 |\n|---|---:|---|---:|\n| 预热 | 2 周 | 收集 800 个候补名单 | ¥12,000 |\n| 首发 | 1 周 | 获得 200 位付费订阅者 | ¥38,000 |\n| 留存 | 5 周 | 首月续订率达到 70% | ¥18,000 |\n| 预备金 | — | 素材补拍与履约波动 | ¥12,000 |\n\n### 三个最先执行的动作\n\n1. 用“每月一封产地来信”建立内容记忆点。\n2. 先向老客开放 100 个创始席位，换取真实开箱素材。\n3. 落地页只保留口味偏好、烘焙度和配送频率三个选择。'}
      ]),
      msg('000000000204','human','2026-06-18T01:48:00Z',root+'000000000203',[{type:'text',text:'方向可以。把发布节奏画成 Mermaid，再给落地页首屏做一个可交互草图。'}],{attachments:[{file_name:'包装视觉参考.pdf',file_size:482000}]}),
      msg('000000000205','assistant','2026-06-18T01:52:00Z',root+'000000000204',[
        {type:'text',text:'```mermaid\ngraph LR\nA[老客预告] --> B[候补名单]\nB --> C[创始席位]\nC --> D[公开发布]\nD --> E[首月续订]\n```\n\n首屏建议用“选择你的日常口味”代替泛泛的品牌口号，让用户第一眼就知道下一步要做什么。'},
        {type:'tool_use',id:'demo-tool-2',name:'visualize:show_widget',is_mcp_app:true,message:'生成订阅偏好交互草图',input:{code:'<section style="font-family:system-ui;padding:24px;background:#fffaf2;color:#35251d"><p style="color:#9a5a2a;font-weight:700">北辰咖啡 · 月度订阅</p><h1 style="font-size:30px;margin:8px 0">下一包豆子，按你的日常来。</h1><p>选择风味，我们每月替你完成剩下的研究。</p><div style="display:flex;gap:8px;margin-top:18px"><button style="padding:10px 16px">明亮果香</button><button style="padding:10px 16px">坚果可可</button><button style="padding:10px 16px">均衡耐喝</button></div></section>'}}
      ]),
      msg('000000000206','human','2026-06-18T02:08:00Z',root+'000000000205',[{type:'text',text:'再补一份上线检查清单，重点避免小团队首发当天手忙脚乱。'}]),
      msg('000000000207','assistant','2026-06-18T02:16:00Z',root+'000000000206',[{type:'text',text:'## 首发日检查清单\n\n- [ ] 库存、批次与预计发货日已同步到客服话术\n- [ ] 支付失败、地址修改和暂停订阅流程已走通\n- [ ] 落地页埋点只保留必要事件，并完成隐私检查\n- [ ] 预先准备“售罄”“延迟发货”“口味售罄”三套公告\n- [ ] 安排一人只看履约，一人只看客服，一人负责最终决策\n\n> 建议首发当天不要临时改价格或套餐结构；把新想法记录下来，次日再评估。'}])
    ]
  },
  {uuid:root+'000000000102',name:'客服知识库迁移：结构与验收清单',summary:'依据北辰咖啡项目文件重组客服知识库，并设计迁移验收规则。',created_at:'2026-06-12T03:00:00Z',updated_at:'2026-06-12T05:35:00Z',chat_messages:[msg('000000000211','human','2026-06-12T03:00:00Z','00000000-0000-4000-8000-000000000000',[{type:'text',text:'把旧客服文档整理成新的知识库结构。'}]),msg('000000000212','assistant','2026-06-12T03:03:00Z',root+'000000000211',[{type:'local_resource',file_path:'/mnt/project/brand-guide.md'},{type:'text',text:'我会以项目品牌手册为唯一口径，按售前、订单、配送、订阅变更和售后五个入口重组，并为每篇文档增加适用范围与最后复核日期。'}])]},
  {uuid:root+'000000000103',name:'口味问卷与首包更换：12 份访谈信号',summary:'访谈持续指向城市精品咖啡用户的三个障碍：害怕选错、担心囤积，以及希望首包更换足够简单。建议把口味问卷与首包更换作为订阅服务的核心承诺。',created_at:'2026-06-08T06:10:00Z',updated_at:'2026-06-08T07:40:00Z',chat_messages:[msg('000000000221','human','2026-06-08T06:10:00Z','00000000-0000-4000-8000-000000000000',[{type:'text',text:'请归纳这些访谈里重复出现的购买障碍。'}]),msg('000000000222','assistant','2026-06-08T06:14:00Z',root+'000000000221',[{type:'text',text:'最稳定的三个信号是：担心选错口味、不清楚多久能喝完，以及不愿意被长期订阅绑定。'}])]},
  {uuid:root+'000000000104',name:'第二季度复盘：哪些实验值得保留',summary:'虚构季度实验复盘。',created_at:'2026-06-02T01:00:00Z',updated_at:'2026-06-02T02:20:00Z',chat_messages:[msg('000000000231','human','2026-06-02T01:00:00Z','00000000-0000-4000-8000-000000000000',[{type:'text',text:'根据实验记录写一份克制的季度复盘。'}]),msg('000000000232','assistant','2026-06-02T01:04:00Z',root+'000000000231',[{type:'text',text:'本季度最值得保留的不是折扣，而是口味问卷与首包可更换机制；两者同时提高了转化与留存。'}])]}
];

const extendedScenarios=[
  ['北辰咖啡订阅服务','创始席位邮件：三版语气对比','创始席位邀请邮件','比较克制、温暖与偏销售的三套语气，并保留品牌可信感','project_knowledge_search'],
  ['北辰咖啡订阅服务','首月续订下降：客服记录与访谈交叉分析','首月续订率下降','从客服标签、暂停原因和访谈记录中拆出可验证假设','view'],
  ['北辰咖啡订阅服务','包装卡片文案：产地故事不应该像说明书','包装内页产地故事','把复杂处理法改写成普通用户愿意读完的短文','str_replace'],
  ['北辰咖啡订阅服务','订阅暂停流程：减少客服往返','暂停与恢复订阅流程','设计清晰状态机与客服兜底话术','visualize:show_widget'],
  ['北辰咖啡订阅服务','门店试饮活动复盘与下轮实验','线下试饮活动复盘','区分样本偏差、执行问题与真实需求信号','create_file'],
  ['雾港档案局世界设定','雾港第七码头：失踪船员案时间线','虚构港口悬疑案件时间线','核对人物行踪、潮汐窗口和证词矛盾','project_knowledge_search'],
  ['雾港档案局世界设定','城防厅、商会与灯塔局的权限冲突','虚构机构权限设计','建立三个机构既合作又互相制衡的制度逻辑','view'],
  ['雾港档案局世界设定','“白潮病”设定档案：症状与社会影响','虚构疾病世界观','把医学表象、民间误解和政治利用分层记录','create_file'],
  ['雾港档案局世界设定','审讯场景重写：不要让反派主动解释一切','悬疑小说审讯场景','通过回避、错词和物证推进，而不是信息倾倒','str_replace'],
  ['雾港档案局世界设定','完全背离主线的 IF 线：灯塔从未熄灭','架空故事分支','保留人物核心动机，同时重建事件因果','conversation_search'],
  ['开源迁移台账','单文件查看器的 Worker 消息协议评审','Worker 消息协议','检查传输所有权、取消机制和错误恢复边界','bash_tool'],
  ['开源迁移台账','大型 JSON 懒解析：基准结果与下一步','大型 JSON 性能','比较全量解析、分块扫描与按需 materialize','bash_tool'],
  ['开源迁移台账','浏览器 file:// 模式下的 CDN 与 ORB 问题','离线依赖兼容性','复现资源拦截并设计本地依赖回退','web_search'],
  ['开源迁移台账','隐私扫描规则：高召回与低误报如何分层','本地隐私扫描','把标准规则与明确会误伤的强力模式分开','ask_user_input_v0'],
  ['开源迁移台账','发布包校验：ZIP、SHA-256 与离线依赖','离线发行验证','生成产物清单并验证不包含 fixture 与本地路径','present_files'],
  ['海岬旅行研究','雨季前往海岬群岛：七天路线可行性','虚构群岛旅行路线','结合渡轮、天气与体力留出缓冲日','web_search'],
  ['海岬旅行研究','三家虚构旅馆比较：位置、噪声与取消政策','住宿比较','把营销描述改写成可比较的决策表','web_fetch'],
  ['海岬旅行研究','海边徒步装备清单：轻量但不冒险','徒步装备取舍','按必要、共享、可选与当地租赁四层整理','create_file'],
  ['海岬旅行研究','旅行预算超支 18%：问题出在哪里','旅行预算复盘','区分汇率、临时交通、餐饮和错误预订','bash_tool'],
  ['海岬旅行研究','把旅行笔记整理成一篇克制的长文','旅行写作整理','保留现场细节，删除流水账和夸张感叹','str_replace'],
  ['', '如何给 200 个 Markdown 文件做可逆批量重命名','批量文件重命名','设计预览、冲突检测、回滚清单和 dry-run','bash_tool'],
  ['', '读完一本虚构城市史后，我真正记住了什么','阅读笔记整理','围绕制度、空间和普通人经验重组笔记','create_file'],
  ['', '比较三种家庭照片备份方案','本地照片备份','权衡成本、隐私、去重和灾难恢复','web_search'],
  ['', '一个周末能完成的个人网站改版范围','个人网站改版','压缩范围并确定必须上线与可以延期的内容','ask_user_input_v0'],
  ['北辰咖啡订阅服务','从最近讨论里找出尚未关闭的发布问题','发布遗留问题','检索近期对话并建立负责人清单','recent_chats'],
  ['北辰咖啡订阅服务','更新项目记忆：哪些结论已经被验证','项目记忆维护','区分稳定事实、临时决定和过期假设','memory_user_edits'],
  ['雾港档案局世界设定','给共同作者写一封设定冲突说明','共同创作沟通','用不带指责的方式解释三处连续性冲突','message_compose_v1'],
  ['雾港档案局世界设定','搜索适合管理虚构年表的 MCP 工具','世界观工具选择','比较本地数据库、图谱和时间线工具','search_mcp_registry'],
  ['开源迁移台账','依赖升级后代码高亮为什么失效','前端依赖回归','从加载顺序、API 变化和样式缺失逐层定位','bash_tool'],
  ['开源迁移台账','给新贡献者写一份不吓人的架构导读','贡献者文档','用数据流和常见任务解释代码边界','create_file'],
  ['开源迁移台账','CI 偶发失败：到底是产品缺陷还是测试竞态','浏览器测试竞态','通过日志、等待条件和重复运行定位根因','bash_tool'],
  ['海岬旅行研究','如果渡轮连续停航两天，路线怎么重排','交通中断预案','保留核心体验并控制额外住宿成本','ask_user_input_v0'],
  ['海岬旅行研究','给家人发送一份简短但完整的行程说明','旅行信息同步','压缩路线、住宿和紧急联系人信息','message_compose_v1'],
  ['', '把 40 条零散想法整理成半年计划','个人计划整理','识别真正承诺、依赖关系和可以删除的愿望','recent_chats'],
  ['', '为虚构播客设计三期连续选题','播客内容策划','让三期内容各自成立又形成递进','visualize:show_widget'],
  ['', '为什么这段数据分析结论听起来很确定但证据很弱','分析论证审查','拆分观察、相关性、因果推断和建议','view']
];

const projectByName=()=>Object.fromEntries(demoProjects.map(project=>[project.name,project]));
function syntheticSummary(title,subject,outcome,projectName){return `**Conversation Overview**\n\nThis was a multi-step Chinese-language collaboration about ${subject}. The user asked Claude to ${outcome}. The conversation moved from scoping and evidence collection into a concrete draft, then through targeted revision and a final operational checklist. ${projectName?`Claude used the fictional “${projectName}” project context and clearly separated project evidence from newly proposed material.`:'The conversation was intentionally left outside any project so the demo also contains unassigned history.'}\n\nThe user consistently pushed back on generic wording and asked for concrete counterexamples, named decision criteria, ownership, deadlines, and fallback paths. Claude responded by separating confirmed evidence from inference, revising broad recommendations into checklists, and preserving the reasons behind important choices. Where a tool result was incomplete or failed, the response continued with a narrower claim instead of silently presenting uncertain material as fact.\n\nThe resulting thread contains a realistic mixture of short confirmations, longer Markdown deliverables, Thinking, tool calls and results, generated files, attachments, and revision branches. It also records which portions came from project knowledge or user-provided material and which were newly proposed during the conversation. This level of summary detail mirrors the dense overview metadata found in mature exports while remaining entirely fictional.\n\nThe user preferred concise conclusions followed by evidence, explicit uncertainty, and reusable Markdown deliverables. Tool calls, intermediate results, attachments, branching alternatives, and occasional empty export records are included to reproduce the shape of a mature Claude archive. This entire overview and every referenced entity are synthetic.`;}
function buildExtendedConversation(spec,index){
  const[projectName,title,subject,outcome,toolName]=spec,base=1000+index,convUuid=root+String(base).padStart(12,'0'),start=new Date(Date.UTC(2026,2+(index%3),3+(index%24),1+(index%12),index%60));
  const at=minutes=>new Date(start.getTime()+minutes*60000).toISOString(),mid=n=>root+String(6000+index*20+n).padStart(12,'0'),messages=[];
  const rootParent='00000000-0000-4000-8000-000000000000',project=projectName?projectByName()[projectName]:null,doc=project?.docs?.[index%project.docs.length];
  messages.push(msg(mid(1).slice(-12),'human',at(0),rootParent,[{type:'text',text:`我们继续处理“${subject}”。先不要直接写最终稿，请先列出需要核实的材料、关键假设和最容易误判的地方。`}],index%3===0?{attachments:[{file_name:`${subject.slice(0,10)}_参考资料.pdf`,file_size:180000+index*7311}]}:{}));
  const toolId=`demo-${index}-tool-1`,toolInput=toolName==='project_knowledge_search'?{query:`${subject} ${projectName} 工作原则`}:toolName==='web_search'?{query:`${subject} 公开资料 核实`}:toolName==='web_fetch'?{url:'https://example.invalid/fictional-reference'}:toolName==='str_replace'?{path:doc?.filename||'draft.md',old_str:'初稿段落',new_str:'修订段落'}:toolName==='bash_tool'?{command:'demo-command --dry-run'}:toolName==='ask_user_input_v0'?{question:'更看重准确性还是完成速度？'}:{path:doc?.filename||'working-notes.md'};
  messages.push(msg(mid(2).slice(-12),'assistant',at(2),mid(1),[{type:'thinking',thinking:`需要围绕${subject}建立证据层级，先检查已有材料，再决定交付结构。不能把假设写成事实。`,summaries:[{summary:'先核实证据，再组织交付结构。'}],signature:`synthetic-signature-${index}`,start_timestamp:at(1),stop_timestamp:at(2)},{type:'tool_use',id:toolId,name:toolName,message:`正在处理：${subject}`,input:toolInput,integration_name:toolName.startsWith('web_')?'Synthetic Web':'',is_mcp_app:toolName==='visualize:show_widget'}]));
  messages.push(msg(mid(3).slice(-12),'assistant',at(4),mid(2),[{type:'tool_result',tool_use_id:toolId,is_error:index%9===0,structured_content:{status:index%9===0?'partial':'ok',items:2,source:'synthetic'},display_content:index%9===0?'部分材料不可用，已使用现有证据继续':'已找到 2 条可用证据',content:[{type:'text',text:doc?`/mnt/project/${doc.filename} 提供了相关项目背景。`:'使用虚构公开资料与用户提供的上下文。'}]},{type:'text',text:`## 第一轮结论\n\n围绕 **${subject}**，最重要的不是一次性写得很满，而是先把“已确认”“合理推断”“待验证”分开。\n\n| 层级 | 当前内容 | 下一步 |\n|---|---|---|\n| 已确认 | 用户目标与现有材料 | 保持原意 |\n| 推断 | 执行顺序与风险 | 小范围验证 |\n| 未知 | 外部条件与边界 | 明确标注 |\n\n建议接下来以${outcome}为主线完成第二稿。`} ]));
  messages.push(msg(mid(4).slice(-12),'human',at(18),mid(3),[{type:'text',text:'结构对了，但现在还太像通用模板。请加入一个具体反例，并把最后部分改成可以直接执行的检查清单。'}]));
  messages.push(msg(mid(5).slice(-12),'assistant',at(21),mid(4),[{type:'thinking',thinking:'用户需要的是具体性和可执行性。应保留证据边界，同时减少抽象术语。',start_timestamp:at(20),stop_timestamp:at(21)},{type:'text',text:`### 具体反例\n\n如果团队只追求“内容完整”，却没有指定负责人和验收条件，${subject}会在交付时变成一份没人敢采用的长文档。\n\n### 执行检查清单\n\n- [ ] 每项结论都能指出来源或明确标注为推断\n- [ ] 至少保留一个失败路径与回退方案\n- [ ] 为关键动作指定负责人、截止时间和验收条件\n- [ ] 删除无法改变决策的背景信息\n- [ ] 最终交付可在五分钟内完成第一次审阅`} ]));
  if(index%4===0)messages.push(msg(mid(6).slice(-12),'assistant',at(22),mid(4),[{type:'text',text:`另一种版本会把${subject}写成更短的决策备忘录，只保留背景、选择、风险和下一步四段。`} ]));
  messages.push(msg(mid(7).slice(-12),'human',at(35),mid(5),[{type:'text',text:'可以。保存一份 Markdown，并告诉我哪些内容来自项目资料，哪些是你补充的建议。'}]));
  messages.push(msg(mid(8).slice(-12),'assistant',at(38),mid(7),[{type:'tool_use',id:`demo-${index}-tool-2`,name:index%2?'create_file':'present_files',message:'生成最终交付文件',input:{filename:`${subject.slice(0,14)}_最终版.md`,content:'synthetic markdown deliverable'}},{type:'text',text:`已整理完成。项目或用户材料提供了主题背景、约束和已确认事实；结构设计、风险分层、反例与检查清单属于本轮新增建议。\n\n> 所有演示文件均为合成内容，不对应真实个人或组织。`}],{files:[{file_name:`${subject.slice(0,14)}_最终版.md`,file_type:'text/markdown',file_size:3200+index*47}]}));
  if(index%6===0)messages.push(msg(mid(9).slice(-12),'assistant',at(39),mid(8),[]));
  return{uuid:convUuid,name:title,summary:syntheticSummary(title,subject,outcome,projectName),created_at:at(0),updated_at:at(39),chat_messages:messages};
}

export const demoMemories={conversations_memory:'**Work context**\n\n用户正在推进一个虚构消费品牌的产品、内容与客服知识库工作，偏好先给结论，再给证据和可执行清单。\n\n**Personal context**\n\n涉及预算时应明确假设与预备金；涉及用户研究时应区分原始信号与推断。\n\n**Top of mind**\n\n当前重点是秋季发布、首月留存和客服知识库迁移。\n\n**Brief history**\n\n所有品牌、人物、文件、账号和数值均为虚构合成数据。',project_memories:{[root+'000000000301']:'**Purpose & context**\n\n北辰咖啡是虚构的 **城市精品咖啡** 订阅品牌，强调 **每月产地来信** 与不需要研究复杂参数的轻松体验。\n\n**Current state**\n\n已确认 **口味问卷**、**首包更换**、可随时暂停，是用户最在意的服务承诺。\n\n**On the horizon**\n\n完成创始席位预热、公开发布和首月续订验证。\n\n**Key learnings & principles**\n\n不把折扣作为核心卖点，所有营销判断都要能追溯到访谈或项目文件。\n\n**Approach & patterns**\n\n小团队可执行、预算透明、避免夸大效果。\n\n**Tools & resources**\n\n品牌手册、访谈摘要、客服知识库和发布检查清单。'}};
export const demoProjects=[{uuid:root+'000000000301',name:'北辰咖啡订阅服务',description:'虚构产品发布项目，用于 README 安全演示。',prompt_template:'所有建议必须给出依据、预算与可执行检查项；不确定时明确说明。',docs:[{uuid:root+'000000000302',filename:'brand-guide.md',content:'# 品牌手册\n\n品牌定位：温暖、克制、可信。目标用户是希望稳定喝到好咖啡、但不想研究复杂参数的城市上班族；订阅体验必须简单、可暂停。'},{uuid:root+'000000000303',filename:'interview-notes.md',content:'# 用户访谈摘要\n\n目标用户主要担心选错口味、囤积和订阅难以暂停，因此订阅体验应突出低风险试用。'}]}];
demoProjects.push(
  {uuid:root+'000000000311',name:'雾港档案局世界设定',description:'虚构悬疑世界观项目，包含机构、案件、人物与城市规则。',prompt_template:'事实档案、人物推断和作者决定必须分层标注；避免用解释性独白代替情节证据。',docs:[{uuid:root+'000000000312',filename:'fog-harbor-timeline.md',content:'# 雾港年表\n\n第七码头失踪案发生在白潮季前夜，灯塔局、城防厅与商会各自掌握不同记录。'},{uuid:root+'000000000313',filename:'agency-jurisdiction.md',content:'# 机构权限\n\n城防厅负责治安，灯塔局管理航道信号，商会控制仓储与船期。'},{uuid:root+'000000000314',filename:'white-tide-notes.md',content:'# 白潮病档案\n\n所有症状与机构均为虚构设定。'}]},
  {uuid:root+'000000000321',name:'开源迁移台账',description:'虚构软件工程项目，记录大型文件解析、离线发行和隐私安全设计。',prompt_template:'先测量再重构；每项优化必须提供可复现基准、失败回退和隐私边界。',docs:[{uuid:root+'000000000322',filename:'worker-protocol.md',content:'# Worker 协议\n\n采用可取消请求、Transferable 分块和按需 materialize。'},{uuid:root+'000000000323',filename:'offline-release.md',content:'# 离线发行\n\n固定依赖版本，验证 ZIP 内容与 SHA-256。'},{uuid:root+'000000000324',filename:'privacy-rules.md',content:'# 隐私规则\n\n标准模式控制误报，强力模式明确告知可能误伤。'}]},
  {uuid:root+'000000000331',name:'海岬旅行研究',description:'虚构群岛旅行研究项目，用于展示网页检索、预算和行程文档。',prompt_template:'所有地点均为虚构；路线建议必须包含天气、交通中断和体力缓冲。',docs:[{uuid:root+'000000000332',filename:'cape-islands-route.md',content:'# 海岬群岛路线\n\n渡轮每周四班，雨季可能临时取消。'},{uuid:root+'000000000333',filename:'packing-and-budget.md',content:'# 装备与预算\n\n预算分为固定交通、住宿、餐饮和应急金。'}]}
);
Object.assign(demoMemories.project_memories,{
  [root+'000000000311']:'**Purpose & context**\n\n构建虚构的 **雾港档案局**、**第七码头** 与 **白潮病** 世界观。\n\n**Current state**\n\n机构权限、案件年表和人物动机已建立。\n\n**Key learnings & principles**\n\n线索必须先于解释出现，IF 线不能改变人物核心动机。',
  [root+'000000000321']:'**Purpose & context**\n\n维护虚构的 **持久 Worker**、**离线发行** 和 **隐私规则** 工程台账。\n\n**Current state**\n\n已完成分块解析、按需渲染和安全导出。\n\n**Approach & patterns**\n\n先建立基线，再做可验证优化。',
  [root+'000000000331']:'**Purpose & context**\n\n研究虚构的 **海岬群岛** 路线、住宿和预算。\n\n**Current state**\n\n已整理渡轮、雨季风险和徒步装备。\n\n**Key learnings & principles**\n\n路线必须留有中断缓冲，不把宣传材料当作事实。'
});
demoConversations.push(...extendedScenarios.map(buildExtendedConversation));
export const demoDesign={uuid:root+'000000000401',title:'订阅落地页视觉探索',project:{name:'北辰咖啡订阅服务'},messages:[{role:'user',content:'设计一个温暖、克制的咖啡订阅首屏。'},{role:'assistant',content:[{type:'thinking',thinking:'采用纸张暖色、有限选项和明确行动按钮。'},{type:'text',text:'首屏聚焦口味选择，不堆叠品牌宣言。'}]}]};

import crypto from 'node:crypto';
const demoMd5=s=>crypto.createHash('md5').update(s,'utf8').digest('hex');
const demoCwd='/workspace/beichen-web';
const demoKimiHash=demoMd5(demoCwd);

export const demoMultiPlatformFiles=[
  {
    path:'chatgpt/conversations.json',
    content:JSON.stringify([{
      id:'gpt-beichen-1',
      title:'咖啡豆烘焙温度曲线分析（ChatGPT）',
      create_time:1751356800,
      update_time:1751356920,
      current_node:'gpt-a1',
      mapping:{
        root:{id:'root',message:null,parent:null,children:['gpt-u1']},
        'gpt-u1':{id:'gpt-u1',parent:'root',children:['gpt-t1'],message:{id:'gpt-u1',author:{role:'user'},create_time:1751356800,content:{content_type:'text',parts:['为北辰浅烘手冲拼配生成 9 分钟烘焙升温率（RoR）参考表。']}}},
        'gpt-t1':{id:'gpt-t1',parent:'gpt-u1',children:['gpt-a1'],message:{id:'gpt-t1',author:{role:'assistant'},create_time:1751356830,content:{content_type:'thoughts',thoughts:[{summary:'规划浅烘发展期 RoR 衰减节奏',content:'一爆前后控制在 6.5°C/min → 3.2°C/min，避免焙烤味。'}]}}},
        'gpt-a1':{id:'gpt-a1',parent:'gpt-t1',children:[],message:{id:'gpt-a1',author:{role:'assistant'},create_time:1751356920,metadata:{model_slug:'gpt-4o'},content:{content_type:'text',parts:['| 阶段 | 豆温 | 建议 RoR |\n|---|---|---|\n| 转黄点 4:30 | 152°C | 11.5°C/min |\n| 一爆点 7:45 | 196°C | 6.2°C/min |\n| 下豆 9:05 | 204°C | 3.0°C/min |']}}}
      }
    }],null,2)
  },
  {
    path:'grok/grok-demo.json',
    content:JSON.stringify([{
      conversation:{id:'grok-beichen-1',title:'浅烘产区趋势与厌氧日晒风味速览（Grok）',create_time:'2026-07-02T09:00:00Z'},
      responses:[
        {_id:'gr-u1',sender:'human',message:'概括今年精品订阅中最受欢迎的两类浅烘风味。',create_time:'2026-07-02T09:00:00Z'},
        {_id:'gr-a1',sender:'assistant',model:'grok-3',message:'第一类为埃塞古吉水洗的高扬柑橘茉莉调性；第二类为哥伦比亚低强度厌氧日晒的白桃乌龙甜感，复购率最高。',create_time:'2026-07-02T09:00:08Z'}
      ]
    }],null,2)
  },
  {
    path:'perplexity/pplx-demo.json',
    content:JSON.stringify({
      context_uuid:'pplx-beichen-1',
      title:'冷萃低温萃取研磨度与浸泡时长检索（Perplexity）',
      created_at:'2026-07-03T10:00:00Z',
      mode:'pro',
      display_model:'sonar-pro',
      entries:[{
        entry_uuid:'pe-1',
        query_str:'冷萃咖啡在 4°C 下 12–16 小时萃取的最佳粉水比与研磨粒度？',
        created_at:'2026-07-03T10:00:00Z',
        blocks:[{
          intended_usage:'ask_text',
          markdown_block:{
            answer:'推荐 1:10 粉水比与 900–1100 微米粗研磨；4°C 浸泡 14 小时可兼顾清晰果酸与干净尾韵。',
            web_results:[{name:'SCA Cold Brew Extraction Notes',url:'https://example.invalid/sca-cold-brew',snippet:'Optimal grind size 950um at 4C for 14h.'}]
          }
        }]
      }]
    },null,2)
  },
  {
    path:'.codex/sessions/2026/08/01/rollout-2026-08-01T10-00-00-dddd4444-4444-4444-8444-444444444444.jsonl',
    content:[
      {timestamp:'2026-08-01T10:00:00Z',type:'session_meta',payload:{id:'dddd4444-4444-4444-8444-444444444444',cwd:demoCwd,cli_version:'0.29.0',model:'gpt-5.3-codex',originator:'codex_cli_rs'}},
      {timestamp:'2026-08-01T10:00:01Z',type:'turn_context',payload:{model:'gpt-5.3-codex',sandbox_mode:'workspace-write',approval_policy:'on-request'}},
      {timestamp:'2026-08-01T10:00:02Z',type:'event_msg',payload:{type:'user_message',message:'为北辰订阅站添加冷萃萃取计算器并委派子代理审计配置'}},
      {timestamp:'2026-08-01T10:00:03Z',type:'response_item',payload:{type:'reasoning',summary:[{type:'summary_text',text:'检查现有订阅组件并规划计算器模块'}]}},
      {timestamp:'2026-08-01T10:00:04Z',type:'response_item',payload:{type:'function_call',call_id:'cd-sp1',name:'spawn_agent',arguments:JSON.stringify({nickname:'qa-auditor',message:'审计风味配置文件字段完整性'})}},
      {timestamp:'2026-08-01T10:00:05Z',type:'response_item',payload:{type:'function_call_output',call_id:'cd-sp1',output:'{"agent_id":"eeee4444-4444-4444-8444-444444444444","nickname":"qa-auditor"}'}},
      {timestamp:'2026-08-01T10:00:06Z',type:'event_msg',payload:{type:'item_completed',item:{type:'Plan',text:'Step 1: 新增 brewRatio 计算函数\nStep 2: 跑通全量测试'}}},
      {timestamp:'2026-08-01T10:00:07Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'cd-ap1',name:'apply_patch',input:'*** Begin Patch\n*** Update File: /workspace/beichen-web/src/brew.js\n@@\n+export const coldBrewRatio = 10;\n*** End Patch'}},
      {timestamp:'2026-08-01T10:00:08Z',type:'response_item',payload:{type:'custom_tool_call_output',call_id:'cd-ap1',output:'Patched 1 file cleanly'}},
      {timestamp:'2026-08-01T10:00:09Z',type:'response_item',payload:{type:'function_call',call_id:'cd-ex1',name:'exec_command',arguments:JSON.stringify({cmd:'npm test'})}},
      {timestamp:'2026-08-01T10:00:10Z',type:'response_item',payload:{type:'function_call_output',call_id:'cd-ex1',output:'Process exited with code 0\nAll 24 tests passed'}},
      {timestamp:'2026-08-01T10:00:11Z',type:'event_msg',payload:{type:'agent_message',message:'已完成冷萃萃取计算器实现，并由 qa-auditor 子代理确认配置 Schema 无误。'}},
      {timestamp:'2026-08-01T10:00:12Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:3400,cached_input_tokens:2100,output_tokens:680,reasoning_output_tokens:240,total_tokens:4080}}}}
    ].map(o=>JSON.stringify(o)).join('\n')
  },
  {
    path:'.codex/sessions/2026/08/01/rollout-2026-08-01T10-00-04-eeee4444-4444-4444-8444-444444444444.jsonl',
    content:[
      {timestamp:'2026-08-01T10:00:04Z',type:'session_meta',payload:{id:'eeee4444-4444-4444-8444-444444444444',cwd:demoCwd,cli_version:'0.29.0',model:'gpt-5.3-codex',parent_thread_id:'dddd4444-4444-4444-8444-444444444444',agent_nickname:'qa-auditor'}},
      {timestamp:'2026-08-01T10:00:05Z',type:'event_msg',payload:{type:'user_message',message:'审计风味配置文件字段完整性'}},
      {timestamp:'2026-08-01T10:00:06Z',type:'event_msg',payload:{type:'agent_message',message:'Schema 校验全部通过：风味标签与烘焙曲线字段齐全。'}},
      {timestamp:'2026-08-01T10:00:07Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:620,cached_input_tokens:300,output_tokens:140,total_tokens:760}}}}
    ].map(o=>JSON.stringify(o)).join('\n')
  },
  {
    path:'.claude/projects/-workspace-beichen-web/cc-beichen-1.jsonl',
    content:[
      {type:'user',uuid:'cc-b-u1',parentUuid:null,sessionId:'cc-beichen-1',cwd:demoCwd,timestamp:'2026-08-01T12:00:00Z',message:{role:'user',content:'检查订阅页结账表单无障碍对比度与键盘焦点'}},
      {type:'assistant',uuid:'cc-b-a1',parentUuid:'cc-b-u1',sessionId:'cc-beichen-1',cwd:demoCwd,timestamp:'2026-08-01T12:00:02Z',message:{role:'assistant',model:'claude-sonnet-4-6',stop_reason:'tool_use',content:[{type:'thinking',thinking:'检查 checkout.css 中的 focus-visible 样式。'},{type:'tool_use',id:'cc-tu1',name:'Read',input:{file_path:'/workspace/beichen-web/src/checkout.css'}}],usage:{input_tokens:2100,output_tokens:420,cache_read_input_tokens:1500,cache_creation_input_tokens:180}}},
      {type:'user',uuid:'cc-b-u2',parentUuid:'cc-b-a1',sessionId:'cc-beichen-1',cwd:demoCwd,timestamp:'2026-08-01T12:00:03Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'cc-tu1',content:'.btn:focus-visible { outline: 2px solid #2563eb; }'}]}},
      {type:'assistant',uuid:'cc-b-a2',parentUuid:'cc-b-u2',sessionId:'cc-beichen-1',cwd:demoCwd,timestamp:'2026-08-01T12:00:05Z',message:{role:'assistant',model:'claude-sonnet-4-6',stop_reason:'end_turn',content:[{type:'text',text:'已验证所有按钮与表单控件均包含 WCAG 2.1 AAA 焦点轮廓，无需额外改动。'}],usage:{input_tokens:2200,output_tokens:180,cache_read_input_tokens:1800,cache_creation_input_tokens:0}}}
    ].map(o=>JSON.stringify(o)).join('\n')
  },
  {
    path:'.gemini/antigravity/brain/ffff5555-5555-4555-8555-555555555555/.system_generated/logs/transcript.jsonl',
    content:[
      {step_index:0,timestamp:'2026-08-01T13:00:00Z',type:'user_input',content:'<ADDITIONAL_METADATA>\nWorkspace: /workspace/beichen-web\nModel: gemini-2.5-pro\n</ADDITIONAL_METADATA>\n为 /workspace/beichen-web 生成订阅调度方案文档'},
      {step_index:1,timestamp:'2026-08-01T13:00:02Z',type:'planner_response',model:'gemini-2.5-pro',input_tokens:1850,output_tokens:390,cache_read_tokens:900,tool_calls:[{id:'ag-tb1',name:'task_boundary',arguments:JSON.stringify({TaskName:'Subscription Scheduler Plan',Mode:'PLANNING',TaskStatus:'Drafting design doc',TaskSummary:'Reviewing cadence state machine'})},{id:'ag-wf1',name:'write_to_file',arguments:JSON.stringify({TargetFile:'/workspace/beichen-web/scheduler.md',Description:'Write scheduler spec'})}]},
      {step_index:2,timestamp:'2026-08-01T13:00:04Z',type:'planner_response',model:'gemini-2.5-pro',input_tokens:950,output_tokens:210,cache_read_tokens:600,tool_calls:[{id:'ag-nu1',name:'notify_user',arguments:JSON.stringify({Message:'请审阅订阅周期调度实现方案 `implementation_plan.md`。',PathsToReview:['implementation_plan.md'],BlockedOnUser:true})}],content:'已在 Brain 工作区生成 `implementation_plan.md` 与 `scheduler.md` 草案。'}
    ].map(o=>JSON.stringify(o)).join('\n')
  },
  {
    path:'.gemini/antigravity/brain/ffff5555-5555-4555-8555-555555555555/implementation_plan.md',
    content:'# 北辰咖啡订阅调度方案\n\n- 支持双周 / 四周灵活跳过与提前发货\n- 烘焙排期与库存锁定幂等重试\n'
  },
  {
    path:'.gemini/tmp/beichen-web/.project_root',
    content:demoCwd
  },
  {
    path:'.gemini/tmp/beichen-web/chats/session-demo-1.json',
    content:JSON.stringify({
      sessionId:'gem-beichen-1',
      projectHash:'beichen-web',
      startTime:'2026-08-01T14:00:00Z',
      lastUpdated:'2026-08-01T14:01:00Z',
      messages:[
        {id:'gm-1',timestamp:'2026-08-01T14:00:00Z',type:'user',content:'检查打包脚本是否包含离线资源校验'},
        {id:'gm-2',timestamp:'2026-08-01T14:00:05Z',type:'gemini',model:'gemini-2.5-pro',thoughts:[{subject:'检查构建脚本',description:'核对 SHA-256 校验输出'}],toolCalls:[{id:'gt-1',name:'run_shell_command',args:{command:'npm run privacy'},status:'success',result:'Privacy guard passed'}],content:'已确认离线包内置 SHA-256 校验与隐私守卫检查通过。',tokens:{input:980,output:240,cached:400,thoughts:160,tool:80,total:1860}}
      ]
    },null,2)
  },
  {
    path:'.kimi/config.toml',
    content:'default_model = "kimi-k2.5"\ndefault_thinking = true\n'
  },
  {
    path:'.kimi/kimi.json',
    content:JSON.stringify({work_dirs:[{path:demoCwd,kaos:'local',last_session_id:'kimi-beichen-1'}]},null,2)
  },
  {
    path:`.kimi/sessions/${demoKimiHash}/kimi-beichen-1/context.jsonl`,
    content:[
      {role:'user',content:'进入 Plan Mode 检查发版前 README 与演示脚本'},
      {role:'assistant',content:[{type:'text',text:'已完成 README 双语校验与 9 平台合成归档验证。'}]}
    ].map(o=>JSON.stringify(o)).join('\n')
  },
  {
    path:`.kimi/sessions/${demoKimiHash}/kimi-beichen-1/wire.jsonl`,
    content:[
      {type:'metadata',protocol_version:'1.10'},
      {timestamp:1760300001,message:{type:'TurnBegin',payload:{user_input:'进入 Plan Mode 检查发版前 README 与演示脚本'}}},
      {timestamp:1760300002,message:{type:'PlanDisplay',payload:{file_path:'/workspace/beichen-web/.kimi/plans/release-check.md',content:'# Release Check Plan\n\n- Run docs parity\n- Capture media'}}},
      {timestamp:1760300003,message:{type:'ToolCall',payload:{id:'km-t1',function:{name:'Shell',arguments:JSON.stringify({command:'npm run docs'})}}}},
      {timestamp:1760300004,message:{type:'ToolResult',payload:{tool_call_id:'km-t1',return_value:{is_error:false,output:'Docs parity passed',display:[{type:'shell',command:'npm run docs',language:'bash'}]}}}},
      {timestamp:1760300005,message:{type:'StatusUpdate',payload:{context_usage:0.28,context_tokens:35840,max_context_tokens:128000,plan_mode:true,token_usage:{input_other:1100,output:290,input_cache_read:2400,input_cache_creation:200}}}},
      {timestamp:1760300006,message:{type:'TurnEnd',payload:{}}}
    ].map(o=>JSON.stringify(o)).join('\n')
  },
  {
    path:`.kimi/sessions/${demoKimiHash}/kimi-beichen-1/subagents/docs-auditor/context.jsonl`,
    content:[
      {role:'user',content:'核对双语徽章与基准测试数据行'},
      {role:'assistant',content:[{type:'text',text:'6 枚徽章与 50/150/300 MiB 基准数据核对一致。'}]}
    ].map(o=>JSON.stringify(o)).join('\n')
  }
];

