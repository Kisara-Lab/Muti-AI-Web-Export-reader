function codexExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const MAX_TOOL_OUTPUT_CHARS=262144; // 256 KB guard per tool output
  const MAX_IMAGE_BUDGET_BYTES=25*1024*1024; // 25 MB per-session embedded image budget
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const trim=value=>string(value).trim();

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
    const raw=trim(value).replace(/\\/g,'/').replace(/\/+$/,'');
    return raw;
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
    return !!(obj&&typeof obj==='object'&&!Array.isArray(obj)&&typeof obj.session_id==='string'&&typeof obj.text==='string'&&!obj.type&&!obj.payload);
  }

  function isRolloutEnvelope(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return false;
    const t=string(obj.type);
    if(!['session_meta','turn_context','response_item','event_msg','compacted','world_state'].includes(t))return false;
    return !!(obj.payload&&typeof obj.payload==='object');
  }

  function inspectJsonlText(text){
    const raw=String(text||'').replace(/^\uFEFF/,'');
    const lines=raw.split(/\r?\n/);
    let checked=0,envelopeCount=0,historyCount=0;
    for(const line of lines){
      const s=line.trim();
      if(!s)continue;
      if(++checked>40)break;
      let parsed;
      try{parsed=JSON.parse(s);}catch{continue;}
      if(isRolloutEnvelope(parsed))envelopeCount++;
      else if(isPromptHistoryRecord(parsed))historyCount++;
    }
    if(envelopeCount>0)return {kind:'rollout',lines};
    if(historyCount>0&&envelopeCount===0)return {kind:'history',lines};
    return {kind:'unknown',lines};
  }

  function isRolloutText(text){
    return inspectJsonlText(text).kind==='rollout';
  }

  function unwrapProposedPlan(text){
    const raw=String(text||'');
    if(!/<proposed_plan>/i.test(raw))return raw;
    return raw.replace(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/gi,(_,body)=>(
      '\n\n> [!NOTE]\n> **Proposed Plan**\n\n'+body.trim()+'\n\n'
    )).trim();
  }

  function isRuntimeContextOnly(text){
    const raw=String(text||'').trim();
    if(!raw)return true;
    const stripped=raw
      .replace(/<(?:environment_context|user_instructions|permissions[\w\s-]*|skills_instructions|turn_aborted|collaboration_mode|multi_agent_role|multi_agent_mode|subagent_notification)>[\s\S]*?<\/(?:environment_context|user_instructions|permissions[\w\s-]*|skills_instructions|turn_aborted|collaboration_mode|multi_agent_role|multi_agent_mode|subagent_notification)>/gi,'')
      .trim();
    if(!stripped)return true;
    if(/^# Context from my IDE setup:/i.test(stripped)&&stripped.length<2500)return true;
    return false;
  }

  function extractContentParts(content,imageState,warnings){
    if(typeof content==='string'){
      const t=content.trim();
      return t?[{type:'text',text:unwrapProposedPlan(content)}]:[];
    }
    const texts=[],images=[];
    for(const part of list(content)){
      if(typeof part==='string'){
        if(part)texts.push(unwrapProposedPlan(part));
        continue;
      }
      if(!part||typeof part!=='object')continue;
      const pt=string(part.type).toLowerCase();
      if(pt==='output_text'||pt==='input_text'||pt==='text'||pt==='summary_text'||(!pt&&typeof part.text==='string')){
        if(typeof part.text==='string'&&part.text)texts.push(unwrapProposedPlan(part.text));
      }else if(pt==='refusal'&&typeof part.refusal==='string'&&part.refusal){
        texts.push(part.refusal);
      }else if(pt==='input_image'||pt==='image'||pt==='image_url'){
        const uri=safeImageUri(part.image_url?.url||part.image_url||part.url||part.data);
        if(uri){
          const size=uri.startsWith('data:')?Math.floor(uri.length*0.75):0;
          if(size&&imageState.bytes+size>MAX_IMAGE_BUDGET_BYTES){
            if(!warnings.includes('image_budget_exceeded'))warnings.push('image_budget_exceeded');
            texts.push('\n\n_[Codex Alpha: image omitted after 25 MB session budget]_\n\n');
          }else{
            imageState.bytes+=size;
            images.push({type:'image',url:uri,source:'codex'});
          }
        }
      }
    }
    const out=[];
    if(texts.length)out.push({type:'text',text:texts.join('\n\n')});
    for(const img of images)out.push(img);
    return out;
  }

  function extractReasoningText(payload){
    if(!payload||typeof payload!=='object')return '';
    const pieces=[];
    if(typeof payload.summary==='string'&&payload.summary.trim()){
      pieces.push(payload.summary.trim());
    }else if(Array.isArray(payload.summary)){
      for(const item of payload.summary){
        if(typeof item==='string'&&item.trim())pieces.push(item.trim());
        else if(item&&typeof item==='object'&&typeof item.text==='string'&&item.text.trim())pieces.push(item.text.trim());
      }
    }
    if(!pieces.length&&typeof payload.text==='string'&&payload.text.trim())pieces.push(payload.text.trim());
    return pieces.join('\n\n');
  }

  function parseJsonMaybe(raw){
    if(typeof raw!=='string')return raw&&typeof raw==='object'?raw:null;
    const trimmed=raw.trim();
    if(!trimmed||!/^[\[{]/.test(trimmed))return null;
    try{return JSON.parse(trimmed);}catch{return null;}
  }

  function formatToolOutput(rawOutput,warnings){
    let isError=false;
    const inspectParsed=obj=>{
      if(!obj||typeof obj!=='object'||Array.isArray(obj))return;
      if(obj.isError===true||obj.is_error===true)isError=true;
      if(Number.isInteger(obj.exit_code)&&obj.exit_code!==0)isError=true;
      if(obj.metadata&&Number.isInteger(obj.metadata.exit_code)&&obj.metadata.exit_code!==0)isError=true;
      if(typeof obj.error==='string'&&obj.error.trim())isError=true;
    };
    const unwrapOutputChunk=raw=>{
      const parsed=typeof raw==='string'?parseJsonMaybe(raw):(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null);
      if(parsed){
        inspectParsed(parsed);
        if(typeof parsed.output==='string'&&(parsed.chunk_id!==undefined||parsed.wall_time_seconds!==undefined||parsed.metadata!==undefined||parsed.exit_code!==undefined)){
          const exitCode=Number.isInteger(parsed.exit_code)?parsed.exit_code:(Number.isInteger(parsed.metadata?.exit_code)?parsed.metadata.exit_code:null);
          return parsed.output+(exitCode!==null&&exitCode!==0?'\n[exit_code: '+exitCode+']':'');
        }
      }
      return null;
    };

    let text='';
    if(typeof rawOutput==='string'){
      const unwrapped=unwrapOutputChunk(rawOutput);
      text=unwrapped!==null?unwrapped:rawOutput;
    }else if(Array.isArray(rawOutput)){
      const parts=[];
      for(const item of rawOutput){
        if(typeof item==='string'){
          const unwrapped=unwrapOutputChunk(item);
          parts.push(unwrapped!==null?unwrapped:item);
        }else if(item&&typeof item==='object'){
          inspectParsed(item);
          if(typeof item.text==='string'){
            const unwrapped=unwrapOutputChunk(item.text);
            parts.push(unwrapped!==null?unwrapped:item.text);
          }else{
            const unwrapped=unwrapOutputChunk(item);
            parts.push(unwrapped!==null?unwrapped:JSON.stringify(item,null,2));
          }
        }
      }
      text=parts.join('\n');
    }else if(rawOutput&&typeof rawOutput==='object'){
      const unwrapped=unwrapOutputChunk(rawOutput);
      text=unwrapped!==null?unwrapped:JSON.stringify(rawOutput,null,2);
    }

    if(!isError){
      const m=/(?:^|\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)/i.exec(text);
      if(m&&Number(m[1])!==0)isError=true;
    }

    return {text:boundedText(text,warnings,'tool_output'),isError};
  }

  function normDedupe(text){
    return String(text||'').replace(/\s+/g,' ').trim();
  }

  function projectFromCwd(cwd){
    const clean=normalizeCwd(cwd);
    if(!clean)return null;
    const wsId='cwd_'+hashKey(clean);
    const parts=clean.split('/').filter(Boolean);
    const shortName=parts.length?parts[parts.length-1]:clean;
    return {
      wsId,
      project:{
        uuid:'codex:cwd:'+wsId,
        name:shortName+' (Codex)',
        description:'Codex workspace: '+clean,
        workspacePath:clean,
        sourcePlatform:'codex',
        docs:[]
      }
    };
  }

  function* convertRolloutSteps(rawText,opts={}){
    const inspected=inspectJsonlText(rawText);
    if(inspected.kind!=='rollout')return null;

    const lines=inspected.lines;
    const fileName=string(opts.path||opts.filename||'rollout.jsonl').split('/').pop();
    const warnings=[];
    const imageState={bytes:0};

    let sessionId='',cwd='',cliVersion='',modelProvider='',gitBranch='',defaultModel='';
    let originator='',agentPath='',agentNickname='',parentThreadId='',forkedFromId='',compactedWindows=0;
    let firstTs='',lastTs='',titleCandidate='',malformedLines=0;
    let totalUsage=null;

    const messages=[];
    let prevUuid=root;
    let currentTurn=null; // { model, blocks, toolMap, seenUserTexts, seenAssistantTexts, seenReasoningPrefixes }
    let pendingPreUserBlocks=[];

    const startNewTurn=(ts,model)=>{
      const blocks=pendingPreUserBlocks.length?pendingPreUserBlocks.splice(0):[];
      return {
        startedAt:ts||firstTs,
        model:model||defaultModel||'',
        blocks,
        toolMap:new Map(),
        seenUserTexts:new Set(),
        seenAssistantTexts:new Set(),
        seenReasoningPrefixes:[],
        lastReasoningAt:-1
      };
    };

    const pushMessage=(sender,createdAt,blocks,model)=>{
      if(!blocks.length)return;
      const uuid='codex:'+(sessionId||'session')+':m'+messages.length;
      const msg={
        uuid,
        originalId:uuid,
        sourcePlatform:'codex',
        sender,
        created_at:createdAt||lastTs||firstTs,
        updated_at:createdAt||lastTs||firstTs,
        parent_message_uuid:prevUuid,
        model:model||'',
        content:blocks,
        attachments:[]
      };
      messages.push(msg);
      prevUuid=uuid;
    };

    const flushTurn=()=>{
      if(!currentTurn)return;
      if(currentTurn.blocks.length){
        pushMessage('assistant',currentTurn.startedAt,currentTurn.blocks,currentTurn.model||defaultModel);
      }
      currentTurn=null;
    };

    const ensureTurn=(ts)=>{
      if(!currentTurn)currentTurn=startNewTurn(ts,defaultModel);
      return currentTurn;
    };

    const queueInjected=(source,rawPrompt,extra=null)=>{
      const prompt=boundedText(rawPrompt,warnings,source);
      if(!prompt.trim()&&!extra?.agentMeta)return;
      const blk={type:'injected_prompt_block',injection_source:source,prompt,...(extra||{})};
      if(!currentTurn&&!messages.length)pendingPreUserBlocks.push(blk);
      else ensureTurn(lastTs||firstTs).blocks.push(blk);
    };

    for(let lineIdx=0;lineIdx<lines.length;lineIdx++){
      if(lineIdx>0&&lineIdx%128===0)yield;
      const rawLine=lines[lineIdx].trim();
      if(!rawLine)continue;
      let env;
      try{
        env=JSON.parse(rawLine);
      }catch{
        malformedLines++;
        continue;
      }
      if(!env||typeof env!=='object'||Array.isArray(env))continue;

      const envType=string(env.type);
      const ts=parseDate(env.timestamp);
      if(ts){
        if(!firstTs)firstTs=ts;
        lastTs=ts;
      }
      const payload=env.payload&&typeof env.payload==='object'?env.payload:null;
      if(!payload)continue;

      if(envType==='session_meta'){
        if(!sessionId&&typeof payload.id==='string'&&payload.id)sessionId=payload.id;
        if(!cwd&&typeof payload.cwd==='string'&&payload.cwd)cwd=payload.cwd;
        if(!cliVersion&&typeof payload.cli_version==='string'&&payload.cli_version)cliVersion=payload.cli_version;
        if(!modelProvider&&typeof payload.model_provider==='string'&&payload.model_provider)modelProvider=payload.model_provider;
        if(!gitBranch&&typeof payload.git?.branch==='string'&&payload.git.branch)gitBranch=payload.git.branch;
        if(!defaultModel&&typeof payload.model==='string'&&payload.model)defaultModel=payload.model;
        if(!originator&&typeof payload.originator==='string'&&payload.originator)originator=payload.originator;
        if(!agentPath&&typeof payload.agent_path==='string'&&payload.agent_path)agentPath=payload.agent_path;
        if(!agentNickname&&typeof payload.agent_nickname==='string'&&payload.agent_nickname)agentNickname=payload.agent_nickname;
        if(!parentThreadId&&typeof payload.parent_thread_id==='string'&&payload.parent_thread_id)parentThreadId=payload.parent_thread_id;
        if(!forkedFromId&&typeof payload.forked_from_id==='string'&&payload.forked_from_id)forkedFromId=payload.forked_from_id;
        continue;
      }

      if(envType==='turn_context'){
        if(!cwd&&typeof payload.cwd==='string'&&payload.cwd)cwd=payload.cwd;
        const m=trim(payload.model);
        if(m){
          if(!defaultModel)defaultModel=m;
          if(currentTurn)currentTurn.model=m;
        }
        continue;
      }

      if(envType==='token_usage_record'){
        const u=payload.total_token_usage||payload.info?.total_token_usage;
        if(u&&typeof u==='object')totalUsage=u;
        continue;
      }

      if(envType==='compacted'){
        compactedWindows++;
        const summaryText=trim(payload.message||payload.summary);
        if(summaryText)queueInjected('codex:compacted',summaryText);
        continue;
      }

      if(envType==='response_item'){
        const ptype=string(payload.type);
        if(ptype==='message'){
          const role=string(payload.role).toLowerCase()||'assistant';
          const parts=extractContentParts(payload.content,imageState,warnings);
          if(!parts.length)continue;
          const plain=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
          const norm=normDedupe(plain);
          const hasImage=parts.some(b=>b.type==='image');

          if(role==='developer'||role==='system'){
            if(plain)queueInjected('codex:'+role,plain);
            continue;
          }

          if(role==='user'){
            if(!hasImage&&isRuntimeContextOnly(plain)){
              queueInjected('codex:context',plain);
              continue;
            }
            flushTurn();
            if(!titleCandidate&&plain){
              const stripped=plain.replace(/<(?:environment_context|user_instructions|permissions[\w\s-]*)>[\s\S]*?<\/(?:environment_context|user_instructions|permissions[\w\s-]*)>/gi,'').trim();
              if(stripped)titleCandidate=stripped.split(/\r?\n/)[0].slice(0,90);
            }
            pushMessage('human',ts,parts,'');
            currentTurn=startNewTurn(ts,defaultModel);
            if(norm)currentTurn.seenUserTexts.add(norm);
            continue;
          }

          // assistant (dedupe against item_completed:AgentMessage)
          const t=ensureTurn(ts);
          if(norm&&!hasImage&&t.seenAssistantTexts.has(norm))continue;
          if(norm)t.seenAssistantTexts.add(norm);
          for(const b of parts)t.blocks.push(b);
          continue;
        }

        if(ptype==='agent_message'){
          const rawList=list(payload.content);
          const hasEncrypted=rawList.some(p=>p&&typeof p==='object'&&(string(p.type).toLowerCase()==='encrypted_content'||typeof p.encrypted_content==='string'));
          const parts=extractContentParts(rawList,imageState,warnings);
          const plain=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n').trim();
          const from=string(payload.author)||'agent';
          const to=string(payload.recipient)||'agent';
          const typeMatch=/Message Type:\s*([A-Z0-9_]+)/i.exec(plain);
          const taskMatch=/Task name:\s*([^\r\n]+)/i.exec(plain);
          const msgType=(typeMatch?typeMatch[1]:'MESSAGE').toUpperCase();
          const taskName=taskMatch?taskMatch[1].trim():'';
          const bodyText=plain.replace(/^(?:Message Type|Task name|Sender):[^\r\n]*\r?\n?/gim,'').replace(/^Payload:\s*/im,'').trim();
          const hasBody=Boolean(bodyText);
          if(plain||hasEncrypted){
            queueInjected('codex:agent_message ('+from+' → '+to+')',bodyText||plain,{
              agentMeta:{author:from,recipient:to,msgType,taskName,encrypted:hasEncrypted,hasBody}
            });
          }
          continue;
        }

        if(ptype==='reasoning'){
          const t=ensureTurn(ts);
          let thinkText=extractReasoningText(payload);
          if(!thinkText&&payload.encrypted_content){
            t.blocks.push({type:'thinking',thinking:'',thinking_hidden:true});
            continue;
          }
          if(!thinkText)continue;
          // Deduplicate cumulative reasoning heading repetitions within the same turn
          const prevCumulative=t.seenReasoningPrefixes.find(p=>thinkText.startsWith(p)&&thinkText.length>p.length);
          if(prevCumulative){
            const delta=thinkText.slice(prevCumulative.length).trim();
            t.seenReasoningPrefixes.push(thinkText);
            if(!delta)continue;
            thinkText=delta;
          }else if(t.seenReasoningPrefixes.includes(thinkText)){
            continue;
          }else{
            t.seenReasoningPrefixes.push(thinkText);
          }
          t.blocks.push({type:'thinking',thinking:thinkText});
          continue;
        }

        if(ptype==='function_call'||ptype==='custom_tool_call'||ptype==='local_shell_call'){
          const t=ensureTurn(ts);
          const name=string(payload.name)||(ptype==='local_shell_call'?'shell':'custom_tool');
          const callId=string(payload.call_id||payload.id)||('codex-call-'+lineIdx);
          let inputObj={};
          if(ptype==='function_call'){
            const parsedArgs=parseJsonMaybe(payload.arguments);
            inputObj=parsedArgs!==null?parsedArgs:(typeof payload.arguments==='string'&&payload.arguments?{raw:boundedText(payload.arguments,warnings,'arguments')}:{});
          }else if(ptype==='custom_tool_call'){
            const rawIn=payload.input;
            const parsedIn=parseJsonMaybe(rawIn);
            if(parsedIn!==null)inputObj=parsedIn;
            else if(typeof rawIn==='string'&&rawIn){
              if(/apply_patch/i.test(name)||rawIn.includes('*** Begin Patch'))inputObj={patch:boundedText(rawIn,warnings,'patch')};
              else if(name==='exec'||name==='js_repl')inputObj={code:boundedText(rawIn,warnings,'code')};
              else inputObj={input:boundedText(rawIn,warnings,'input')};
            }
          }else if(payload.action&&typeof payload.action==='object'){
            inputObj=payload.action;
          }
          const block={type:'tool_use',id:callId,name,input:inputObj};
          t.toolMap.set(callId,block);
          t.blocks.push(block);
          continue;
        }

        if(ptype==='function_call_output'||ptype==='custom_tool_call_output'||ptype==='local_shell_call_output'){
          const t=ensureTurn(ts);
          const callId=string(payload.call_id||payload.id)||('codex-out-'+lineIdx);
          const paired=t.toolMap.get(callId);
          const {text,isError}=formatToolOutput(payload.output??payload.result??'',warnings);
          t.blocks.push({
            type:'tool_result',
            tool_use_id:callId,
            name:paired?.name||string(payload.name)||'tool_output',
            is_error:isError,
            content:text?[{type:'text',text}]:[]
          });
          continue;
        }

        if(ptype==='web_search_call'){
          const t=ensureTurn(ts);
          const query=string(payload.action?.query||payload.query);
          const callId=string(payload.call_id||payload.id)||('codex-ws-'+lineIdx);
          t.blocks.push({type:'tool_use',id:callId,name:'web_search',input:query?{query}:{}});
          const rawRes=list(payload.results||payload.action?.sources);
          if(rawRes.length){
            t.blocks.push({
              type:'web_search_tool_result',
              tool_use_id:callId,
              content:rawRes.filter(r=>r?.url).map(r=>({type:'web_search_result',title:string(r.title||r.url),url:string(r.url)}))
            });
          }
          continue;
        }

        if(ptype==='image_generation_call'){
          const t=ensureTurn(ts);
          const uri=safeImageUri(payload.result||payload.image_url);
          if(uri)t.blocks.push({type:'image',url:uri,source:'codex'});
          else if(payload.revised_prompt)t.blocks.push({type:'text',text:'_[Generated image: '+string(payload.revised_prompt)+']_'});
          continue;
        }
        continue;
      }

      if(envType==='event_msg'){
        const etype=string(payload.type);
        if(etype==='token_count'&&payload.info?.total_token_usage){
          totalUsage=payload.info.total_token_usage;
          continue;
        }
        if(etype==='turn_aborted'){
          const t=ensureTurn(ts);
          t.blocks.push({type:'text',text:'_[Turn aborted'+(payload.reason?': '+string(payload.reason):'')+']_'});
          continue;
        }
        if(etype==='user_message'){
          const parts=payload.content?extractContentParts(payload.content,imageState,warnings):[{type:'text',text:string(payload.message||payload.text)}];
          const text=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
          const norm=normDedupe(text);
          const hasImage=parts.some(b=>b.type==='image');
          if(!norm&&!hasImage)continue;
          if(!hasImage&&isRuntimeContextOnly(text))continue;
          const prevHuman=messages.length&&messages[messages.length-1].sender==='human'?messages[messages.length-1]:null;
          const prevNorm=prevHuman?normDedupe(prevHuman.content.filter(b=>b.type==='text').map(b=>b.text).join('\n\n')):'';
          if(norm&&(prevNorm===norm||(currentTurn&&currentTurn.seenUserTexts.has(norm))))continue;
          flushTurn();
          if(!titleCandidate&&text){
            const stripped=text.replace(/<(?:environment_context|user_instructions|permissions[\w\s-]*)>[\s\S]*?<\/(?:environment_context|user_instructions|permissions[\w\s-]*)>/gi,'').trim();
            if(stripped)titleCandidate=stripped.split(/\r?\n/)[0].slice(0,90);
          }
          pushMessage('human',ts,parts,'');
          currentTurn=startNewTurn(ts,defaultModel);
          if(norm)currentTurn.seenUserTexts.add(norm);
          continue;
        }
        if(etype==='agent_message'){
          const parts=payload.content?extractContentParts(payload.content,imageState,warnings):[{type:'text',text:string(payload.message||payload.text)}];
          const text=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
          const norm=normDedupe(text);
          if(!norm&&!parts.some(b=>b.type==='image'))continue;
          const t=ensureTurn(ts);
          if(norm&&t.seenAssistantTexts.has(norm))continue;
          if(norm)t.seenAssistantTexts.add(norm);
          for(const b of parts)t.blocks.push(b);
          continue;
        }
        if(etype==='item_completed'){
          const item=payload.item;
          if(!item||typeof item!=='object')continue;
          const itemType=string(item.type).toLowerCase();
          if(itemType==='usermessage'||itemType==='user_message'||item.role==='user'){
            const parts=item.content?extractContentParts(item.content,imageState,warnings):[{type:'text',text:string(item.text)}];
            const text=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
            const norm=normDedupe(text);
            const hasImage=parts.some(b=>b.type==='image');
            if(!norm&&!hasImage)continue;
            if(!hasImage&&isRuntimeContextOnly(text))continue;
            const prevHuman=messages.length&&messages[messages.length-1].sender==='human'?messages[messages.length-1]:null;
            const prevNorm=prevHuman?normDedupe(prevHuman.content.filter(b=>b.type==='text').map(b=>b.text).join('\n\n')):'';
            if(norm&&(prevNorm===norm||(currentTurn&&currentTurn.seenUserTexts.has(norm))))continue;
            flushTurn();
            if(!titleCandidate&&text){
              const stripped=text.replace(/<(?:environment_context|user_instructions|permissions[\w\s-]*)>[\s\S]*?<\/(?:environment_context|user_instructions|permissions[\w\s-]*)>/gi,'').trim();
              if(stripped)titleCandidate=stripped.split(/\r?\n/)[0].slice(0,90);
            }
            pushMessage('human',ts,parts,'');
            currentTurn=startNewTurn(ts,defaultModel);
            if(norm)currentTurn.seenUserTexts.add(norm);
            continue;
          }
          if(itemType==='agentmessage'||itemType==='agent_message'||item.role==='assistant'){
            const parts=item.content?extractContentParts(item.content,imageState,warnings):[{type:'text',text:string(item.text)}];
            const text=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
            const norm=normDedupe(text);
            if(!norm&&!parts.some(b=>b.type==='image'))continue;
            const t=ensureTurn(ts);
            if(norm&&t.seenAssistantTexts.has(norm))continue;
            if(norm)t.seenAssistantTexts.add(norm);
            for(const b of parts)t.blocks.push(b);
            continue;
          }
          if(itemType==='plan'){
            const planText=trim(item.text);
            if(!planText)continue;
            const norm=normDedupe(planText);
            const t=ensureTurn(ts);
            if(norm&&t.seenAssistantTexts.has(norm))continue;
            if(norm)t.seenAssistantTexts.add(norm);
            t.blocks.push({type:'text',text:'> [!NOTE]\n> **Codex Plan**\n\n'+planText});
            continue;
          }
          if(itemType==='imageview'){
            const imgPath=string(item.path);
            if(imgPath){
              const t=ensureTurn(ts);
              t.blocks.push({type:'local_resource',name:imgPath.split(/[\\/]/).pop()||imgPath,file_path:imgPath});
            }
            continue;
          }
          // Skip noisy item_completed mirrors (CommandExecution, Reasoning, FileChange, ContextCompaction, SubAgentActivity)
          continue;
        }
      }
    }

    if(pendingPreUserBlocks.length)ensureTurn(firstTs);
    flushTurn();
    if(malformedLines>0)warnings.push('skipped_malformed_jsonl_lines:'+malformedLines);

    if(!sessionId){
      const idMatch=/rollout-.*?-([0-9a-f-]{8,})\.jsonl$/i.exec(fileName);
      sessionId=idMatch?idMatch[1]:hashKey(fileName+'|'+firstTs);
    }
    const cwdInfo=projectFromCwd(cwd);
    const uuid='codex:'+sessionId;
    let title=titleCandidate||(cwdInfo?'['+cwdInfo.project.name.replace(/ \(Codex\)$/,'')+'] '+fileName:fileName);
    if(agentPath||agentNickname){
      const tag=agentNickname||(agentPath.split('/').filter(Boolean).pop()||agentPath);
      if(tag&&!title.includes(tag))title='['+tag+'] '+title;
    }

    const conversation={
      uuid,
      originalId:sessionId,
      sourcePlatform:'codex',
      name:title,
      summary:'',
      created_at:firstTs||lastTs,
      updated_at:lastTs||firstTs,
      ...(cwdInfo?{workspaceId:cwdInfo.wsId}:{}),
      ...(defaultModel?{defaultModel}:{}),
      codexMeta:{
        cwd:normalizeCwd(cwd),
        cliVersion,
        modelProvider,
        gitBranch,
        ...(originator?{originator}:{}),
        ...(agentPath?{agentPath}:{}),
        ...(agentNickname?{agentNickname}:{}),
        ...(parentThreadId?{parentThreadId}:{}),
        ...(forkedFromId?{forkedFromId}:{}),
        ...(compactedWindows?{compactedWindows}:{}),
        ...(totalUsage?{usage:totalUsage}:{})
      },
      importWarnings:warnings,
      chat_messages:messages
    };
    return {conversation,project:cwdInfo?cwdInfo.project:null,warnings};
  }

  function parseRolloutText(text,opts={}){
    const it=convertRolloutSteps(text,opts);
    let step;
    do{step=it.next();}while(!step.done);
    return step.value;
  }

  async function parseRolloutAsync(text,opts={},checkpoint=async()=>{}){
    const it=convertRolloutSteps(text,opts);
    let step;
    do{step=it.next();if(!step.done)await checkpoint();}while(!step.done);
    return step.value;
  }

  return {
    inspectJsonlText,
    isRolloutText,
    isPromptHistoryRecord,
    parseRolloutText,
    parseRolloutAsync,
    parseDate,
    projectFromCwd
  };
}
