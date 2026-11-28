function claudeCodeExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const MAX_TOOL_OUTPUT_CHARS=262144; // 256 KB guard per tool output
  const MAX_IMAGE_BUDGET_BYTES=25*1024*1024; // 25 MB per-session embedded image budget
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const trim=value=>string(value).trim();

  const KNOWN_RECORD_TYPES=new Set([
    'user','assistant','system','attachment','ai-title','custom-title','summary',
    'last-prompt','cost-state','mode','queue-operation','api-request','api-request-blob',
    'api-request-shape','atis-latch','file-history-snapshot','file-history-delta',
    'permission-mode','agent-name','pr-link','progress'
  ]);
  const SKIP_NOISE_TYPES=new Set([
    'api-request','api-request-blob','api-request-shape','atis-latch',
    'file-history-snapshot','file-history-delta','queue-operation',
    'permission-mode','agent-name','pr-link','progress'
  ]);
  const SKIP_ATTACHMENT_TYPES=new Set([
    'total_tokens_reminder','silent_turn_reminder','batching_reminder_sent',
    'auto_mode','date','agent_listing_delta','skill_listing','deferred_tools_delta',
    'environment','model'
  ]);

  function parseDate(value){
    if(value==null||value==='')return '';
    if(typeof value==='number'&&Number.isFinite(value)&&value>0){
      const ms=value>=1e11?value:value*1000;
      if(ms>8.64e15)return '';
      try{return new Date(ms).toISOString();}catch{return '';}
    }
    const raw=trim(value);
    if(!raw)return '';
    if(/^\d{10,16}$/.test(raw)){
      const num=Number(raw),ms=num>=1e11?num:num*1000;
      if(ms<=8.64e15)try{return new Date(ms).toISOString();}catch{}
    }
    const ms=Date.parse(raw);
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

  function normalizeCwd(value){
    return trim(value).replace(/\\/g,'/').replace(/\/+$/,'');
  }

  function safeImageUri(value){
    const raw=trim(value);
    if(!raw)return '';
    if(/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/=\s]+$/i.test(raw))return raw;
    try{
      const url=new URL(raw);
      return /^(?:https?:)$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';
    }catch{
      return '';
    }
  }

  function boundedText(value,warnings,label){
    const text=String(value??'');
    if(text.length<=MAX_TOOL_OUTPUT_CHARS)return text;
    if(warnings&&!warnings.includes('oversized_tool_output'))warnings.push('oversized_tool_output');
    const head=text.slice(0,Math.floor(MAX_TOOL_OUTPUT_CHARS*0.75));
    const tail=text.slice(-Math.floor(MAX_TOOL_OUTPUT_CHARS*0.15));
    return head+'\n\n... ['+(label||'output')+' truncated: '+(text.length-head.length-tail.length)+' chars omitted] ...\n\n'+tail;
  }

  function isPromptHistoryRecord(obj){
    return !!(obj&&typeof obj==='object'&&!Array.isArray(obj)&&typeof obj.sessionId==='string'&&typeof obj.display==='string'&&!obj.type&&!obj.message);
  }

  function isClaudeCodeRecord(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return false;
    const t=string(obj.type);
    if(!t||!KNOWN_RECORD_TYPES.has(t))return false;
    return !!(
      typeof obj.sessionId==='string'||
      (obj.message&&typeof obj.message==='object')||
      'parentUuid' in obj||
      t==='cost-state'||t==='ai-title'||t==='custom-title'||t==='mode'||t==='last-prompt'
    );
  }

  function inspectJsonlText(text){
    const raw=String(text||'').replace(/^\uFEFF/,'');
    const lines=raw.split(/\r?\n/);
    let checked=0,ccCount=0,historyCount=0;
    for(const line of lines){
      const s=line.trim();
      if(!s)continue;
      if(++checked>60)break;
      let parsed;
      try{parsed=JSON.parse(s);}catch{continue;}
      if(isClaudeCodeRecord(parsed))ccCount++;
      else if(isPromptHistoryRecord(parsed))historyCount++;
    }
    if(ccCount>0)return {kind:'claude_code',lines};
    if(historyCount>0&&ccCount===0)return {kind:'history',lines};
    return {kind:'unknown',lines};
  }

  function isClaudeCodeText(text){
    return inspectJsonlText(text).kind==='claude_code';
  }

  function projectFromCwd(cwd){
    const norm=normalizeCwd(cwd);
    if(!norm)return null;
    const parts=norm.split('/').filter(Boolean);
    const leaf=parts.length?parts[parts.length-1]:norm;
    const wsId='cwd_'+hashKey(norm.toLowerCase());
    return {
      wsId,
      project:{
        uuid:'cc:cwd:'+wsId,
        name:leaf+' (Claude Code)',
        description:'Claude Code workspace: '+norm,
        sourcePlatform:'claude_code',
        is_archived:false,
        docs:[]
      }
    };
  }

  function normDedupe(text){
    return String(text||'').replace(/\r\n/g,'\n').replace(/\s+/g,' ').trim();
  }

  function parseSubagentPath(filePath){
    const clean=String(filePath||'').replace(/\\/g,'/');
    const m=/(?:^|\/)([0-9a-f]{8}-[0-9a-f-]{12,})\/subagents\/(?:workflows\/([^/]+)\/)?(agent-[^/.]+)\.jsonl$/i.exec(clean);
    if(m)return {parentSessionId:m[1],workflowId:m[2]||'',agentId:m[3]};
    const m2=/(?:^|\/)subagents\/(agent-[^/.]+)\.jsonl$/i.exec(clean);
    if(m2)return {parentSessionId:'',workflowId:'',agentId:m2[1]};
    return null;
  }

  function buildUnifiedPatchFromStructured(filePath,hunks){
    const target=filePath||'file';
    const parts=[];
    for(const h of list(hunks)){
      if(!h||typeof h!=='object')continue;
      const os=Number.isFinite(h.oldStart)?h.oldStart:1;
      const ol=Number.isFinite(h.oldLines)?h.oldLines:0;
      const ns=Number.isFinite(h.newStart)?h.newStart:1;
      const nl=Number.isFinite(h.newLines)?h.newLines:0;
      const body=list(h.lines).map(l=>String(l??'')).join('\n');
      parts.push('@@ -'+os+','+ol+' +'+ns+','+nl+' @@\n'+body);
    }
    if(!parts.length)return '';
    return '*** Update File: '+target+'\n'+parts.join('\n');
  }

  function buildSimpleDiffFromStrings(filePath,oldStr,newStr){
    if(typeof oldStr!=='string'&&typeof newStr!=='string')return '';
    const target=filePath||'file';
    const oldLines=String(oldStr??'').split(/\r?\n/);
    const newLines=String(newStr??'').split(/\r?\n/);
    const maxPreview=180;
    const clippedOld=oldLines.slice(0,maxPreview).map(l=>'-'+l);
    if(oldLines.length>maxPreview)clippedOld.push('-... ['+(oldLines.length-maxPreview)+' more lines]');
    const clippedNew=newLines.slice(0,maxPreview).map(l=>'+'+l);
    if(newLines.length>maxPreview)clippedNew.push('+... ['+(newLines.length-maxPreview)+' more lines]');
    return '*** Update File: '+target+'\n@@ -1,'+oldLines.length+' +1,'+newLines.length+' @@\n'+clippedOld.concat(clippedNew).join('\n');
  }

  function formatToolResultOutput(rawContent,toolUseResult,warnings,toolName){
    let isError=false;
    const chunks=[];

    const pushContentBlock=node=>{
      if(node==null)return;
      if(typeof node==='string'){
        if(node.trim())chunks.push(node);
        return;
      }
      if(typeof node!=='object')return;
      if(node.type==='text'&&typeof node.text==='string'){
        if(node.text.trim())chunks.push(node.text);
        return;
      }
      if(node.type==='tool_reference'&&node.tool_name){
        chunks.push('[Loaded tool: '+node.tool_name+']');
        return;
      }
      if(typeof node.text==='string'&&node.text.trim())chunks.push(node.text);
    };

    if(typeof rawContent==='string'){
      if(rawContent.trim())chunks.push(rawContent);
    }else if(Array.isArray(rawContent)){
      for(const item of rawContent)pushContentBlock(item);
    }

    if(typeof toolUseResult==='string'){
      if(!chunks.length&&toolUseResult.trim())chunks.push(toolUseResult);
      if(/denied|error|failed|rejected/i.test(toolUseResult))isError=true;
    }else if(toolUseResult&&typeof toolUseResult==='object'){
      if(toolUseResult.interrupted)isError=true;
      if(typeof toolUseResult.stdout==='string'||typeof toolUseResult.stderr==='string'){
        const outParts=[];
        if(trim(toolUseResult.stdout))outParts.push(toolUseResult.stdout.replace(/\s+$/,''));
        if(trim(toolUseResult.stderr))outParts.push('stderr:\n'+toolUseResult.stderr.replace(/\s+$/,''));
        if(toolUseResult.interrupted)outParts.push('[Interrupted]');
        if(outParts.length){
          chunks.length=0;
          chunks.push(outParts.join('\n\n'));
        }
      }else if(toolName==='Read'&&toolUseResult.file&&typeof toolUseResult.file==='object'){
        const f=toolUseResult.file;
        const fp=string(f.filePath);
        const range=Number.isFinite(f.startLine)?' (lines '+f.startLine+'–'+((f.startLine||1)+(f.numLines||0)-1)+' of '+(f.totalLines||f.numLines||'?')+')':'';
        const header=fp?'File: '+fp+range:'';
        if(header&&typeof f.content==='string'){
          chunks.length=0;
          chunks.push(header+'\n\n'+f.content);
        }
      }
    }

    const combined=boundedText(chunks.join('\n\n'),warnings,'tool_result');
    return {text:combined,isError};
  }

  function extractInlineContextTags(text){
    const raw=String(text||'');
    const contextChunks=[];
    let cleaned=raw;
    const tagRe=/<(ide_opened_file|ide_selection|system-reminder|local-command-caveat|local-command-stdout|command-name|command-message|command-args|task-notification)>([\s\S]*?)<\/\1>/gi;
    cleaned=cleaned.replace(tagRe,(full,tag,inner)=>{
      const lower=tag.toLowerCase();
      if(lower==='command-name'||lower==='command-message'||lower==='command-args'){
        const val=trim(inner);
        return val?full:'';
      }
      contextChunks.push({tag:lower,text:full.trim()});
      return '';
    });
    return {cleaned:cleaned.trim(),contextChunks};
  }

  function appendImageBlock(blocks,sourceObj,imageState,warnings){
    if(!sourceObj||typeof sourceObj!=='object')return false;
    let uri='';
    if(sourceObj.type==='base64'&&sourceObj.data){
      const mime=/^image\/(?:png|jpe?g|gif|webp|bmp)$/i.test(string(sourceObj.media_type))?string(sourceObj.media_type):'image/png';
      uri='data:'+mime+';base64,'+String(sourceObj.data).replace(/\s+/g,'');
    }else if(sourceObj.type==='url'&&sourceObj.url){
      uri=safeImageUri(sourceObj.url);
    }
    if(!uri)return false;
    if(imageState.usedBytes+uri.length>MAX_IMAGE_BUDGET_BYTES){
      if(!warnings.includes('image_budget_exceeded'))warnings.push('image_budget_exceeded');
      blocks.push({type:'text',text:'_[Image omitted: 25 MB session media budget exceeded]_'});
      return true;
    }
    imageState.usedBytes+=uri.length;
    blocks.push({type:'image',url:uri,source:'claude_code'});
    return true;
  }

  function* convertTranscriptSteps(text,opts={}){
    const inspected=inspectJsonlText(text);
    const warnings=[];
    if(inspected.kind!=='claude_code'){
      return {conversation:null,project:null,warnings,skippedKind:inspected.kind};
    }

    const lines=inspected.lines;
    const filePath=string(opts.path||'claude-code-session.jsonl');
    const fileName=filePath.split(/[\\/]/).pop()||filePath;
    const subMetaFromPath=parseSubagentPath(filePath);
    const externalMeta=opts.meta&&typeof opts.meta==='object'?opts.meta:null;

    let sessionId='';
    let cwd='';
    let gitBranch='';
    let cliVersion='';
    let slug='';
    let entrypoint='';
    let defaultModel='';
    let latestMode='';
    let customTitle='';
    let aiTitle='';
    let summaryTitle='';
    let lastPromptTitle='';
    let firstPromptCandidate='';
    let firstTs='';
    let lastTs='';
    let isSidechain=!!(subMetaFromPath||externalMeta);
    let agentId=subMetaFromPath?.agentId||'';
    let parentSessionId=subMetaFromPath?.parentSessionId||'';
    let workflowId=subMetaFromPath?.workflowId||'';
    let agentType=string(externalMeta?.agentType);
    let agentDescription=string(externalMeta?.description);
    let parentAgentId=string(externalMeta?.parentAgentId);
    let malformedLines=0;
    let compactedCount=0;
    let latestCostState=null;

    const imageState={usedBytes:0};
    const messages=[];
    const toolMap=new Map(); // tool_use id -> tool_use block (for pairing & diff patching)
    const assistantMsgById=new Map(); // message.id -> { msg, turn, lastUsage, stopReason, rawModel }
    const seenToolUseIds=new Set();
    const seenToolResultIds=new Set();
    const seenHumanNorms=new Set();
    const seenPlanNorms=new Set();
    const seenFallbackMsgIds=new Set();
    let lastInjectedKey='';
    let currentTurn=null;
    let pendingPreUserBlocks=[];

    const telemetry={
      recordTypes:{},
      attachmentTypes:{},
      apiRequests:{total:0,querySources:{},efforts:{},thinkingConfigs:{},betas:{},cacheControlBreakpoints:0,fallbackCreditRequests:0},
      refusals:{stopRefusalIds:new Set(),syntheticErrors:0,safeguardNotices:0,noFallback:0,apiErrors:0,userInterrupts:0,categories:{}},
      fallbacks:{modelSwaps:{},modelSwapCount:0,noFallbackCount:0},
      interceptors:{serverClassifierIds:new Set(),serverClassifierRefusalIds:new Set(),autoModeDenials:0,autoModeRules:{},hookBlocks:0,stopHooksPrevented:0,hookErrors:0,manualDenials:0,autoModeConfig:null,modes:[],permissionModes:[]},
      compaction:{boundaries:0,microBoundaries:0,preTokensSum:0,preTokensMax:0,preTokensCount:0,queuedPrompts:0},
      costTiming:{apiDurationMs:0,apiNoRetryMs:0,toolDurationMs:0,totalDurationMs:0},
      events:[]
    };
    const bump=(map,key,by=1)=>{if(!key)return;map[key]=(map[key]||0)+by;};
    const pushMode=(arr,val)=>{const v=trim(val);if(v&&arr[arr.length-1]!==v)arr.push(v);};
    const addTelemetryEvent=(kind,severity,detail,tsValue)=>{
      if(telemetry.events.length>=24)return;
      telemetry.events.push({kind,severity,detail:string(detail).slice(0,140),ts:tsValue||''});
    };

    const noteTs=iso=>{
      if(!iso)return;
      if(!firstTs||iso<firstTs)firstTs=iso;
      if(!lastTs||iso>lastTs)lastTs=iso;
    };

    const startTurn=(ts,model)=>{
      const blocks=pendingPreUserBlocks.length?[...pendingPreUserBlocks]:[];
      pendingPreUserBlocks=[];
      return {
        ts:ts||lastTs||firstTs,
        model:model||defaultModel||'',
        blocks,
        pendingPlans:[],
        seenTextNorms:new Set(),
        seenThinkNorms:new Set()
      };
    };

    const ensureTurn=(ts,model)=>{
      if(!currentTurn){
        currentTurn=startTurn(ts,model);
      }else{
        if(ts&&(!currentTurn.ts||ts>currentTurn.ts))currentTurn.ts=ts;
        if(model&&!currentTurn.model)currentTurn.model=model;
      }
      return currentTurn;
    };

    const pushMessage=(sender,ts,contentBlocks,model)=>{
      const baseId='cc:'+(agentId||sessionId||'session')+':m'+messages.length;
      const parentUuid=messages.length?messages[messages.length-1].uuid:root;
      const stampedContent=[];
      for(const b of list(contentBlocks)){
        if(!b||typeof b!=='object')continue;
        stampedContent.push(b);
      }
      if(!stampedContent.length)return null;
      const msg={
        uuid:baseId,
        parent_message_uuid:parentUuid,
        sender,
        created_at:ts||firstTs,
        updated_at:ts||firstTs,
        sourcePlatform:'claude_code',
        ...(model?{model}:{}),
        content:stampedContent,
        attachments:[]
      };
      messages.push(msg);
      return msg;
    };

    const flushTurn=()=>{
      if(!currentTurn)return;
      for(const pp of currentTurn.pendingPlans){
        if(!seenPlanNorms.has(pp.pnorm)){
          seenPlanNorms.add(pp.pnorm);
          currentTurn.blocks.push({type:'text',text:'> [!NOTE]\n> **Claude Code Plan**\n\n'+pp.plan});
        }
      }
      currentTurn.pendingPlans=[];
      if(currentTurn.blocks.length){
        pushMessage('assistant',currentTurn.ts||lastTs||firstTs,currentTurn.blocks,currentTurn.model||defaultModel);
      }
      currentTurn=null;
    };

    const queueInjected=(source,prompt,extra={})=>{
      const cleanPrompt=boundedText(String(prompt||'').trim(),warnings,'context');
      if(!cleanPrompt&&!extra.agentMeta)return;
      const key=source+'::'+cleanPrompt.slice(0,180);
      if(key===lastInjectedKey)return;
      lastInjectedKey=key;
      const block={type:'injected_prompt_block',injection_source:source,prompt:cleanPrompt,...extra};
      if(currentTurn)currentTurn.blocks.push(block);
      else if(messages.length&&messages[messages.length-1].sender==='assistant')messages[messages.length-1].content.push(block);
      else pendingPreUserBlocks.push(block);
    };

    for(let lineIdx=0;lineIdx<lines.length;lineIdx++){
      if(lineIdx>0&&lineIdx%256===0)yield;
      const rawLine=lines[lineIdx].trim();
      if(!rawLine)continue;

      let obj;
      try{obj=JSON.parse(rawLine);}catch{malformedLines++;continue;}
      if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;

      const rtype=string(obj.type);
      const ts=parseDate(obj.timestamp);
      if(ts)noteTs(ts);
      if(rtype)bump(telemetry.recordTypes,rtype);

      if(obj.sessionId&&!sessionId)sessionId=string(obj.sessionId);
      if(obj.cwd&&!cwd)cwd=string(obj.cwd);
      if(obj.gitBranch)gitBranch=string(obj.gitBranch);
      if(obj.version)cliVersion=string(obj.version);
      if(obj.slug&&!slug)slug=string(obj.slug);
      if(obj.entrypoint&&!entrypoint)entrypoint=string(obj.entrypoint);
      if(obj.isSidechain===true)isSidechain=true;
      if(obj.agentId&&!agentId)agentId=string(obj.agentId);

      // Dynamic session metadata events
      if(rtype==='ai-title'){
        if(trim(obj.aiTitle))aiTitle=trim(obj.aiTitle);
        continue;
      }
      if(rtype==='custom-title'){
        if(trim(obj.customTitle))customTitle=trim(obj.customTitle);
        continue;
      }
      if(rtype==='summary'){
        if(trim(obj.summary))summaryTitle=trim(obj.summary);
        continue;
      }
      if(rtype==='last-prompt'){
        if(trim(obj.lastPrompt)&&!lastPromptTitle)lastPromptTitle=trim(obj.lastPrompt);
        continue;
      }
      if(rtype==='cost-state'){
        latestCostState={
          totalCostUSD:typeof obj.totalCostUSD==='number'?obj.totalCostUSD:null,
          totalLinesAdded:typeof obj.totalLinesAdded==='number'?obj.totalLinesAdded:null,
          totalLinesRemoved:typeof obj.totalLinesRemoved==='number'?obj.totalLinesRemoved:null,
          totalDurationMs:typeof obj.totalDuration==='number'?obj.totalDuration:null,
          modelUsage:obj.modelUsage&&typeof obj.modelUsage==='object'?obj.modelUsage:null
        };
        if(typeof obj.totalAPIDuration==='number'&&Number.isFinite(obj.totalAPIDuration))telemetry.costTiming.apiDurationMs=obj.totalAPIDuration;
        if(typeof obj.totalAPIDurationWithoutRetries==='number'&&Number.isFinite(obj.totalAPIDurationWithoutRetries))telemetry.costTiming.apiNoRetryMs=obj.totalAPIDurationWithoutRetries;
        if(typeof obj.totalToolDuration==='number'&&Number.isFinite(obj.totalToolDuration))telemetry.costTiming.toolDurationMs=obj.totalToolDuration;
        if(typeof obj.totalDuration==='number'&&Number.isFinite(obj.totalDuration))telemetry.costTiming.totalDurationMs=obj.totalDuration;
        continue;
      }
      if(rtype==='mode'){
        const nextMode=string(obj.mode);
        pushMode(telemetry.interceptors.modes,nextMode);
        if(nextMode&&nextMode!==latestMode){
          const hadMode=!!latestMode;
          latestMode=nextMode;
          if(hadMode||nextMode!=='normal'){
            queueInjected('cc:mode:'+nextMode,'Mode switched to: '+nextMode);
            addTelemetryEvent('mode_switch','info',nextMode,ts);
          }
        }
        continue;
      }
      if(rtype==='permission-mode'){
        const pmode=string(obj.permissionMode||obj.mode);
        pushMode(telemetry.interceptors.permissionModes,pmode);
        if(pmode&&pmode!=='default'&&pmode!=='normal')addTelemetryEvent('permission_mode','info',pmode,ts);
        continue;
      }
      if(rtype==='api-request'){
        telemetry.apiRequests.total++;
        if(trim(obj.querySource))bump(telemetry.apiRequests.querySources,trim(obj.querySource));
        const p=obj.params&&typeof obj.params==='object'?obj.params:null;
        if(p){
          if(trim(p.output_config?.effort))bump(telemetry.apiRequests.efforts,trim(p.output_config.effort));
          if(p.thinking&&typeof p.thinking==='object'){
            const tk=[string(p.thinking.type),string(p.thinking.display)].filter(Boolean).join('/');
            if(tk)bump(telemetry.apiRequests.thinkingConfigs,tk);
          }
          if(Array.isArray(p.betas)){
            let hasFallbackCredit=false;
            for(const b of p.betas){
              const bs=trim(b);
              if(!bs)continue;
              bump(telemetry.apiRequests.betas,bs);
              if(/^fallback-credit/i.test(bs))hasFallbackCredit=true;
            }
            if(hasFallbackCredit)telemetry.apiRequests.fallbackCreditRequests++;
          }
        }
        if(Array.isArray(obj.cacheControl))telemetry.apiRequests.cacheControlBreakpoints+=obj.cacheControl.length;
        continue;
      }

      if(SKIP_NOISE_TYPES.has(rtype))continue;

      if(rtype==='system'){
        const stype=string(obj.subtype);
        if(stype==='compact_boundary'||stype==='microcompact_boundary'){
          if(stype==='microcompact_boundary')telemetry.compaction.microBoundaries++;
          else{compactedCount++;telemetry.compaction.boundaries++;}
          const trigger=obj.compactMetadata?.trigger||'auto';
          const preTokens=Number(obj.compactMetadata?.preTokens);
          if(Number.isFinite(preTokens)&&preTokens>0){
            telemetry.compaction.preTokensSum+=preTokens;
            telemetry.compaction.preTokensMax=Math.max(telemetry.compaction.preTokensMax,preTokens);
            telemetry.compaction.preTokensCount++;
          }
          const label='Context compacted ('+trigger+(Number.isFinite(preTokens)&&preTokens>0?', pre-tokens: '+preTokens:'')+')';
          queueInjected('cc:compacted',label);
          addTelemetryEvent('compaction','info',trigger+(Number.isFinite(preTokens)&&preTokens>0?' ('+preTokens+' tok)':''),ts);
          continue;
        }
        if(stype==='turn_duration'){
          // Optional subtle duration metadata; skip injecting clutter unless needed
          continue;
        }
        if(stype==='model_refusal_no_fallback'){
          telemetry.refusals.noFallback++;
          telemetry.fallbacks.noFallbackCount++;
          const cat=trim(obj.apiRefusalCategory)||'unspecified';
          bump(telemetry.refusals.categories,cat);
          const origModel=trim(obj.originalModel)||'unknown';
          addTelemetryEvent('no_fallback','high',origModel+' ['+cat+']',ts);
          const t=ensureTurn(ts);
          const msgText=trim(obj.content||obj.error?.message||obj.apiRefusalExplanation)||'Model refusal (no fallback)';
          t.blocks.push({type:'text',text:'_[Turn aborted: '+msgText+']_'});
          continue;
        }
        if(stype==='model_fallback'){
          const fromM=trim(obj.originalModel||obj.fromModel);
          const toM=trim(obj.fallbackModel||obj.targetModel||obj.newModel);
          const pair=fromM&&toM?(fromM+' → '+toM):(toM||'model_fallback');
          bump(telemetry.fallbacks.modelSwaps,pair);
          telemetry.fallbacks.modelSwapCount++;
          addTelemetryEvent('fallback','warn',pair,ts);
          const infoText=trim(obj.content);
          if(infoText)queueInjected('cc:system:model_fallback',infoText);
          continue;
        }
        if(stype==='stop_hook_summary'){
          const prevented=!!obj.preventedContinuation;
          const errLen=Array.isArray(obj.hookErrors)?obj.hookErrors.length:0;
          if(prevented){telemetry.interceptors.stopHooksPrevented++;telemetry.interceptors.hookBlocks++;}
          if(errLen)telemetry.interceptors.hookErrors+=errLen;
          if(prevented||errLen)addTelemetryEvent('hook_block',prevented?'warn':'info',(prevented?'preventedContinuation':'hookError')+(obj.hookCount?' ('+obj.hookCount+' hooks)':''),ts);
          continue;
        }
        if(stype==='api_error'||obj.level==='warning'||obj.level==='error'){
          telemetry.refusals.apiErrors++;
          addTelemetryEvent('api_error','warn',trim(obj.error?.error?.type||obj.error?.type||stype||'api_error'),ts);
          const t=ensureTurn(ts);
          const msgText=trim(obj.content||obj.error?.message||obj.apiRefusalExplanation)||'System alert';
          t.blocks.push({type:'text',text:'_[Turn aborted: '+msgText+']_'});
          continue;
        }
        if(stype==='informational'||stype==='local_command'){
          const infoText=trim(obj.content);
          if(stype==='informational'&&/safeguards stopped/i.test(infoText)){
            telemetry.refusals.safeguardNotices++;
            addTelemetryEvent('safeguard_stop','warn',infoText.slice(0,90),ts);
          }
          if(infoText)queueInjected('cc:system:'+stype,infoText);
          continue;
        }
        continue;
      }

      if(rtype==='attachment'){
        const att=obj.attachment;
        if(!att||typeof att!=='object')continue;
        const atype=string(att.type);
        if(atype)bump(telemetry.attachmentTypes,atype);
        if(atype==='auto_mode'){
          telemetry.interceptors.autoModeConfig={
            consentFlow:!!att.autoModeConsentFlow,
            bashFirst:!!att.bashFirst,
            bashFirstSteer:string(att.bashFirstSteer),
            steerOnly:!!att.steerOnly,
            bypass:!!att.bypass
          };
        }
        if(atype==='model'&&trim(att.identity))defaultModel=trim(att.identity);
        if(SKIP_ATTACHMENT_TYPES.has(atype))continue;

        if(atype==='queued_command'){
          const promptArr=list(att.prompt);
          const rawText=promptArr.length?promptArr.map(p=>typeof p==='string'?p:string(p?.text)).join('\n\n'):string(att.prompt);
          const {cleaned,contextChunks}=extractInlineContextTags(rawText);
          if(att.commandMode==='prompt'||att.humanTurn===true){
            const norm=normDedupe(cleaned);
            if(norm&&!seenHumanNorms.has(norm)){
              telemetry.compaction.queuedPrompts++;
              flushTurn();
              if(!firstPromptCandidate&&cleaned)firstPromptCandidate=cleaned.split(/\r?\n/)[0].slice(0,90);
              for(const c of contextChunks)pendingPreUserBlocks.push({type:'injected_prompt_block',injection_source:'cc:context:'+c.tag,prompt:c.text});
              pushMessage('human',ts,[{type:'text',text:cleaned}],'');
              seenHumanNorms.add(norm);
              currentTurn=startTurn(ts,defaultModel);
            }
          }else if(rawText.trim()){
            queueInjected('cc:notification',rawText.trim());
          }
          continue;
        }

        if(atype==='edited_text_file'&&att.filename){
          queueInjected('cc:edited_file','IDE file modified: '+att.filename+(att.snippet?'\n\n'+att.snippet:''));
          continue;
        }
        if(atype==='prompt_snapshot'){
          const linesOut=list(att.systemPrompt).slice(0,25).join('\n');
          if(linesOut)queueInjected('cc:prompt_snapshot',linesOut);
          continue;
        }
        if(atype==='deferred_tools_record'){
          const toolNames=list(att.entries).map(e=>e?.name).filter(Boolean).join(', ');
          if(toolNames)queueInjected('cc:deferred_tools','Deferred tools available: '+toolNames);
          continue;
        }
        if(atype==='instructions'||atype==='session_context'){
          const txt=trim(att.text||att.content||att.rendered||JSON.stringify(att));
          if(txt)queueInjected('cc:'+atype,txt);
          continue;
        }
        continue;
      }

      if(rtype==='user'){
        const msg=obj.message;
        const msgContent=msg?.content;
        const rawTur=obj.toolUseResult;

        if(obj.isMeta===true){
          let metaText='';
          if(typeof msgContent==='string')metaText=msgContent;
          else if(Array.isArray(msgContent))metaText=msgContent.map(b=>b?.type==='text'?string(b.text):'').filter(Boolean).join('\n\n');
          metaText=trim(metaText);
          if(!metaText)continue;
          if(/safety classifier/i.test(metaText))queueInjected('cc:classifier',metaText);
          else if(/<local-command-caveat>/i.test(metaText))queueInjected('cc:caveat',metaText.replace(/<\/?local-command-caveat>/gi,'').trim());
          else queueInjected('cc:meta',metaText);
          continue;
        }

        const humanParts=[];
        let hasToolResult=false;

        const handleUserText=(txt)=>{
          if(!txt)return;
          const {cleaned,contextChunks}=extractInlineContextTags(txt);
          for(const c of contextChunks){
            queueInjected('cc:context:'+c.tag,c.text);
          }
          if(cleaned){
            if(/^\[Request interrupted by user/i.test(cleaned)){
              telemetry.refusals.userInterrupts++;
              addTelemetryEvent('interrupt','info',cleaned.replace(/^\[|\]$/g,''),ts);
              const t=ensureTurn(ts);
              t.blocks.push({type:'text',text:'_[Turn aborted: '+cleaned.replace(/^\[|\]$/g,'')+']_'});
            }else if(obj.isCompactSummary===true){
              queueInjected('cc:compacted',cleaned);
            }else{
              humanParts.push({type:'text',text:cleaned});
            }
          }
        };

        if(typeof msgContent==='string'){
          handleUserText(msgContent);
        }else if(Array.isArray(msgContent)){
          for(const item of msgContent){
            if(!item||typeof item!=='object')continue;
            const itype=string(item.type);
            if(itype==='tool_result'){
              hasToolResult=true;
              const useId=string(item.tool_use_id);
              if(useId&&seenToolResultIds.has(useId))continue;
              if(useId)seenToolResultIds.add(useId);
              const paired=useId?toolMap.get(useId):null;
              const toolName=paired?.name||'';

              // Enrich paired Edit / Write tool_use with unified diff patch if available
              if(paired&&rawTur&&typeof rawTur==='object'){
                const fp=string(rawTur.filePath||paired.input?.file_path);
                if((toolName==='Edit'||toolName==='MultiEdit'||toolName==='Write')&&!paired.input?.patch){
                  const patch=Array.isArray(rawTur.structuredPatch)&&rawTur.structuredPatch.length
                    ?buildUnifiedPatchFromStructured(fp,rawTur.structuredPatch)
                    :(typeof rawTur.oldString==='string'||typeof rawTur.newString==='string')
                      ?buildSimpleDiffFromStrings(fp,rawTur.oldString,rawTur.newString)
                      :'';
                  if(patch)paired.input={...(paired.input||{}),patch};
                }
              }

              const formatted=formatToolResultOutput(item.content,rawTur,warnings,toolName);
              const isErr=!!(item.is_error||formatted.isError);
              if(isErr||typeof rawTur==='string'){
                const errSignal=[typeof rawTur==='string'?rawTur:'',formatted.text].filter(Boolean).join('\n');
                if(/denied by the Claude Code auto mode classifier/i.test(errSignal)){
                  telemetry.interceptors.autoModeDenials++;
                  const rm=/\[([^\]]{2,40})\]/.exec(errSignal);
                  const ruleName=rm?rm[1]:'AutoMode';
                  bump(telemetry.interceptors.autoModeRules,ruleName);
                  addTelemetryEvent('auto_mode_deny','warn',(toolName||'tool')+(rm?' ['+ruleName+']':''),ts);
                }else if(/\b(?:PreToolUse|PostToolUse)\s+hook\b|Execution stopped by .*hook/i.test(errSignal)){
                  telemetry.interceptors.hookBlocks++;
                  addTelemetryEvent('hook_block','warn',(toolName||'tool')+' hook blocked',ts);
                }else if(/doesn't want to proceed|User rejected|Permission for this action was denied/i.test(errSignal)){
                  telemetry.interceptors.manualDenials++;
                }
              }
              const t=ensureTurn(ts);
              const resBlocks=[];
              if(formatted.text)resBlocks.push({type:'text',text:formatted.text});
              if(Array.isArray(item.content)){
                for(const sub of item.content){
                  if(sub?.type==='image'&&sub.source)appendImageBlock(resBlocks,sub.source,imageState,warnings);
                }
              }
              t.blocks.push({
                type:'tool_result',
                tool_use_id:useId||('cc-res-'+lineIdx),
                name:toolName||'tool',
                is_error:isErr,
                content:resBlocks
              });

              // Surface ExitPlanMode plan content as an Antigravity Plan Card
              if(toolName==='ExitPlanMode'&&!isErr){
                const planBody=trim(rawTur?.plan||paired?.input?.plan||formatted.text);
                if(planBody){
                  const pnorm=normDedupe(planBody);
                  if(!seenPlanNorms.has(pnorm)){
                    seenPlanNorms.add(pnorm);
                    t.blocks.push({type:'text',text:'> [!NOTE]\n> **Claude Code Plan**\n\n'+planBody});
                  }
                }
              }
              continue;
            }
            if(itype==='text'){
              handleUserText(string(item.text));
              continue;
            }
            if(itype==='image'&&item.source){
              appendImageBlock(humanParts,item.source,imageState,warnings);
              continue;
            }
            if(itype==='document'){
              const docTitle=string(item.title||item.source?.media_type||'Document');
              humanParts.push({type:'text',text:'_[Attached document: '+docTitle+']_'});
              continue;
            }
          }
        }

        if(humanParts.length){
          const plain=humanParts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n').trim();
          const norm=normDedupe(plain);
          const hasImg=humanParts.some(b=>b.type==='image');
          if((norm&&!seenHumanNorms.has(norm))||hasImg){
            flushTurn();
            if(!firstPromptCandidate&&plain)firstPromptCandidate=plain.split(/\r?\n/)[0].slice(0,90);
            pushMessage('human',ts,humanParts,'');
            if(norm)seenHumanNorms.add(norm);
            currentTurn=startTurn(ts,defaultModel);
          }
        }else if(!hasToolResult){
          // Empty non-tool user record: nothing to push
        }
        continue;
      }

      if(rtype==='assistant'){
        const msg=obj.message;
        if(!msg||typeof msg!=='object')continue;
        const msgId=string(msg.id);
        const rawModel=string(msg.model);
        const isSynthetic=rawModel==='<synthetic>'||!!obj.isApiErrorMessage;
        if(rawModel&&rawModel!=='<synthetic>')defaultModel=rawModel;

        if(trim(obj.serverClassifierRequest)){
          const cid=trim(obj.serverClassifierRequest);
          telemetry.interceptors.serverClassifierIds.add(cid);
          if(msg.stop_reason==='refusal')telemetry.interceptors.serverClassifierRefusalIds.add(cid);
        }

        const t=ensureTurn(ts,rawModel!=='<synthetic>'?rawModel:'');

        if(msgId){
          let entry=assistantMsgById.get(msgId);
          if(!entry){
            entry={rawModel,lastUsage:null,stopReason:''};
            assistantMsgById.set(msgId,entry);
          }
          if(msg.stop_reason)entry.stopReason=string(msg.stop_reason);
          if(msg.usage&&typeof msg.usage==='object')entry.lastUsage=msg.usage;
        }

        if(isSynthetic){
          if(msg.stop_reason==='refusal'||obj.refusedMessageId||obj.error){
            telemetry.refusals.syntheticErrors++;
            if(obj.error)bump(telemetry.refusals.categories,string(obj.error));
          }
          const synthText=list(msg.content).filter(b=>b?.type==='text').map(b=>trim(b.text)).filter(Boolean).join('\n');
          if(synthText&&!/^No response requested\.?$/i.test(synthText)){
            t.blocks.push({type:'text',text:'_[Turn aborted: '+synthText+']_'});
          }
          continue;
        }

        if(msg.stop_reason==='refusal'){
          const rKey=msgId||('line-'+lineIdx);
          if(!telemetry.refusals.stopRefusalIds.has(rKey)){
            telemetry.refusals.stopRefusalIds.add(rKey);
            addTelemetryEvent('refusal','high',(rawModel||'assistant')+(obj.serverClassifierRequest?' + serverClassifier':''),ts);
          }
        }
        const reqModel=trim(obj.requestedModel);
        if(reqModel&&rawModel&&reqModel!==rawModel){
          const fKey=msgId||('line-'+lineIdx);
          if(!seenFallbackMsgIds.has(fKey)){
            seenFallbackMsgIds.add(fKey);
            const swapPair=reqModel+' → '+rawModel;
            bump(telemetry.fallbacks.modelSwaps,swapPair);
            telemetry.fallbacks.modelSwapCount++;
            addTelemetryEvent('fallback','warn',swapPair,ts);
          }
        }

        for(const b of list(msg.content)){
          if(!b||typeof b!=='object')continue;
          const bt=string(b.type);
          if(bt==='thinking'||bt==='redacted_thinking'){
            const dur=typeof obj.thinkingDurationMs==='number'&&obj.thinkingDurationMs>0?obj.thinkingDurationMs:undefined;
            const txt=trim(b.thinking);
            if(bt==='redacted_thinking'||!txt){
              t.blocks.push({
                type:'thinking',
                thinking:'',
                thinking_hidden:true,
                ...(dur!==undefined?{duration_ms:dur}:{})
              });
            }else{
              const tnorm=normDedupe(txt);
              if(tnorm&&!t.seenThinkNorms.has(tnorm)){
                t.seenThinkNorms.add(tnorm);
                t.blocks.push({
                  type:'thinking',
                  thinking:txt,
                  ...(dur!==undefined?{duration_ms:dur}:{})
                });
              }
            }
            continue;
          }
          if(bt==='text'){
            const txt=trim(b.text);
            if(!txt)continue;
            const tnorm=normDedupe(txt);
            if(tnorm&&!t.seenTextNorms.has(tnorm)){
              t.seenTextNorms.add(tnorm);
              t.blocks.push({type:'text',text:b.text});
            }
            continue;
          }
          if(bt==='tool_use'){
            const callId=string(b.id)||('cc-call-'+lineIdx);
            if(seenToolUseIds.has(callId))continue;
            seenToolUseIds.add(callId);
            const name=string(b.name)||'tool';
            const inputObj=b.input&&typeof b.input==='object'?{...b.input}:{};
            if((name==='Edit'||name==='MultiEdit')&&(typeof inputObj.old_string==='string'||typeof inputObj.new_string==='string')&&!inputObj.patch){
              const patch=buildSimpleDiffFromStrings(string(inputObj.file_path),inputObj.old_string,inputObj.new_string);
              if(patch)inputObj.patch=patch;
            }
            const toolBlock={type:'tool_use',id:callId,name,input:inputObj};
            toolMap.set(callId,toolBlock);
            t.blocks.push(toolBlock);
            if(name==='ExitPlanMode'&&typeof inputObj.plan==='string'&&trim(inputObj.plan)){
              // Prefer emitting right after paired tool_result (or in flushTurn if unpaired) so Steps stay grouped
              const pnorm=normDedupe(inputObj.plan);
              if(!seenPlanNorms.has(pnorm))t.pendingPlans.push({pnorm,plan:trim(inputObj.plan)});
            }
            continue;
          }
        }
        continue;
      }
    }

    if(pendingPreUserBlocks.length)ensureTurn(firstTs,defaultModel);
    flushTurn();
    if(malformedLines>0)warnings.push('skipped_malformed_jsonl_lines:'+malformedLines);

    // Compute accurate token usage using last fragment per message.id (never sum streaming fragments)
    let inputTokens=0,outputTokens=0,cacheReadTokens=0,cacheCreateTokens=0,countedUsage=false;
    for(const entry of assistantMsgById.values()){
      if(entry.rawModel==='<synthetic>')continue;
      const u=entry.lastUsage;
      if(!u)continue;
      // Only trust finished calls (stopReason present) or single-shot complete usage when costState unavailable
      if(entry.stopReason){
        inputTokens+=Number(u.input_tokens||0);
        outputTokens+=Number(u.output_tokens||0);
        cacheReadTokens+=Number(u.cache_read_input_tokens||0);
        cacheCreateTokens+=Number(u.cache_creation_input_tokens||0);
        countedUsage=true;
      }
    }
    if(latestCostState?.modelUsage){
      let cIn=0,cOut=0,cRead=0,cCreate=0;
      for(const mu of Object.values(latestCostState.modelUsage)){
        if(!mu||typeof mu!=='object')continue;
        cIn+=Number(mu.inputTokens||0);
        cOut+=Number(mu.outputTokens||0);
        cRead+=Number(mu.cacheReadInputTokens||0);
        cCreate+=Number(mu.cacheCreationInputTokens||0);
      }
      if(cIn+cOut+cRead+cCreate>0){
        inputTokens=cIn;outputTokens=cOut;cacheReadTokens=cRead;cacheCreateTokens=cCreate;countedUsage=true;
      }
    }
    const totalTokens=countedUsage?(inputTokens+outputTokens+cacheReadTokens+cacheCreateTokens):0;

    if(!sessionId){
      const fnId=/([0-9a-f]{8}-[0-9a-f-]{12,})/i.exec(filePath);
      sessionId=subMetaFromPath?.parentSessionId||(fnId?fnId[1]:hashKey(filePath+'|'+firstTs));
    }

    const cwdInfo=projectFromCwd(cwd);
    const convUuid=agentId?'cc:'+sessionId+':agent:'+agentId:'cc:'+sessionId;
    const baseTitle=customTitle||aiTitle||summaryTitle||slug||firstPromptCandidate||lastPromptTitle||(cwdInfo?'['+cwdInfo.project.name.replace(/ \(Claude Code\)$/,'')+'] '+fileName:fileName);
    const agentNickname=agentType||agentId||'';
    const displayTitle=(isSidechain&&agentNickname&&!baseTitle.includes(agentNickname))
      ?('['+agentNickname+'] '+baseTitle)
      :baseTitle;

    const conversation={
      uuid:convUuid,
      originalId:agentId?sessionId+':'+agentId:sessionId,
      sourcePlatform:'claude_code',
      name:displayTitle,
      summary:summaryTitle||'',
      created_at:firstTs||lastTs,
      updated_at:lastTs||firstTs,
      ...(cwdInfo?{workspaceId:cwdInfo.wsId}:{}),
      ...(defaultModel?{defaultModel}:{}),
      claudeCodeMeta:{
        cwd:normalizeCwd(cwd),
        cliVersion,
        gitBranch,
        ...(slug?{slug}:{}),
        ...(entrypoint?{entrypoint}:{}),
        ...(latestMode?{mode:latestMode}:{}),
        ...(isSidechain?{isSubagent:true}:{}),
        ...(agentId?{agentId}:{}),
        ...(agentType?{agentType}:{}),
        ...(agentNickname?{agentNickname}:{}),
        ...(agentDescription?{agentDescription}:{}),
        ...(parentAgentId?{parentAgentId}:{}),
        ...(parentSessionId?{parentThreadId:parentSessionId}:{}),
        ...(workflowId?{workflowId}:{}),
        ...(compactedCount?{compactedWindows:compactedCount}:{}),
        ...(latestCostState?{
          totalCostUSD:latestCostState.totalCostUSD,
          totalLinesAdded:latestCostState.totalLinesAdded,
          totalLinesRemoved:latestCostState.totalLinesRemoved,
          totalDurationMs:latestCostState.totalDurationMs
        }:{}),
        ...(countedUsage?{usage:{input_tokens:inputTokens,output_tokens:outputTokens,cache_read_input_tokens:cacheReadTokens,cache_creation_input_tokens:cacheCreateTokens,total_tokens:totalTokens}}:{})
      },
      claudeCodeTelemetry:{
        recordTypes:telemetry.recordTypes,
        attachmentTypes:telemetry.attachmentTypes,
        apiRequests:telemetry.apiRequests,
        refusals:{
          stopRefusal:telemetry.refusals.stopRefusalIds.size,
          syntheticErrors:telemetry.refusals.syntheticErrors,
          safeguardNotices:telemetry.refusals.safeguardNotices,
          noFallback:telemetry.refusals.noFallback,
          apiErrors:telemetry.refusals.apiErrors,
          userInterrupts:telemetry.refusals.userInterrupts,
          categories:telemetry.refusals.categories
        },
        fallbacks:telemetry.fallbacks,
        interceptors:{
          serverClassifierRequests:telemetry.interceptors.serverClassifierIds.size,
          serverClassifierRefusals:telemetry.interceptors.serverClassifierRefusalIds.size,
          autoModeDenials:telemetry.interceptors.autoModeDenials,
          autoModeRules:telemetry.interceptors.autoModeRules,
          hookBlocks:telemetry.interceptors.hookBlocks,
          stopHooksPrevented:telemetry.interceptors.stopHooksPrevented,
          hookErrors:telemetry.interceptors.hookErrors,
          manualDenials:telemetry.interceptors.manualDenials,
          ...(telemetry.interceptors.autoModeConfig?{autoModeConfig:telemetry.interceptors.autoModeConfig}:{}),
          modes:telemetry.interceptors.modes,
          permissionModes:telemetry.interceptors.permissionModes
        },
        compaction:telemetry.compaction,
        costTiming:{
          ...telemetry.costTiming,
          retryOverheadMs:(telemetry.costTiming.apiDurationMs>0&&telemetry.costTiming.apiNoRetryMs>=0&&telemetry.costTiming.apiDurationMs>=telemetry.costTiming.apiNoRetryMs)
            ?(telemetry.costTiming.apiDurationMs-telemetry.costTiming.apiNoRetryMs):0
        },
        events:telemetry.events
      },
      importWarnings:warnings,
      chat_messages:messages
    };
    return {conversation,project:cwdInfo?cwdInfo.project:null,warnings};
  }

  function parseTranscriptText(text,opts={}){
    const it=convertTranscriptSteps(text,opts);
    let step;
    do{step=it.next();}while(!step.done);
    return step.value;
  }

  async function parseTranscriptAsync(text,opts={},checkpoint=async()=>{}){
    const it=convertTranscriptSteps(text,opts);
    let step;
    do{step=it.next();if(!step.done)await checkpoint();}while(!step.done);
    return step.value;
  }

  return {
    inspectJsonlText,
    isClaudeCodeText,
    isPromptHistoryRecord,
    parseTranscriptText,
    parseTranscriptAsync,
    parseDate,
    projectFromCwd
  };
}
