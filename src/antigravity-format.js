function antigravityExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const MAX_OUTPUT_CHARS=262144; // 256 KB per-tool-output guard
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const trim=value=>string(value).trim();

  const KNOWN_STEP_TYPES=new Set([
    'USER_INPUT','PLANNER_RESPONSE','GENERIC','SYSTEM_MESSAGE','EPHEMERAL_MESSAGE',
    'ERROR_MESSAGE','CONVERSATION_HISTORY','CHECKPOINT','USER_SETTINGS_CHANGE',
    'RUN_COMMAND','VIEW_FILE','LIST_DIRECTORY','GREP_SEARCH','SEARCH_WEB','CODE_ACTION',
    'WRITE_TO_FILE','REPLACE_FILE_CONTENT','MULTI_REPLACE_FILE_CONTENT',
    'FIND_BY_NAME','VIEW_FILE_OUTLINE','VIEW_CODE_ITEM','COMMAND_STATUS',
    'SEND_COMMAND_INPUT','TASK_BOUNDARY','NOTIFY_USER','ASK_QUESTION',
    'INVOKE_SUBAGENT','SEND_MESSAGE','MANAGE_SUBAGENTS','GENERATE_IMAGE',
    'READ_URL_CONTENT','READ_BROWSER_PAGE'
  ]);

  const TOOL_RESULT_TYPES=new Set([
    'RUN_COMMAND','VIEW_FILE','LIST_DIRECTORY','GREP_SEARCH','SEARCH_WEB',
    'CODE_ACTION','WRITE_TO_FILE','REPLACE_FILE_CONTENT','MULTI_REPLACE_FILE_CONTENT',
    'FIND_BY_NAME','VIEW_FILE_OUTLINE','VIEW_CODE_ITEM','COMMAND_STATUS',
    'SEND_COMMAND_INPUT','TASK_BOUNDARY','NOTIFY_USER','ASK_QUESTION',
    'INVOKE_SUBAGENT','SEND_MESSAGE','MANAGE_SUBAGENTS','GENERATE_IMAGE',
    'READ_URL_CONTENT','READ_BROWSER_PAGE'
  ]);

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

  function sanitizeToolArgs(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return value;
    const out={};
    for(const [k,v]of Object.entries(value)){
      if(typeof v==='string'){
        const tv=v.trim();
        if((tv.startsWith('"')&&tv.endsWith('"'))||(tv.startsWith('{')&&tv.endsWith('}'))||(tv.startsWith('[')&&tv.endsWith(']'))||tv==='true'||tv==='false'||/^-?\d+(?:\.\d+)?$/.test(tv)){
          try{out[k]=JSON.parse(tv);}catch{out[k]=v;}
        }else out[k]=v;
      }else if(v&&typeof v==='object'&&!Array.isArray(v)){
        out[k]=sanitizeToolArgs(v);
      }else out[k]=v;
    }
    return out;
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
    const lines=[];
    const cleanPath=String(filePath||'').replace(/^\/+/,'');
    if(cleanPath)lines.push('--- a/'+cleanPath,'+++ b/'+cleanPath);
    lines.push('@@ -1,'+oldLines.length+' +1,'+newLines.length+' @@');
    for(const l of oldLines)lines.push('-'+l);
    for(const l of newLines)lines.push('+'+l);
    return lines.join('\n');
  }

  function projectFromCwd(cwd){
    const norm=normalizeCwd(cwd);
    if(!norm)return null;
    const parts=norm.split('/').filter(Boolean);
    const base=parts[parts.length-1]||norm;
    const wsId=hashKey(norm);
    return {
      wsId,
      cwd:norm,
      project:{
        uuid:'ag:cwd:'+wsId,
        name:base+' (Antigravity)',
        description:'Antigravity Workspace: '+norm,
        docs:[],
        is_starter_project:false,
        sourcePlatform:'antigravity'
      }
    };
  }

  function isAntigravityTranscriptText(text){
    const raw=String(text||'').replace(/^\uFEFF/,'');
    const lines=raw.split(/\r?\n/);
    let checked=0,agHits=0;
    for(const line of lines){
      const s=line.trim();
      if(!s)continue;
      checked++;
      if(checked>40)break;
      try{
        const obj=JSON.parse(s);
        if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;
        if(Number.isInteger(obj.step_index)&&typeof obj.type==='string'&&(KNOWN_STEP_TYPES.has(obj.type)||'source' in obj||'status' in obj)){
          agHits++;
        }
      }catch{}
    }
    return agHits>0;
  }

  function parsePbtxtTitle(text){
    const raw=String(text||'');
    if(!raw.trim())return '';
    const m=/(?:^|\n)\s*(?:title|display_name|name|conversation_title)\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw);
    if(!m)return '';
    try{return JSON.parse('"'+m[1]+'"').trim();}catch{return m[1].trim();}
  }

  function inspectHistoryJsonl(text){
    const byId=new Map();
    const raw=String(text||'').replace(/^\uFEFF/,'');
    for(const line of raw.split(/\r?\n/)){
      const s=line.trim();
      if(!s)continue;
      try{
        const obj=JSON.parse(s);
        if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;
        const cid=trim(obj.conversationId||obj.conversation_id||obj.sessionId||obj.id);
        if(!cid)continue;
        const prev=byId.get(cid)||{conversationId:cid,display:'',workspace:'',timestamp:''};
        const disp=trim(obj.display||obj.title);
        const ws=trim(obj.workspace||obj.cwd);
        const ts=parseDate(obj.timestamp||obj.created_at);
        if(disp&&!prev.display)prev.display=disp;
        if(ws&&!prev.workspace)prev.workspace=ws;
        if(ts&&(!prev.timestamp||ts>prev.timestamp))prev.timestamp=ts;
        byId.set(cid,prev);
      }catch{}
    }
    return byId;
  }

  function unwrapUserInputContent(rawContent){
    const text=string(rawContent);
    const extracted=[];
    let userText='';
    const reqRe=/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/gi;
    const reqMatches=[];
    let m;
    while((m=reqRe.exec(text))!==null){
      if(trim(m[1]))reqMatches.push(trim(m[1]));
    }
    let remainder=text.replace(/<USER_REQUEST>[\s\S]*?<\/USER_REQUEST>/gi,'').trim();
    const tagDefs=[
      {tag:'ADDITIONAL_METADATA',src:'ag:metadata'},
      {tag:'USER_SETTINGS_CHANGE',src:'ag:settings'},
      {tag:'PLAN',src:'ag:plan_context'},
      {tag:'SKILLS',src:'ag:skills'},
      {tag:'EPHEMERAL_MESSAGE',src:'ag:ephemeral'},
      {tag:'SYSTEM_MESSAGE',src:'ag:system'}
    ];
    let detectedModel='';
    let detectedWorkspace='';
    for(const def of tagDefs){
      const re=new RegExp('<'+def.tag+'>([\\s\\S]*?)<\\/'+def.tag+'>','gi');
      remainder=remainder.replace(re,(_,inner)=>{
        const cleaned=trim(inner);
        if(cleaned){
          extracted.push({type:'injected_prompt_block',prompt:cleaned,injection_source:def.src});
          if(def.tag==='USER_SETTINGS_CHANGE'){
            const mm=/Model\s*Selection\s*[:=]\s*([^\r\n<]+)/i.exec(cleaned);
            if(mm)detectedModel=trim(mm[1]);
          }
          if(def.tag==='ADDITIONAL_METADATA'){
            const wm=/(?:Active\s+Workspaces|Workspace|cwd)\s*[:=]\s*([^\r\n<,]+)/i.exec(cleaned);
            if(wm&&/^\/|^[A-Za-z]:[\\/]/.test(trim(wm[1])))detectedWorkspace=trim(wm[1]);
          }
        }
        return '';
      });
    }
    remainder=trim(remainder);
    if(reqMatches.length){
      userText=reqMatches.join('\n\n');
      if(remainder)extracted.push({type:'injected_prompt_block',prompt:remainder,injection_source:'ag:envelope'});
    }else{
      userText=remainder||trim(text);
    }
    return {userText,injectedBlocks:extracted,detectedModel,detectedWorkspace};
  }

  function isSubagentToolCall(name){
    return /^(?:invoke_subagent|send_message|spawn_subagent|subagent)$/i.test(trim(name));
  }

  function* convertTranscriptSteps(text,opts={}){
    const filePath=string(opts.path||'transcript_full.jsonl').replace(/\\/g,'/');
    const convIdHint=trim(opts.conversationId)||(/brain\/(?:.*\/)?([0-9a-f]{8}-[0-9a-f-]{12,}|[A-Za-z0-9_-]{8,})\/(?:\.system_generated|[^/]+\.(?:jsonl|md))?/i.exec(filePath)?.[1]||'');
    const sourceVariant=opts.sourceVariant||(filePath.includes('transcript_full')?'full':filePath.includes('chunks/')?'chunks':'compact');
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);

    const recordsByStep=new Map();
    const fallbackRecords=[];
    let malformedLines=0,lineIndex=0;
    for(const rawLine of lines){
      if(++lineIndex%200===0)yield;
      const s=rawLine.trim();
      if(!s)continue;
      let obj;
      try{obj=JSON.parse(s);}catch{malformedLines++;continue;}
      if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;
      if(Number.isInteger(obj.step_index)){
        const prev=recordsByStep.get(obj.step_index);
        // Prefer untruncated record when merging compact & full copies
        if(!prev||(Array.isArray(prev.truncated_fields)&&!Array.isArray(obj.truncated_fields))){
          recordsByStep.set(obj.step_index,obj);
        }
      }else{
        fallbackRecords.push(obj);
      }
    }

    const steps=[...[...recordsByStep.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]),...fallbackRecords];
    const warnings=[];
    if(malformedLines>0)warnings.push('skipped_malformed_jsonl_lines:'+malformedLines);

    const messages=[];
    let prevMsgUuid=root;
    let firstTs='',lastTs='',defaultModel=trim(opts.modelName||''),inferredCwd=normalizeCwd(opts.workspace||'');
    let firstPromptTitle='';
    let truncatedSteps=0,runningSteps=0,errorSteps=0;
    let inputTokens=0,outputTokens=0,cacheReadTokens=0;
    let plannerStreak=0,maxPlannerStreak=0;
    let notifyGates=0,taskBoundaryCount=0,subagentSpawns=0;
    const phases={PLANNING:0,EXECUTION:0,VERIFICATION:0,OTHER:0};
    const modelSwitches=[];
    const toolCounts={};
    const toolErrorCounts={};
    const childConversationIds=[];
    const filesTouched=new Set();
    const telemetryEvents=[];

    // Track last assistant turn and queued tool calls awaiting trailing result step records
    let currentTurn=null;
    let pendingToolNodes=[];

    const flushAssistantTurn=()=>{
      if(!currentTurn)return;
      const blocks=currentTurn.blocks;
      if(blocks.length){
        const id='ag-msg-'+hashKey(convIdHint+':'+messages.length+':'+currentTurn.createdAt);
        const rawText=blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
        messages.push({
          uuid:id,
          sender:'assistant',
          created_at:currentTurn.createdAt||lastTs||firstTs,
          updated_at:currentTurn.updatedAt||currentTurn.createdAt||lastTs||firstTs,
          parent_message_uuid:prevMsgUuid,
          model:currentTurn.model||defaultModel||undefined,
          content:blocks,
          text:rawText,
          attachments:[],
          files:[]
        });
        prevMsgUuid=id;
      }
      currentTurn=null;
      pendingToolNodes=[];
    };

    const ensureAssistantTurn=(ts,model)=>{
      if(!currentTurn){
        currentTurn={createdAt:ts||lastTs||firstTs,updatedAt:ts||lastTs||firstTs,model:model||defaultModel,blocks:[]};
      }else{
        if(ts)currentTurn.updatedAt=ts;
        if(model&&!currentTurn.model)currentTurn.model=model;
      }
      return currentTurn;
    };

    const recordToolName=(name,isErr=false)=>{
      const k=name||'unknown';
      toolCounts[k]=(toolCounts[k]||0)+1;
      if(isErr)toolErrorCounts[k]=(toolErrorCounts[k]||0)+1;
    };

    for(let i=0;i<steps.length;i++){
      if(i%100===0)yield;
      const step=steps[i];
      const ts=parseDate(step.created_at||step.timestamp)||lastTs;
      if(ts){if(!firstTs)firstTs=ts;lastTs=ts;}
      const stype=string(step.type).toUpperCase();
      const status=string(step.status).toUpperCase();
      const source=string(step.source).toUpperCase();
      const isTruncated=Array.isArray(step.truncated_fields)&&step.truncated_fields.length>0;
      if(isTruncated)truncatedSteps++;
      if(status==='RUNNING')runningSteps++;

      // Model from step if explicitly included
      const stepModel=trim(step.model||step.modelName||'');
      if(stepModel){
        if(defaultModel&&stepModel!==defaultModel&&!modelSwitches.includes(stepModel))modelSwitches.push(stepModel);
        if(!defaultModel)defaultModel=stepModel;
      }

      if(stype==='USER_INPUT'||(source==='USER_EXPLICIT'&&stype!=='USER_SETTINGS_CHANGE')){
        flushAssistantTurn();
        plannerStreak=0;
        const {userText,injectedBlocks,detectedModel,detectedWorkspace}=unwrapUserInputContent(step.content);
        if(detectedModel){
          if(defaultModel&&detectedModel!==defaultModel&&!modelSwitches.includes(detectedModel))modelSwitches.push(detectedModel);
          if(!defaultModel)defaultModel=detectedModel;
        }
        if(detectedWorkspace&&!inferredCwd)inferredCwd=normalizeCwd(detectedWorkspace);
        if(!firstPromptTitle&&userText){
          firstPromptTitle=userText.split(/\r?\n/).map(x=>x.trim()).find(Boolean)||'';
          if(firstPromptTitle.length>72)firstPromptTitle=firstPromptTitle.slice(0,72)+'…';
        }
        const blocks=[];
        if(userText)blocks.push({type:'text',text:userText});
        for(const ib of injectedBlocks)blocks.push(ib);
        const msgId='ag-step-'+(Number.isInteger(step.step_index)?step.step_index:messages.length);
        messages.push({
          uuid:msgId,
          sender:'human',
          created_at:ts||firstTs,
          updated_at:ts||firstTs,
          parent_message_uuid:prevMsgUuid,
          content:blocks.length?blocks:[{type:'text',text:''}],
          text:userText,
          attachments:[],
          files:[]
        });
        prevMsgUuid=msgId;
        continue;
      }

      if(stype==='USER_SETTINGS_CHANGE'){
        const raw=trim(step.content);
        const mm=/Model\s*Selection\s*[:=]\s*([^\r\n<]+)/i.exec(raw);
        if(mm){
          const nextM=trim(mm[1]);
          if(nextM){
            if(defaultModel&&nextM!==defaultModel&&!modelSwitches.includes(nextM))modelSwitches.push(nextM);
            if(!defaultModel)defaultModel=nextM;
          }
        }
        const t=ensureAssistantTurn(ts,stepModel);
        if(raw)t.blocks.push({type:'injected_prompt_block',prompt:raw,injection_source:'ag:settings'});
        continue;
      }

      if(stype==='PLANNER_RESPONSE'){
        plannerStreak++;
        if(plannerStreak>maxPlannerStreak)maxPlannerStreak=plannerStreak;
        const t=ensureAssistantTurn(ts,stepModel);
        const inTok=Number(step.input_tokens||0),outTok=Number(step.output_tokens||0),cacheTok=Number(step.cache_read_tokens||0);
        if(Number.isFinite(inTok))inputTokens+=inTok;
        if(Number.isFinite(outTok))outputTokens+=outTok;
        if(Number.isFinite(cacheTok))cacheReadTokens+=cacheTok;

        const think=string(step.thinking);
        if(trim(think)){
          t.blocks.push({
            type:'thinking',
            thinking:think,
            ...(isTruncated&&step.truncated_fields.includes('thinking')?{truncated:true}:{})
          });
        }

        const calls=list(step.tool_calls);
        for(let ci=0;ci<calls.length;ci++){
          const rawCall=calls[ci];
          if(!rawCall||typeof rawCall!=='object')continue;
          const cname=trim(rawCall.name||rawCall.tool_name||'unknown');
          const rawArgs=sanitizeToolArgs(rawCall.args||rawCall.arguments||rawCall.input||{});
          const callId=trim(rawCall.id)||('ag-tc-'+(Number.isInteger(step.step_index)?step.step_index:i)+'-'+ci);
          const argsObj=(rawArgs&&typeof rawArgs==='object'&&!Array.isArray(rawArgs))?{...rawArgs}:{raw:rawArgs};

          // Recover cwd / touched file paths from Antigravity tool args
          const targetFile=trim(argsObj.TargetFile||argsObj.AbsolutePath||argsObj.DirectoryPath||argsObj.SearchDirectory||'');
          if(targetFile&&!inferredCwd&&/^\/|^[A-Za-z]:[\\/]/.test(targetFile)){
            const dirParts=normalizeCwd(targetFile).split('/').filter(Boolean);
            if(dirParts.length>=3)inferredCwd='/'+dirParts.slice(0,Math.min(4,dirParts.length-(argsObj.TargetFile||argsObj.AbsolutePath?1:0))).join('/');
          }
          if(argsObj.TargetFile||argsObj.AbsolutePath){
            filesTouched.add(trim(argsObj.TargetFile||argsObj.AbsolutePath));
          }
          if(argsObj.Cwd&&!inferredCwd){
            inferredCwd=normalizeCwd(argsObj.Cwd);
          }
          if((/replace_file_content|multi_replace_file_content/i.test(cname))&&!argsObj.patch){
            if(typeof argsObj.TargetContent==='string'||typeof argsObj.ReplacementContent==='string'){
              const diff=buildSimpleDiffFromStrings(string(argsObj.TargetFile),argsObj.TargetContent,argsObj.ReplacementContent);
              if(diff)argsObj.patch=diff;
            }else if(Array.isArray(argsObj.ReplacementChunks)&&argsObj.ReplacementChunks.length){
              const chunksDiff=argsObj.ReplacementChunks.map(ch=>buildSimpleDiffFromStrings(string(argsObj.TargetFile),ch?.TargetContent,ch?.ReplacementContent)).filter(Boolean).join('\n');
              if(chunksDiff)argsObj.patch=chunksDiff;
            }
          }
          if(/write_to_file/i.test(cname)&&typeof argsObj.CodeContent==='string'&&!argsObj.content){
            argsObj.content=argsObj.CodeContent;
          }
          if(/task_boundary/i.test(cname)){
            taskBoundaryCount++;
            const mode=trim(argsObj.Mode).toUpperCase();
            if(mode==='PLANNING'||mode==='EXECUTION'||mode==='VERIFICATION')phases[mode]++;
            else phases.OTHER++;
          }
          if(/notify_user/i.test(cname)&&argsObj.BlockedOnUser===true)notifyGates++;
          if(/invoke_subagent/i.test(cname)&&Array.isArray(argsObj.Subagents)){
            subagentSpawns+=argsObj.Subagents.length;
          }

          recordToolName(cname,false);
          const useBlock={
            type:'tool_use',
            id:callId,
            name:cname,
            input:argsObj,
            ...(rawCall.message?{message:string(rawCall.message)}:{})
          };
          t.blocks.push(useBlock);
          pendingToolNodes.push({id:callId,name:cname,args:argsObj,matched:false});

          if(isSubagentToolCall(cname)){
            const firstSub=Array.isArray(argsObj.Subagents)?argsObj.Subagents[0]:null;
            const targetRole=trim(firstSub?.Role||firstSub?.TypeName||argsObj.Recipient||'Subagent');
            const promptText=trim(firstSub?.Prompt||argsObj.Message||'');
            t.blocks.push({
              type:'injected_prompt_block',
              prompt:promptText,
              injection_source:'ag:subagent',
              agentMeta:{
                msgType:trim(cname).toUpperCase(),
                author:'Antigravity Agent',
                recipient:targetRole,
                hasBody:Boolean(promptText)
              }
            });
          }
        }

        const txt=string(step.content);
        if(trim(txt)){
          t.blocks.push({
            type:'text',
            text:txt,
            ...(isTruncated&&step.truncated_fields.includes('content')?{truncated:true}:{})
          });
        }
        continue;
      }

      if(TOOL_RESULT_TYPES.has(stype)||step.tool_use_id){
        const t=ensureAssistantTurn(ts,stepModel);
        let matched=null;
        if(step.tool_use_id){
          matched=pendingToolNodes.find(n=>n.id===step.tool_use_id&&!n.matched)||null;
        }
        if(!matched){
          matched=pendingToolNodes.find(n=>!n.matched&&n.name.toUpperCase()===stype)||pendingToolNodes.find(n=>!n.matched)||null;
        }
        if(matched)matched.matched=true;
        const callId=matched?matched.id:('ag-res-'+(Number.isInteger(step.step_index)?step.step_index:i));
        const rname=matched?matched.name:stype.toLowerCase();
        const isErr=status==='ERROR'||status==='FAILED'||step.is_error===true;
        if(isErr){
          errorSteps++;
          recordToolName(rname,true);
          telemetryEvents.push({
            kind:'tool_error',
            severity:'warn',
            ts:ts||'',
            label:'工具失败: '+rname,
            detail:trim(step.error||step.content).slice(0,180)
          });
        }
        const outStr=boundedText(typeof step.content==='string'?step.content:JSON.stringify(step.content??''),warnings,rname);
        // Detect returned child subagent conversation IDs
        const subIdMatches=outStr.matchAll(/"conversationId"\s*:\s*"([0-9a-f-]{16,})"/gi);
        for(const sm of subIdMatches)if(sm[1]&&!childConversationIds.includes(sm[1]))childConversationIds.push(sm[1]);

        const resBlock={
          type:'tool_result',
          tool_use_id:callId,
          name:rname,
          is_error:isErr,
          content:outStr?[{type:'text',text:outStr+(isTruncated?'\n\n⚠️ [truncated in transcript.jsonl]':'')}]:[]
        };
        const useIdx=matched?t.blocks.findIndex(b=>b.type==='tool_use'&&b.id===matched.id):-1;
        if(useIdx>=0)t.blocks.splice(useIdx+1,0,resBlock);
        else t.blocks.push(resBlock);
        continue;
      }

      if(stype==='ERROR_MESSAGE'){
        errorSteps++;
        const t=ensureAssistantTurn(ts,stepModel);
        const errText=trim(step.content||step.message||JSON.stringify(step));
        t.blocks.push({
          type:'tool_result',
          tool_use_id:'ag-err-'+(Number.isInteger(step.step_index)?step.step_index:i),
          name:'error',
          is_error:true,
          content:[{type:'text',text:errText}]
        });
        telemetryEvents.push({
          kind:'error_step',
          severity:'high',
          ts:ts||'',
          label:'Antigravity 运行错误',
          detail:errText.slice(0,200)
        });
        continue;
      }

      if(stype==='SYSTEM_MESSAGE'||stype==='EPHEMERAL_MESSAGE'||stype==='CHECKPOINT'||stype==='CONVERSATION_HISTORY'||stype==='GENERIC'){
        const raw=trim(typeof step.content==='string'?step.content:JSON.stringify(step));
        if(raw){
          const t=ensureAssistantTurn(ts,stepModel);
          t.blocks.push({
            type:'injected_prompt_block',
            prompt:raw,
            injection_source:'ag:'+stype.toLowerCase()
          });
        }
        continue;
      }
    }

    flushAssistantTurn();

    if(maxPlannerStreak>=8){
      warnings.push('antigravity_runaway_planner_streak:'+maxPlannerStreak);
      telemetryEvents.push({
        kind:'runaway_loop',
        severity:'high',
        ts:lastTs||firstTs,
        label:'疑似连续自激循环 ('+maxPlannerStreak+' 次连续规划步)',
        detail:'连续出现多次无用户输入间隔的 PLANNER_RESPONSE（类似 /btw 后台循环特征）'
      });
    }
    if(truncatedSteps>0){
      warnings.push('antigravity_transcript_truncated_steps:'+truncatedSteps);
    }

    const totalTokens=inputTokens+outputTokens+cacheReadTokens;
    const rawCwd=inferredCwd||normalizeCwd(opts.workspace||'');
    const cwdInfo=projectFromCwd(rawCwd);
    const idSeed=convIdHint||hashKey(filePath+'|'+firstTs);
    const convUuid='ag:'+idSeed;
    const resolvedTitle=trim(opts.title)||firstPromptTitle||(cwdInfo?'['+cwdInfo.project.name.replace(/ \(Antigravity\)$/,'')+'] '+idSeed.slice(0,8):'Antigravity '+idSeed.slice(0,8));

    const conversation={
      uuid:convUuid,
      originalId:idSeed,
      sourcePlatform:'antigravity',
      name:resolvedTitle,
      summary:trim(opts.summary||''),
      created_at:firstTs||lastTs,
      updated_at:lastTs||firstTs,
      ...(cwdInfo?{workspaceId:cwdInfo.wsId}:{}),
      ...(defaultModel?{defaultModel}:{}),
      antigravityMeta:{
        conversationId:idSeed,
        cwd:rawCwd,
        transcriptSource:sourceVariant,
        totalSteps:steps.length,
        truncatedSteps,
        runningSteps,
        errorSteps,
        childConversationIds,
        filesTouched:[...filesTouched].slice(0,40),
        brainArtifacts:[],
        urlBookmarks:[],
        brainImages:[],
        phases,
        ...(totalTokens>0?{usage:{input_tokens:inputTokens,output_tokens:outputTokens,cache_read_input_tokens:cacheReadTokens,total_tokens:totalTokens}}:{})
      },
      antigravityTelemetry:{
        transcriptSource:sourceVariant,
        totalSteps:steps.length,
        truncatedSteps,
        runningSteps,
        errorSteps,
        maxPlannerStreak,
        notifyGates,
        taskBoundaryCount,
        subagentSpawns,
        phases,
        modelSwitches,
        toolCounts,
        toolErrorCounts,
        tokens:{input:inputTokens,output:outputTokens,cached:cacheReadTokens,total:totalTokens},
        events:telemetryEvents
      },
      importWarnings:warnings,
      chat_messages:messages
    };

    return {conversation,project:cwdInfo?cwdInfo.project:null,warnings};
  }

  function parseTaskChecklistStats(mdText){
    const lines=String(mdText||'').split(/\r?\n/);
    let done=0,active=0,todo=0;
    for(const line of lines){
      const m=/^\s*(?:[-*]|\d+\.)\s+\[([ xX\/])\]\s+/.exec(line);
      if(!m)continue;
      const mark=m[1];
      if(mark==='x'||mark==='X')done++;
      else if(mark==='/')active++;
      else todo++;
    }
    return {done,active,todo,total:done+active+todo};
  }

  function mergeBrainBundle(parsedResult,bundle={}){
    const artifacts=list(bundle.artifacts); // [{ name, path, content, metadata, versions: [{label, content}] }]
    const urls=list(bundle.urlBookmarks); // [{ name, url, title, description, metadata }]
    const images=list(bundle.images); // [{ name, path }]
    const titleOverride=trim(bundle.title||'');
    const wsOverride=normalizeCwd(bundle.workspace||'');
    let conversation=parsedResult?.conversation||null;
    let project=parsedResult?.project||null;

    // Infer workspace from paths inside markdown artifacts if still empty
    let artifactCwd=wsOverride;
    if(!artifactCwd){
      for(const art of artifacts){
        const text=string(art.content);
        const pm=/(?:file:\/\/)?(\/(?:workspaces?|home|Users|mnt\/[^/\s]+)\/[^\s)"'`<>]+\.(?:[a-zA-Z0-9]{1,8}))/.exec(text);
        if(pm){
          const cleanPath=normalizeCwd(pm[1]);
          const parts=cleanPath.split('/').filter(Boolean);
          if(parts.length>=3){artifactCwd='/'+parts.slice(0,Math.min(4,parts.length-1)).join('/');break;}
        }
      }
    }

    // Artifact-only Desktop/IDE conversation folder (no JSONL transcript present)
    if(!conversation){
      if(!artifacts.length&&!urls.length)return null;
      const cid=trim(bundle.conversationId)||hashKey((artifacts[0]?.path||urls[0]?.name||'brain')+'|'+Date.now());
      const firstH1=artifacts.map(a=>/^#\s+([^\r\n]+)/m.exec(string(a.content))?.[1]||'').find(Boolean);
      const firstUpdated=artifacts.map(a=>parseDate(a.metadata?.updatedAt)).filter(Boolean).sort()[0]||'';
      const lastUpdated=artifacts.map(a=>parseDate(a.metadata?.updatedAt)).filter(Boolean).sort().pop()||firstUpdated;
      const cwdInfo=projectFromCwd(artifactCwd);
      if(cwdInfo)project=cwdInfo.project;

      const synthMsgs=[];
      let prevUuid=root;
      for(const art of artifacts){
        const id='ag-brain-'+hashKey(cid+':'+art.name);
        synthMsgs.push({
          uuid:id,
          sender:'assistant',
          created_at:parseDate(art.metadata?.updatedAt)||lastUpdated||firstUpdated,
          updated_at:parseDate(art.metadata?.updatedAt)||lastUpdated||firstUpdated,
          parent_message_uuid:prevUuid,
          content:[{
            type:'text',
            text:string(art.content),
            agArtifact:{
              kind:art.name==='task.md'?'task':art.name==='implementation_plan.md'?'plan':art.name==='walkthrough.md'?'walkthrough':'markdown',
              name:art.name,
              summary:trim(art.metadata?.summary),
              userFacing:art.metadata?.userFacing!==false,
              requestFeedback:Boolean(art.metadata?.requestFeedback)
            }
          }],
          text:string(art.content),
          attachments:[],
          files:[]
        });
        prevUuid=id;
      }
      conversation={
        uuid:'ag:'+cid,
        originalId:cid,
        sourcePlatform:'antigravity',
        name:titleOverride||trim(firstH1)||'Antigravity Brain '+cid.slice(0,8),
        summary:trim(artifacts.find(a=>a.metadata?.summary)?.metadata?.summary||''),
        created_at:firstUpdated,
        updated_at:lastUpdated,
        ...(cwdInfo?{workspaceId:cwdInfo.wsId}:{}),
        antigravityMeta:{
          conversationId:cid,
          cwd:artifactCwd,
          transcriptSource:'brain_only',
          totalSteps:0,
          truncatedSteps:0,
          runningSteps:0,
          errorSteps:0,
          childConversationIds:[],
          filesTouched:[],
          brainArtifacts:[],
          urlBookmarks:[],
          brainImages:[]
        },
        antigravityTelemetry:{
          transcriptSource:'brain_only',
          totalSteps:0,
          truncatedSteps:0,
          runningSteps:0,
          errorSteps:0,
          maxPlannerStreak:0,
          notifyGates:0,
          taskBoundaryCount:0,
          subagentSpawns:0,
          phases:{PLANNING:0,EXECUTION:0,VERIFICATION:0,OTHER:0},
          modelSwitches:[],
          toolCounts:{},
          toolErrorCounts:{},
          tokens:{input:0,output:0,cached:0,total:0},
          events:[]
        },
        importWarnings:['antigravity_brain_only_no_transcript'],
        chat_messages:synthMsgs
      };
    }

    const meta=conversation.antigravityMeta||(conversation.antigravityMeta={});
    if(titleOverride&&(!conversation.name||/^Antigravity\s+[0-9a-f]{6,}/i.test(conversation.name))){
      conversation.name=titleOverride;
    }
    if(artifactCwd&&!meta.cwd){
      meta.cwd=artifactCwd;
      const cwdInfo=projectFromCwd(artifactCwd);
      if(cwdInfo){conversation.workspaceId=cwdInfo.wsId;project=cwdInfo.project;}
    }

    const mappedArtifacts=artifacts.map(a=>{
      const kind=a.name==='task.md'?'task':a.name==='implementation_plan.md'?'plan':a.name==='walkthrough.md'?'walkthrough':'markdown';
      const checklist=kind==='task'?parseTaskChecklistStats(a.content):null;
      const h1=/^#\s+([^\r\n]+)/m.exec(string(a.content))?.[1]?.trim()||'';
      return {
        name:a.name,
        path:a.path||a.name,
        kind,
        title:h1||a.name,
        content:string(a.content),
        summary:trim(a.metadata?.summary),
        updatedAt:parseDate(a.metadata?.updatedAt),
        userFacing:a.metadata?.userFacing!==false,
        requestFeedback:Boolean(a.metadata?.requestFeedback),
        ...(checklist?{checklist}:{}),
        versions:list(a.versions).map(v=>({label:string(v.label),content:string(v.content)}))
      };
    });

    meta.brainArtifacts=mappedArtifacts;
    meta.urlBookmarks=urls.map(u=>({
      name:string(u.name),
      title:trim(u.title||u.name),
      url:trim(u.url),
      description:trim(u.description),
      userFacing:u.metadata?.userFacing!==false
    })).filter(u=>u.url);
    meta.brainImages=images.map(img=>({name:string(img.name),path:string(img.path)}));

    // Also tag matching write_to_file calls in transcript so inline cards render rich Brain styling
    if(conversation.chat_messages.length&&mappedArtifacts.length){
      const byName=new Map(mappedArtifacts.map(a=>[a.name.toLowerCase(),a]));
      let attachedSummary=false;
      for(const msg of conversation.chat_messages){
        if(msg.sender!=='assistant')continue;
        for(const b of list(msg.content)){
          if(b.type==='tool_use'&&/write_to_file|replace_file_content/i.test(b.name||'')){
            const base=string(b.input?.TargetFile||'').split(/[\\/]/).pop().toLowerCase();
            const matchedArt=byName.get(base);
            if(matchedArt&&b.input?.CodeContent){
              b.agArtifactName=matchedArt.name;
            }
          }
        }
      }
      // If none of the core brain artifacts were emitted inline by transcript tool calls, append a consolidated Brain Artifact digest turn
      if(!attachedSummary&&conversation.antigravityMeta.transcriptSource!=='brain_only'){
        meta.hasUnlinkedArtifacts=true;
      }
    }

    return {conversation,project,warnings:conversation.importWarnings||[]};
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
    isAntigravityTranscriptText,
    parsePbtxtTitle,
    inspectHistoryJsonl,
    unwrapUserInputContent,
    sanitizeToolArgs,
    parseTranscriptText,
    parseTranscriptAsync,
    parseTaskChecklistStats,
    mergeBrainBundle,
    projectFromCwd,
    parseDate
  };
}
