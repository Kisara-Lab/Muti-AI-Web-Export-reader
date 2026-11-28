function kimiCliExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const MAX_OUTPUT_CHARS=262144;
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const trim=value=>string(value).trim();

  function parseDate(value){
    if(value==null||value==='')return '';
    if(typeof value==='number'&&Number.isFinite(value)&&value>0){
      const ms=value>=1e11?value:value*1000;
      if(ms<=8.64e15)try{return new Date(ms).toISOString();}catch{}
      return '';
    }
    const raw=trim(value);
    if(!raw)return '';
    if(/^\d{10,16}$/.test(raw)){
      const num=Number(raw),ms=num>=1e11?num:num*1000;
      if(ms<=8.64e15)try{return new Date(ms).toISOString();}catch{}
    }
    const isoLike=/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)?raw.replace(' ','T'):raw;
    const ms=Date.parse(isoLike);
    if(!Number.isFinite(ms))return '';
    try{return new Date(ms).toISOString();}catch{return '';}
  }

  function hashKey(value){
    const s=String(value||'');
    let h1=0x811c9dc5,h2=0x9e3779b9;
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      h1^=c;h1=Math.imul(h1,0x01000193);
      h2^=c;h2=Math.imul(h2,0x85ebca6b);
    }
    return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }

  // Dependency-free RFC 1321 MD5 for matching ~/.kimi/sessions/<workdir_md5> to kimi.json paths
  const MD5_S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0);
  function md5Hex(str){
    const bytes=new TextEncoder().encode(String(str||''));
    const bitLen=bytes.length*8;
    const padLen=((56-((bytes.length+1)%64)+64)%64)+1;
    const buf=new Uint8Array(bytes.length+padLen+8);
    buf.set(bytes);
    buf[bytes.length]=0x80;
    const dv=new DataView(buf.buffer);
    dv.setUint32(buf.length-8,bitLen>>>0,true);
    dv.setUint32(buf.length-4,Math.floor(bitLen/4294967296)>>>0,true);
    let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
    const M=new Uint32Array(16);
    for(let off=0;off<buf.length;off+=64){
      for(let i=0;i<16;i++)M[i]=dv.getUint32(off+i*4,true);
      let A=a0,B=b0,C=c0,D=d0;
      for(let i=0;i<64;i++){
        let F,g;
        if(i<16){F=(B&C)|((~B)&D);g=i;}
        else if(i<32){F=(D&B)|((~D)&C);g=(5*i+1)%16;}
        else if(i<48){F=B^C^D;g=(3*i+5)%16;}
        else{F=C^(B|(~D));g=(7*i)%16;}
        const temp=D;
        D=C;
        C=B;
        const x=(A+F+MD5_K[i]+M[g])>>>0;
        const s=MD5_S[i];
        B=(B+(((x<<s)|(x>>>(32-s)))>>>0))>>>0;
        A=temp;
      }
      a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0;
    }
    const hex32=n=>{let s='';for(let i=0;i<4;i++)s+=((n>>>(i*8))&0xff).toString(16).padStart(2,'0');return s;};
    return hex32(a0)+hex32(b0)+hex32(c0)+hex32(d0);
  }

  function normalizeCwd(value){
    return trim(value).replace(/\\/g,'/').replace(/\/+$/,'');
  }

  function boundedText(value,warnings,label){
    const text=String(value??'');
    if(text.length<=MAX_OUTPUT_CHARS)return text;
    if(warnings&&!warnings.includes('oversized_tool_output'))warnings.push('oversized_tool_output');
    const head=text.slice(0,Math.floor(MAX_OUTPUT_CHARS*0.75));
    const tail=text.slice(-Math.floor(MAX_OUTPUT_CHARS*0.15));
    return head+'\n\n... ['+(label||'output')+' truncated: '+(text.length-head.length-tail.length)+' chars omitted] ...\n\n'+tail;
  }

  function buildSimpleDiffFromStrings(filePath,oldStr,newStr){
    if(typeof oldStr!=='string'&&typeof newStr!=='string')return '';
    const oldLines=(typeof oldStr==='string'?oldStr:'').split('\n').slice(0,220);
    const newLines=(typeof newStr==='string'?newStr:'').split('\n').slice(0,220);
    const cleanPath=String(filePath||'').replace(/^\/+/,'');
    const lines=[];
    if(cleanPath)lines.push('--- a/'+cleanPath,'+++ b/'+cleanPath);
    lines.push('@@ -1,'+oldLines.length+' +1,'+newLines.length+' @@');
    for(const l of oldLines)lines.push('-'+l);
    for(const l of newLines)lines.push('+'+l);
    return lines.join('\n');
  }

  function projectFromCwd(cwd,hashHint=''){
    const norm=normalizeCwd(cwd);
    const label=norm?(norm.split('/').filter(Boolean).pop()||norm):(hashHint?'ws:'+hashHint.slice(0,8):'');
    if(!label)return null;
    const wsId=hashKey(norm||('kimi-hash:'+hashHint));
    return {
      wsId,
      cwd:norm||trim(cwd),
      project:{
        uuid:'kimi:cwd:'+wsId,
        name:label+' (Kimi CLI)',
        description:norm?('Kimi Code CLI Workspace: '+norm):('Kimi CLI Directory Hash: '+hashHint),
        docs:[],
        is_starter_project:false,
        sourcePlatform:'kimi_cli'
      }
    };
  }

  function indexWorkDirs(kimiJsonValue){
    const byHash=new Map();
    const listEntries=[];
    try{
      const obj=typeof kimiJsonValue==='string'?JSON.parse(kimiJsonValue):kimiJsonValue;
      for(const wd of list(obj?.work_dirs)){
        const rawPath=trim(wd?.path);
        if(!rawPath)continue;
        const entry={path:rawPath,kaos:trim(wd?.kaos||'local'),lastSessionId:trim(wd?.last_session_id||'')};
        listEntries.push(entry);
        const variants=new Set([rawPath,rawPath.replace(/\//g,'\\'),rawPath.replace(/\\/g,'/'),rawPath.replace(/[\\/]+$/,''),rawPath.toLowerCase()]);
        for(const v of variants){
          if(v)byHash.set(md5Hex(v),entry);
        }
      }
    }catch{}
    return {byHash,workDirs:listEntries,thinking:!!kimiJsonValue?.thinking};
  }

  // Strictly extract safe config parameters from config.toml while ignoring/stripping credentials
  function parseKimiTomlSafe(tomlText){
    const cfg={};
    const secretKey=/api_?key|token|secret|password|passwd|auth|credential|bearer|oauth|cookie/i;
    let section='';
    for(const rawLine of String(tomlText||'').split(/\r?\n/)){
      const line=rawLine.split('#')[0].trim();
      if(!line)continue;
      const secM=/^\[([^\]]+)\]$/.exec(line);
      if(secM){section=secM[1].trim().toLowerCase();continue;}
      if(section==='providers'||section==='services'||section.startsWith('providers.'))continue;
      const kv=/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
      if(!kv)continue;
      const key=kv[1].trim();
      if(secretKey.test(key))continue;
      let val=kv[2].trim();
      if(/^["'].*["']$/.test(val))val=val.slice(1,-1);
      else if(val==='true')val=true;
      else if(val==='false')val=false;
      else if(/^-?\d+(?:\.\d+)?$/.test(val))val=Number(val);
      else if(/^\[.*\]$/.test(val))continue;
      if(section==='loop_control'||section==='background'||section===''){
        cfg[key]=val;
      }
    }
    return cfg;
  }

  function parseKimiLog(logText){
    const sessions=new Map();
    const globalWarnings=[];
    let currentSid='';
    const lines=String(logText||'').split(/\r?\n/);
    for(const line of lines){
      const m=/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*\|\s*(\w+)\s*\|\s*(?:([^|]+?)\s*\|\s*-\s*)?(.*)$/.exec(line);
      if(!m)continue;
      const ts=parseDate(m[1]),level=m[2].toUpperCase(),mod=trim(m[3]||''),msg=trim(m[4]);
      const createM=/Created new session:\s*([A-Za-z0-9_-]{8,})/i.exec(msg);
      if(createM){
        currentSid=createM[1];
        if(!sessions.has(currentSid))sessions.set(currentSid,{sessionId:currentSid,createdAt:ts,warnings:[],loadedTools:[],skillsCount:0});
        const rec=sessions.get(currentSid);
        if(ts&&!rec.createdAt)rec.createdAt=ts;
        continue;
      }
      const target=currentSid?sessions.get(currentSid):null;
      if(target){
        const skillM=/Discovered\s+(\d+)\s+skill/i.exec(msg);
        if(skillM)target.skillsCount=Number(skillM[1]);
        if(/Loaded tools:/i.test(msg)){
          const tools=[...msg.matchAll(/:([A-Za-z0-9_]+)['"]/g)].map(x=>x[1]);
          if(tools.length)target.loadedTools=tools;
        }
        if(level==='WARNING'||level==='ERROR'){
          if(!/api_?key|sk-[A-Za-z0-9]/i.test(msg)){
            target.warnings.push(level+': '+msg);
          }
        }
      }else if((level==='WARNING'||level==='ERROR')&&!/api_?key|sk-[A-Za-z0-9]/i.test(msg)){
        if(globalWarnings.length<12)globalWarnings.push(level+': '+msg);
      }
    }
    return {sessions,globalWarnings};
  }

  const KIMI_WIRE_TYPES=new Set([
    'TurnBegin','TurnEnd','StepBegin','StepInterrupted','StepRetry',
    'CompactionBegin','CompactionEnd','StatusUpdate','ContentPart',
    'ToolCall','ToolCallPart','ToolResult','ApprovalResponse','ApprovalRequestResolved',
    'BtwBegin','BtwEnd','SubagentEvent','SteerInput','PlanDisplay',
    'HookTriggered','HookResolved','ApprovalRequest','ToolCallRequest','QuestionRequest','HookRequest'
  ]);
  const KIMI_CODE_WIRE_TYPES=new Set([
    'turn.started','turn.prompt','turn.ended','turn.cancel',
    'item.started','item.delta','item.ended',
    'llm.request','usage.record','step.end',
    'agent.switched','agent.turn.started','agent.turn.ended','agent.message.appended',
    'subagent.spawned','subagent.started','subagent.completed','subagent.failed','subagent.cancelled',
    'context.undone'
  ]);

  function isKimiContextJsonlText(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    let checked=0;
    for(const raw of lines){
      const s=raw.trim();
      if(!s)continue;
      if(++checked>40)break;
      try{
        const obj=JSON.parse(s);
        if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;
        const role=string(obj.role);
        if(role==='_system_prompt'||role==='_checkpoint'||role==='_usage')return true;
        if(Array.isArray(obj.content)&&obj.content.some(p=>p&&p.type==='think'&&typeof p.think==='string'))return true;
        if(role==='assistant'&&Array.isArray(obj.tool_calls)&&obj.tool_calls.some(tc=>/^(?:StrReplaceFile|WriteFile|SetTodoList|AskUserQuestion|EnterPlanMode|ExitPlanMode|Shell|ReadMediaFile|SearchWeb|FetchURL)$/.test(string(tc?.function?.name))))return true;
      }catch{}
    }
    return false;
  }

  function isKimiWireJsonlText(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    let checked=0;
    for(const raw of lines){
      const s=raw.trim();
      if(!s)continue;
      if(++checked>40)break;
      try{
        const obj=JSON.parse(s);
        if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;
        if(KIMI_WIRE_TYPES.has(obj.type)||KIMI_CODE_WIRE_TYPES.has(obj.type))return true;
        if(obj.jsonrpc==='2.0'&&(obj.method==='event'||obj.method==='request')&&KIMI_WIRE_TYPES.has(obj.params?.type))return true;
        if(obj.message&&KIMI_WIRE_TYPES.has(obj.message.type))return true;
      }catch{}
    }
    return false;
  }

  function unwrapWireLine(obj){
    if(!obj||typeof obj!=='object')return null;
    if(obj.jsonrpc==='2.0'&&obj.params&&typeof obj.params.type==='string'){
      return {type:obj.params.type,payload:obj.params.payload||{},ts:parseDate(obj.timestamp||obj.time||obj.params.timestamp)};
    }
    if(obj.message&&typeof obj.message.type==='string'){
      return {type:obj.message.type,payload:obj.message.payload||{},ts:parseDate(obj.timestamp||obj.time||obj.message.timestamp)};
    }
    if(typeof obj.type==='string'){
      return {type:obj.type,payload:obj.payload&&typeof obj.payload==='object'?obj.payload:obj,ts:parseDate(obj.timestamp||obj.time||obj.payload?.timestamp)};
    }
    return null;
  }

  function safeParseArgs(raw){
    if(raw&&typeof raw==='object'&&!Array.isArray(raw))return raw;
    if(typeof raw!=='string'||!raw.trim())return {};
    try{
      const p=JSON.parse(raw);
      return p&&typeof p==='object'?p:{value:p};
    }catch{return {raw};}
  }

  function formatDisplayBlock(block,warnings){
    if(!block||typeof block!=='object')return null;
    const ty=string(block.type).toLowerCase();
    if(ty==='diff'){
      const path=trim(block.path||'file');
      if(block.is_summary){
        return {type:'text',text:'📄 `'+path+'` · Large file diff summary (skipped full diff >10k lines)'};
      }
      const patch=buildSimpleDiffFromStrings(path,block.old_text,block.new_text);
      return {type:'diff',path,patch,isSummary:false};
    }
    if(ty==='todo'){
      return {type:'todo',items:list(block.items).map(x=>({title:string(x?.title||x?.text||x?.content),status:string(x?.status||'pending')}))};
    }
    if(ty==='shell'){
      return {type:'shell',language:trim(block.language||'sh'),command:boundedText(string(block.command||''),warnings,'shell command')};
    }
    if(ty==='brief'&&typeof block.text==='string'){
      return {type:'text',text:block.text};
    }
    return null;
  }

  function* convertSessionSteps(input,opts={}){
    const cfg=typeof input==='string'?{contextText:isKimiContextJsonlText(input)?input:'',wireText:isKimiWireJsonlText(input)?input:''}:(input||{});
    const filePath=string(opts.path||cfg.path||'').replace(/\\/g,'/');
    const warnings=[];
    const logInfo=opts.logInfo||cfg.logInfo||null;
    const configSafe=opts.configSafe||cfg.configSafe||{};
    const stateObj=cfg.stateObj||(()=>{try{return cfg.stateText?JSON.parse(cfg.stateText):null;}catch{return null;}})()||{};

    // Infer sessionId & directory hash from path when possible
    let hashHint=trim(opts.workDirHash||'');
    let sidHint=trim(opts.sessionId||stateObj.session_id||logInfo?.sessionId||'');
    const sessPathM=/sessions\/([^/]+)\/(?:session_)?([^/]+)\//i.exec(filePath);
    if(sessPathM){
      if(!hashHint)hashHint=sessPathM[1];
      if(!sidHint)sidHint=sessPathM[2];
    }
    const subM=/(?:subagents|agents)\/([^/]+)\//i.exec(filePath);
    const agentSubId=trim(opts.agentId||(subM&&subM[1]!=='main'?subM[1]:'')||'');
    const isSubagent=Boolean(agentSubId);

    const rawCwd=trim(opts.workDir||stateObj.workDir||stateObj.work_dir||'');
    const cwdInfo=projectFromCwd(rawCwd,hashHint);
    const idSeed=(sidHint||hashKey(filePath||String(cfg.contextText||'').slice(0,120)))+(agentSubId?(':'+agentSubId):'');
    const convUuid='kimi:'+idSeed;

    let planMode=Boolean(stateObj.plan_mode ?? configSafe.default_plan_mode);
    const approvalState=stateObj.approval&&typeof stateObj.approval==='object'?stateObj.approval:{};
    const yoloMode=Boolean(approvalState.yolo ?? configSafe.default_yolo);
    const afkMode=Boolean(approvalState.afk);
    const thinkingDefault=Boolean(configSafe.default_thinking);
    const maxContextConfigured=Number(configSafe.max_context_size)||0;

    // Trackers across Wire 1.x / kimi-code / context.jsonl
    const modelsUsed=[];
    const recordModel=m=>{const nm=trim(m);if(nm&&!modelsUsed.includes(nm))modelsUsed.push(nm);};
    if(configSafe.default_model)recordModel(configSafe.default_model);

    const tokenTotals={inputOther:0,output:0,cacheRead:0,cacheCreate:0,total:0};
    let latestContextUsage=null,peakContextUsage=0,latestContextTokens=0,peakContextTokens=0,maxContextTokens=maxContextConfigured;
    const approvalCounts={approve:0,approve_for_session:0,reject:0,requests:0};
    const hookCounts={triggered:0,allow:0,block:0};
    let btwCount=0,steerCount=0,compactionCount=0,checkpointCount=0,stepRetryCount=0;
    const telemetryEvents=[];
    let wireFormatVersion=isKimiWireJsonlText(cfg.wireText)?'wire':'';
    let rotatedBackupCount=Array.isArray(cfg.rotatedContexts)?cfg.rotatedContexts.length:0;

    // Collect wire overlays (diff display blocks, todo lists, approvals, retries, questions)
    const wireDisplayByCallId=new Map();
    const wireApprovalsByCallId=new Map();
    const wireEvents=[];
    let sawModernKimiCode=false;

    const wireLines=String(cfg.wireText||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    let lineIdx=0;
    for(const rawLine of wireLines){
      if(++lineIdx%250===0)yield;
      const s=rawLine.trim();
      if(!s)continue;
      let obj;
      try{obj=JSON.parse(s);}catch{continue;}
      if(obj&&obj.type==='metadata'&&obj.protocol_version){wireFormatVersion=string(obj.protocol_version);continue;}
      const ev=unwrapWireLine(obj);
      if(!ev)continue;
      wireEvents.push(ev);
      const t=ev.type,p=ev.payload||{};

      if(KIMI_CODE_WIRE_TYPES.has(t)){
        sawModernKimiCode=true;
        wireFormatVersion='kimi-code';
      }

      if(t==='StatusUpdate'){
        if(typeof p.context_usage==='number'&&Number.isFinite(p.context_usage)){
          latestContextUsage=p.context_usage;
          if(p.context_usage>peakContextUsage)peakContextUsage=p.context_usage;
        }
        if(typeof p.context_tokens==='number'&&Number.isFinite(p.context_tokens)){
          latestContextTokens=p.context_tokens;
          if(p.context_tokens>peakContextTokens)peakContextTokens=p.context_tokens;
        }
        if(typeof p.max_context_tokens==='number'&&Number.isFinite(p.max_context_tokens)){
          maxContextTokens=p.max_context_tokens;
        }
        if(typeof p.plan_mode==='boolean')planMode=p.plan_mode;
        if(p.token_usage&&typeof p.token_usage==='object'){
          const io=Number(p.token_usage.input_other||0);
          const out=Number(p.token_usage.output||0);
          const cr=Number(p.token_usage.input_cache_read||0);
          const cc=Number(p.token_usage.input_cache_creation||0);
          tokenTotals.inputOther+=io;tokenTotals.output+=out;tokenTotals.cacheRead+=cr;tokenTotals.cacheCreate+=cc;
          tokenTotals.total+=io+out+cr+cc;
        }
      }else if(t==='llm.request'){
        recordModel(p.model||p.modelAlias);
      }else if(t==='usage.record'||t==='step.end'){
        const u=p.usage||p;
        // Skip cumulative session-scoped usage.record summaries to avoid double counting
        if(p.scope==='session')continue;
        if(p.model&&!modelsUsed.length)recordModel(p.model);
        const io=Number(u.inputOther||u.input_other||0);
        const out=Number(u.output||0);
        const cr=Number(u.inputCacheRead||u.input_cache_read||0);
        const cc=Number(u.inputCacheCreation||u.input_cache_creation||0);
        tokenTotals.inputOther+=io;tokenTotals.output+=out;tokenTotals.cacheRead+=cr;tokenTotals.cacheCreate+=cc;
        tokenTotals.total+=io+out+cr+cc;
      }else if(t==='ApprovalRequest'){
        approvalCounts.requests++;
        if(p.tool_call_id)wireApprovalsByCallId.set(p.tool_call_id,{id:p.id,sender:p.sender,action:p.action,description:p.description,display:list(p.display)});
      }else if(t==='ApprovalResponse'||t==='ApprovalRequestResolved'){
        const resp=string(p.response||'approve');
        if(resp==='approve')approvalCounts.approve++;
        else if(resp==='approve_for_session')approvalCounts.approve_for_session++;
        else if(resp==='reject'){
          approvalCounts.reject++;
          telemetryEvents.push({kind:'approval_reject',severity:'warn',label:'用户拒绝工具执行'+(p.feedback?' · '+p.feedback.slice(0,80):''),ts:ev.ts});
        }
        for(const req of wireApprovalsByCallId.values()){
          if(req.id===p.request_id){req.response=resp;if(p.feedback)req.feedback=p.feedback;}
        }
      }else if(t==='StepRetry'){
        stepRetryCount++;
        const code=p.status_code?('HTTP '+p.status_code):string(p.error_type||'Error');
        const ov=(p.status_code===400||p.status_code===413)&&peakContextTokens>=380000;
        telemetryEvents.push({
          kind:ov?'overflow_2mib':'step_retry',
          severity:ov||(p.next_attempt>=p.max_attempts)?'high':'warn',
          label:(ov?'2 MiB / 上下文溢出重试 ('+code+')':'StepRetry · '+code)+' ('+(p.next_attempt||1)+'/'+(p.max_attempts||3)+(p.wait_s?', '+p.wait_s+'s':'')+')',
          ts:ev.ts
        });
      }else if(t==='HookTriggered'){
        hookCounts.triggered++;
      }else if(t==='HookResolved'){
        if(p.action==='block'){
          hookCounts.block++;
          telemetryEvents.push({kind:'hook_block',severity:'high',label:'Hook 拦截 · '+(p.event||'')+' '+(p.target||'')+(p.reason?' · '+p.reason:''),ts:ev.ts});
        }else{
          hookCounts.allow++;
        }
      }else if(t==='CompactionBegin'){
        compactionCount++;
      }else if(t==='BtwBegin'){
        btwCount++;
      }else if(t==='SteerInput'){
        steerCount++;
      }else if(t==='ToolResult'&&p.tool_call_id&&p.return_value){
        const blocks=list(p.return_value.display).map(d=>formatDisplayBlock(d,warnings)).filter(Boolean);
        if(blocks.length)wireDisplayByCallId.set(p.tool_call_id,blocks);
      }
    }

    if(peakContextTokens>=400000&&maxContextTokens>=900000&&!telemetryEvents.some(e=>e.kind==='overflow_2mib')){
      telemetryEvents.push({kind:'overflow_risk',severity:'warn',label:'1M 窗口超 400k Tokens · 接近 2 MiB 请求上限 ('+Math.round(peakContextTokens/1000)+'k)',ts:''});
    }

    // Build messages from context.jsonl if it has conversation turns, otherwise reconstruct from wire.jsonl
    const messages=[];
    let frozenSystemPrompt='';
    let msgSeq=0;
    const nextUuid=()=>convUuid+':m'+(++msgSeq);
    const pushMessage=msg=>{
      const parent=messages.length?messages[messages.length-1].uuid:root;
      msg.uuid=nextUuid();
      msg.parent_message_uuid=parent;
      msg.sourcePlatform='kimi_cli';
      messages.push(msg);
      return msg;
    };

    const parseContextRecords=text=>{
      const recs=[];
      const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
      for(const line of lines){
        const s=line.trim();
        if(!s)continue;
        try{const o=JSON.parse(s);if(o&&typeof o==='object'&&!Array.isArray(o))recs.push(o);}catch{}
      }
      return recs;
    };

    const contextRecords=parseContextRecords(cfg.contextText);
    for(const rec of contextRecords){
      const role=string(rec.role);
      if(role==='_system_prompt'&&!frozenSystemPrompt)frozenSystemPrompt=string(rec.content);
      else if(role==='_checkpoint')checkpointCount++;
      else if(role==='_usage'&&tokenTotals.total===0){
        const u=rec.usage||rec;
        if(u){
          const io=Number(u.input_other||u.input_tokens||0),out=Number(u.output||u.output_tokens||0),cr=Number(u.input_cache_read||u.cache_read_tokens||0),cc=Number(u.input_cache_creation||0);
          tokenTotals.inputOther+=io;tokenTotals.output+=out;tokenTotals.cacheRead+=cr;tokenTotals.cacheCreate+=cc;
          tokenTotals.total+=io+out+cr+cc;
        }
      }
    }
    const hasNonSystemContext=contextRecords.some(r=>r.role==='user'||r.role==='assistant'||r.role==='tool');
    const hasRichWire=wireEvents.some(e=>e.type==='TurnBegin'||e.type==='turn.prompt'||e.type==='ContentPart'||e.type==='item.ended'||e.type==='ToolCall');
    let latestPlanDisplay=null;

    if(hasNonSystemContext&&!hasRichWire){
      let activeAssistant=null;
      const useById=new Map();
      const baseTs=logInfo?.createdAt||parseDate(stateObj.created_at||stateObj.createdAt)||'';

      const ensureAssistant=ts=>{
        if(!activeAssistant){
          activeAssistant=pushMessage({sender:'assistant',created_at:ts||baseTs,updated_at:ts||baseTs,content:[]});
        }
        return activeAssistant;
      };

      for(let idx=0;idx<contextRecords.length;idx++){
        if(idx%200===0)yield;
        const rec=contextRecords[idx];
        const role=string(rec.role);
        const ts=parseDate(rec.timestamp||rec.created_at)||baseTs;

        if(role==='_system_prompt'||role==='_checkpoint'||role==='_usage')continue;
        if(role==='user'){
          activeAssistant=null;
          const parts=Array.isArray(rec.content)?rec.content:[{type:'text',text:string(rec.content)}];
          const blocks=[];
          for(const pt of parts){
            if(!pt||typeof pt!=='object')continue;
            if(pt.type==='text'&&trim(pt.text))blocks.push({type:'text',text:pt.text});
            else if(pt.type==='image_url'&&pt.image_url?.url){
              const u=string(pt.image_url.url);
              if(u.startsWith('blobref:'))blocks.push({type:'text',text:'🖼 `[Kimi blobref image: '+u+']`'});
              else blocks.push({type:'text',text:'![image]('+u+')'});
            }
          }
          if(!blocks.length)blocks.push({type:'text',text:''});
          pushMessage({sender:'human',created_at:ts,updated_at:ts,content:blocks});
          continue;
        }
        if(role==='assistant'){
          if(rec.model)recordModel(rec.model);
          const asst=ensureAssistant(ts);
          const parts=Array.isArray(rec.content)?rec.content:(typeof rec.content==='string'&&rec.content?[{type:'text',text:rec.content}]:[]);
          for(const pt of parts){
            if(!pt||typeof pt!=='object')continue;
            if(pt.type==='think'){
              const thText=string(pt.think||pt.thinking||'');
              if(thText||pt.encrypted){
                asst.content.push({
                  type:'thinking',
                  thinking:thText,
                  ...(pt.encrypted?{signature:string(pt.encrypted),thinking_hidden:!thText}:{})
                });
              }
            }else if(pt.type==='text'&&trim(pt.text)){
              asst.content.push({type:'text',text:pt.text});
            }
          }
          for(const tc of list(rec.tool_calls)){
            const fnName=trim(tc?.function?.name||tc?.name||'tool');
            const cid=trim(tc?.id||('tc_'+idx+'_'+Math.random().toString(36).slice(2,6)));
            const argsObj=safeParseArgs(tc?.function?.arguments ?? tc?.arguments);
            if(fnName==='StrReplaceFile'&&typeof argsObj.old_str==='string'&&typeof argsObj.new_str==='string'&&!argsObj.patch){
              argsObj.patch=buildSimpleDiffFromStrings(string(argsObj.path||argsObj.file_path),argsObj.old_str,argsObj.new_str);
            }else if(fnName==='WriteFile'&&typeof argsObj.content==='string'&&!argsObj.patch){
              argsObj.patch=buildSimpleDiffFromStrings(string(argsObj.path||argsObj.file_path),'',argsObj.content);
            }
            const useBlk={
              type:'tool_use',
              id:cid,
              name:fnName,
              input:argsObj,
              ...(wireDisplayByCallId.has(cid)?{kimiDisplay:wireDisplayByCallId.get(cid)}:{}),
              ...(wireApprovalsByCallId.has(cid)?{kimiApproval:wireApprovalsByCallId.get(cid)}:{})
            };
            useById.set(cid,asst);
            asst.content.push(useBlk);
          }
          continue;
        }
        if(role==='tool'){
          const cid=trim(rec.tool_call_id||'');
          const host=useById.get(cid)||ensureAssistant(ts);
          const rawText=Array.isArray(rec.content)?rec.content.map(x=>typeof x==='string'?x:string(x?.text||x?.output||'')).filter(Boolean).join('\n'):string(rec.content);
          const resBlk={
            type:'tool_result',
            tool_use_id:cid,
            name:trim(rec.name||''),
            content:[{type:'text',text:boundedText(rawText,warnings,'tool output')}],
            ...(wireDisplayByCallId.has(cid)?{kimiDisplay:wireDisplayByCallId.get(cid)}:{}),
            ...(rec.is_error?{is_error:true}:{})
          };
          host.content.push(resBlk);
          continue;
        }
      }
      // Keep assistant prose after tools when an interleaved multi-turn sequence ended with prose
      for(const m of messages){
        if(m.sender==='assistant'&&m.content.length){
          const head=[],tail=[];
          let lastNonText=-1;
          m.content.forEach((b,bi)=>{if(b.type!=='text')lastNonText=bi;});
          if(lastNonText>=0){
            m.content.forEach((b,bi)=>{if(bi>lastNonText&&b.type==='text')tail.push(b);else head.push(b);});
            m.content=[...head,...tail];
          }
        }
      }
    }else if(wireEvents.length){
      // Reconstruct timeline purely from Wire 1.x / kimi-code events
      let activeAsst=null;
      const byId=new Map();
      const ensureAsst=ts=>{
        if(!activeAsst)activeAsst=pushMessage({sender:'assistant',created_at:ts,updated_at:ts,content:[]});
        if(ts&&!activeAsst.created_at)activeAsst.created_at=ts;
        return activeAsst;
      };
      for(let wi=0;wi<wireEvents.length;wi++){
        if(wi%250===0)yield;
        const ev=wireEvents[wi],t=ev.type,p=ev.payload||{},ts=ev.ts;
        if(t==='TurnBegin'||t==='turn.prompt'){
          activeAsst=null;
          const uInp=p.user_input ?? p.prompt ?? p.text ?? '';
          const txt=Array.isArray(uInp)?uInp.map(x=>string(x?.text||x)).join('\n'):string(uInp);
          pushMessage({sender:'human',created_at:ts,updated_at:ts,content:[{type:'text',text:txt}]});
        }else if(t==='ContentPart'){
          const asst=ensureAsst(ts);
          if(p.type==='think'){
            const prev=asst.content[asst.content.length-1];
            if(prev&&prev.type==='thinking')prev.thinking=(prev.thinking||'')+string(p.think);
            else asst.content.push({type:'thinking',thinking:string(p.think),...(p.encrypted?{signature:string(p.encrypted)}:{})});
          }else if(p.type==='text'&&p.text){
            const prev=asst.content[asst.content.length-1];
            if(prev&&prev.type==='text')prev.text+=string(p.text);
            else asst.content.push({type:'text',text:string(p.text)});
          }
        }else if(t==='item.ended'){
          const item=p.item||p;
          const kind=string(item.type||item.kind);
          if(kind==='reasoning'||kind==='think'){
            ensureAsst(ts).content.push({type:'thinking',thinking:string(item.text||item.thinking||item.content)});
          }else if(kind==='message'||kind==='assistant'||kind==='text'){
            const txt=string(item.text||item.content);
            if(txt)ensureAsst(ts).content.push({type:'text',text:txt});
          }else if(kind==='tool_call'||kind==='function_call'){
            const cid=trim(item.id||item.call_id||('ktc_'+wi));
            const nm=trim(item.name||item.function?.name||'tool');
            const argsObj=safeParseArgs(item.arguments ?? item.function?.arguments ?? item.input);
            const blk={type:'tool_use',id:cid,name:nm,input:argsObj,...(wireApprovalsByCallId.has(cid)?{kimiApproval:wireApprovalsByCallId.get(cid)}:{})};
            byId.set(cid,blk);
            ensureAsst(ts).content.push(blk);
          }else if(kind==='tool_result'){
            const cid=trim(item.tool_call_id||item.call_id||'');
            const rawOut=string(item.output||item.text||'');
            const textOut=/^blobref:/i.test(rawOut)?'🖼 `[Kimi blobref spilled media: '+rawOut+']`':boundedText(rawOut,warnings,'tool output');
            ensureAsst(ts).content.push({type:'tool_result',tool_use_id:cid,content:[{type:'text',text:textOut}],...(item.is_error?{is_error:true}:{})});
          }
        }else if(t==='ToolCall'){
          const asst=ensureAsst(ts);
          const cid=trim(p.id||('ktc_'+wi));
          const nm=trim(p.function?.name||p.name||'tool');
          const argsObj=safeParseArgs(p.function?.arguments);
          if(nm==='StrReplaceFile'&&typeof argsObj.old_str==='string'&&typeof argsObj.new_str==='string'&&!argsObj.patch){
            argsObj.patch=buildSimpleDiffFromStrings(string(argsObj.path||argsObj.file_path),argsObj.old_str,argsObj.new_str);
          }
          const blk={type:'tool_use',id:cid,name:nm,input:argsObj,...(wireApprovalsByCallId.has(cid)?{kimiApproval:wireApprovalsByCallId.get(cid)}:{})};
          byId.set(cid,blk);
          asst.content.push(blk);
        }else if(t==='ToolCallPart'){
          const asst=ensureAsst(ts);
          const last=[...asst.content].reverse().find(b=>b.type==='tool_use');
          if(last&&typeof p.arguments_part==='string'){
            last._rawArgs=(last._rawArgs||'')+p.arguments_part;
            const parsed=safeParseArgs(last._rawArgs);
            if(!parsed.raw)last.input=parsed;
          }
        }else if(t==='ToolResult'){
          const asst=ensureAsst(ts);
          const cid=trim(p.tool_call_id||'');
          const rv=p.return_value||{};
          const outText=Array.isArray(rv.output)?rv.output.map(x=>string(x?.text||x)).join('\n'):string(rv.output||rv.message||'');
          const blocks=list(rv.display).map(d=>formatDisplayBlock(d,warnings)).filter(Boolean);
          const pairedUse=byId.get(cid);
          if(pairedUse&&blocks.length){
            pairedUse.kimiDisplay=blocks;
            const diffBlk=blocks.find(b=>b.type==='diff'&&b.patch);
            if(diffBlk&&pairedUse.input&&!pairedUse.input.patch)pairedUse.input.patch=diffBlk.patch;
          }
          asst.content.push({
            type:'tool_result',
            tool_use_id:cid,
            content:[{type:'text',text:/^blobref:/i.test(outText)?'🖼 `[Kimi blobref spilled media: '+outText+']`':boundedText(outText,warnings,'tool output')}],
            ...(rv.is_error?{is_error:true}:{}),
            ...(blocks.length?{kimiDisplay:blocks}:{})
          });
        }else if(t==='PlanDisplay'){
          const fp=string(p.file_path||'plan.md'),pc=string(p.content||'');
          if(pc)latestPlanDisplay={slug:fp.split(/[\\/]/).pop().replace(/\.md$/i,'')||'plan',name:fp.split(/[\\/]/).pop()||'plan.md',content:pc};
          ensureAsst(ts).content.push({
            type:'text',
            text:pc,
            kimiPlan:{filePath:fp,content:pc}
          });
        }else if(t==='BtwBegin'||t==='BtwEnd'){
          if(t==='BtwBegin'){
            ensureAsst(ts).content.push({type:'tool_use',id:'btw_'+string(p.id||wi),name:'/btw',input:{question:string(p.question)}});
          }else{
            ensureAsst(ts).content.push({type:'tool_result',tool_use_id:'btw_'+string(p.id||wi),name:'/btw',content:[{type:'text',text:string(p.response||p.error||'')}],...(p.error?{is_error:true}:{})});
          }
        }else if(t==='StepRetry'){
          ensureAsst(ts).content.push({
            type:'injected_prompt_block',
            prompt:'StepRetry attempt '+(p.next_attempt||1)+'/'+(p.max_attempts||3)+' ('+(p.error_type||'Error')+(p.status_code?' · HTTP '+p.status_code:'')+', wait '+Number(p.wait_s||0)+'s)',
            injection_source:'kimi:retry'
          });
        }else if(t==='SteerInput'){
          const txt=Array.isArray(p.user_input)?p.user_input.map(x=>string(x?.text||x)).join('\n'):string(p.user_input||'');
          ensureAsst(ts).content.push({type:'injected_prompt_block',prompt:txt,injection_source:'kimi:steer'});
        }else if(t==='turn.ended'&&p.error){
          ensureAsst(ts).content.push({type:'injected_prompt_block',prompt:string(p.error.message||p.error),injection_source:'kimi:error'});
        }
      }
    }

    // Grab _system_prompt if not yet captured when contextRecords only had 1 line
    if(!frozenSystemPrompt&&contextRecords.length){
      const sp=contextRecords.find(r=>r.role==='_system_prompt');
      if(sp)frozenSystemPrompt=string(sp.content);
    }

    // Stub session fallback (e.g. ~/.kimi/sessions/<hash>/<uuid>/context.jsonl with only _system_prompt)
    const isStub=messages.length===0&&(Boolean(frozenSystemPrompt)||Boolean(logInfo)||Boolean(cfg.stateText));
    if(isStub){
      const diagTs=logInfo?.createdAt||parseDate(stateObj.created_at||stateObj.createdAt)||'';
      const blocks=[];
      const diagLines=[];
      diagLines.push('该 Kimi CLI 会话尚未包含用户/助手对话轮次，仅保存了初始化冻结上下文'+(logInfo?.warnings?.length?' 与启动诊断日志':'')+'。');
      if(rawCwd)diagLines.push('- **工作目录 (`cwd`)**: `'+rawCwd+'`');
      if(hashHint)diagLines.push('- **目录校验和 (`MD5`)**: `'+hashHint+'`');
      if(logInfo?.loadedTools?.length)diagLines.push('- **已加载工具集 ('+logInfo.loadedTools.length+')**: `'+logInfo.loadedTools.join('`, `')+'`');
      if(logInfo?.skillsCount)diagLines.push('- **已发现 Skills**: '+logInfo.skillsCount);
      if(logInfo?.warnings?.length){
        diagLines.push('\n> [!WARNING]\n> **kimi.log 初始化告警**\n> '+(logInfo.warnings.slice(0,4).map(w=>'`'+w+'`').join(' · ')));
        for(const w of logInfo.warnings.slice(0,4)){
          telemetryEvents.push({kind:'log_warning',severity:/^ERROR/i.test(w)?'high':'warn',label:w,ts:diagTs});
        }
      }
      blocks.push({type:'text',text:diagLines.join('\n')});
      if(frozenSystemPrompt){
        blocks.push({type:'injected_prompt_block',prompt:boundedText(frozenSystemPrompt,warnings,'frozen system prompt'),injection_source:'kimi:system_prompt'});
      }
      pushMessage({sender:'system',created_at:diagTs,updated_at:diagTs,content:blocks});
      warnings.push('kimi_stub_session:'+(logInfo?.warnings?.length?'startup_error':'empty_turns'));
    }

    if(!messages.length)return null;

    // Resolve conversation timestamps & readable title
    const msgTimes=messages.map(m=>m.created_at).filter(Boolean).sort();
    const firstTs=logInfo?.createdAt||msgTimes[0]||'';
    const lastTs=msgTimes[msgTimes.length-1]||firstTs;

    let firstHumanTitle='';
    const firstHuman=messages.find(m=>m.sender==='human');
    if(firstHuman){
      const txt=trim(list(firstHuman.content).find(b=>b.type==='text')?.text||'').replace(/\s+/g,' ');
      if(txt)firstHumanTitle=txt.length>64?txt.slice(0,64)+'…':txt;
    }
    const baseWsName=cwdInfo?cwdInfo.project.name.replace(/ \(Kimi CLI\)$/,''):(hashHint?hashHint.slice(0,8):'Kimi');
    const resolvedTitle=trim(opts.title||stateObj.title||'')||firstHumanTitle||(isStub?'['+baseWsName+'] 初始化存根 · '+(sidHint||idSeed).slice(0,8):'['+baseWsName+'] '+(sidHint||idSeed).slice(0,8));

    const convWarnings=[...warnings];
    if(rotatedBackupCount>0)convWarnings.push('kimi_rotated_context:'+rotatedBackupCount);

    const conversation={
      uuid:convUuid,
      originalId:sidHint||idSeed,
      sourcePlatform:'kimi_cli',
      name:resolvedTitle,
      summary:trim(stateObj.summary||''),
      created_at:firstTs,
      updated_at:lastTs,
      ...(cwdInfo?{workspaceId:cwdInfo.wsId}:{}),
      ...(modelsUsed[0]?{defaultModel:modelsUsed[0]}:{}),
      kimiCliMeta:{
        sessionId:sidHint||idSeed,
        workDirHash:hashHint,
        cwd:rawCwd,
        theme:string(configSafe.theme||''),
        wireVersion:wireFormatVersion||(sawModernKimiCode?'kimi-code':'context'),
        planMode,
        planSlug:string(stateObj.plan_slug||''),
        yolo:yoloMode,
        afk:afkMode,
        thinking:thinkingDefault,
        isStub,
        isSubagent,
        ...(agentSubId?{agentId:agentSubId}:{}),
        ...(isSubagent&&sidHint?{parentThreadId:sidHint}:{}),
        ...(cfg.planDoc?{planArtifact:{slug:string(stateObj.plan_slug||'plan'),name:(stateObj.plan_slug||'plan')+'.md',content:cfg.planDoc}}:latestPlanDisplay?{planArtifact:latestPlanDisplay}:{}),
        rotatedBackupCount,
        checkpointCount,
        systemPromptBytes:frozenSystemPrompt.length,
        loadedTools:list(logInfo?.loadedTools),
        skillsCount:Number(logInfo?.skillsCount||0),
        logWarnings:list(logInfo?.warnings).slice(0,8),
        models:modelsUsed,
        contextUsage:peakContextUsage,
        contextTokens:peakContextTokens,
        maxContextTokens,
        ...(tokenTotals.total>0?{usage:{
          input_tokens:tokenTotals.inputOther,
          output_tokens:tokenTotals.output,
          cache_read_input_tokens:tokenTotals.cacheRead,
          cache_creation_input_tokens:tokenTotals.cacheCreate,
          total_tokens:tokenTotals.total
        }}:{})
      },
      kimiCliTelemetry:{
        wireVersion:wireFormatVersion||(sawModernKimiCode?'kimi-code':'context'),
        isStub,
        isSubagent,
        planMode,
        yolo:yoloMode,
        afk:afkMode,
        rotatedBackupCount,
        checkpointCount,
        compactionCount,
        stepRetryCount,
        btwCount,
        steerCount,
        approvalCounts,
        hookCounts,
        peakContextUsage,
        peakContextTokens,
        maxContextTokens,
        tokens:tokenTotals,
        models:modelsUsed,
        events:telemetryEvents
      },
      importWarnings:convWarnings,
      chat_messages:messages
    };

    return {conversation,project:cwdInfo?cwdInfo.project:null,warnings:convWarnings};
  }

  function parseSessionText(input,opts={}){
    const it=convertSessionSteps(input,opts);
    let step;
    do{step=it.next();}while(!step.done);
    return step.value;
  }

  async function parseSessionAsync(input,opts={},checkpoint=async()=>{}){
    const it=convertSessionSteps(input,opts);
    let step;
    do{step=it.next();if(!step.done)await checkpoint();}while(!step.done);
    return step.value;
  }

  return {
    md5Hex,
    indexWorkDirs,
    parseKimiTomlSafe,
    parseKimiLog,
    isKimiContextJsonlText,
    isKimiWireJsonlText,
    parseSessionText,
    parseSessionAsync,
    projectFromCwd,
    parseDate
  };
}
