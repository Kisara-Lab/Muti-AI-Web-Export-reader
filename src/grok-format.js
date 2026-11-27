function grokExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const bounded=value=>string(value).slice(0,8192);
  const safeUrl=value=>{try{const url=new URL(string(value));return /^(https?:)$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
  const escape=value=>string(value).replace(/[\\`*{}\[\]<>_!|]/g,'\\$&').replace(/[\r\n]+/g,' ');
  const link=(label,url)=>safeUrl(url)?'['+escape(label||url)+'](<'+safeUrl(url).replace(/[<>]/g,encodeURIComponent)+'>)':escape(label);

  function parseDateMs(value){
    if(value==null||value==='')return NaN;
    if(typeof value==='number'&&Number.isFinite(value)&&value>0){
      const ms=value>=1e11?value:value*1000;
      return ms<=8.64e15?ms:NaN;
    }
    if(typeof value==='string'){
      if(/^\d{10,16}$/.test(value.trim())){
        const num=Number(value.trim()),ms=num>=1e11?num:num*1000;
        return ms<=8.64e15?ms:NaN;
      }
      const parsed=Date.parse(value);
      return Number.isFinite(parsed)?parsed:NaN;
    }
    if(typeof value==='object'){
      if(value.$date!==undefined)return parseDateMs(value.$date);
      if(value.$numberLong!==undefined)return parseDateMs(value.$numberLong);
    }
    return NaN;
  }

  function parseDate(value){
    const ms=parseDateMs(value);
    if(!Number.isFinite(ms))return '';
    try{return new Date(ms).toISOString();}catch{return '';}
  }

  function isConversation(value){
    return !!(value&&typeof value==='object'&&!Array.isArray(value)&&value.conversation&&typeof value.conversation==='object'&&typeof value.conversation.id==='string'&&value.conversation.id&&Array.isArray(value.responses));
  }

  function isBackendExport(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.conversations))return false;
    if(value.conversations.length)return value.conversations.every(isConversation);
    return Array.isArray(value.projects)||Array.isArray(value.tasks)||Array.isArray(value.media_posts);
  }

  function isAuthExport(value){
    return !!(value&&typeof value==='object'&&!Array.isArray(value)&&value.user&&typeof value.user==='object'&&typeof value.user.userId==='string'&&value.user.userId&&Array.isArray(value.sessions));
  }

  function parseCardMap(rawCards){
    const map=new Map();
    for(const item of list(rawCards)){
      let card=item;
      if(typeof item==='string'){try{card=JSON.parse(item);}catch{continue;}}
      if(card&&typeof card==='object'&&typeof card.id==='string'&&card.id)map.set(card.id,card);
    }
    return map;
  }

  function parseAttrs(raw){
    const attrs=Object.create(null);
    for(const match of string(raw).matchAll(/([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){
      attrs[match[1]]=match[2]??match[3]??'';
    }
    return attrs;
  }

  function parseMessage(text,cardAttachmentsJson=[]){
    const input=string(text);
    if(!input||!input.includes('<grok:render'))return {text:input,files:[]};
    const cards=parseCardMap(cardAttachmentsJson),numbered=new Map(),sources=[],files=[];
    let output='',cursor=0,fence=null,inline=0;
    const addCitation=(cardId,card,fallbackLabel)=>{
      const key=cardId||fallbackLabel||'citation';
      if(!numbered.has(key)){
        numbered.set(key,numbered.size+1);
        sources.push({number:numbered.get(key),title:bounded(card?.title||card?.url||fallbackLabel||'来源 / Source'),url:safeUrl(card?.url)});
      }
      return '['+numbered.get(key)+']';
    };
    while(cursor<input.length){
      const lineStart=cursor===0||input[cursor-1]==='\n';
      if(lineStart){
        const match=/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(input.slice(cursor));
        if(match){
          const token=match[1];
          if(!fence)fence={char:token[0],length:token.length};
          else if(fence.char===token[0]&&token.length>=fence.length)fence=null;
          output+=match[0];cursor+=match[0].length;inline=0;continue;
        }
      }
      if(!fence&&input[cursor]==='`'){
        const match=/^`+/.exec(input.slice(cursor))[0];
        if(!inline)inline=match.length;else if(inline===match.length)inline=0;
        output+=match;cursor+=match.length;continue;
      }
      if(!fence&&!inline&&input.startsWith('<grok:render',cursor)){
        const closeTag='</grok:render>';
        const end=input.indexOf(closeTag,cursor);
        if(end!==-1&&end-cursor<=16384){
          const full=input.slice(cursor,end+closeTag.length);
          const openEnd=full.indexOf('>');
          const attrs=openEnd>0?parseAttrs(full.slice('<grok:render'.length,openEnd)):Object.create(null);
          const body=openEnd>0?full.slice(openEnd+1,-closeTag.length):'';
          const args=Object.create(null);
          for(const m of body.matchAll(/<argument\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/argument>/gi)){
            args[m[1]]=m[2].trim();
          }
          const cardId=attrs.card_id||'',cardType=attrs.card_type||'',renderType=attrs.type||'',card=cards.get(cardId);
          if(cardType==='citation_card'||renderType==='render_inline_citation'){
            output+=addCitation(cardId,card,args.citation_id);
          }else if(cardType==='rendered_file_card'||renderType==='render_file'){
            const fileName=bounded(card?.file_name||args.file_path||cardId||'file');
            const fileUrl=safeUrl(card?.url||card?.preview_doc_url);
            files.push({name:fileName,mime:string(card?.mime_type),size:card?.file_size,url:fileUrl});
            output+='\n\n📎 '+(fileUrl?link(fileName,fileUrl):escape(fileName))+(card?.mime_type?' (`'+escape(card.mime_type)+'`)':'')+'\n\n';
          }else if(card?.url){
            output+=addCitation(cardId,card,card.title||cardId);
          }
          cursor=end+closeTag.length;continue;
        }
      }
      output+=input[cursor++];
    }
    for(const source of sources){
      output+='\n\n['+source.number+'] '+link(source.title,source.url);
    }
    return {text:output,files};
  }

  function parseToolCard(xml){
    const raw=string(xml);
    if(!raw)return null;
    const stripCdata=s=>string(s).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/,'$1').trim();
    const tag=name=>{
      const m=new RegExp('<xai:'+name+'[^>]*>([\\s\\S]*?)<\\/xai:'+name+'>','i').exec(raw);
      return m?stripCdata(m[1]):'';
    };
    const id=tag('tool_usage_card_id'),name=tag('tool_name'),rawArgs=tag('tool_args');
    if(!id&&!name&&!rawArgs)return null;
    let input={};
    if(rawArgs){
      try{const parsed=JSON.parse(rawArgs);input=parsed&&typeof parsed==='object'?parsed:{value:parsed};}
      catch{input={raw:rawArgs.slice(0,8192)};}
    }
    return {id,name:name||'tool',input};
  }

  function* convertSteps(entry){
    if(!isConversation(entry))return entry;
    const conv=entry.conversation,originalId=string(conv.id);
    if(!originalId)throw new Error('Grok conversation ID missing');
    const prefix='grok:'+originalId+':',warnings=[],messages=[];
    const rawResponses=list(entry.responses).map(item=>item?.response||item).filter(r=>r&&typeof r==='object'&&typeof r._id==='string'&&r._id);
    const byId=new Map();
    for(const r of rawResponses)byId.set(r._id,r);

    const parents=new Map();
    for(const r of rawResponses){
      const key=r._id;
      let parent=string(r.parent_response_id);
      if(parent===key){parent='';warnings.push('消息树存在循环 / Message tree cycle');}
      if(!parent)parents.set(key,root);
      else parents.set(key,prefix+parent);
    }

    for(const r of rawResponses){
      const blocks=[],thinkingHeaders=[],toolNamesById=new Map(),searchItems=[],seenUrls=new Set();
      for(const step of list(r.steps)){
        if(!step||typeof step!=='object')continue;
        const tagged=step.tagged_text&&typeof step.tagged_text==='object'?step.tagged_text:{};
        const header=string(tagged.header).trim();
        if(header)thinkingHeaders.push(header);
        const cards=Array.isArray(tagged.tool_usage_card)?tagged.tool_usage_card:(tagged.tool_usage_card?[tagged.tool_usage_card]:[]);
        for(const cardXml of cards){
          const parsedCard=parseToolCard(cardXml);
          if(parsedCard){
            if(parsedCard.id)toolNamesById.set(parsedCard.id,parsedCard.name);
            blocks.push({type:'tool_use',id:parsedCard.id||undefined,name:parsedCard.name,input:parsedCard.input});
          }
        }
        for(const res of list(step.tool_usage_results)){
          if(!res||typeof res!=='object')continue;
          const toolId=string(res.tool_usage_card_id);
          const resultText=typeof res.result==='string'?res.result:JSON.stringify(res.result??'',null,2);
          blocks.push({type:'tool_result',tool_use_id:toolId||undefined,name:toolNamesById.get(toolId)||'tool',content:[{type:'text',text:resultText.slice(0,32768)}]});
        }
        for(const sr of list(step.web_search_results)){
          const url=safeUrl(sr?.url);
          if(url&&!seenUrls.has(url)){seenUrls.add(url);searchItems.push({type:'web_search_result',title:bounded(sr.title||url),url});}
        }
      }
      for(const sr of list(r.web_search_results)){
        const url=safeUrl(sr?.url);
        if(url&&!seenUrls.has(url)){seenUrls.add(url);searchItems.push({type:'web_search_result',title:bounded(sr.title||url),url});}
      }
      if(thinkingHeaders.length){
        const tStart=parseDateMs(r.thinking_start_time),tEnd=parseDateMs(r.thinking_end_time);
        const durationMs=Number.isFinite(tStart)&&Number.isFinite(tEnd)&&tEnd>=tStart?Math.round(tEnd-tStart):undefined;
        blocks.unshift({type:'thinking',thinking:thinkingHeaders.join('\n\n'),summaries:true,...(durationMs?{duration_ms:durationMs}:{})});
      }
      if(searchItems.length){
        blocks.push({type:'web_search_tool_result',content:searchItems});
      }
      const parsedMsg=parseMessage(r.message,r.card_attachments_json);
      let bodyText=parsedMsg.text;
      const xposts=list(r.xpost_ids).map(id=>string(id).trim()).filter(id=>/^\d{5,25}$/.test(id));
      if(xposts.length){
        bodyText+=(bodyText?'\n\n':'')+xposts.map(id=>'- X Post: '+link('x.com/i/web/status/'+id,'https://x.com/i/web/status/'+id)).join('\n');
      }
      if(bodyText){
        blocks.push({type:'text',text:bodyText});
      }
      const attachments=[];
      for(const att of list(r.file_attachments)){
        if(typeof att==='string'&&att.trim()){
          const id=att.trim();
          attachments.push({file_name:id,file_type:'',file_id:id,file_path:'prod-mc-asset-server/'+id+'/content'});
        }else if(att&&typeof att==='object'){
          const id=string(att.file_id||att.id||att.asset_id).trim();
          const fname=string(att.file_name||att.name||id);
          if(id||fname)attachments.push({file_name:fname,file_type:string(att.mime_type||att.file_type),file_id:id,file_path:id?'prod-mc-asset-server/'+id+'/content':''});
        }
      }
      const rawSender=string(r.sender).toLowerCase();
      const sender=rawSender==='human'||rawSender==='user'?'human':rawSender==='assistant'||rawSender==='grok'?'assistant':rawSender||'unknown';
      const createdAt=parseDate(r.create_time);
      messages.push({
        uuid:prefix+r._id,
        originalId:r._id,
        sourcePlatform:'grok',
        sender,
        created_at:createdAt,
        updated_at:createdAt,
        parent_message_uuid:parents.get(r._id),
        model:string(r.model),
        content:blocks,
        attachments
      });
      yield;
    }

    const path=[],seen=new Set();
    let current=string(conv.leaf_response_id),valid=!!(current&&byId.has(current));
    while(current&&byId.has(current)){
      if(seen.has(current)){valid=false;break;}
      seen.add(current);
      path.unshift(prefix+current);
      const parent=string(byId.get(current).parent_response_id);
      if(parent&&!byId.has(parent))valid=false;
      current=parent;
    }
    if(conv.leaf_response_id&&(!valid||!path.length)){
      warnings.push('当前节点缺失或无效，显示最长有效路径 / Invalid current node; showing longest valid path');
    }

    const accountUuid=string(conv.user_id)?'grok:'+string(conv.user_id):'';
    return {
      uuid:'grok:'+originalId,
      originalId,
      sourcePlatform:'grok',
      name:string(conv.title),
      summary:string(conv.summary),
      created_at:parseDate(conv.create_time),
      updated_at:parseDate(conv.modify_time)||parseDate(conv.create_time),
      ...(accountUuid?{account:{uuid:accountUuid}}:{}),
      ...(string(conv.workspace_id)?{workspaceId:string(conv.workspace_id)}:{}),
      defaultModel:'',
      currentNode:string(conv.leaf_response_id),
      defaultPath:valid?path:[],
      importWarnings:[...new Set(warnings)],
      chat_messages:messages
    };
  }

  function convert(entry){const it=convertSteps(entry);let step;do{step=it.next();}while(!step.done);return step.value;}
  async function convertAsync(entry,checkpoint){const it=convertSteps(entry);let step;do{step=it.next();if(!step.done)await checkpoint();}while(!step.done);return step.value;}

  function convertProjects(projects){
    return list(projects).filter(p=>p&&typeof p==='object'&&typeof p.workspace_id==='string'&&p.workspace_id).map(p=>({
      uuid:'grok:ws:'+p.workspace_id,
      name:string(p.name)||'Grok Workspace',
      description:string(p.preferred_model)?'Preferred model: '+string(p.preferred_model):'',
      prompt_template:string(p.custom_personality),
      created_at:parseDate(p.create_time),
      updated_at:parseDate(p.last_use_time)||parseDate(p.create_time),
      sourcePlatform:'grok',
      docs:[]
    }));
  }

  function convertAuth(auth){
    if(!isAuthExport(auth))return {users:[],logins:[],accounts:[]};
    const u=auth.user;
    const fullName=[string(u.givenName),string(u.familyName)].filter(Boolean).join(' ');
    const accountId='grok:'+u.userId;
    const users=[{
      ...u,
      uuid:accountId,
      full_name:fullName||string(u.email)||u.userId,
      sourcePlatform:'grok'
    }];
    const logins=list(auth.sessions).filter(s=>s&&typeof s==='object').map(s=>({
      ...s,
      account_uuid:accountId,
      timestamp:parseDate(s.createTime)||string(s.createTime),
      ip_address:string(s.cfMetadata?.ipAddress),
      city:string(s.cfMetadata?.city),
      country:string(s.cfMetadata?.country),
      sourcePlatform:'grok'
    }));
    return {users,logins,accounts:[accountId]};
  }

  return {isBackendExport,isConversation,isAuthExport,parseDate,parseMessage,parseToolCard,convert,convertAsync,convertProjects,convertAuth,safeUrl};
}
