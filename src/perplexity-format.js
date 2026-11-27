function perplexityExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const bounded=value=>string(value).slice(0,8192);
  const safeUrl=value=>{try{const url=new URL(string(value));return /^(https?:)$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};

  function parseDate(value){
    if(value==null||value==='')return '';
    if(typeof value==='number'&&Number.isFinite(value)&&value>0){
      const ms=value>=1e11?value:value*1000;
      if(ms>8.64e15)return '';
      try{return new Date(ms).toISOString();}catch{return '';}
    }
    const raw=string(value).trim();
    if(!raw)return '';
    // Normalize space-separated timestamps or naive ISO strings as UTC
    const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)?raw.replace(' ','T')+'Z':(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)?raw+'Z':raw);
    const ms=Date.parse(normalized);
    if(!Number.isFinite(ms))return '';
    try{return new Date(ms).toISOString();}catch{return '';}
  }

  function isConversation(value){
    return !!(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.context_uuid==='string'&&value.context_uuid&&Array.isArray(value.entries));
  }

  function isExport(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.conversations))return false;
    return value.conversations.length>0&&value.conversations.every(isConversation);
  }

  function* convertSteps(conv){
    if(!isConversation(conv))return conv;
    const originalId=string(conv.context_uuid);
    if(!originalId)throw new Error('Perplexity conversation UUID missing');
    const prefix='perplexity:'+originalId+':',messages=[];
    const convMode=string(conv.mode).trim();
    let prevUuid=root;

    for(let index=0;index<conv.entries.length;index++){
      const entry=conv.entries[index];
      if(!entry||typeof entry!=='object')continue;
      const entryId=string(entry.entry_uuid)||('entry-'+index);
      const createdAt=parseDate(entry.created_at)||parseDate(conv.created_at);
      const query=string(entry.query);
      const answer=string(entry.answer);
      const status=string(entry.query_status).trim();
      const engineMode=string(entry.engine_mode).trim();
      const model=string(entry.model).trim()||(engineMode?'perplexity-'+engineMode.toLowerCase():(convMode?'perplexity-'+convMode.toLowerCase():'perplexity'));

      const qUuid=prefix+entryId+':q';
      messages.push({
        uuid:qUuid,
        originalId:entryId,
        sourcePlatform:'perplexity',
        sender:'human',
        created_at:createdAt,
        updated_at:createdAt,
        parent_message_uuid:prevUuid,
        model:'',
        content:query?[{type:'text',text:query}]:[],
        attachments:[]
      });
      prevUuid=qUuid;

      const aBlocks=[];
      const rawSources=list(entry.sources||entry.web_results||entry.citations);
      const searchItems=[],seenUrls=new Set();
      for(const src of rawSources){
        const url=safeUrl(src?.url||src?.link);
        if(url&&!seenUrls.has(url)){
          seenUrls.add(url);
          searchItems.push({type:'web_search_result',title:bounded(src.title||src.name||url),url});
        }
      }
      if(searchItems.length)aBlocks.push({type:'web_search_tool_result',content:searchItems});
      if(answer){
        aBlocks.push({type:'text',text:answer});
      }else if(status&&status.toUpperCase()!=='COMPLETED'){
        aBlocks.push({type:'text',text:'[Status: '+status+']'});
      }

      const aUuid=prefix+entryId+':a';
      messages.push({
        uuid:aUuid,
        originalId:entryId,
        sourcePlatform:'perplexity',
        sender:'assistant',
        created_at:createdAt,
        updated_at:createdAt,
        parent_message_uuid:prevUuid,
        model,
        content:aBlocks,
        attachments:[]
      });
      prevUuid=aUuid;
      yield;
    }

    const title=string(conv.context_title).trim()||string(conv.entries[0]?.query).trim().slice(0,80);
    return {
      uuid:'perplexity:'+originalId,
      originalId,
      sourcePlatform:'perplexity',
      name:title,
      summary:'',
      created_at:parseDate(conv.created_at),
      updated_at:parseDate(conv.updated_at)||parseDate(conv.created_at),
      ...(string(conv.collection_uuid)?{collectionUuid:string(conv.collection_uuid)}:{}),
      defaultModel:convMode?'perplexity-'+convMode.toLowerCase():'',
      importWarnings:[],
      chat_messages:messages
    };
  }

  function convert(conv){const it=convertSteps(conv);let step;do{step=it.next();}while(!step.done);return step.value;}
  async function convertAsync(conv,checkpoint){const it=convertSteps(conv);let step;do{step=it.next();if(!step.done)await checkpoint();}while(!step.done);return step.value;}

  function unescapeXml(text){
    return string(text)
      .replace(/&#x([0-9a-fA-F]+);/g,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
      .replace(/&#(\d+);/g,(_,dec)=>String.fromCodePoint(parseInt(dec,10)))
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
  }

  function colIndex(ref){
    const m=/^([A-Z]+)/i.exec(string(ref));
    if(!m)return -1;
    let n=0;
    for(const ch of m[1].toUpperCase())n=n*26+(ch.charCodeAt(0)-64);
    return n-1;
  }

  function parseSharedStrings(xml){
    const out=[];
    if(!xml)return out;
    for(const si of string(xml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)){
      let buf='';
      for(const t of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi))buf+=unescapeXml(t[1]);
      out.push(buf);
    }
    return out;
  }

  function parseSheetRows(xml,sharedStrings=[]){
    const rows=[];
    for(const rowMatch of string(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)){
      const cells=[];
      for(const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)){
        const attrs=cellMatch[1],body=cellMatch[2];
        const rMatch=/\br="([^"]+)"/i.exec(attrs),tMatch=/\bt="([^"]+)"/i.exec(attrs);
        const idx=rMatch?colIndex(rMatch[1]):cells.length;
        const type=tMatch?tMatch[1]:'';
        let value='';
        if(type==='inlineStr'){
          for(const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi))value+=unescapeXml(t[1]);
        }else{
          const vMatch=/<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body);
          const rawVal=vMatch?unescapeXml(vMatch[1]):'';
          if(type==='s'){
            const si=Number(rawVal);
            value=Number.isInteger(si)&&sharedStrings[si]!==undefined?sharedStrings[si]:rawVal;
          }else{
            value=rawVal;
          }
        }
        if(idx>=0)cells[idx]=value;
      }
      if(cells.length)rows.push(cells.map(v=>v===undefined?'':v));
    }
    return rows;
  }

  function rowsToObjects(rows){
    if(rows.length<2)return [];
    const headers=rows[0].map(h=>string(h).trim());
    const result=[];
    for(let i=1;i<rows.length;i++){
      const obj=Object.create(null);
      let hasValue=false;
      for(let j=0;j<headers.length;j++){
        if(!headers[j])continue;
        const val=string(rows[i][j]);
        if(val)hasValue=true;
        obj[headers[j]]=val;
      }
      if(hasValue)result.push(obj);
    }
    return result;
  }

  function parseWorkbook({workbookXml='',sharedStringsXml='',sheets={}}={}){
    const shared=parseSharedStrings(sharedStringsXml);
    const sheetNames=[];
    for(const m of string(workbookXml).matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*>/gi)){
      sheetNames.push(unescapeXml(m[1]));
    }
    const byName=Object.create(null);
    const orderedKeys=Object.keys(sheets).sort((a,b)=>{
      const na=Number(/sheet(\d+)\.xml$/i.exec(a)?.[1]??0);
      const nb=Number(/sheet(\d+)\.xml$/i.exec(b)?.[1]??0);
      return na-nb||a.localeCompare(b);
    });
    orderedKeys.forEach((key,idx)=>{
      const name=sheetNames[idx]||key;
      byName[name]=rowsToObjects(parseSheetRows(sheets[key],shared));
    });

    const profile=byName['User Profile']?.[0]||null;
    const prefs=byName['User Preferences']?.[0]||null;
    const account=byName['Account Information']?.[0]||null;
    const collections=byName['Collections & Shared Content']||[];

    const users=[],accounts=[],projects=[];
    const rawUserId=string(profile?.USER_ID||prefs?.USER_ID||account?.USERNAME||account?.EMAIL).trim();
    if(profile||account||prefs){
      const accountId=rawUserId?'perplexity:'+rawUserId:'';
      if(accountId)accounts.push(accountId);
      const userObj={
        ...(accountId?{uuid:accountId}:{}),
        full_name:string(account?.NAME||profile?.USERNAME||account?.USERNAME||profile?.USER_EMAIL||account?.EMAIL),
        email:string(profile?.USER_EMAIL||account?.EMAIL),
        username:string(profile?.USERNAME||account?.USERNAME),
        sourcePlatform:'perplexity',
        ...(profile?{profile}:{}),
        ...(prefs?{preferences:prefs}:{}),
        ...(account?{account}:{})
      };
      users.push(userObj);
    }

    for(const col of collections){
      const cid=string(col.COLLECTION_ID||col.ID).trim();
      const title=string(col.TITLE).trim();
      if(!cid&&!title)continue;
      projects.push({
        uuid:'perplexity:col:'+(cid||title),
        name:title||('Perplexity Space '+cid),
        description:string(col.DESCRIPTION).trim(),
        created_at:parseDate(col.CREATED),
        updated_at:parseDate(col.UPDATED)||parseDate(col.CREATED),
        sourcePlatform:'perplexity',
        docs:[]
      });
    }
    return {users,accounts,projects};
  }

  return {isConversation,isExport,parseDate,convert,convertAsync,parseWorkbook};
}
