import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadCodex(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/codex-format.js',import.meta.url),'utf8'),context);
  return context.codexExportCore();
}

function loadWorkerCore(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/redaction-rules.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../src/worker-core.js',import.meta.url),'utf8'),context);
  return context.workerDomainCore();
}

test('codex format distinguishes rollout JSONL from prompt-only history.jsonl and tolerates BOM + truncated tail',()=>{
  const codex=loadCodex();
  const historyJsonl=[
    JSON.stringify({session_id:'sess-h1',ts:1760000000,text:'fix bug'}),
    JSON.stringify({session_id:'sess-h2',ts:1760000100,text:'run tests'})
  ].join('\n');
  assert.equal(codex.inspectJsonlText(historyJsonl).kind,'history');
  assert.equal(codex.isRolloutText(historyJsonl),false);

  const rolloutJsonl='\uFEFF\n'+[
    JSON.stringify({timestamp:'2026-04-01T10:00:00Z',type:'session_meta',payload:{id:'sess-001',cwd:'/workspace/demo',cli_version:'0.101.0'}}),
    '{"timestamp":"2026-04-01T10:00:05Z","type":"response_item","payload":{"truncated'
  ].join('\n');
  assert.equal(codex.inspectJsonlText(rolloutJsonl).kind,'rollout');
  assert.equal(codex.isRolloutText(rolloutJsonl),true);

  const parsed=codex.parseRolloutText(rolloutJsonl,{path:'sessions/2026/04/01/rollout-2026-04-01-sess-001.jsonl'});
  assert.ok(parsed);
  assert.equal(parsed.conversation.uuid,'codex:sess-001');
  assert.ok(parsed.warnings.includes('skipped_malformed_jsonl_lines:1'));
});

test('codex format converts multi-turn rollout, deduplicates mirror events & incremental reasoning, pairs tools, and exports safely',async()=>{
  const codex=loadCodex();
  const core=loadWorkerCore();

  const lines=[
    {timestamp:'2026-04-01T10:00:00Z',type:'session_meta',payload:{id:'sess-alpha-1',cwd:'/home/dev/project-alpha',cli_version:'0.104.0',model_provider:'openai',git:{branch:'feat/auth'}}},
    {timestamp:'2026-04-01T10:00:01Z',type:'turn_context',payload:{cwd:'/home/dev/project-alpha',model:'gpt-5.4'}},
    {timestamp:'2026-04-01T10:00:02Z',type:'response_item',payload:{type:'message',role:'developer',content:[{type:'input_text',text:'<permissions instructions>Filesystem sandbox active</permissions instructions>'}]}},
    {timestamp:'2026-04-01T10:00:03Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Patch app.js and run tests for user@example.test'}]}},
    // Duplicate mirror event should be ignored
    {timestamp:'2026-04-01T10:00:03Z',type:'event_msg',payload:{type:'user_message',message:'Patch app.js and run tests for user@example.test'}},
    // Incremental reasoning summaries + encrypted block
    {timestamp:'2026-04-01T10:00:04Z',type:'response_item',payload:{type:'reasoning',summary:[{type:'summary_text',text:'Inspecting project layout'}]}},
    {timestamp:'2026-04-01T10:00:05Z',type:'response_item',payload:{type:'reasoning',summary:[{type:'summary_text',text:'Inspecting project layout\nPlanning patch on app.js'}]}},
    {timestamp:'2026-04-01T10:00:05Z',type:'response_item',payload:{type:'reasoning',encrypted_content:'gAAAAA_opaque_cipher'}},
    // Custom apply_patch tool + output
    {timestamp:'2026-04-01T10:00:06Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'call-patch-1',name:'apply_patch',input:'*** Begin Patch\n*** Update File: app.js\n@@\n-old()\n+new()\n*** End Patch'}},
    {timestamp:'2026-04-01T10:00:07Z',type:'response_item',payload:{type:'custom_tool_call_output',call_id:'call-patch-1',output:'Success. Updated 1 file.'}},
    // Function call failing command
    {timestamp:'2026-04-01T10:00:08Z',type:'response_item',payload:{type:'function_call',call_id:'call-cmd-1',name:'exec_command',arguments:JSON.stringify({cmd:'npm test',workdir:'/home/dev/project-alpha'})}},
    {timestamp:'2026-04-01T10:00:09Z',type:'response_item',payload:{type:'function_call_output',call_id:'call-cmd-1',output:'Process exited with code 1\nAssertion failed'}},
    // Web search call
    {timestamp:'2026-04-01T10:00:10Z',type:'response_item',payload:{type:'web_search_call',call_id:'call-ws-1',action:{query:'codex jsonl format',sources:[{title:'Codex Spec',url:'https://example.test/codex'}]} }},
    // Final assistant text + mirror agent_message
    {timestamp:'2026-04-01T10:00:11Z',type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:'Applied patch to `app.js`; test failed at Assertion failed.'}]}},
    {timestamp:'2026-04-01T10:00:11Z',type:'event_msg',payload:{type:'agent_message',message:'Applied patch to `app.js`; test failed at Assertion failed.'}},
    {timestamp:'2026-04-01T10:00:12Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:1200,output_tokens:340,total_tokens:1540}}}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const res=codex.parseRolloutText(lines,{path:'rollout-2026-04-01-sess-alpha-1.jsonl'});
  assert.ok(res);
  const {conversation:conv,project}=res;

  assert.equal(conv.uuid,'codex:sess-alpha-1');
  assert.equal(conv.sourcePlatform,'codex');
  assert.equal(conv.defaultModel,'gpt-5.4');
  assert.equal(conv.codexMeta.cwd,'/home/dev/project-alpha');
  assert.equal(conv.codexMeta.cliVersion,'0.104.0');
  assert.equal(conv.codexMeta.gitBranch,'feat/auth');
  assert.equal(conv.codexMeta.usage.total_tokens,1540);
  assert.ok(project);
  assert.equal(project.uuid,'codex:cwd:'+conv.workspaceId);
  assert.equal(project.sourcePlatform,'codex');
  assert.equal(project.name,'project-alpha (Codex)');

  assert.equal(conv.chat_messages.length,2);
  const [human,assistant]=conv.chat_messages;
  assert.equal(human.sender,'human');
  assert.equal(human.content[0].text,'Patch app.js and run tests for user@example.test');
  assert.equal(assistant.sender,'assistant');

  const blocks=assistant.content;
  assert.equal(blocks[0].type,'injected_prompt_block');
  assert.equal(blocks[0].injection_source,'codex:developer');

  const thinking=blocks.filter(b=>b.type==='thinking');
  assert.equal(thinking.length,3);
  assert.equal(thinking[0].thinking,'Inspecting project layout');
  assert.equal(thinking[1].thinking,'Planning patch on app.js');
  assert.equal(thinking[2].thinking_hidden,true);

  const patchCall=blocks.find(b=>b.type==='tool_use'&&b.name==='apply_patch');
  assert.ok(patchCall?.input?.patch.includes('*** Update File: app.js'));
  const cmdOut=blocks.find(b=>b.type==='tool_result'&&b.tool_use_id==='call-cmd-1');
  assert.equal(cmdOut.is_error,true);
  const wsRes=blocks.find(b=>b.type==='web_search_tool_result');
  assert.equal(wsRes.content[0].url,'https://example.test/codex');
  const finalTexts=blocks.filter(b=>b.type==='text');
  assert.equal(finalTexts.length,1);

  const mdText=await core.markdown(conv,'longest',{},async()=>{});
  assert.ok(mdText.includes('**Codex**'));
  assert.ok(mdText.includes('Applied patch to'));
});

