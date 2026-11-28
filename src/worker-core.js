function workerDomainCore(){
let currentLang='zh',labels={},markedConfigured=false;const codes=new Map();
const ROOT_ID='00000000-0000-4000-8000-000000000000';
function isDesignExport(value){return !!(value&&typeof value==='object'&&!Array.isArray(value)&&Array.isArray(value.messages)&&value.messages.some(m=>m&&typeof m.role==='string'&&'content'in m));}
function designContentBlocks(raw){
  if(Array.isArray(raw))return raw.flatMap(b=>{
    if(!b||typeof b!=='object')return typeof b==='string'?[{type:'text',text:b}]:[];
    if(b.type==='tool_call'&&b.toolCall)return[{type:'tool_use',id:b.toolCall.id||'',name:b.toolCall.name||'tool',input:b.toolCall.input||{},output:b.toolCall.output||''}];
    if(b.type==='thinking'||b.type==='redacted_thinking')return[{...b,thinking:b.thinking||b.text||''}];
    return[b];
  });
  if(typeof raw==='string')return[{type:'text',text:raw}];
  if(!raw||typeof raw!=='object')return[];
  const blocks=[];
  if(typeof raw.content==='string')blocks.push({type:'text',text:raw.content});
  else if(typeof raw.text==='string')blocks.push({type:'text',text:raw.text});
  if(Array.isArray(raw.contentBlocks))blocks.push(...designContentBlocks(raw.contentBlocks));
  return blocks;
}
function designChatToConversation(d,index){
  const msgs=(d.messages||[]).map((m,i)=>{const raw=m.content,record=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const created=m.created_at||m.timestamp||record.created_at||record.timestamp||'';return{uuid:m.uuid||record.id||'design-'+index+'-'+i,sender:m.role==='user'?'human':'assistant',created_at:created,updated_at:created,parent_message_uuid:i?(m.parent_message_uuid||(d.messages[i-1].uuid||'design-'+index+'-'+(i-1))):ROOT_ID,content:designContentBlocks(raw),attachments:Array.isArray(record.attachments)?record.attachments:[],text:typeof raw==='string'?raw:(typeof record.content==='string'?record.content:'')}});
  return{uuid:d.uuid||'design-chat-'+index,name:(d.title&&d.title!=='Chat'?d.title:t('Design'))+(d.project&&d.project.name?' · '+d.project.name:''),created_at:d.created_at||msgs[0]?.created_at||'',updated_at:d.updated_at||msgs[msgs.length-1]?.created_at||'',chat_messages:msgs,project:d.project||null,_design:true};
}
function parseDesignExports(texts){const out=[];for(const text of texts||[]){try{const value=JSON.parse(text);if(isDesignExport(value))out.push(designChatToConversation(value,out.length));}catch(e){}}return out;}


const list=value=>Array.isArray(value)?value:[];
const t=(key,vars)=>{let value=currentLang==='en'?(labels[key]||key):key;if(vars)for(const [k,v]of Object.entries(vars))value=value.replaceAll('{'+k+'}',String(v));return value;};
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr=s=>esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtDate=iso=>iso?new Date(iso).toLocaleDateString(currentLang==='en'?'en-US':'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
const fmtTime=iso=>iso?new Date(iso).toLocaleTimeString(currentLang==='en'?'en-US':'zh-CN',{hour:'2-digit',minute:'2-digit'}):'';
// Match the original text once; replacements are never scanned as new secrets.
const REDACTION_RULE_VERSION=3;
const contextRules=redactionRules();
const SENSITIVE_PATTERNS=[
  ['内嵌二进制',/data:(?:image|audio|video|application)\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}/gi],
  ['私钥',/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----|$)/g],
  ['API 密钥',/\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,})\b/g],
  ['认证凭据',/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi],
  ['JWT 令牌',/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['Webhook 令牌',/https:\/\/(?:hooks\.slack\.com\/services\/[^\s"'<>]+|(?:discord\.com|discordapp\.com)\/api\/webhooks\/[^\s"'<>]+|api\.telegram\.org\/bot\d+:[A-Za-z0-9_-]+)/gi],
  ['邮箱',/(?<![\w.+%-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])/gi],
  ['手机号',/(?<!\d)(?:\+?86[- .]?)?1[3-9](?:[- .]?\d){9}(?!\d)/g],
  ['手机号',/(?<![\w\d])\+[1-9]\d{0,2}(?:[ .()-]?\d){7,12}(?!\d)/g],
  ['本地路径',/(?:\b[A-Z]:[\\/]|\\\\[A-Za-z0-9_.-]+\\|file:\/\/)[^\s"'<>]+|(?<![\w:/])\/(?:Users|home|mnt|tmp|var|opt|srv|etc|root|workspace|workspaces|data)\/[^\s"'<>]+/gi]
];
const STRICT_SENSITIVE_PATTERNS=[
  ['身份证件',/(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9X](?!\d)/gi],
  ['银行卡号',/(?:卡号|银行卡|借记卡|信用卡|card(?:\s*(?:no|number))?)\s*[：:=]?\s*(?:\d[ -]?){13,19}(?!\d)/gi],
  ['网络地址',/(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.])/g],
  ['网络地址',/(?<![\w:])(?:[\da-f]{0,4}:){2,7}[\da-f]{0,4}(?![\w:])/gi,value=>{const parts=value.split(':');return value.includes('::')?!value.includes(':::')&&value.indexOf('::')===value.lastIndexOf('::')&&parts.filter(Boolean).length<8:parts.length===8&&parts.every(Boolean);}],
  ['设备标识',/(?<![\w:])(?:[\da-f]{2}[:-]){5}[\da-f]{2}(?![\w:])/gi],
  ['银行卡号',/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g,value=>{const digits=value.replace(/\D/g,'');if(/^(\d)\1+$/.test(digits))return false;let sum=0;for(let i=digits.length-1,even=false;i>=0;i--,even=!even){let n=+digits[i];if(even&&(n*=2)>9)n-=9;sum+=n;}return sum%10===0;}],
  ['车牌号',/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][·A-Z0-9][A-Z0-9]{4,5}/g],
  ['社交账号',/https?:\/\/(?:www\.)?(?:weibo\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com|douyin\.com|bilibili\.com|zhihu\.com|linkedin\.com|github\.com|reddit\.com|t\.me|discord\.gg|youtube\.com)\/[^\s<>"'）)\]}]+/gi],
  ['详细地址',/(?:[\u4e00-\u9fff]{2,20}(?:省|自治区|市|区|县)){1,3}[\u4e00-\u9fff0-9-]{2,80}(?:街道|路|街|巷|小区|村|镇|乡|号|栋|幢|楼|单元|室)/g],
  ['详细地址',/[\u4e00-\u9fff]{2,40}(?:路|街|巷|小区|大道)\d{1,4}号(?:\d{1,3}(?:栋|幢|楼|单元|室))?/g],
  ['链接',/(?:https?:\/\/|www\.)[^\s<>"'）)\]}]+|\b(?:[A-Za-z0-9-]+\.)+(?:com|net|org|cn|io|dev|app|ai|edu|gov|co|me)(?:\/[^\s<>"'）)\]}]*)?/gi]
];
const SECRET_KEY=/^(?:password|passwd|pwd|passphrase|secret|client[_ -]?secret|api[_ -]?key|access[_ -]?key|private[_ -]?key|access[_ -]?token|refresh[_ -]?token|auth[_ -]?token|id[_ -]?token|token|authorization|proxy[_ -]?authorization|cookie|set[_ -]?cookie|x[_ -]?api[_ -]?key|aws[_ -]?secret[_ -]?access[_ -]?key|db[_ -]?password|密码|口令|密钥)$/i;
const IDENTIFIER_KEY=/^(?:device[_ -]?id|user[_ -]?id|visitor[_ -]?id|session[_ -]?id|storage[_ -]?key|fingerprint|did)$/i;
const CONTEXT_SECRET_RE=/((?:(?:cohere)[ \t]+(?:api[ \t]+)?key|device[_ -]?id|user[_ -]?id|visitor[_ -]?id|fingerprint|session[_ -]?id|storage[_ -]?key|access[_ -]?token|refresh[_ -]?token|auth[_ -]?token|id[_ -]?token|client[_ -]?secret|api[_ -]?key|access[_ -]?key|private[_ -]?key|aws[_ -]?secret[_ -]?access[_ -]?key|db[_ -]?password|password|passwd|pwd|passphrase|token|secret|did|密码|口令|密钥)\s*["']?\s*[:=：]\s*)(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s,"'，。；;<>\]}]+))/gi;
const QUERY_SECRET_RE=/([?&#](?:token|access_token|refresh_token|id_token|auth|authorization|api[_-]?key|key|sid|session|device_id|did|t|sig|signature|x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential)=)([^\s&#"'<>）)\]}]+)/gi;
const STRICT_CONTEXT_RE=/((?:姓名|名字|联系人|老师|教师|教授|班主任|校长|学校|学院|大学|中学|小学|幼儿园|公司|单位|部门|微信|wechat|qq|微博|抖音|uid|用户[_ -]?id|account[_ -]?id|open[_ -]?id|social[_ -]?id|身份证(?:号)?|护照(?:号)?|passport(?:[ \t]+(?:no|number))?|ssn|住址|地址|家庭住址|工作地址|full[_ -]?name|phone|telephone|mobile|address)\s*[：:=]\s*["']?)([^\s,"'，。；;]{2,80})/gi;
const REDACTION_METADATA=new Set(['tool_input','input','metadata','file_path','path','claudeCodeTelemetry','antigravityTelemetry','geminiCliTelemetry','TargetFile','AbsolutePath','Cwd','DirectoryPath','SearchDirectory']);
const REDACTION_PATH_KEYS=new Set('conversation name title summary chat_messages content text thinking subject description prompt injection_source summaries attachments files file_name filename file_type file_size media_type url uri data value metadata tool_input input path file_path filePath TargetFile AbsolutePath Cwd CommandLine account uuid parent_message_uuid sender type structured_content display_content output created_at updated_at start_timestamp stop_timestamp tool_use_id id model thinking_hidden truncated signature _design _sourcePackage'.split(' '));
function redactionOptions(options={}){
  const terms=Array.isArray(options.customTerms)?options.customTerms:String(options.customTerms||'').split(/\r?\n/);
  const customTerms=[...new Set(terms.filter(s=>typeof s==='string').map(s=>s.trim()).filter(Boolean))];
  if(customTerms.length>100||customTerms.some(s=>s.length>256)||customTerms.join('\n').length>8192)throw new Error('Custom redaction terms exceed the limit (100 terms, 256 characters each, 8192 total).');
  return{customTerms,includeContextCandidates:options.includeContextCandidates===true,customSimilarity:options.customSimilarity===true};
}
function redactionState(options){const normalized=redactionOptions(options);return{stats:{},matches:[],total:0,pseudonyms:new Map(),candidateTotal:0,candidateStats:{},complete:true,compiled:normalized.customSimilarity?contextRules.compile(normalized.customTerms):null,...normalized};}
function redactionToken(label,value,style,state){
  if(style==='scp')return label==='metadata'?(currentLang==='en'?'[DATA EXPUNGED]':'[数据删除]'):'█'.repeat(Math.max(6,Math.min(24,String(value||'').length)));
  if(style==='pseudonym'&&label!=='metadata'){if(!state.pseudonyms.has(value))state.pseudonyms.set(value,'[ID_'+(state.pseudonyms.size+1)+']');return state.pseudonyms.get(value);}
  return '[REDACTED:'+label+']';
}
function addRedactionFinding(state,label,value,path,reason){state.stats[label]=(state.stats[label]||0)+1;state.total++;if(state.matches.length<100)state.matches.push({label,path:path||'conversation',preview:'█'.repeat(Math.max(4,Math.min(12,String(value).length)))+' ('+String(value).length+')',reason,evidence:'definite',method:'rule',applied:true});}
function* redactText(text,state,path,style,strict=false){
  text=String(text??'');const spans=[];
  const add=(start,end,label,reason)=>{if(end>start)spans.push({start,end,label,reason,evidence:'definite',method:'rule'});};
  const scan=(re,callback)=>{re.lastIndex=0;for(const match of text.matchAll(re))callback(match);};
  scan(CONTEXT_SECRET_RE,m=>{const value=m[2]??m[3]??m[4],start=m.index+m[1].length+(m[2]!==undefined||m[3]!==undefined?1:0),label=/device|fingerprint|\bdid\b/i.test(m[1])?'设备标识':/user|visitor/i.test(m[1])?'用户标识':/session|storage/i.test(m[1])?'会话标识':'凭据或令牌';add(start,start+value.length,label,'敏感字段名与值同时出现');});
  scan(QUERY_SECRET_RE,m=>add(m.index+m[1].length,m.index+m[0].length,'URL 查询令牌','敏感查询参数'));
  scan(/(https:\/\/claude\.ai\/export\/[A-Za-z0-9-]+\/download\/)([A-Za-z0-9-]+)/gi,m=>add(m.index+m[1].length,m.index+m[0].length,'下载令牌','官方导出下载令牌'));
  scan(/\b[a-z][a-z0-9+.-]*:\/\/([^\s/@"'<>]+)@/gi,m=>{if(m[1].includes(':'))add(m.index+m[0].indexOf('://')+3,m.index+m[0].length-1,'连接凭据','连接地址中的用户名与密码');});
  scan(/(["']?)\b(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|X-Api-Key)\s*:\s*([^\r\n]+)/gi,m=>{const value=m[2],start=m.index+m[0].length-value.length;let length=value.length;const quoted=m[1]&&(m.index===0||/[\s,(=]/.test(text[m.index-1]));if(quoted)for(let i=0;i<value.length;i++){if(value[i]==='\\'&&(value[i+1]===m[1]||value[i+1]==='\\')){i++;continue;}if(value[i]===m[1]){length=i;break;}}add(start,start+length,'认证凭据','认证头或 Cookie');});
  const connections=spans.filter(s=>s.label==='连接凭据').sort((a,b)=>a.start-b.start);let connectionIndex=0;
  for(const [label,re,validate]of [...SENSITIVE_PATTERNS,...(strict?STRICT_SENSITIVE_PATTERNS:[])])scan(re,m=>{if(label==='邮箱'){while(connections[connectionIndex]?.end<=m.index)connectionIndex++;const connection=connections[connectionIndex];if(connection&&connection.start<m.index+m[0].length)return;}if(!validate||validate(m[0]))add(m.index,m.index+m[0].length,label,strict?'格式匹配；强力规则可能误伤':'敏感格式匹配');});
  if(strict)scan(STRICT_CONTEXT_RE,m=>{const label=/老师|教师|教授|班主任|校长|姓名|名字|联系人|name/i.test(m[1])?'个人姓名':/学校|学院|大学|中学|小学|幼儿园|公司|单位|部门/i.test(m[1])?'学校或单位':/微信|wechat|qq|微博|抖音/i.test(m[1])?'社交账号':/phone|telephone|mobile/i.test(m[1])?'手机号':/uid|用户|account|open|social/i.test(m[1])?'用户标识':/地址|住址|address/i.test(m[1])?'详细地址':'身份证件';add(m.index+m[1].length,m.index+m[0].length,label,'宽泛隐私规则，可能误伤普通文本');});
  for(const term of state.customTerms){let from=0,index;while((index=text.indexOf(term,from))!==-1){add(index,index+term.length,'自定义敏感词','用户指定的精确文本');from=index+term.length;}}
  yield* contextRules.scan(text,state.compiled,span=>spans.push(span),()=>{state.complete=false;});
  const merge=items=>{items.sort((a,b)=>a.start-b.start||b.end-a.end);const result=[];for(const span of items){const last=result[result.length-1];if(last&&span.start<last.end){if(last.evidence!=='definite'&&span.evidence==='definite'){last.label=span.label;last.reason=span.reason;last.evidence=span.evidence;last.method=span.method;}last.end=Math.max(last.end,span.end);}else result.push({...span});}return result;};
  // Formatting/exact rules win over fuzzy supersets (e.g. an adjacent emoji).
  // Use a binary overlap lookup rather than comparing every fuzzy hit to every rule hit.
  const fixed=merge(spans.filter(s=>s.evidence!=='candidate'&&s.method!=='similar'));
  const overlaps=(items,span)=>{let low=0,high=items.length;while(low<high){const mid=(low+high)>>>1;if(items[mid].end<=span.start)low=mid+1;else high=mid;}return low<items.length&&items[low].start<span.end;};
  const fuzzy=spans.filter(s=>s.method==='similar'&&!overlaps(fixed,s)).sort((a,b)=>a.start-b.start||a.edits-b.edits||b.similarity-a.similarity),selected=[];
  for(const span of fuzzy){const last=selected[selected.length-1];if(last&&span.start<last.end){if(span.edits<last.edits||span.edits===last.edits&&span.similarity>last.similarity)selected[selected.length-1]=span;}else selected.push(span);}
  const definite=merge([...fixed,...selected]),candidates=merge(spans.filter(s=>s.evidence==='candidate'));
  let atDefinite=0;const weak=candidates.filter(span=>{while(definite[atDefinite]?.end<=span.start)atDefinite++;return !definite[atDefinite]||definite[atDefinite].start>=span.end;});
  if(!state.includeContextCandidates)for(const span of weak){const value=text.slice(span.start,span.end);state.candidateTotal++;state.candidateStats[span.label]=(state.candidateStats[span.label]||0)+1;if(state.matches.length<100)state.matches.push({label:span.label,path,preview:'█'.repeat(Math.max(4,Math.min(12,value.length)))+' ('+value.length+')',reason:span.reason,evidence:'candidate',method:span.method,applied:false});}
  const merged=state.includeContextCandidates?merge([...definite,...weak]):definite;
  let out='',at=0;for(const span of merged){const value=text.slice(span.start,span.end),before=state.matches.length;addRedactionFinding(state,span.label,value,path,span.reason);if(state.matches.length>before)Object.assign(state.matches[state.matches.length-1],{evidence:span.evidence,method:span.method,applied:true});out+=text.slice(at,span.start)+redactionToken(span.label,value,style,state);at=span.end;}return out+text.slice(at);
}
function* redactionSteps(conv,state,style,strict){
  const stack=[{parent:{value:conv},key:'value',path:'conversation'}];
  while(stack.length){
    const {parent,key,path}=stack.pop(),value=parent[key];
    if(typeof value==='string')parent[key]=yield* redactText(value,state,path,style,strict);
    else if(value&&typeof value==='object'){
      if(value.gptProgram)value.gptProgram._redactedMedia=true;
      // Matches attachments/files arrays at any depth, including content blocks.
      // _redactedMedia is consumed by the PDF renderer to block cached original pixels.
      if(/\.(?:attachments|files)\[\d+\]$/.test(path)){
        value._redactedMedia=true;
        for(const binaryKey of ['data','data_url','source'])if(value[binaryKey]!=null){const raw=typeof value[binaryKey]==='string'?value[binaryKey]:JSON.stringify(value[binaryKey]);addRedactionFinding(state,'内嵌二进制',raw,path,'二进制内容不做 OCR，安全导出移除原始数据');value[binaryKey]=redactionToken('内嵌二进制',raw,style,state);}
      }
      if(value.type==='image'&&value.source){addRedactionFinding(state,'内嵌二进制',JSON.stringify(value.source),path,'二进制内容不做 OCR，安全导出移除原始数据');value.source={type:'redacted'};}
      const entries=Object.keys(value);for(let i=entries.length-1;i>=0;i--){
        let k=entries[i];const safeKey=REDACTION_PATH_KEYS.has(k)?'.'+k:'[field]',p=Array.isArray(value)?path+'['+k+']':path+safeKey;
        if(!Array.isArray(value)&&!REDACTION_PATH_KEYS.has(k)&&!SECRET_KEY.test(k)){const replacement=yield* redactText(k,state,p,style,strict);if(replacement!==k){let renamed=replacement,n=1;while(Object.hasOwn(value,renamed))renamed=replacement+'_'+n++;Object.defineProperty(value,renamed,{value:value[k],writable:true,enumerable:true,configurable:true});delete value[k];k=renamed;}}
        const originalKey=entries[i],label=SECRET_KEY.test(originalKey)?'凭据或令牌':IDENTIFIER_KEY.test(originalKey)?(/device|fingerprint|did/i.test(originalKey)?'设备标识':/session|storage/i.test(originalKey)?'会话标识':'用户标识'):strict&&/^(?:email|phone|telephone|mobile|full_name|address|passport|ssn|account_id)$/i.test(originalKey)?'个人信息字段':null;
        if(REDACTION_METADATA.has(originalKey)||label){const raw=typeof value[k]==='string'?value[k]:JSON.stringify(value[k]??'');if(raw&&raw!=='null'){if(!label)yield* redactText(raw,state,p,style,strict);addRedactionFinding(state,label||'metadata',raw,p,label?'敏感字段名与值同时出现':'安全导出会移除工具参数、路径或系统元数据');value[k]=redactionToken(label||'metadata',raw,style,state);}}
        else stack.push({parent:value,key:k,path:p});
      }
    }
    yield;
  }
}
function redactConversation(conv,style='standard',strict=false,options={}){const clone=structuredClone(conv),state=redactionState(options);for(const _ of redactionSteps(clone,state,style,strict)){}return{conv:clone,stats:state.stats,matches:state.matches,total:state.total,style,strict,ruleVersion:REDACTION_RULE_VERSION,candidateTotal:state.candidateTotal,candidateStats:state.candidateStats,complete:state.complete};}

  const plain=m=>{let s=String(m?.text||'');for(const b of(m?.content||[]))if(b&&typeof b==='object')s+=' '+String(b.text||b.thinking||b.content||'');return s.replace(/\s+/g,' ').trim();};
  const hasType=(m,re)=>((m?.content||[]).some(b=>b&&re.test(String(b.type||'')+' '+String(b.name||''))));
  async function quality(data,checkpoint){const msgs=Array.isArray(data?.messages)?data.messages:[],title=String(data?.title||''),issues=[],counts={empty:0,repeated:0,truncated:0,toolOnly:0,refusal:0,refusalAlternative:0,fallback:0,reverse:0,orphan:0,incompleteAttachment:0,unparseable:0,latency:0,internalMetadata:0};let prevTime=0,prevAssistant='';const ids=new Set(msgs.map(m=>m.uuid));let processed=0;
    const securityTitle=/(安全|网安|漏洞|CVE|XSS|SQL|RCE|渗透|提权|木马|恶意|钓鱼|凭证|密码|入侵|攻击|payload|exploit|shell|WAF|防火墙|越狱|SSH|RDP|端口|API|代理|DNS|爬虫)/iu;
    const refusal=/((?:我|我们)?\s*(?:没办法|不能|无法|不可以|不便|不予|拒绝|不协助|不提供|不帮助|抱歉)[^。！？\n]{0,120}(?:帮|为你|提供|协助|回答|完成|执行|生成|教|绕过|提取|破解|攻击|入侵|密码|锁屏|加密数据|请求|任务))|(\b(?:can't|cannot|won't) +(?:help|assist|provide|comply|create|generate|bypass|extract|do that)\b)|(\b(?:unable to|i can’t|i cannot)\s+(?:help|assist|provide|comply|create|generate|bypass|extract)\b)/iu;
    const fallback=/\b(as an ai|language model|try again later|model limitation|not available in this mode)\b|(?:当前|暂时|目前|受限于当前模型|这个模型)?(?:无法访问|功能受限|服务受限|能力有限|降级模式|不具备(?:执行|访问|处理|完成)[^。！？\n]{0,24}能力)|(?:我只能|我目前只能|只能提供)[^。！？\n]{0,18}(?:概括|一般性信息|高层次建议)/iu,truncated=/(\.\.\.|…|回答未完|to be continued|继续$)/i;
    for(const m of msgs){if(processed++%128===0)await checkpoint();const text=plain(m),time=Date.parse(m.created_at||m.updated_at||'')||0;if(m.sender!=='system'){if(time&&prevTime&&time<prevTime&&(!m.parent_message_uuid||m.parent_message_uuid===msgs[processed-2]?.uuid)){counts.reverse++;issues.push({kind:'reverse',uuid:m.uuid,label:'时间倒序'});}if(time)prevTime=time;}
      if(!text&&m.sender!=='system'&&!hasType(m,/tool|thinking|result|image|injected/i)){counts.empty++;issues.push({kind:'empty',uuid:m.uuid,label:'空消息'});}
      if(m.parent_message_uuid&&!ids.has(m.parent_message_uuid)&&m.parent_message_uuid!==ROOT_ID&&m.parent_message_uuid!=='00000000-0000-0000-0000-000000000000'){counts.orphan++;issues.push({kind:'orphan',uuid:m.uuid,label:'孤立消息'});}
      if(m.sourcePlatform==='gpt'&&['thoughts','reasoning_recap'].includes(m.contentType))continue;
      if(m.sender==='assistant'){if(text&&text===prevAssistant){counts.repeated++;issues.push({kind:'repeated',uuid:m.uuid,label:'重复回答'});}const directRefusal=/\b(?:can't|cannot|won't)\s+do that\b/i.test(text);const refusalHit=refusal.test(text)&&(directRefusal||securityTitle.test(title)||/(请求|任务|帮|提供|协助|生成|绕过|提取|锁屏|加密数据)/u.test(text));if(refusalHit){counts.refusal++;const alternative=/(合法|安全替代|可以尝试|建议|改为|官方|防御|恢复出厂|维修店)/u.test(text);if(alternative){counts.refusalAlternative++;issues.push({kind:'refusalAlternative',uuid:m.uuid,label:'拒答并给出替代方案'});}else issues.push({kind:'refusal',uuid:m.uuid,label:'疑似拒答'});}if(fallback.test(text)){counts.fallback++;issues.push({kind:'fallback',uuid:m.uuid,label:'疑似降级回答'});}if(truncated.test(text)){counts.truncated++;issues.push({kind:'truncated',uuid:m.uuid,label:'被截断回答'});}if(!text&&hasType(m,/tool|server_tool/)){counts.toolOnly++;issues.push({kind:'toolOnly',uuid:m.uuid,label:'仅工具无正文'});}prevAssistant=text;}
      for(const a of(m.attachments||m.files||[])){if(!a||!(a.file_name||a.name||a.file_id||a.data||a.content)){counts.incompleteAttachment++;issues.push({kind:'attachment',uuid:m.uuid,label:'不完整附件'});}}
      if((m.content||[]).some(b=>!b||typeof b!=='object'||!b.type)){counts.unparseable++;issues.push({kind:'unparseable',uuid:m.uuid,label:'不可解析内容块'});}
      const raw=JSON.stringify(m);if(/"(?:safety|moderation|policy|risk|flag|restriction|model_tier|stop_reason|internal_metadata)"\s*:/i.test(raw)){counts.internalMetadata++;issues.push({kind:'internalMetadata',uuid:m.uuid,label:'内部元数据'});}
    }
    for(let i=1;i<msgs.length;i++){const a=Date.parse(msgs[i-1].created_at||'')||0,b=Date.parse(msgs[i].created_at||'')||0;if(msgs[i-1].sender==='human'&&msgs[i].sender==='assistant'&&a&&b&&b-a>30*60*1000&&(!msgs[i].parent_message_uuid||msgs[i].parent_message_uuid===msgs[i-1].uuid)){counts.latency++;issues.push({kind:'latency',uuid:msgs[i].uuid,label:'回复延迟异常'});}}
    return {counts,issues};
  }
  async function behavior(records,checkpoint){
    const out={conversations:0,messages:0,tools:0,toolResults:0,paired:0,unpairedUse:0,unpairedResult:0,errors:0,approvals:0,mcp:0,structured:0,hiddenResults:0,thinking:0,thinkingHidden:0,thinkingTruncated:0,thinkingCutoff:0,thinkingSummary:0,thinkingSigned:0,thinkingDurationMs:0,quality:{refusal:0,fallback:0,latency:0,empty:0,truncated:0},examples:[]};
    const cc={sessions:0,subagentSessions:0,agentTypes:{},models:{},telemetry:{recordTypes:{},attachmentTypes:{},apiRequests:0,querySources:{},efforts:{},thinkingConfigs:{},betas:{},cacheControlBreakpoints:0},refusals:{stopRefusal:0,syntheticErrors:0,safeguardNotices:0,noFallback:0,apiErrors:0,userInterrupts:0,categories:{}},fallbacks:{modelSwaps:{},modelSwapCount:0,fallbackCreditRequests:0,noFallbackCount:0},interceptors:{serverClassifierRequests:0,serverClassifierRefusals:0,autoModeDenials:0,autoModeRules:{},hookBlocks:0,stopHooksPrevented:0,hookErrors:0,manualDenials:0,autoModeProfiles:{},modes:{},permissionModes:{}},efficiency:{totalCostUSD:0,costSessions:0,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheCreateTokens:0,linesAdded:0,linesRemoved:0,apiDurationMs:0,apiNoRetryMs:0,retryOverheadMs:0,toolDurationMs:0,totalDurationMs:0},compaction:{boundaries:0,microBoundaries:0,preTokensSum:0,preTokensMax:0,preTokensCount:0,queuedPrompts:0},events:[]};
    const ag={sessions:0,brainOnlySessions:0,models:{},transcriptSources:{},totalSteps:0,truncatedSteps:0,runningSteps:0,errorSteps:0,maxPlannerStreak:0,runawaySessions:0,notifyGates:0,taskBoundaryCount:0,subagentSpawns:0,pbSkipped:0,artifactsCount:0,bookmarksCount:0,phases:{PLANNING:0,EXECUTION:0,VERIFICATION:0,OTHER:0},tokens:{input:0,output:0,cached:0,total:0},toolCounts:{},toolErrorCounts:{},events:[]};
    const gem={sessions:0,subagentSessions:0,models:{},rewindCount:0,patchCount:0,setCount:0,filesModifiedCount:0,toolStatusCounts:{success:0,error:0,cancelled:0,awaiting_approval:0,other:0},toolNameCounts:{},tokens:{input:0,output:0,cached:0,thoughts:0,tool:0,total:0},events:[]};
    const mergeMap=(target,src)=>{if(!src||typeof src!=='object')return;for(const [k,v]of Object.entries(src))if(typeof v==='number'&&Number.isFinite(v))target[k]=(target[k]||0)+v;};
    const stable=value=>{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const result={};for(const key of Object.keys(value).sort())result[key]=stable(value[key]);return result;}return value;},different=(a,b)=>JSON.stringify(stable(a))!==JSON.stringify(stable(b));
    const uses=new Map(),results=new Map(),refusal=/(?:我(?:不能|无法|不可以|不会)(?:帮助|协助|提供|执行|生成|完成)|抱歉[^。！？\n]{0,40}(?:不能|无法)|\b(?:can't|cannot|won't|unable to)\s+(?:help|assist|provide|comply|create|generate|do that)\b)/iu,fallback=/(?:当前模型|这个模型|能力受限|降级模式|只能提供[^。！？\n]{0,18}(?:概括|一般性信息|高层次建议))|\b(?:as an ai|language model|model limitation|not available in this mode)\b/iu;
    for await(const record of records){out.conversations++;const conversation=JSON.parse(record.raw),messages=list(conversation.chat_messages);out.messages+=messages.length;
      if(conversation.sourcePlatform==='antigravity'){
        ag.sessions++;const meta=conversation.antigravityMeta||{},tel=conversation.antigravityTelemetry||{};
        if(meta.transcriptSource){const tsKey=String(meta.transcriptSource);ag.transcriptSources[tsKey]=(ag.transcriptSources[tsKey]||0)+1;if(tsKey==='brain_only')ag.brainOnlySessions++;}
        if(conversation.defaultModel){const dm=String(conversation.defaultModel);ag.models[dm]=(ag.models[dm]||0)+1;}
        for(const m of list(tel.modelSwitches))ag.models[m]=(ag.models[m]||0)+1;
        ag.totalSteps+=Number(tel.totalSteps||0);ag.truncatedSteps+=Number(tel.truncatedSteps||0);ag.runningSteps+=Number(tel.runningSteps||0);ag.errorSteps+=Number(tel.errorSteps||0);
        const streak=Number(tel.maxPlannerStreak||0);if(streak>ag.maxPlannerStreak)ag.maxPlannerStreak=streak;if(streak>=8)ag.runawaySessions++;
        ag.notifyGates+=Number(tel.notifyGates||0);ag.taskBoundaryCount+=Number(tel.taskBoundaryCount||0);ag.subagentSpawns+=Number(tel.subagentSpawns||0);
        if(Number(tel.pbSkipped||0)>ag.pbSkipped)ag.pbSkipped=Number(tel.pbSkipped||0);
        ag.artifactsCount+=list(meta.brainArtifacts).length;ag.bookmarksCount+=list(meta.urlBookmarks).length;
        mergeMap(ag.phases,tel.phases);mergeMap(ag.tokens,tel.tokens);mergeMap(ag.toolCounts,tel.toolCounts);mergeMap(ag.toolErrorCounts,tel.toolErrorCounts);
        for(const ev of list(tel.events))ag.events.push({uuid:conversation.uuid,title:conversation.name||'',...ev});
      }
      if(conversation.sourcePlatform==='gemini_cli'){
        gem.sessions++;const tel=conversation.geminiCliTelemetry||{};
        if(tel.isSubagent)gem.subagentSessions++;
        if(conversation.defaultModel){const dm=String(conversation.defaultModel);gem.models[dm]=(gem.models[dm]||0)+1;}
        for(const m of list(tel.models))if(m&&m!==conversation.defaultModel)gem.models[m]=(gem.models[m]||0)+1;
        gem.rewindCount+=Number(tel.rewindCount||0);gem.patchCount+=Number(tel.patchCount||0);gem.setCount+=Number(tel.setCount||0);gem.filesModifiedCount+=Number(tel.filesModifiedCount||0);
        mergeMap(gem.toolStatusCounts,tel.toolStatusCounts);mergeMap(gem.toolNameCounts,tel.toolNameCounts);mergeMap(gem.tokens,tel.tokens);
        for(const ev of list(tel.events))gem.events.push({uuid:conversation.uuid,title:conversation.name||'',...ev});
      }
      if(conversation.sourcePlatform==='claude_code'){
        cc.sessions++;const meta=conversation.claudeCodeMeta||{},tel=conversation.claudeCodeTelemetry||{};
        if(meta.isSubagent){cc.subagentSessions++;const at=String(meta.agentType||meta.agentNickname||'subagent');cc.agentTypes[at]=(cc.agentTypes[at]||0)+1;}
        if(conversation.defaultModel){const dm=String(conversation.defaultModel);cc.models[dm]=(cc.models[dm]||0)+1;}
        if(typeof meta.totalCostUSD==='number'&&Number.isFinite(meta.totalCostUSD)){cc.efficiency.totalCostUSD+=meta.totalCostUSD;cc.efficiency.costSessions++;}
        if(typeof meta.totalLinesAdded==='number')cc.efficiency.linesAdded+=meta.totalLinesAdded;
        if(typeof meta.totalLinesRemoved==='number')cc.efficiency.linesRemoved+=meta.totalLinesRemoved;
        if(meta.usage){cc.efficiency.inputTokens+=Number(meta.usage.input_tokens||0);cc.efficiency.outputTokens+=Number(meta.usage.output_tokens||0);cc.efficiency.cacheReadTokens+=Number(meta.usage.cache_read_input_tokens||0);cc.efficiency.cacheCreateTokens+=Number(meta.usage.cache_creation_input_tokens||0);}
        mergeMap(cc.telemetry.recordTypes,tel.recordTypes);mergeMap(cc.telemetry.attachmentTypes,tel.attachmentTypes);
        if(tel.apiRequests){cc.telemetry.apiRequests+=Number(tel.apiRequests.total||0);cc.telemetry.cacheControlBreakpoints+=Number(tel.apiRequests.cacheControlBreakpoints||0);cc.fallbacks.fallbackCreditRequests+=Number(tel.apiRequests.fallbackCreditRequests||0);mergeMap(cc.telemetry.querySources,tel.apiRequests.querySources);mergeMap(cc.telemetry.efforts,tel.apiRequests.efforts);mergeMap(cc.telemetry.thinkingConfigs,tel.apiRequests.thinkingConfigs);mergeMap(cc.telemetry.betas,tel.apiRequests.betas);}
        if(tel.refusals){cc.refusals.stopRefusal+=Number(tel.refusals.stopRefusal||0);cc.refusals.syntheticErrors+=Number(tel.refusals.syntheticErrors||0);cc.refusals.safeguardNotices+=Number(tel.refusals.safeguardNotices||0);cc.refusals.noFallback+=Number(tel.refusals.noFallback||0);cc.refusals.apiErrors+=Number(tel.refusals.apiErrors||0);cc.refusals.userInterrupts+=Number(tel.refusals.userInterrupts||0);mergeMap(cc.refusals.categories,tel.refusals.categories);}
        if(tel.fallbacks){cc.fallbacks.modelSwapCount+=Number(tel.fallbacks.modelSwapCount||0);cc.fallbacks.noFallbackCount+=Number(tel.fallbacks.noFallbackCount||0);mergeMap(cc.fallbacks.modelSwaps,tel.fallbacks.modelSwaps);}
        if(tel.interceptors){cc.interceptors.serverClassifierRequests+=Number(tel.interceptors.serverClassifierRequests||0);cc.interceptors.serverClassifierRefusals+=Number(tel.interceptors.serverClassifierRefusals||0);cc.interceptors.autoModeDenials+=Number(tel.interceptors.autoModeDenials||0);cc.interceptors.hookBlocks+=Number(tel.interceptors.hookBlocks||0);cc.interceptors.stopHooksPrevented+=Number(tel.interceptors.stopHooksPrevented||0);cc.interceptors.hookErrors+=Number(tel.interceptors.hookErrors||0);cc.interceptors.manualDenials+=Number(tel.interceptors.manualDenials||0);mergeMap(cc.interceptors.autoModeRules,tel.interceptors.autoModeRules);
          for(const m of list(tel.interceptors.modes))cc.interceptors.modes[m]=(cc.interceptors.modes[m]||0)+1;
          for(const pm of list(tel.interceptors.permissionModes))cc.interceptors.permissionModes[pm]=(cc.interceptors.permissionModes[pm]||0)+1;
          if(tel.interceptors.autoModeConfig){const ac=tel.interceptors.autoModeConfig,pKey=[ac.bashFirst?'bashFirst':'',ac.bashFirstSteer?'steer:'+ac.bashFirstSteer:'',ac.steerOnly?'steerOnly':'',ac.bypass?'bypass':''].filter(Boolean).join(', ')||'default';cc.interceptors.autoModeProfiles[pKey]=(cc.interceptors.autoModeProfiles[pKey]||0)+1;}
        }
        if(tel.compaction){cc.compaction.boundaries+=Number(tel.compaction.boundaries||0);cc.compaction.microBoundaries+=Number(tel.compaction.microBoundaries||0);cc.compaction.preTokensSum+=Number(tel.compaction.preTokensSum||0);cc.compaction.preTokensMax=Math.max(cc.compaction.preTokensMax,Number(tel.compaction.preTokensMax||0));cc.compaction.preTokensCount+=Number(tel.compaction.preTokensCount||0);cc.compaction.queuedPrompts+=Number(tel.compaction.queuedPrompts||0);}
        if(tel.costTiming){cc.efficiency.apiDurationMs+=Number(tel.costTiming.apiDurationMs||0);cc.efficiency.apiNoRetryMs+=Number(tel.costTiming.apiNoRetryMs||0);cc.efficiency.retryOverheadMs+=Number(tel.costTiming.retryOverheadMs||0);cc.efficiency.toolDurationMs+=Number(tel.costTiming.toolDurationMs||0);cc.efficiency.totalDurationMs+=Number(tel.costTiming.totalDurationMs||0);}
        for(const ev of list(tel.events))cc.events.push({uuid:conversation.uuid,title:conversation.name||'',...ev});
      }
      let previous=null,processed=0;for(const message of messages){if(processed++%128===0)await checkpoint();const text=messageText(message).trim(),time=Date.parse(message.created_at||message.updated_at||'')||0;if(!text&&message.sender!=='system'&&!list(message.content).some(block=>/tool|thinking|result|image|injected/i.test(String(block?.type||''))))out.quality.empty++;if(message.sender==='assistant'){if(refusal.test(text))out.quality.refusal++;if(fallback.test(text))out.quality.fallback++;if(/(?:\.\.\.|…|回答未完|to be continued)$/i.test(text))out.quality.truncated++;if(previous?.sender==='human'&&previous.time&&time&&time-previous.time>30*60*1000)out.quality.latency++;}previous={sender:message.sender,time};
        for(const block of list(message.content)){if(!block||typeof block!=='object')continue;const type=String(block.type||'');if(type==='tool_use'||type==='server_tool_use'){out.tools++;const id=block.id||block.tool_use_id;if(id)uses.set(id,true);if(block.approval_key||block.approval_key_legacy||block.approval_options)out.approvals++;if(block.is_mcp_app||block.mcp_server_url||block.integration_name)out.mcp++;if(out.examples.length<8)out.examples.push({name:block.name||block.tool_identifier||'unknown',status:'调用'});}else if(type==='tool_result'||type==='web_search_tool_result'||type==='web_search_result'){out.toolResults++;const id=block.tool_use_id||block.id;if(id)results.set(id,true);if(block.is_error)out.errors++;if(block.structured_content||block.meta)out.structured++;const hasDisplay=block.display_content!==undefined&&block.display_content!==null,hasContent=block.content!==undefined&&block.content!==null;if((hasDisplay&&hasContent&&different(block.display_content,block.content))||(!hasDisplay&&(block.structured_content||block.meta)))out.hiddenResults++;}else if(type==='thinking'){out.thinking++;if(block.hidden||block.thinking_hidden)out.thinkingHidden++;if(block.truncated||block.cut_off)out.thinkingTruncated++;if(block.cut_off)out.thinkingCutoff++;if(block.summaries||block.alternative_display_type)out.thinkingSummary++;if(block.signature)out.thinkingSigned++;if(typeof block.duration_ms==='number'&&Number.isFinite(block.duration_ms)&&block.duration_ms>0)out.thinkingDurationMs+=block.duration_ms;else{const start=Date.parse(block.start_timestamp),stop=Date.parse(block.stop_timestamp);if(start&&stop&&stop>=start)out.thinkingDurationMs+=stop-start;}}}
      }}
    const sevRank={high:3,warn:2,info:1};
    cc.events.sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0)||String(b.ts||'').localeCompare(String(a.ts||'')));
    if(cc.events.length>40)cc.events.length=40;
    if(cc.sessions>0)out.claudeCode=cc;
    ag.events.sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0)||String(b.ts||'').localeCompare(String(a.ts||'')));
    if(ag.events.length>40)ag.events.length=40;
    if(ag.sessions>0)out.antigravity=ag;
    gem.events.sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0)||String(b.ts||'').localeCompare(String(a.ts||'')));
    if(gem.events.length>40)gem.events.length=40;
    if(gem.sessions>0)out.geminiCli=gem;
    for(const id of uses.keys())if(results.has(id))out.paired++;else out.unpairedUse++;for(const id of results.keys())if(!uses.has(id))out.unpairedResult++;return out;
  }

async function markdown(conv,mode,choices,checkpoint){  // Build linear thread (same logic as renderMessages)
  const msgs=conv.chat_messages||[];
  const linear=tree(conv,mode,choices).messages.flatMap(message=>message._warning?[message._warning,message]:[message]); // 与当前浏览模式保持一致
  const msgCount=linear.filter(m=>m&&!m._divider).length;

  let md='# '+((conv.name||t('对话')).replace(/[<>]/g,''))+'\n\n';
  md+='> '+t('创建时间')+': '+fmtDate(conv.created_at)+' · '+t('更新时间')+': '+fmtDate(conv.updated_at)+' · '+t('消息数')+': '+msgCount+'\n\n';
  if(conv.summary)md+='## '+t('摘要')+'\n\n'+conv.summary+'\n\n---\n\n';
  md+='## '+t('对话内容')+'\n\n';

  let processed=0;for(const msg of linear){if(processed++%128===0)await checkpoint();
    if(!msg||typeof msg!=='object')continue;
    if(msg._divider==='linear'){md+='## ⚠️ '+t('对话分支结构异常，已按时间顺序展示全部消息')+'\n\n';continue;}
    if(msg._divider==='orphan'){md+='## 🧩 '+t('以下消息无法归入对话分支（可能是已删除分支的残留）')+' ('+msg.count+')\n\n';continue;}
    const role='**'+(msg.sender==='human'?t('你'):msg.sender==='assistant'?(conv.sourcePlatform==='gpt'?'ChatGPT':conv.sourcePlatform==='grok'?'Grok':conv.sourcePlatform==='perplexity'?'Perplexity':conv.sourcePlatform==='codex'?'Codex':conv.sourcePlatform==='claude_code'?'Claude Code':conv.sourcePlatform==='antigravity'?'Antigravity':conv.sourcePlatform==='gemini_cli'?'Gemini CLI':'Claude'):msg.sender)+'**';
    md+=role+' · '+fmtTime(msg.created_at)+'\n\n';
    // Attachments
    for(const att of[...(msg.attachments||[]),...(msg.files||[])]){
      md+='> 📎 '+t('附件')+': '+(att.file_name||att.name||t('文件'))+'\n\n';
    }
    // Content blocks
    const content=msg.content||[];
    let hasContent=false;
    for(const b of content){
      if(!b||typeof b!=='object')continue;
      if(b.type==='text'){md+=(b.text||'')+'\n\n';hasContent=true;}
      else if(b.type==='thinking'){md+='<details>\n<summary>💭 '+t('思考过程')+'</summary>\n\n'+(b.thinking||'')+'\n\n</details>\n\n';hasContent=true;}
      else if(b.type==='tool_use'){md+='> ⚙ '+t('工具调用')+': `'+(b.name||'unknown')+'`'+(b.message?' — '+b.message:'')+'\n\n';hasContent=true;}
      else if(b.type==='tool_result'){md+='> ✅ '+t('工具结果')+': `'+(b.name||'')+'`\n\n';hasContent=true;}
      else if(b.type==='injected_prompt_block'){md+='<details>\n<summary>'+t('注入上下文')+' · '+esc(b.injection_source||'')+'</summary>\n\n'+(b.prompt||'')+'\n\n</details>\n\n';hasContent=true;}
    }
    if(!hasContent&&msg.text)md+=msg.text+'\n\n';
    md+='---\n\n';
  }
  const agMeta=conv.antigravityMeta;
  if(agMeta&&Array.isArray(agMeta.brainArtifacts)&&agMeta.brainArtifacts.length){
    md+='## Brain Artifacts\n\n';
    for(const art of agMeta.brainArtifacts){
      md+='### '+art.name+'\n\n'+(art.content||'')+'\n\n';
    }
  }
  if(agMeta&&Array.isArray(agMeta.urlBookmarks)&&agMeta.urlBookmarks.length){
    md+='## URL Bookmarks\n\n';
    for(const u of agMeta.urlBookmarks){
      md+='- ['+(u.title||u.url)+']('+u.url+')'+(u.description?' — '+u.description:'')+'\n';
    }
    md+='\n';
  }


return md;}
function safeLinkUrl(value){
  const raw=String(value||'').trim();
  if(!raw||/[\u0000-\u0020\u007f]/.test(raw))return '';
  try{const url=new URL(raw);return /^(https?:|mailto:|tel:|blob:)$/.test(url.protocol)?url.href:'';}catch{return '';}
}
function safeImageUrl(value){
  const raw=String(value||'');
  return /^blob:/i.test(raw)||/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(raw)?raw:'';
}
function importedLink(url,label){
  const href=safeLinkUrl(url);
  return href?'<a href="'+escAttr(href)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+esc(label)+'</a>':esc(label);
}


function configureMarked(){
  if(markedConfigured||typeof marked==='undefined')return;
  markedConfigured=true;
  marked.setOptions({breaks:true,gfm:true});
  const renderer=new marked.Renderer();
  const ALERT_ICONS={
    note:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5h.01"/></svg>',
    tip:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5h4M6.5 14.5h3M5.5 10.2C4.3 9.3 3.8 8 3.8 6.5a4.2 4.2 0 1 1 8.4 0c0 1.5-.5 2.8-1.7 3.7-.4.3-.7.8-.7 1.3H6.2c0-.5-.3-1-.7-1.3z"/></svg>',
    important:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v8A1.5 1.5 0 0 1 11.5 13H6l-3 2V3.5z"/><path d="M8 5.2v3.3M8 10.6h.01"/></svg>',
    warning:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.1 2.7L1.7 12a1 1 0 0 0 .9 1.5h10.8a1 1 0 0 0 .9-1.5L8.9 2.7a1 1 0 0 0-1.8 0z"/><path d="M8 6.3v3M8 11.4h.01"/></svg>',
    caution:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 2h5l3.5 3.5v5L10.5 14h-5L2 10.5v-5L5.5 2z"/><path d="M8 5.4v3.4M8 11h.01"/></svg>'
  };
  const ALERT_LABELS={note:'Note',tip:'Tip',important:'Important',warning:'Warning',caution:'Caution'};
  renderer.html=function(html){
    const raw=html&&typeof html==='object'?html.text:html;
    return esc(raw==null?'':raw);
  };
  renderer.link=function(token){
    const label=this.parser.parseInline(token.tokens||[]),href=safeLinkUrl(token.href);
    return href?'<a href="'+escAttr(href)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"'+(token.title?' title="'+escAttr(token.title)+'"':'')+'>'+label+'</a>':label;
  };
  renderer.image=function(token){
    const src=safeImageUrl(token.href),label=token.text||t('图片');
    if(src)return '<img src="'+escAttr(src)+'" alt="'+escAttr(label)+'"'+(token.title?' title="'+escAttr(token.title)+'"':'')+'>';
    return '<span class="img-placeholder">🖼 '+esc(t('外部图片不会自动加载'))+' · '+importedLink(token.href,label)+'</span>';
  };
  renderer.blockquote=function(token){
    const body=typeof token==='string'?token:this.parser.parse(token?.tokens||[]);
    const match=body.match(/^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*<br\s*\/?>|[ \t]*\n|[ \t]+|(?=<\/p>))([\s\S]*)$/i);
    if(!match)return '<blockquote>'+body+'</blockquote>\n';
    const kind=match[1].toLowerCase();
    const cleaned=('<p>'+match[2]).replace(/^<p>\s*<\/p>\s*/,'');
    return '<div class="md-alert md-alert-'+kind+'"><div class="md-alert-title"><span class="md-alert-icon" aria-hidden="true">'+(ALERT_ICONS[kind]||ALERT_ICONS.note)+'</span><span>'+(ALERT_LABELS[kind]||kind)+'</span></div><div class="md-alert-body">'+cleaned+'</div></div>\n';
  };
  renderer.code=function(code,lang){
    // marked v5+ passes a token object {text,lang,escaped}; older versions pass (code,lang) directly
    let rawCode, l;
    if(code&&typeof code==='object'){
      rawCode=code.text||'';
      l=(code.lang||lang||'').trim();
    } else {
      rawCode=String(code||'');
      l=(lang||'').trim();
    }
    l=String(l).split(/\s/,1)[0];
    const safeCode=esc(rawCode);
    if(l==='mermaid')return '<div class="visual" data-vkind="mermaid" data-vcode="'+escAttr(encodeURIComponent(rawCode))+'" data-vtitle="'+escAttr(t('流程图'))+'"><div class="vcap"><span class="vtitle">'+esc(t('流程图'))+'</span><span class="vcap-actions"><button class="vdl" type="button" data-ui-click="open-canvas-inline">'+esc(t('画布'))+'</button></span></div><div class="mermaid">'+safeCode+'</div><details class="vsrc"><summary>'+t('查看 Mermaid 源码')+'</summary><pre><code>'+safeCode+'</code></pre></details></div>';
    const id='cb_'+Math.random().toString(36).slice(2);codes.set(id,rawCode);
    const highlighted=rawCode.length<=65536&&typeof hljs!=='undefined'&&l&&hljs.getLanguage(l)
      ?hljs.highlight(rawCode,{language:l}).value
      :safeCode;
    const lineCount=rawCode?rawCode.replace(/\n$/,'').split('\n').length:0;
    const langKey=(l||'plain').toLowerCase();
    return '<div class="code-block" data-code-lines="'+lineCount+'">'
      +'<div class="code-block-header">'
      +'<span class="code-lang-dot" data-lang="'+escAttr(langKey)+'" aria-hidden="true"></span>'
      +'<span class="code-lang">'+esc(l)+'</span>'
      +'<div class="code-actions">'
      +(lineCount?'<span class="code-line-count">'+lineCount+'L</span>':'')
      +'<button type="button" class="code-action-btn" data-ui-click="code-wrap" aria-pressed="false" title="'+escAttr(t('自动换行'))+'">Wrap</button>'
      +'<button type="button" class="code-action-btn" data-ui-click="code-lines" aria-pressed="false" title="'+escAttr(t('行号'))+'">#</button>'
      +'<button type="button" class="code-action-btn" data-ui-click="code-canvas" data-ui-value="'+id+'" data-code-lang="'+escAttr(l)+'" title="'+escAttr(t('在画布中打开'))+'">Canvas</button>'
      +(lineCount>32?'<button type="button" class="code-action-btn" data-ui-click="code-collapse" aria-expanded="true" title="'+escAttr(t('折叠代码'))+'">'+esc(t('折叠'))+'</button>':'')
      +'<button type="button" class="copy-btn" data-ui-click="copy-code" data-ui-value="'+id+'">'+t('复制')+'</button>'
      +'</div>'
      +'</div>'
      +'<div class="code-body"><div class="code-gutter" aria-hidden="true"></div><pre><code id="'+id+'" class="'+(l?'language-'+escAttr(l):'')+'">'+highlighted+'</code></pre></div>'
      +'</div>';
  };
  const baseTable=marked.Renderer.prototype.table;
  renderer.table=function(token){
    return '<div class="table-scroll">'+baseTable.call(this,token)+'</div>';
  };
  marked.setOptions({renderer});
}


const trees=new WeakMap();
function tree(conv,mode='longest',choices={}){
  const messages=conv.chat_messages||[];
  if(mode!=='full'&&(conv.sourcePlatform==='gpt'||conv.sourcePlatform==='grok'||conv.sourcePlatform==='gemini_cli')&&conv.defaultPath?.length){const defaults={};const groups=new Map();for(const message of messages){const parent=message.parent_message_uuid||ROOT_ID;if(!groups.has(parent))groups.set(parent,[]);groups.get(parent).push(message);}for(const siblings of groups.values())siblings.sort((a,b)=>(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0));const preferred=new Set(conv.defaultPath);for(const [parent,siblings]of groups){const selected=siblings.findIndex(message=>preferred.has(message.uuid));if(selected>=0)defaults[parent]=selected;}choices={...defaults,...choices};}
  let index=trees.get(messages);
  if(!index){
    const byId=new Map(),children=new Map(),roots=[],times=messages.map(m=>Date.parse(m?.created_at||'')||0);
    messages.forEach((m,i)=>{if(m?.uuid&&!byId.has(m.uuid))byId.set(m.uuid,i);});
    messages.forEach((m,i)=>{const parent=byId.get(m?.parent_message_uuid);if(parent===undefined||parent===i)roots.push(i);else{if(!children.has(parent))children.set(parent,[]);children.get(parent).push(i);}});
    const sort=a=>a.sort((a,b)=>times[a]-times[b]||a-b);sort(roots);for(const a of children.values())sort(a);
    const depth=new Map(),color=new Set();
    for(let i=0;i<messages.length;i++){
      const stack=[[i,false]];
      while(stack.length){const [id,done]=stack.pop();if(depth.has(id))continue;if(done){let d=1;for(const child of children.get(id)||[])if(depth.has(child))d=Math.max(d,1+depth.get(child));depth.set(id,d);color.delete(id);continue;}if(color.has(id))continue;color.add(id);stack.push([id,true]);for(const child of children.get(id)||[])if(!color.has(child)&&!depth.has(child))stack.push([child,false]);}
    }
    index={byId,children,roots,times,depth};trees.set(messages,index);
  }
  const {children,roots,times,depth}=index,ids=[],depths=new Map(),navigation={},seen=new Set();let warning=null,orphanStart=-1,orphanCount=0;
  const push=(id,d)=>{seen.add(id);ids.push(id);depths.set(id,d);};
  if(mode==='full'){
    const stack=roots.map(id=>[id,0]).reverse();
    while(stack.length){const [id,d]=stack.pop();if(seen.has(id))continue;push(id,d);for(const child of [...(children.get(id)||[])].reverse())stack.push([child,d+1]);}
    messages.forEach((_,id)=>{if(!seen.has(id))push(id,0);});
  }else{
    const canonical='00000000-0000-4000-8000-000000000000';
    let siblings=roots.filter(id=>(messages[id]?.parent_message_uuid||canonical)===canonical),key=canonical;
    if(!siblings.length){warning='linear';messages.map((_,id)=>id).sort((a,b)=>times[a]-times[b]||a-b).forEach(id=>push(id,0));}
    else{
      while(siblings.length){let selected=choices[key];if(selected===undefined){selected=0;for(let i=1;i<siblings.length;i++){const a=siblings[i],b=siblings[selected],content=m=>!!(m?.text||m?.content?.some(b=>b?.type==='text'&&b.text));if((depth.get(a)||0)>(depth.get(b)||0)||depth.get(a)===depth.get(b)&&content(messages[a])&&!content(messages[b]))selected=i;}}selected=Math.max(0,Math.min(siblings.length-1,selected));const id=siblings[selected];if(seen.has(id))break;push(id,0);if(siblings.length>1)navigation[id]={key,index:selected,count:siblings.length};key=messages[id]?.uuid||String(id);siblings=children.get(id)||[];}
      const reachable=new Set(),stack=[...roots.filter(id=>(messages[id]?.parent_message_uuid||canonical)===canonical)];while(stack.length){const id=stack.pop();if(reachable.has(id))continue;reachable.add(id);for(const child of children.get(id)||[])stack.push(child);}
      const orphans=messages.map((_,id)=>id).filter(id=>!reachable.has(id)).sort((a,b)=>times[a]-times[b]||a-b);
      if(orphans.length>ids.length){warning='linear';ids.length=0;messages.map((_,id)=>id).sort((a,b)=>times[a]-times[b]||a-b).forEach(id=>push(id,0));}else{orphanStart=ids.length;orphanCount=orphans.length;for(const id of orphans)if(!seen.has(id))push(id,0);}
    }
  }
  return {ids,navigation,messages:ids.map((id,i)=>({...messages[id],_warning:i===0&&warning?{_divider:warning}:i===orphanStart&&orphanCount?{_divider:'orphan',count:orphanCount}:null,_sourceIndex:id,_treeDepth:depths.get(id)||0,_branch:navigation[id]||null}))};
}
async function redactAsync(conv,style,strict,checkpoint,preview=false,options={}){
  const state=redactionState(options);let n=0;
  for(const _ of redactionSteps(conv,state,style,strict)){await checkpoint({processed:++n});}
  return {...(!preview?{conv}:{}),stats:state.stats,matches:state.matches,total:state.total,style,strict,ruleVersion:REDACTION_RULE_VERSION,candidateTotal:state.candidateTotal,candidateStats:state.candidateStats,complete:state.complete};
}
function messageText(message){const parts=[message?.text||''];for(const b of list(message?.content)){if(typeof b?.text==='string')parts.push(b.text);if(typeof b?.thinking==='string')parts.push(b.thinking);if(typeof b?.content==='string')parts.push(b.content);if(b?.input?.query)parts.push(b.input.query);}return parts.join('\n');}
function* matches(text,needle){
  text=String(text);needle=String(needle).toLowerCase();if(!needle)return;
  const lower=text.toLowerCase();let starts=null,ends=null;
  // Lowercasing can expand a code point (e.g. dotted capital I). Locations remain source UTF-16 offsets.
  if(lower.length!==text.length){starts=[];ends=[];let offset=0;for(const point of text){const size=point.toLowerCase().length;for(let i=0;i<size;i++){starts.push(offset);ends.push(offset+point.length);}offset+=point.length;}}
  let at=0;while((at=lower.indexOf(needle,at))!==-1){const offset=starts?starts[at]:at,end=ends?ends[at+needle.length-1]:at+needle.length;yield{offset,length:end-offset};at+=needle.length;}
}
function markdownPlain(text){
  const tokens=marked.lexer(String(text||''));
  const plain=tokens=>tokens.map(token=>token.type==='code'?token.text:token.tokens?plain(token.tokens):token.items?token.items.map(item=>plain(item.tokens||[])).join('\n'):token.type==='table'?[...token.header,...token.rows.flat()].map(cell=>plain(cell.tokens||[])).join(' '):token.text||'').join('');
  return plain(tokens);
}
function searchFields(message){const fields=[];if(!message.content?.length&&message.text)fields.push({key:'text',text:markdownPlain(message.text)});for(let i=0;i<(message.content||[]).length;i++){const b=message.content[i];if(b?.type==='text')fields.push({key:'content.'+i+'.text',text:markdownPlain(b.text||'')});else if(b?.type==='thinking')fields.push({key:'content.'+i+'.thinking',text:String(b.thinking||'')});}return fields;}
function readArtifact(b){
  if(!b||typeof b!=='object')return null;
  const inp=(b.type==='tool_use'||b.type==='server_tool_use')?(b.input||{}):b;
  const mime=(inp.type||inp.mimeType||inp.media_type||'')+'';
  let code=inp.widget_code!=null?inp.widget_code
    :inp.content!=null?inp.content
    :inp.source!=null?inp.source
    :inp.code!=null?inp.code
    :inp.svg!=null?inp.svg
    :inp.html!=null?inp.html:'';
  if(typeof code!=='string')code=(code&&code.text)?code.text:'';
  const title=inp.title||inp.name||'';
  if(!code){
    const rc=b.content;
    if(Array.isArray(rc)){for(const x of rc){if(x&&typeof x.text==='string'&&x.text){code=x.text;break;}}}
    else if(typeof rc==='string')code=rc;
  }
  if(!code)return null;
  const t=code.trim();
  if(/svg\+xml/i.test(mime)||/^<svg[\s>]/i.test(t))return{kind:'svg',code,title};
  if(/mermaid/i.test(mime)||/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline)\b/.test(t))return{kind:'mermaid',code,title};
  if(/html/i.test(mime)||/^<!doctype html|^<html[\s>]/i.test(t)||/<(?:style|div|section|main|canvas|script|table|article)[\s>]/i.test(t))return{kind:'html',code,title};
  return null;
}

function extractHeredocFiles(cmd){
  const out=[];
  const re=/cat\s+>{1,2}\s*([^\s<]+)\s*<<\s*['"]?([A-Za-z0-9_]+)['"]?\s*\n([\s\S]*?)\n\2\b/g;
  let m;
  while((m=re.exec(cmd))){
    const path=m[1].replace(/['"]/g,''),body=m[3];
    if(path&&body&&body.length>1)out.push({path,name:path.split('/').pop(),content:body});
  }
  return out;
}

// ── 生成文件存储（blob URL，可下载/打开）──
const FILESTORE={};let _fid=0;

function prepare(message,offsets={},full=false){
  const copy=structuredClone(message),msg=copy,content=copy.content||[];
  // Modern exports duplicate body text at the top level; only content blocks are rendered.
  if(content.length)delete copy.text;
  const visuals=[],files=[],searchQueries=[],searchResults=[];
  for(const b of content){
    if(!b||typeof b!=='object')continue;
    const ty=b.type,nm=(b.name||'')+'';
    if((ty==='tool_use'||ty==='server_tool_use')&&/show_widget|visualize|imagine|artifact/i.test(nm)){
      const art=readArtifact(b);
      if(art){visuals.push(art);b._consumed=true;}
      continue;
    }
    if(ty==='tool_use'||ty==='server_tool_use'){
      if(/web_search|web_fetch/i.test(nm)){
        const q=(b.input||{}).query||(b.input||{}).url||'';
        if(q)searchQueries.push(q+'');
        b._consumed=true;continue;
      }
      const inp=b.input||{};
      const fcontent=inp.file_text!=null?inp.file_text
        :(typeof inp.content==='string'&&/^(create|write)/i.test(nm)?inp.content:null);
      const path=inp.path||inp.file_path||inp.filename||inp.output_path||'';
      if(/create_file|write_file|create/i.test(nm)&&fcontent!=null&&path){
        files.push({path,name:path.split('/').pop(),content:fcontent});
        b._consumed=true; // 文件卡片已完整承载（含全部内容），不再渲染原始工具块
      }else if(/bash/i.test(nm)&&typeof inp.command==='string'){
        extractHeredocFiles(inp.command).forEach(f=>files.push(f));
        // bash 命令本身是上下文，保留原始工具块
      }else if(/present_files|present_fs_item/i.test(nm)){
        const fps=inp.filepaths||inp.paths||inp.files||(path?[path]:[]);
        (Array.isArray(fps)?fps:[fps]).forEach(p=>{
          if(p&&!files.some(f=>f.path===p))files.push({path:p+'',name:(p+'').split('/').pop(),content:null});
        });
        b._consumed=true; // 路径列表已由文件卡片展示
      }
      continue;
    }
    if(ty==='tool_result'||ty==='web_search_tool_result'||ty==='web_search_result'){
      if(/web_search|web_fetch/i.test(nm)||ty!=='tool_result'){
        const items=Array.isArray(b.content)?b.content:(b.content?[b.content]:[]);
        for(const r of items){
          const x=r&&(r.url||r.title)?r:(r&&r.content);
          if(x&&(x.url||x.title))searchResults.push({title:x.title||x.url,url:x.url||''});
        }
        b._consumed=true; // 查询与来源已由搜索面板承载，不再渲染原始工具结果块（避免重复展示）
      }
    }
  }

copy._prepared={visuals,files,searchQueries,searchResults};
  const partial=(text,key,markdown=true)=>{
    const tokens=markdown?marked.lexer(String(text)).filter(token=>token.type!=='space'):[],singleCode=tokens.length===1&&tokens[0].type==='code'?tokens[0]:null;
    const plain=markdown?markdownPlain(text):String(text),offset=Math.max(0,Math.min(offsets[key]||0,Math.max(0,plain.length-1))),slice=plain.slice(offset,offset+32768);
    const id='cb_'+Math.random().toString(36).slice(2),language=String(singleCode?.lang||'').split(/\s/,1)[0];codes.set(id,singleCode?singleCode.text:plain);
    return {text:slice,html:'<pre class="reader-partial"><code id="'+id+'"'+(language?' data-large-code="'+id+'" data-language="'+escAttr(language)+'"':'')+'>'+esc(slice)+'</code></pre>',key,start:offset,end:offset+slice.length,total:plain.length};
  };
  if(copy.text){if(!full&&copy.text.length>65536){copy._partial=partial(copy.text,'text');copy.text=copy._partial.text;copy._html=copy._partial.html;}else copy._html=marked.parse(copy.text);}
  for(let i=0;i<(copy.content||[]).length;i++){
    const block=copy.content[i];if(!block||typeof block!=='object')continue;const key='content.'+i+'.'+(block.type==='thinking'?'thinking':'text');block._field=key;
    if(block.gptProgram){const stack=[...block.gptProgram.nodes];while(stack.length){const node=stack.pop();if(node.kind==='markdown'){node._html=marked.parse(String(node.text||''));node._inlineHtml=marked.parseInline(String(node.text||''));}if(node.children)stack.push(...node.children);}}
    if(block.type==='text'){if(!full&&String(block.text||'').length>65536){block._partial=partial(block.text,key);block.text=block._partial.text;block._html=block._partial.html;}else block._html=marked.parse(String(block.text||''));}
    else if(block.type==='thinking'){if(!full&&String(block.thinking||'').length>65536){block._partial=partial(block.thinking,key,false);block.thinking=block._partial.text;}else if(block.thinking)block._thinkingHtml=marked.parse(String(block.thinking));}
  }
  return copy;
}

return {get language(){return currentLang;},redactionOptions,redactionRuleVersion:REDACTION_RULE_VERSION,renderMarkdown:text=>marked.parse(String(text||'')),code:id=>codes.get(id)||'',clearCodes:()=>codes.clear(),parseDesignExports,configure(context={}){currentLang=context.lang||'zh';labels=context.labels||{};if(typeof marked!=='undefined')configureMarked();},tree,redactConversation,redactAsync,quality,behavior,markdown,prepare,searchFields,matches,esc,escAttr,t,fmtTime,messageText};
}
