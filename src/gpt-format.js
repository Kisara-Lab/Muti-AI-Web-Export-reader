function gptExportCore(){
  const root='00000000-0000-4000-8000-000000000000';
  const list=value=>Array.isArray(value)?value:[];
  const string=value=>typeof value==='string'?value:'';
  const bounded=value=>string(value).slice(0,8192);
  const safeUrl=value=>{try{const url=new URL(string(value));return /^(https?:)$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
  const escape=value=>string(value).replace(/[\\`*{}\[\]<>_!|]/g,'\\$&').replace(/[\r\n]+/g,' ');
  const link=(label,url)=>safeUrl(url)?'['+escape(label||url)+'](<'+safeUrl(url).replace(/[<>]/g,encodeURIComponent)+'>)':escape(label);
  const timestamp=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<8640000000000?new Date(value*1000).toISOString():'';
  const isConversation=value=>!!(value&&typeof value==='object'&&!Array.isArray(value)&&value.mapping&&typeof value.mapping==='object'&&!Array.isArray(value.mapping));
  function manifest(value,paths){
    const logical=value?.logical_files?.['conversations.json'];if(!logical)return null;
    const files=list(logical.files);if(!files.length||logical.shard_count!==files.length)throw new Error('Invalid GPT conversation shards');
    const seen=new Set();for(const path of files){if(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.split('/').some(part=>part==='..'||part==='')||seen.has(path))throw new Error('Duplicate or invalid GPT shard path');if(!paths.includes(path))throw new Error('Missing GPT conversation shard: '+path);seen.add(path);}
    return files;
  }
  function boundedDetails(value){
    let nodes=0,exceeded=false;
    const visit=(item,depth)=>{if(++nodes>256||depth>6){exceeded=true;return '[limit]';}if(typeof item==='string')return item.slice(0,512);if(item===null||typeof item==='number'||typeof item==='boolean')return item;if(Array.isArray(item))return item.slice(0,32).map(child=>visit(child,depth+1));if(item&&typeof item==='object'){const result=Object.create(null);for(const key of Object.keys(item).slice(0,32))result[key.slice(0,64)]=visit(item[key],depth+1);return result;}return null;};
    return {text:JSON.stringify(visit(value,0),null,2).slice(0,8192),exceeded};
  }
  function referenceIndex(references){
    const index=new Map();for(const reference of references)for(const item of [...list(reference.items),...list(reference.sources)])for(const ref of list(item.refs))index.set('turn'+ref.turn_index+ref.ref_type+ref.ref_index,item);for(const reference of references)if(reference.type==='file'){for(const id of [reference.id,reference.input_pointer])if(typeof id==='string')index.set(id,reference);const pointer=reference.input_pointer;if(pointer&&typeof pointer==='object')index.set('turn'+pointer.message_index+'file'+pointer.file_index,reference);}return index;
  }
  function parseText(text,metadata={}){
    const references=list(metadata.content_references),index=referenceIndex(references),views=[],used=new Set();let output='',cursor=0,fence=null,inline=0;
    const numbered=new Map(),sources=[];let citationGroup=0;
    function marker(kind,payload,raw){
      if(kind==='cite'||kind==='filecite'){
        const ids=payload.split('\ue202'),group=kind==='cite'?references.filter(reference=>reference.type==='grouped_webpages')[citationGroup]:null;
        const suffix=id=>/^turn\d+([a-z]+\d+)$/.exec(id)?.[1];
        const groupItems=list(group?.items),groupRefs=groupItems.flatMap(item=>list(item.refs).map(ref=>ref.ref_type+ref.ref_index));
        const groupValid=group&&ids.every(id=>suffix(id)&&groupRefs.includes(suffix(id)))&&groupRefs.every(ref=>ids.some(id=>suffix(id)===ref));
        if(groupValid)citationGroup++;
        return ids.map(id=>{
        if(/^L\d+(?:-L?\d+)?$/.test(id))return ' '+id;
        const places=references.filter(ref=>ref.type==='map').flatMap(ref=>list(ref.entities)).concat(Object.values(metadata.view_state?.widgets||{}).flatMap(widget=>list(widget?.points))),place=/business\d+$/.test(id)?places.find(point=>list(point.refs).some(ref=>ref.ref_type+ref.ref_index===suffix(id))):null;
        const source=(groupValid?groupItems.find(item=>list(item.refs).some(ref=>ref.ref_type+ref.ref_index===suffix(id))):null)||index.get(id)||(place?{title:place.name,url:place.entity?.website_url}:null);if(!source){views.push({kind:'missing',title:'来源数据缺失 / Source data missing',details:boundedDetails({marker:raw}).text});return '[来源数据缺失 / Source data missing]';}
        if(!numbered.has(id)){numbered.set(id,numbered.size+1);sources.push({number:numbered.get(id),source});if(source.type==='file')views.push({kind:'file',title:bounded(source.name),fileId:string(source.id),description:source.page_range_start!=null?'p. '+source.page_range_start:''});}return '['+numbered.get(id)+']';
      }).join(' ');}
      const reference=references.find(ref=>ref.type===kind&&!used.has(ref));if(reference)used.add(reference);
      if(kind==='entity'){let value;try{value=JSON.parse(payload);}catch{}const name=reference?.name||reference?.alt||(Array.isArray(value)?value[1]:'');views.push({kind:'entity',title:bounded(name),description:bounded(reference?.notes),url:safeUrl(reference?.entity_data?.website_url)});return escape(bounded(name))||'[实体 / Entity]';}
      if(kind==='url')return reference?.alt?bounded(reference.alt):'[链接 / Link]';
      if(kind==='entity_metadata'){const entity=reference?.entity_data||{};const title=bounded(entity.name||reference?.name);const description=bounded(entity.description||entity.enriched_description);const url=safeUrl(entity.website_url);views.push({kind:'entity',title,description,url});return '\n\n'+link(title,url)+'\n\n'+escape(description)+'\n\n';}
      if(kind==='image_group'){
        const images=list(reference?.images).slice(0,100).map(item=>{const image=item.image_result||item;return {title:bounded(image.title||image.alt||'图片 / Image'),url:safeUrl(image.content_url||image.image_url||image.url||image.original)};});views.push({kind:'images',title:'图片组 / Image group',images});return '\n\n'+images.map(image=>'图片 / Image: '+link(image.title,image.url)).join('\n\n')+'\n\n';
      }
      if(kind==='map'){
        const widgets=Object.values(metadata.view_state?.widgets||{}),points=list(widgets.find(widget=>Array.isArray(widget?.points))?.points||reference?.entities).slice(0,200).map(point=>{const entity=point.entity||point;return {title:bounded(point.name||entity.name),description:bounded(point.address||entity.address||point.description),latitude:typeof point.latitude==='number'?point.latitude:entity.latitude,longitude:typeof point.longitude==='number'?point.longitude:entity.longitude};});views.push({kind:'map',title:'地点 / Places',points});return '\n\n'+points.map(point=>escape(point.title)+' — '+escape(point.description)+(Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)?' ('+point.latitude+', '+point.longitude+')':'')).join('\n\n')+'\n\n';
      }
      if(kind==='genui'||kind==='client_defined_widget'){
        const dil=references.find(ref=>ref.type==='dil')?.dil,widgets=Object.values(metadata.view_state?.widgets||{}),state=widgets.find(widget=>widget?.kind)||dil?.initialState||{},labels=[];let count=0,limited=false;
        const walk=(node,depth)=>{if(!node||typeof node!=='object')return;if(++count>256||depth>12){limited=true;return;}if(!['Basic','Box','Show','Button','Text','Stack','Row','Column'].includes(node.type))return;for(const key of ['text','label','$label']){const value=node[key];if(typeof value==='string'&&!/[${}]|\b(?:state|function)\b/.test(value))labels.push(bounded(value));}for(const child of list(node.children).slice(0,64))walk(child,depth+1);};walk(dil,0);
        for(const key of ['file_label','photo_label','video_label','media_label','camera_label'])if(typeof state[key]==='string')labels.push(bounded(state[key]));
        const buttons=[...new Set(labels)].slice(0,32);views.push({kind:'disabled',title:'历史组件 / Historical component',buttons,details:buttons.length&&!limited?'':boundedDetails({kind,payload,limited}).text});return '\n\n'+(buttons.length?buttons.map(escape).join(' · '):'组件数据缺失 / Component data missing')+' — 历史记录中不可执行 / Unavailable in history\n\n';
      }
      views.push({kind:'unknown',title:'未知组件 / Unknown component',details:boundedDetails({kind,payload,reference}).text});return '[未知组件 / Unknown component]';
    }
    while(cursor<text.length){
      const lineStart=cursor===0||text[cursor-1]==='\n';
      if(lineStart){const match=/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(text.slice(cursor));if(match){const token=match[1];if(!fence)fence={char:token[0],length:token.length};else if(fence.char===token[0]&&token.length>=fence.length)fence=null;output+=match[0];cursor+=match[0].length;inline=0;continue;}}
      if(!fence&&text[cursor]==='`'){const match=/^`+/.exec(text.slice(cursor))[0];if(!inline)inline=match.length;else if(inline===match.length)inline=0;output+=match;cursor+=match.length;continue;}
      if(!fence&&!inline&&text[cursor]==='\ue200'){const end=text.indexOf('\ue201',cursor+1);if(end!==-1&&end-cursor<=65536){const raw=text.slice(cursor,end+1),split=raw.indexOf('\ue202');output+=marker(raw.slice(1,split<0?-1:split),split<0?'':raw.slice(split+1,-1),raw);cursor=end+1;continue;}}
      output+=text[cursor++];
    }
    for(const {number,source}of sources){const title=bounded(source.title||source.name||'来源 / Source'),url=safeUrl(source.url||source.cloud_doc_url);output+='\n\n['+number+'] '+link(title,url)+(source.page_range_start!=null?' · p. '+source.page_range_start+(source.page_range_end!=null?'–'+source.page_range_end:''):'');}
    return {text:output,views};
  }
  function convert(value){
    if(!isConversation(value))return value;
    const originalId=string(value.id||value.conversation_id);if(!originalId)throw new Error('GPT conversation ID missing');
    const mapping=value.mapping,keys=Object.keys(mapping),prefix='gpt:'+originalId+':',warnings=[],messages=[],parents=new Map();
    for(const key of keys){const node=mapping[key];if(node?.message){let parent=node.parent,seen=new Set([key]);while(parent&&mapping[parent]&&!mapping[parent].message){if(seen.has(parent)){parent=null;warnings.push('消息树存在循环 / Message tree cycle');break;}seen.add(parent);parent=mapping[parent].parent;}parents.set(key,parent&&mapping[parent]?.message?prefix+parent:root);}}
    for(const key of keys){const node=mapping[key],message=node?.message;if(!message)continue;const metadata=message.metadata||{},content=message.content||{},blocks=[];
      if(content.content_type==='text'||content.content_type==='multimodal_text')for(const part of list(content.parts)){if(typeof part==='string'){const parsed=parseText(part,metadata);blocks.push({type:'text',text:parsed.text,gptViews:parsed.views});}else blocks.push({type:'text',text:'[非文本内容 / Non-text content]',gptViews:[{kind:'unknown',title:string(part?.content_type),details:boundedDetails(part).text}]});}
      else if(content.content_type==='reasoning_recap')blocks.push({type:'thinking',thinking:string(content.content),summaries:true});
      else if(content.content_type==='thoughts')blocks.push({type:'thinking',thinking:list(content.thoughts).map(thought=>[string(thought.summary),string(thought.content)].filter(Boolean).join('\n')).join('\n\n'),summaries:true});
      else blocks.push({type:'text',text:'[未知内容 / Unknown content]',gptViews:[{kind:'unknown',title:bounded(content.content_type),details:boundedDetails(content).text}]});
      if(list(metadata.content_references).some(reference=>reference.type==='client_defined_widget')&&!blocks.some(block=>block.gptViews?.some(view=>view.kind==='disabled')))blocks.push({type:'text',text:'[组件数据缺失 / Component data missing]',gptViews:[{kind:'unknown',title:'历史组件 / Historical component',details:'client_defined_widget: exported data unavailable'}]});
      messages.push({uuid:prefix+key,originalId:string(message.id),originalNodeId:key,sourcePlatform:'gpt',sender:message.author?.role==='user'?'human':string(message.author?.role)||'unknown',created_at:timestamp(message.create_time),updated_at:timestamp(message.update_time),parent_message_uuid:parents.get(key),model:string(metadata.model_slug||metadata.resolved_model_slug),contentType:string(content.content_type),content:blocks,attachments:list(metadata.attachments).map(att=>({file_name:string(att.name),file_type:string(att.mime_type),file_id:string(att.id),library_file_id:string(att.library_file_id),file_path:string(att.id)+'.dat',file_size:att.size}))});
    }
    const path=[],seen=new Set();let current=value.current_node,valid=!!mapping[current];while(current&&mapping[current]){if(seen.has(current)){valid=false;break;}seen.add(current);if(mapping[current].message)path.unshift(prefix+current);const parent=mapping[current].parent;if(parent&&!mapping[parent])valid=false;current=parent;}
    if(!valid||!path.length)warnings.push('当前节点缺失或无效，显示最长有效路径 / Invalid current node; showing longest valid path');
    return {uuid:'gpt:'+originalId,originalId,sourcePlatform:'gpt',name:string(value.title),summary:'',created_at:timestamp(value.create_time),updated_at:timestamp(value.update_time),defaultModel:string(value.default_model_slug),currentNode:string(value.current_node),defaultPath:valid?path:[],importWarnings:[...new Set(warnings)],chat_messages:messages};
  }
  return {isConversation,convert,manifest,parseText,safeUrl,boundedDetails};
}