test('codex format caps oversized tool output and image budget per session',()=>{
  const codex=loadCodex();
  const hugeOutput='X'.repeat(300*1024);
  const hugeImg='data:image/png;base64,'+'A'.repeat(36*1024*1024); // ~27MB decoded
  const jsonl=[
    {timestamp:'2026-04-01T10:00:00Z',type:'session_meta',payload:{id:'sess-bounds',cwd:'/tmp/repo'}},
    {timestamp:'2026-04-01T10:00:01Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Check bounds'},{type:'input_image',image_url:hugeImg}]}},
    {timestamp:'2026-04-01T10:00:02Z',type:'response_item',payload:{type:'function_call',call_id:'c1',name:'exec_command',arguments:'{"cmd":"cat big"}'}},
    {timestamp:'2026-04-01T10:00:03Z',type:'response_item',payload:{type:'function_call_output',call_id:'c1',output:hugeOutput}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const res=codex.parseRolloutText(jsonl);
  assert.ok(res.warnings.includes('oversized_tool_output'));
  assert.ok(res.warnings.includes('image_budget_exceeded'));
  const toolOut=res.conversation.chat_messages[1].content.find(b=>b.type==='tool_result');
  assert.ok(toolOut.content[0].text.length<265000);
  assert.ok(toolOut.content[0].text.includes('truncated:'));
});

