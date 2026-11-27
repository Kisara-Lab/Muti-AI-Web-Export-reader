import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {marked} from 'marked';
const source=name=>fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8');
const context={URL,structuredClone,marked,Date,Map,Set,Blob};
const gpt=vm.runInNewContext(source('gpt-format')+';gptExportCore()',context);
const core=vm.runInNewContext(source('redaction-rules')+source('worker-core')+';workerDomainCore()',context);
const message=(id,role='assistant',text='Answer')=>({id,author:{role},create_time:1700000000,content:{content_type:'text',parts:[text]},metadata:{}});
const fixture=()=>({id:'synthetic',title:'Synthetic GPT',create_time:1700000000,default_model_slug:'default-only',current_node:'right',mapping:{root:{parent:null,message:null},user:{parent:'root',message:message('u','user','Question')},left:{parent:'user',message:message('a')},deep:{parent:'left',message:message('d')},right:{parent:'user',message:message('b')}}});
test('mapping preserves explicit roles, times, models and current branch with navigation',()=>{
  const value=fixture();value.mapping.right.message.metadata.model_slug='explicit-model';value.mapping.tool={parent:'root',message:message('t','tool')};value.mapping.system={parent:'root',message:message('s','system')};
  const result=gpt.convert(value);assert.equal(result.uuid,'gpt:synthetic');assert.equal(result.chat_messages.length,6);assert.equal(result.chat_messages[0].sender,'human');assert.equal(result.chat_messages[0].created_at,'2023-11-14T22:13:20.000Z');assert.equal(result.chat_messages[0].model,'');assert.equal(result.defaultModel,'default-only');assert.equal(result.chat_messages[3].model,'explicit-model');
  const selected=core.tree(result);assert.deepEqual(Array.from(selected.messages,m=>m.originalNodeId),['user','right']);assert.equal(selected.messages[1]._branch.count,2);assert.deepEqual(Array.from(core.tree(result,'longest',{['gpt:synthetic:user']:0}).messages,m=>m.originalNodeId),['user','left','deep']);
});
test('invalid current, empty roots, cycles, orphan nodes and bad times remain bounded',()=>{
  const value=fixture();value.current_node='missing';value.mapping.left.message.create_time=Infinity;value.mapping.orphan={parent:'missing',message:message('o')};value.mapping.cycle1={parent:'cycle2',message:message('c1')};value.mapping.cycle2={parent:'cycle1',message:message('c2')};const result=gpt.convert(value);assert.equal(result.chat_messages[1].created_at,'');assert.ok(result.importWarnings.length);assert.equal(core.tree(result,'full').ids.length,7);
  value.current_node='cycle1';assert.equal(gpt.convert(value).defaultPath.length,0);
});
test('manifest follows explicit shard order and rejects missing, duplicate and traversal paths',()=>{
  const manifest={logical_files:{'conversations.json':{files:['b.json','a.json'],shard_count:2}}};assert.deepEqual(Array.from(gpt.manifest(manifest,['a.json','b.json'])),['b.json','a.json']);assert.throws(()=>gpt.manifest(manifest,['a.json']),/Missing/);manifest.logical_files['conversations.json'].files=['a.json','a.json'];assert.throws(()=>gpt.manifest(manifest,['a.json']),/Duplicate/);manifest.logical_files['conversations.json'].files=['../a.json','a.json'];assert.throws(()=>gpt.manifest(manifest,['a.json']),/invalid/);
});
test('citations resolve webpage and exact file pointers while code markers stay literal',()=>{
  const citation='\ue200cite\ue202turn1search0\ue201',file='\ue200filecite\ue202turn0file0\ue202L1-L3\ue201';const result=gpt.parseText('😀 '+citation+' `'+citation+'`\n```text\n'+citation+'\n```\n'+file,{content_references:[{type:'grouped_webpages',items:[{title:'Source',url:'https://example.test',refs:[{turn_index:1,ref_type:'search',ref_index:0}]}]},{type:'file',name:'file.md',id:'file_synthetic',input_pointer:{message_index:0,file_index:0}}]});
  assert.match(result.text,/😀 \[1\]/);assert.match(result.text,/L1-L3/);assert.equal(result.text.split(citation).length,3);assert.match(result.text,/example.test/);assert.equal(result.views[0].fileId,'file_synthetic');assert.match(gpt.parseText(citation).text,/Source data missing/);
});
test('components expose only visible fields, deny actions and keep remote images as links',()=>{
  const result=gpt.parseText('\ue200genui\ue202{}\ue201\n\ue200map\ue202{}\ue201\n\ue200image_group\ue202{}\ue201',{content_references:[{type:'dil',dil:{type:'Box',initialState:{file_label:'Attach a file'},$onVisibleAction:'SECRET_ACTION',children:[{type:'Button',$label:'Upload',$onClickAction:'evil()'}]}},{type:'image_group',images:[{image_result:{title:'Remote image',content_url:'https://example.test/image.png'}}]}],view_state:{widgets:{map:{points:[{name:'Test place',latitude:10,longitude:20,address:'Test address'}]}}}});
  assert.match(result.text,/Upload/);assert.match(result.text,/Test place/);assert.ok(!JSON.stringify(result).includes('SECRET_ACTION'));assert.ok(!JSON.stringify(result).includes('evil()'));assert.ok(!result.text.includes('!['));assert.equal(gpt.safeUrl('javascript:alert(1)'),'');assert.equal(gpt.safeUrl('https://user:pass@example.test'),'');assert.ok(gpt.boundedDetails({children:Array(1000).fill('test')}).text.length<=8192);
});
test('recaps and actual thoughts stay summaries; safe exports scan every visible component field',async()=>{
  const value=fixture();value.mapping.right.message.content={content_type:'reasoning_recap',content:'Exported summary'};const result=gpt.convert(value);assert.equal(result.chat_messages[3].content[0].thinking,'Exported summary');result.chat_messages[0].content.push({type:'text',text:'Contact sample@example.test',gptViews:[{kind:'entity',title:'sample@example.test',description:'sample@example.test',url:'https://example.test/?token=synthetic-secret'}]});const redacted=core.redactConversation(result);assert.ok(!JSON.stringify(redacted.conv).includes('sample@example.test'));assert.ok(!JSON.stringify(redacted.conv).includes('synthetic-secret'));const markdown=await core.markdown(result,'longest',{},async()=>{});assert.match(markdown,/ChatGPT/);assert.match(markdown,/Exported summary/);
});
test('P0/P1 regressions: TypeScript/HTML/LaTeX stay intact, ms/0 timestamps, content_types, multimodal parts, hidden system nodes, legacy citations, and defaultPath branch preservation',()=>{
  const dilCtx={URL,TextEncoder,structuredClone};
  const gptWithDil=vm.runInNewContext(source('gpt-dil')+'\n'+source('gpt-format')+';gptExportCore()',dilCtx);
  const plainText='Use Array<string> with <br> and <div>hello</div> and \\frac{a}{b} = {1+2} \ue200entity\ue202["org","OpenAI"]\ue201 after';
  const parsed=gptWithDil.parseText(plainText,{content_references:[{type:'entity',name:'OpenAI'}]});
  assert.ok(parsed.text.includes('Array<string>'));
  assert.ok(parsed.text.includes('\\frac{a}{b} = {1+2}'));
  assert.ok(parsed.text.includes('after'));

  const legacy=gptWithDil.parseText('Fact 【12:0†source】 and \ue200navlist\ue202{}\ue201',{citations:[{start_ix:5,end_ix:17,metadata:{title:'Legacy Doc',url:'https://example.test/legacy'}}],content_references:[{type:'navlist',items:[{title:'Nav Item',url:'https://example.test/nav'}]}]});
  assert.match(legacy.text,/Fact \[1\]/);assert.match(legacy.text,/Legacy Doc/);assert.match(legacy.text,/Nav Item/);

  const conv={
    id:'p1-rich',title:'Rich GPT',create_time:1700000000000,update_time:0,current_node:'leafB',
    mapping:{
      root:{parent:null,message:{id:'sys',author:{role:'system'},create_time:0,content:{content_type:'text',parts:['']},metadata:{is_visually_hidden_from_conversation:true}}},
      u1:{parent:'root',message:{id:'u1',author:{role:'user'},create_time:1700000001,content:{content_type:'multimodal_text',parts:[null,{content_type:'audio_transcription',text:'Spoken voice prompt'},{content_type:'image_asset_pointer',asset_pointer:'file-service://file-img1',metadata:{dalle:{prompt:'A sunny cat'}}}]},metadata:{}}},
      codeNode:{parent:'u1',message:{id:'c1',author:{role:'assistant'},recipient:'python',create_time:1700000002,content:{content_type:'code',language:'python',text:'print(1+1)'},metadata:{}}},
      execNode:{parent:'codeNode',message:{id:'e1',author:{role:'tool',name:'python'},create_time:1700000003,content:{content_type:'execution_output',text:'2'},metadata:{}}},
      browseNode:{parent:'execNode',message:{id:'b1',author:{role:'tool',name:'web'},create_time:1700000004,content:{content_type:'tether_browsing_display',result:'Search body',title:'Web Hit',url:'https://example.test/hit'},metadata:{}}},
      errNode:{parent:'browseNode',message:{id:'er1',author:{role:'assistant'},create_time:1700000005,content:{content_type:'system_error',name:'ToolError',text:'Timed out'},metadata:{}}},
      ctxNode:{parent:'errNode',message:{id:'cx1',author:{role:'system'},create_time:1700000006,content:{content_type:'user_editable_context',user_profile:'Dev profile',user_instructions:'Be concise'},metadata:{}}},
      a1:{parent:'ctxNode',message:{id:'a1',author:{role:'assistant'},create_time:1700000007,content:{content_type:'thoughts',thoughts:[{summary:'Plan',content:'Step 1'}]},metadata:{finished_duration_sec:12.5}}},
      leafA:{parent:'a1',message:{id:'la',author:{role:'assistant'},create_time:1700000008,content:{content_type:'text',parts:['Branch A']},metadata:{}}},
      leafA2:{parent:'leafA',message:{id:'la2',author:{role:'user'},create_time:1700000009,content:{content_type:'text',parts:['Followup A']},metadata:{}}},
      leafB:{parent:'a1',message:{id:'lb',author:{role:'assistant'},create_time:1700000010,content:{content_type:'text',parts:['Branch B']},metadata:{}}},
      altU:{parent:'root',message:{id:'altu',author:{role:'user'},create_time:1700000011,content:{content_type:'text',parts:['Alt root']},metadata:{}}}
    }
  };
  const converted=gptWithDil.convert(conv);
  assert.equal(converted.created_at,'2023-11-14T22:13:20.000Z');
  assert.equal(converted.updated_at,'');
  assert.ok(!converted.chat_messages.some(m=>m.originalNodeId==='root'));
  const u1=converted.chat_messages.find(m=>m.originalNodeId==='u1');
  assert.ok(u1.content.some(b=>b.type==='text'&&b.text==='Spoken voice prompt'));
  assert.ok(u1.content.some(b=>b.type==='image'&&b.file_uuid==='file-img1'));
  assert.equal(converted.chat_messages.find(m=>m.originalNodeId==='codeNode').content[0].type,'tool_use');
  assert.equal(converted.chat_messages.find(m=>m.originalNodeId==='execNode').content[0].type,'tool_result');
  assert.equal(converted.chat_messages.find(m=>m.originalNodeId==='browseNode').content[0].type,'tool_result');
  assert.match(converted.chat_messages.find(m=>m.originalNodeId==='errNode').content[0].text,/Timed out/);
  assert.equal(converted.chat_messages.find(m=>m.originalNodeId==='ctxNode').content[0].type,'injected_prompt_block');
  assert.equal(converted.chat_messages.find(m=>m.originalNodeId==='a1').content[0].duration_ms,12500);
  // P0-3: selecting an unrelated branch choice keeps leafB from defaultPath instead of jumping to longer leafA->leafA2
  const treeWithOtherChoice=core.tree(converted,'longest',{['gpt:p1-rich:nonexistent']:0});
  assert.equal(treeWithOtherChoice.messages.at(-1).originalNodeId,'leafB');
});
