function geminiCliExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const MAX_OUTPUT_CHARS=262144; // 256 KB per-tool-output guard
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

  function boundedText(value,warnings,label){
    const text=String(value??'');
    if(text.length<=MAX_OUTPUT_CHARS)return text;
    if(warnings&&!warnings.includes('oversized_tool_output'))warnings.push('oversized_tool_output');
    const head=text.slice(0,Math.floor(MAX_OUTPUT_CHARS*0.75));
    const tail=text.slice(-Math.floor(MAX_OUTPUT_CHARS*0.15));
    return head+'\n\n... ['+(label||'output')+' truncated: '+(text.length-head.length-tail.length)+' chars omitted] ...\n\n'+tail;
  }

  function projectFromCwd(cwd,slugHint=''){
    const norm=normalizeCwd(cwd);
    const label=norm?(norm.split('/').filter(Boolean).pop()||norm):trim(slugHint);
    if(!label)return null;
    const wsId=hashKey(norm||('slug:'+label));
    return {
      wsId,
      cwd:norm,
      project:{
        uuid:'gemini:cwd:'+wsId,
        name:label+' (Gemini CLI)',
        description:norm?('Gemini CLI Workspace: '+norm):('Gemini CLI Project: '+label),
        docs:[],
        is_starter_project:false,
        sourcePlatform:'gemini_cli'
      }
    };
  }

  function isGeminiCliJson(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    return typeof value.sessionId==='string'&&Array.isArray(value.messages)&&value.messages.some(m=>m&&typeof m==='object'&&(m.type==='gemini'||m.type==='user'||'toolCalls' in m||'thoughts' in m));
  }

  function isGeminiCliJsonlText(text){
    const raw=String(text||'').replace(/^\uFEFF/,'');
    const lines=raw.split(/\r?\n/);
    let checked=0,hasHeader=false,hasMsg=false;
    for(const line of lines){
      const s=line.trim();
      if(!s)continue;
      checked++;
      if(checked>40)break;
      try{
        const obj=JSON.parse(s);
        if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;
        if(typeof obj.sessionId==='string'&&('projectHash' in obj||'startTime' in obj||'directories' in obj||'kind' in obj))hasHeader=true;
        if(typeof obj.type==='string'&&/^(?:user|gemini|info|warning|error)$/i.test(obj.type)&&('content' in obj||'toolCalls' in obj||'thoughts' in obj||'tokens' in obj))hasMsg=true;
        if('$set' in obj||'$patch' in obj||'$rewindTo' in obj)hasMsg=true;
      }catch{}
    }
    return (hasHeader&&hasMsg)||(hasMsg&&checked>=1&&raw.includes('"type":"gemini"'));
  }

  function buildSimpleDiff(filePath,origStr,newStr){
    if(typeof origStr!=='string'&&typeof newStr!=='string')return '';
    const oldLines=(typeof origStr==='string'?origStr:'').split('\n').slice(0,220);
    const newLines=(typeof newStr==='string'?newStr:'').split('\n').slice(0,220);
    const lines=[];
    if(filePath)lines.push('--- a/'+filePath,'+++ b/'+filePath);
    lines.push('@@ -1,'+oldLines.length+' +1,'+newLines.length+' @@');
    for(const l of oldLines)lines.push('-'+l);
    for(const l of newLines)lines.push('+'+l);
    return lines.join('\n');
  }

  function extractPartsFromContent(content,rawBlocks,textParts,thinkParts,inlineCalls,warnings){
    if(typeof content==='string'){
      if(content)textParts.push(content);
      return;
    }
    const items=Array.isArray(content)?content:(content&&typeof content==='object'?[content]:[]);
    for(const part of items){
      if(typeof part==='string'){
        if(part)textParts.push(part);
        continue;
      }
      if(!part||typeof part!=='object')continue;
      if(part.thought===true&&typeof part.text==='string'){
        if(part.text)thinkParts.push({subject:'',description:part.text});
        continue;
      }
      if(typeof part.text==='string'){
        if(part.text)textParts.push(part.text);
        continue;
      }
      if(part.functionCall&&typeof part.functionCall==='object'){
        const fc=part.functionCall;
        inlineCalls.push({
          id:trim(fc.id)||('gfc-'+inlineCalls.length),
          name:trim(fc.name||'function'),
          args:fc.args&&typeof fc.args==='object'?fc.args:{},
          status:'success'
        });
        continue;
      }
      if(part.functionResponse&&typeof part.functionResponse==='object'){
        const fr=part.functionResponse;
        const txt=typeof fr.response==='string'?fr.response:JSON.stringify(fr.response??'');
        rawBlocks.push({
          type:'tool_result',
          tool_use_id:trim(fr.id||''),
          name:trim(fr.name||'function'),
          is_error:false,
          content:txt?[{type:'text',text:boundedText(txt,warnings,fr.name)}]:[]
        });
        continue;
      }
      if(part.inlineData&&typeof part.inlineData==='object'&&/^image\//i.test(string(part.inlineData.mimeType))){
        rawBlocks.push({
          type:'image',
          media_type:string(part.inlineData.mimeType),
          data:string(part.inlineData.data)
        });
      }
    }
  }

  function mergeToolCall(prev,incoming){
    if(!prev)return {...incoming};
    const merged={...prev,...incoming};
    if(incoming.args&&typeof incoming.args==='object'&&prev.args&&typeof prev.args==='object'){
      merged.args={...prev.args,...incoming.args};
    }
    if(incoming.result==null&&prev.result!=null)merged.result=prev.result;
    if(incoming.resultDisplay==null&&prev.resultDisplay!=null)merged.resultDisplay=prev.resultDisplay;
    return merged;
  }

  function* convertGeminiSessionSteps(input,opts={}){
    const filePath=string(opts.path||'session.jsonl').replace(/\\/g,'/');
    let meta={};
    const warnings=[];
    let malformedLines=0;

    // Ordered active timeline + branched rewound timelines
    let activeRecords=[];
    const rewoundBranches=[];
    let rewindCount=0,patchCount=0,setCount=0;

    if(typeof input==='string'){
      const lines=input.replace(/^\uFEFF/,'').split(/\r?\n/);
      let li=0;
      for(const line of lines){
        if(++li%200===0)yield;
        const s=line.trim();
        if(!s)continue;
        let obj;
        try{obj=JSON.parse(s);}catch{malformedLines++;continue;}
        if(!obj||typeof obj!=='object'||Array.isArray(obj))continue;

        if('$set' in obj&&obj.$set&&typeof obj.$set==='object'){
          setCount++;
          meta={...meta,...obj.$set};
          if(Array.isArray(obj.$set.directories))meta.directories=obj.$set.directories;
          continue;
        }
        if('$patch' in obj&&obj.$patch&&typeof obj.$patch==='object'){
          patchCount++;
          const p=obj.$patch;
          if(Array.isArray(p.removeIds)){
            const rm=new Set(p.removeIds.map(String));
            activeRecords=activeRecords.filter(r=>!rm.has(String(r.id)));
          }
          if(Array.isArray(p.updates)){
            for(const upd of p.updates){
              if(!upd||!upd.id)continue;
              const idx=activeRecords.findIndex(r=>r.id===upd.id);
              if(idx>=0)activeRecords[idx]={...activeRecords[idx],...upd};
            }
          }
          if(p.id){
            const idx=activeRecords.findIndex(r=>r.id===p.id);
            if(idx>=0)activeRecords[idx]={...activeRecords[idx],...p};
          }
          if(Array.isArray(p.orderIds)){
            const byId=new Map(activeRecords.map(r=>[String(r.id),r]));
            const ordered=[];
            for(const oid of p.orderIds){const item=byId.get(String(oid));if(item){ordered.push(item);byId.delete(String(oid));}}
            for(const rest of byId.values())ordered.push(rest);
            activeRecords=ordered;
          }
          continue;
        }
        if('$rewindTo' in obj){
          rewindCount++;
          const targetId=trim(obj.$rewindTo);
          const idx=activeRecords.findIndex(r=>r.id===targetId);
          if(idx>=0){
            const cut=activeRecords.slice(idx);
            if(cut.length)rewoundBranches.push({anchorId:idx>0?activeRecords[idx-1].id:root,records:cut});
            activeRecords=activeRecords.slice(0,idx);
          }
          continue;
        }

        // Line 1 metadata header
        if(!obj.type&&typeof obj.sessionId==='string'){
          meta={...meta,...obj};
          continue;
        }

        if(obj.id){
          const existingIdx=activeRecords.findIndex(r=>r.id===obj.id);
          if(existingIdx>=0){
            const prev=activeRecords[existingIdx];
            const nextCalls=[...list(prev.toolCalls)];
            for(const tc of list(obj.toolCalls)){
              if(!tc||typeof tc!=='object')continue;
              const ti=nextCalls.findIndex(x=>x.id&&tc.id&&x.id===tc.id);
              if(ti>=0)nextCalls[ti]=mergeToolCall(nextCalls[ti],tc);
              else nextCalls.push({...tc});
            }
            activeRecords[existingIdx]={
              ...prev,
              ...obj,
              ...(nextCalls.length?{toolCalls:nextCalls}:{})
            };
            continue;
          }
        }
        activeRecords.push(obj);
      }
    }else if(input&&typeof input==='object'){
      meta={...input};
      activeRecords=list(input.messages).map(m=>({...m}));
    }

    if(malformedLines>0)warnings.push('skipped_malformed_jsonl_lines:'+malformedLines);

    let sessionId=trim(meta.sessionId);
    if(!sessionId){
      const fnM=/session-[^/]*-([0-9a-f-]{6,})\.jsonl?$/i.exec(filePath)||/([0-9a-f]{8}-[0-9a-f-]{12,})/i.exec(filePath);
      sessionId=fnM?fnM[1]:hashKey(filePath);
    }

    const subPathM=/chats\/([0-9a-f-]{8,})\/([0-9a-f-]{8,})\.jsonl?$/i.exec(filePath);
    const isSubagent=meta.kind==='subagent'||Boolean(subPathM);
    const parentSessionId=trim(meta.parentSessionId||meta.parentId||(subPathM?subPathM[1]:''));

    // Determine project cwd & slug
    const slugMatch=/tmp\/([^/]+)\/chats\//i.exec(filePath);
    const slug=slugMatch?slugMatch[1]:'';
    const rawDirs=list(meta.directories).map(normalizeCwd).filter(Boolean);
    const cwd=normalizeCwd(opts.cwd||rawDirs[0]||'');
    const cwdInfo=projectFromCwd(cwd,slug);

    const tokenSum={input:0,output:0,cached:0,thoughts:0,tool:0,total:0};
    const toolStatusCounts={success:0,error:0,cancelled:0,awaiting_approval:0,other:0};
    const toolNameCounts={};
    const fileDiffPaths=new Set();
    const modelsUsed=new Set();
    const telemetryEvents=[];

    let firstTs=parseDate(meta.startTime);
    let lastTs=parseDate(meta.lastUpdated);
    let defaultModel='';
    let firstPromptTitle='';

    function materializeRecordList(records,initialParentUuid,suffix=''){
      const out=[];
      let parentUuid=initialParentUuid;
      for(let idx=0;idx<records.length;idx++){
        const rec=records[idx];
        const ts=parseDate(rec.timestamp)||lastTs||firstTs;
        if(ts){
          if(!firstTs)firstTs=ts;
          if(!lastTs||ts>lastTs)lastTs=ts;
        }
        const mtype=trim(rec.type).toLowerCase()||'gemini';
        const msgId=(trim(rec.id)||('gem-'+idx))+suffix;
        const blocks=[];
        const textParts=[],thinkParts=[],inlineCalls=[];
        extractPartsFromContent(rec.content,blocks,textParts,thinkParts,inlineCalls,warnings);
        for(const th of list(rec.thoughts)){
          if(!th||typeof th!=='object')continue;
          const desc=trim(th.description),subj=trim(th.subject);
          if(desc||subj)thinkParts.push({subject:subj,description:desc,timestamp:parseDate(th.timestamp)});
        }

        if(mtype==='user'){
          const promptTxt=trim(rec.displayContent)||textParts.join('\n\n')||string(rec.content);
          if(!suffix&&!firstPromptTitle&&promptTxt){
            firstPromptTitle=promptTxt.split(/\r?\n/).map(x=>x.trim()).find(Boolean)||'';
            if(firstPromptTitle.length>72)firstPromptTitle=firstPromptTitle.slice(0,72)+'…';
          }
          const userBlocks=promptTxt?[{type:'text',text:promptTxt},...blocks]:(blocks.length?blocks:[{type:'text',text:''}]);
          out.push({
            uuid:msgId,
            sender:'human',
            created_at:ts,
            updated_at:ts,
            parent_message_uuid:parentUuid,
            content:userBlocks,
            text:promptTxt,
            attachments:[],
            files:[]
          });
          parentUuid=msgId;
          continue;
        }

        if(mtype==='info'||mtype==='warning'||mtype==='error'){
          const infoTxt=textParts.join('\n\n')||trim(rec.content);
          if(mtype==='error'){
            telemetryEvents.push({
              kind:'error_record',
              severity:'warn',
              ts,
              label:'Gemini CLI 运行警告/错误',
              detail:infoTxt.slice(0,180)
            });
          }
          out.push({
            uuid:msgId,
            sender:'system',
            created_at:ts,
            updated_at:ts,
            parent_message_uuid:parentUuid,
            content:[{
              type:'injected_prompt_block',
              prompt:infoTxt,
              injection_source:'gemini:'+mtype
            }],
            text:infoTxt,
            attachments:[],
            files:[]
          });
          parentUuid=msgId;
          continue;
        }

        // gemini / assistant turn
        const model=trim(rec.model);
        if(model){
          modelsUsed.add(model);
          if(!defaultModel)defaultModel=model;
        }

        if(rec.tokens&&typeof rec.tokens==='object'&&!suffix){
          const t=rec.tokens;
          tokenSum.input+=Number(t.input||0);
          tokenSum.output+=Number(t.output||0);
          tokenSum.cached+=Number(t.cached||0);
          tokenSum.thoughts+=Number(t.thoughts||0);
          tokenSum.tool+=Number(t.tool||0);
          tokenSum.total+=Number(t.total||(Number(t.input||0)+Number(t.output||0)+Number(t.cached||0)+Number(t.thoughts||0)+Number(t.tool||0)));
        }

        for(const tp of thinkParts){
          const combined=tp.subject?('**'+tp.subject+'**\n\n'+tp.description):tp.description;
          blocks.push({
            type:'thinking',
            thinking:combined,
            ...(tp.subject?{subject:tp.subject}:{}),
            ...(tp.timestamp?{start_timestamp:tp.timestamp}:{})
          });
        }

        const allCalls=[...inlineCalls,...list(rec.toolCalls)];
        for(let ci=0;ci<allCalls.length;ci++){
          const tc=allCalls[ci];
          if(!tc||typeof tc!=='object')continue;
          const cname=trim(tc.name||tc.displayName||'tool');
          const cid=trim(tc.id)||('gtc-'+msgId+'-'+ci);
          const tstatus=trim(tc.status||'success').toLowerCase();
          if(!suffix){
            toolNameCounts[cname]=(toolNameCounts[cname]||0)+1;
            if(tstatus==='success'||tstatus==='error'||tstatus==='cancelled'||tstatus==='awaiting_approval'){
              toolStatusCounts[tstatus]++;
            }else toolStatusCounts.other++;
          }

          const argsObj=(tc.args&&typeof tc.args==='object'&&!Array.isArray(tc.args))?{...tc.args}:{raw:tc.args};
          const rd=tc.resultDisplay;
          let diffPatch='';
          let outputText='';
          if(rd&&typeof rd==='object'&&!Array.isArray(rd)){
            const fpath=trim(rd.filePath||rd.fileName||argsObj.file_path||argsObj.path||'');
            if(fpath&&!suffix)fileDiffPaths.add(fpath);
            if(typeof rd.fileDiff==='string'&&rd.fileDiff)diffPatch=rd.fileDiff;
            else if(typeof rd.originalContent==='string'||typeof rd.newContent==='string'){
              diffPatch=buildSimpleDiff(fpath,rd.originalContent,rd.newContent);
            }
            if(diffPatch)argsObj.patch=diffPatch;
            if(typeof rd.output==='string')outputText=rd.output;
          }else if(typeof rd==='string'){
            outputText=rd;
          }
          if(!outputText&&tc.result!=null){
            if(typeof tc.result==='string')outputText=tc.result;
            else if(Array.isArray(tc.result)){
              outputText=tc.result.map(x=>typeof x==='string'?x:(x?.functionResponse?.response?.output||x?.text||JSON.stringify(x))).join('\n');
            }else outputText=JSON.stringify(tc.result);
          }

          const isErr=tstatus==='error'||tstatus==='cancelled';
          blocks.push({
            type:'tool_use',
            id:cid,
            name:cname,
            input:argsObj,
            ...(tc.description?{message:string(tc.description)}:{})
          });
          if(outputText||isErr||tstatus==='awaiting_approval'){
            const statusNote=tstatus==='cancelled'?'⚠️ [Cancelled by user]\n\n':tstatus==='awaiting_approval'?'⏳ [Awaiting user approval]\n\n':'';
            blocks.push({
              type:'tool_result',
              tool_use_id:cid,
              name:cname,
              is_error:isErr,
              content:[{type:'text',text:boundedText(statusNote+outputText,warnings,cname)}]
            });
          }
          if(!suffix&&(tstatus==='error'||tstatus==='cancelled'||tstatus==='awaiting_approval')){
            telemetryEvents.push({
              kind:'tool_'+tstatus,
              severity:tstatus==='error'?'warn':'info',
              ts,
              label:'工具状态 ['+tstatus+']: '+cname,
              detail:trim(tc.description||outputText).slice(0,160)
            });
          }
        }

        const bodyText=textParts.join('\n\n');
        if(bodyText)blocks.push({type:'text',text:bodyText});

        out.push({
          uuid:msgId,
          sender:'assistant',
          created_at:ts,
          updated_at:ts,
          parent_message_uuid:parentUuid,
          ...(model?{model}:{}),
          content:blocks.length?blocks:[{type:'text',text:''}],
          text:bodyText,
          attachments:[],
          files:[]
        });
        parentUuid=msgId;
      }
      return out;
    }

    const activeMsgs=materializeRecordList(activeRecords,root,'');
    const branchMsgs=[];
    rewoundBranches.forEach((br,bi)=>{
      branchMsgs.push(...materializeRecordList(br.records,br.anchorId,'-rewind'+bi));
    });
    const allMessages=[...activeMsgs,...branchMsgs];

    if(rewindCount>0){
      telemetryEvents.push({
        kind:'rewind',
        severity:'info',
        ts:lastTs||firstTs,
        label:'对话历史回溯 ($rewindTo ×'+rewindCount+')',
        detail:'保留已回退分支供树状模式检查'
      });
    }

    const convUuid='gemini:'+sessionId;
    const rawSummary=trim(meta.summary||'');
    const title=rawSummary||firstPromptTitle||(cwdInfo?'['+cwdInfo.project.name.replace(/ \(Gemini CLI\)$/,'')+'] '+sessionId.slice(0,8):'Gemini CLI '+sessionId.slice(0,8));
    const displayTitle=(isSubagent&&!title.startsWith('[Subagent]'))?('[Subagent] '+title):title;

    const conversation={
      uuid:convUuid,
      originalId:sessionId,
      sourcePlatform:'gemini_cli',
      name:displayTitle,
      summary:rawSummary,
      created_at:firstTs||lastTs,
      updated_at:lastTs||firstTs,
      ...(activeMsgs.length?{defaultPath:activeMsgs.map(m=>m.uuid)}:{}),
      ...(cwdInfo?{workspaceId:cwdInfo.wsId}:{}),
      ...(defaultModel?{defaultModel}:{}),
      geminiCliMeta:{
        sessionId,
        projectHash:trim(meta.projectHash||''),
        slug,
        cwd,
        directories:rawDirs,
        kind:isSubagent?'subagent':'main',
        isSubagent,
        ...(parentSessionId?{parentThreadId:parentSessionId}:{}),
        models:[...modelsUsed],
        filesModified:[...fileDiffPaths],
        rewindCount,
        ...(tokenSum.total>0?{usage:{
          input_tokens:tokenSum.input,
          output_tokens:tokenSum.output,
          cache_read_input_tokens:tokenSum.cached,
          thoughts_tokens:tokenSum.thoughts,
          tool_tokens:tokenSum.tool,
          total_tokens:tokenSum.total
        }}:{})
      },
      geminiCliTelemetry:{
        isSubagent,
        rewindCount,
        patchCount,
        setCount,
        toolStatusCounts,
        toolNameCounts,
        filesModifiedCount:fileDiffPaths.size,
        tokens:tokenSum,
        models:[...modelsUsed],
        events:telemetryEvents
      },
      importWarnings:warnings,
      chat_messages:allMessages
    };

    return {conversation,project:cwdInfo?cwdInfo.project:null,warnings};
  }

  function parseSessionText(input,opts={}){
    const it=convertGeminiSessionSteps(input,opts);
    let step;
    do{step=it.next();}while(!step.done);
    return step.value;
  }

  async function parseSessionAsync(input,opts={},checkpoint=async()=>{}){
    const it=convertGeminiSessionSteps(input,opts);
    let step;
    do{step=it.next();if(!step.done)await checkpoint();}while(!step.done);
    return step.value;
  }

  return {
    isGeminiCliJson,
    isGeminiCliJsonlText,
    parseSessionText,
    parseSessionAsync,
    projectFromCwd,
    parseDate
  };
}