test('codex format handles modern PascalCase item_completed, runtime context wrappers, agent_message, proposed_plan, and exec chunks without duplication',()=>{
  const codex=loadCodex();
  const jsonl=[
    {timestamp:'2026-10-02T14:00:00Z',type:'session_meta',payload:{id:'subagent-01',cwd:'C:\\Work\\demo',cli_version:'0.155.0-alpha',originator:'codex_vscode',agent_path:'/root/ui_worker',agent_nickname:'ui_worker',parent_thread_id:'parent-01',model_provider:'custom'}},
    {timestamp:'2026-10-02T14:00:01Z',type:'session_meta',payload:{id:'parent-01',cwd:'C:\\Other'}},
    {timestamp:'2026-10-02T14:00:02Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'<environment_context>\n <cwd>C:\\Work\\demo</cwd>\n</environment_context>'}]}},
    {timestamp:'2026-10-02T14:00:03Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Build the collaboration card UI'}]}},
    {timestamp:'2026-10-02T14:00:04Z',type:'event_msg',payload:{type:'item_completed',item:{type:'UserMessage',content:[{type:'text',text:'Build the collaboration card UI'}]}}},
    {timestamp:'2026-10-02T14:00:05Z',type:'response_item',payload:{type:'agent_message',author:'/root',recipient:'/root/ui_worker',content:[{type:'input_text',text:'Message Type: NEW_TASK\nPayload: Build card'}]}},
    {timestamp:'2026-10-02T14:00:06Z',type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',command:'dir',status:'completed'}}},
    {timestamp:'2026-10-02T14:00:07Z',type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{'a.js':{type:'add',content:'x'}}}}},
    {timestamp:'2026-10-02T14:00:08Z',type:'event_msg',payload:{type:'item_completed',item:{type:'SubAgentActivity',kind:'started'}}},
    {timestamp:'2026-10-02T14:00:09Z',type:'event_msg',payload:{type:'item_completed',item:{type:'Plan',text:'# Card Plan\n- Step 1'}}},
    {timestamp:'2026-10-02T14:00:10Z',type:'event_msg',payload:{type:'item_completed',item:{type:'ImageView',path:'file:///C:/Work/demo/preview.png'}}},
    {timestamp:'2026-10-02T14:00:11Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'call-ex-1',name:'exec',input:'text(await tools.exec_command({cmd:"ls -la"}));'}},
    {timestamp:'2026-10-02T14:00:12Z',type:'response_item',payload:{type:'custom_tool_call_output',call_id:'call-ex-1',output:[{type:'input_text',text:'Script completed\nOutput:'},{type:'input_text',text:JSON.stringify({chunk_id:'abc',exit_code:2,output:'file1.js\nmissing target'})}]}},
    {timestamp:'2026-10-02T14:00:13Z',type:'event_msg',payload:{type:'item_completed',item:{type:'AgentMessage',content:[{type:'Text',text:'<proposed_plan>\n# Steps\n1. Ship it\n</proposed_plan>'}]}}},
    {timestamp:'2026-10-02T14:00:14Z',type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:'<proposed_plan>\n# Steps\n1. Ship it\n</proposed_plan>'}]}},
    {timestamp:'2026-10-02T14:00:15Z',type:'token_usage_record',payload:{total_token_usage:{total_tokens:4321}}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const {conversation:conv,project}=codex.parseRolloutText(jsonl);
  assert.equal(conv.uuid,'codex:subagent-01');
  assert.equal(conv.name,'[ui_worker] Build the collaboration card UI');
  assert.equal(conv.codexMeta.cwd,'C:/Work/demo');
  assert.equal(conv.codexMeta.agentPath,'/root/ui_worker');
  assert.equal(conv.codexMeta.originator,'codex_vscode');
  assert.equal(conv.codexMeta.usage.total_tokens,4321);
  assert.equal(project.name,'demo (Codex)');

  // Runtime <environment_context> does NOT create a fake leading human bubble
  assert.equal(conv.chat_messages.length,2);
  assert.equal(conv.chat_messages[0].sender,'human');
  assert.equal(conv.chat_messages[0].content[0].text,'Build the collaboration card UI');

  const ablocks=conv.chat_messages[1].content;
  // UserMessage item_completed was NOT duplicated into assistant
  assert.equal(ablocks.some(b=>b.type==='text'&&b.text.includes('Build the collaboration card UI')),false);
  // agent_message captured cleanly as injected_prompt_block
  assert.ok(ablocks.some(b=>b.type==='injected_prompt_block'&&b.injection_source.includes('/root → /root/ui_worker')));
  // ImageView -> local_resource
  assert.ok(ablocks.some(b=>b.type==='local_resource'&&b.name==='preview.png'));
  // Plan + proposed_plan converted cleanly AND not duplicated across item_completed + response_item
  const textBlocks=ablocks.filter(b=>b.type==='text');
  assert.equal(textBlocks.length,2);
  assert.ok(textBlocks[0].text.includes('> [!NOTE]\n> **Codex Plan**'));
  assert.ok(textBlocks[1].text.includes('> [!NOTE]\n> **Proposed Plan**'));
  // exec JSON chunk unwrapped and non-zero exit_code detected as error
  const execRes=ablocks.find(b=>b.type==='tool_result'&&b.tool_use_id==='call-ex-1');
  assert.equal(execRes.is_error,true);
  assert.ok(execRes.content[0].text.includes('file1.js\nmissing target'));
  assert.equal(execRes.content[0].text.includes('"chunk_id"'),false);
});

