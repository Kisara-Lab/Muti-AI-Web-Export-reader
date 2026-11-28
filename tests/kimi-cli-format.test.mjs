import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadKimiCli(){
  const context=vm.createContext({URL,TextEncoder});
  vm.runInContext(fs.readFileSync(new URL('../src/kimi-cli-format.js',import.meta.url),'utf8'),context);
  return context.kimiCliExportCore();
}

function loadWorkerCore(){
  const context=vm.createContext({URL,structuredClone});
  vm.runInContext(fs.readFileSync(new URL('../src/redaction-rules.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../src/worker-core.js',import.meta.url),'utf8'),context);
  return context.workerDomainCore();
}

function loadAnalysisCore(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/analysis-core.js',import.meta.url),'utf8'),context);
  return context.archiveAnalysisCore();
}

test('Kimi CLI md5Hex, kimi.json work_dirs lookup, and safe TOML config credential stripping',()=>{
  const kimi=loadKimiCli();
  assert.equal(kimi.md5Hex('c:\\VSC'),'4b63f380bcd892b1bb7c5c9d0eae5c5e');
  assert.equal(kimi.md5Hex('/workspace/kimi-demo').length,32);

  const workDirMap=kimi.indexWorkDirs(JSON.stringify({
    work_dirs:[{path:'/workspace/kimi-demo',kaos:'local',last_session_id:'sess-1'}]
  }));
  const expectedHash=kimi.md5Hex('/workspace/kimi-demo');
  assert.equal(workDirMap.byHash.get(expectedHash)?.path,'/workspace/kimi-demo');

  const cfg=kimi.parseKimiTomlSafe([
    'default_model = "kimi-k2-thinking"',
    'default_thinking = true',
    'default_yolo = false',
    'theme = "dark"',
    'api_key = "sk-kimi-topsecret-do-not-leak"',
    '[providers.moonshot]',
    'base_url = "https://api.example.test/v1"',
    'api_key = "sk-kimi-provider-secret"',
    'token = "tok-secret"'
  ].join('\n'));

  assert.equal(cfg.default_model,'kimi-k2-thinking');
  assert.equal(cfg.default_thinking,true);
  assert.equal(cfg.default_yolo,false);
  assert.equal(cfg.theme,'dark');
  assert.equal(JSON.stringify(cfg).includes('topsecret'),false);
  assert.equal(JSON.stringify(cfg).includes('provider-secret'),false);
  assert.equal(JSON.stringify(cfg).includes('tok-secret'),false);
});

test('Kimi CLI Python Wire 1.10 parses Plan, Approval, Todo, Diff, Shell, Question, /btw, Retry, Hook & Behavior Lab',async()=>{
  const kimi=loadKimiCli();
  const core=loadWorkerCore();
  const analysis=loadAnalysisCore();

  const wireLines=[
    {type:'metadata',protocol_version:'1.10'},
    {timestamp:1760000001,message:{type:'TurnBegin',payload:{user_input:'Switch to Plan Mode and add healthz endpoint in server.js'}}},
    {timestamp:1760000002,message:{type:'StepBegin',payload:{n:1}}},
    {timestamp:1760000003,message:{type:'CompactionBegin',payload:{reason:'auto_compact'}}},
    {timestamp:1760000004,message:{type:'CompactionEnd',payload:{}}},
    {timestamp:1760000005,message:{type:'ContentPart',payload:{type:'think',think:'Planning routes and todo checklist carefully.'}}},
    {timestamp:1760000006,message:{type:'ToolCall',payload:{id:'tc-plan',function:{name:'WriteFile',arguments:JSON.stringify({path:'/workspace/kimi-demo/.kimi/plans/fuzzy-plan.md',content:'# Plan\nAdd /healthz route'})}}}},
    {timestamp:1760000007,message:{type:'PlanDisplay',payload:{file_path:'/workspace/kimi-demo/.kimi/plans/fuzzy-plan.md',content:'# Healthz Plan\n- Add GET /healthz\n- Verify tests'}}},
    {timestamp:1760000008,message:{type:'ToolCall',payload:{id:'tc-todo',function:{name:'SetTodoList',arguments:JSON.stringify({todos:[{title:'Edit server.js',status:'done'},{title:'Run npm test',status:'in_progress'}]})}}}},
    {timestamp:1760000009,message:{type:'ToolResult',payload:{tool_call_id:'tc-todo',return_value:{is_error:false,output:'Todo updated',display:[{type:'todo',items:[{title:'Edit server.js',status:'done'},{title:'Run npm test',status:'in_progress'}]}]}}}},
    {timestamp:1760000010,message:{type:'ToolCall',payload:{id:'tc-edit',function:{name:'StrReplaceFile',arguments:JSON.stringify({path:'/workspace/kimi-demo/server.js',edits:[{old:'PORT=3000',new:'PORT=8080'}]})}}}},
    {timestamp:1760000011,message:{type:'ApprovalRequest',payload:{id:'ap-1',tool_call_id:'tc-edit',sender:'StrReplaceFile',action:'edit file',description:'Allow editing server.js?'}}},
    {timestamp:1760000012,message:{type:'ApprovalResponse',payload:{request_id:'ap-1',response:'approve_for_session'}}},
    {timestamp:1760000013,message:{type:'ToolResult',payload:{tool_call_id:'tc-edit',return_value:{is_error:false,output:'Replaced 1 occurrence',display:[{type:'diff',path:'/workspace/kimi-demo/server.js',old_text:'const PORT = 3000;',new_text:'const PORT = 8080;'}]}}},},
    {timestamp:1760000014,message:{type:'ToolCall',payload:{id:'tc-ask',function:{name:'AskUserQuestion',arguments:JSON.stringify({questions:[{header:'Deploy',question:'Restart service now?',options:[{label:'Yes',description:'Restart worker'},{label:'Later',description:'Manual restart'}]}]})}}}},
    {timestamp:1760000015,message:{type:'QuestionRequest',payload:{id:'q-1',tool_call_id:'tc-ask',questions:[{header:'Deploy',question:'Restart service now?'}],answers:{'Restart service now?':'Yes'}}}},
    {timestamp:1760000016,message:{type:'ToolResult',payload:{tool_call_id:'tc-ask',return_value:{is_error:false,output:'Restart service now?: Yes'}}}},
    {timestamp:1760000017,message:{type:'ToolCall',payload:{id:'tc-sh',function:{name:'Shell',arguments:JSON.stringify({command:'npm test'})}}}},
    {timestamp:1760000018,message:{type:'ToolResult',payload:{tool_call_id:'tc-sh',return_value:{is_error:false,output:'All tests passed',display:[{type:'shell',command:'npm test',language:'bash'},{type:'brief',text:'10 tests passed'}]}}}},
    {timestamp:1760000019,message:{type:'StepRetry',payload:{attempt:2,reason:'429 rate limit'}}},
    {timestamp:1760000020,message:{type:'HookTriggered',payload:{hook_name:'pre-shell',target:'Shell'}}},
    {timestamp:1760000021,message:{type:'HookResolved',payload:{hook_name:'pre-shell',action:'allow'}}},
    {timestamp:1760000022,message:{type:'BtwBegin',payload:{id:'btw-1',question:'Does it break CI?'}}},
    {timestamp:1760000023,message:{type:'BtwEnd',payload:{id:'btw-1',response:'No, CI passes cleanly.'}}},
    {timestamp:1760000024,message:{type:'SteerInput',payload:{user_input:'Keep patch minimal'}}},
    {timestamp:1760000025,message:{type:'ContentPart',payload:{type:'text',text:'Implemented the `/healthz` route and verified all checks.'}}},
    {timestamp:1760000026,message:{type:'StatusUpdate',payload:{context_usage:0.42,context_tokens:53760,max_context_tokens:128000,plan_mode:true,yolo_mode:false,thinking_enabled:true,token_usage:{input_other:1200,output:350,input_cache_read:2400,input_cache_creation:400}}}},
    {timestamp:1760000027,message:{type:'TurnEnd',payload:{}}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const ctxLines=[
    {role:'_system_prompt',content:'You are Kimi Code CLI.'},
    {role:'user',content:'Switch to Plan Mode and add healthz endpoint in server.js'},
    {role:'assistant',content:[{type:'text',text:'Implemented the `/healthz` route and verified all checks.'}]}
  ].map(o=>JSON.stringify(o)).join('\n');

  assert.equal(kimi.isKimiWireJsonlText(wireLines),true);
  assert.equal(kimi.isKimiContextJsonlText(ctxLines),true);

  const hash=kimi.md5Hex('/workspace/kimi-demo');
  const parsed=await kimi.parseSessionAsync({
    contextText:ctxLines,
    wireText:wireLines,
    stateObj:{plan_mode:true,approval:{yolo:false},thinking:true},
    planDoc:'# Healthz Plan\n- Add GET /healthz\n- Verify tests'
  },{
    workDirHash:hash,
    workDir:'/workspace/kimi-demo',
    sessionId:'kimi-sess-1',
    configSafe:{default_model:'kimi-k2-thinking',theme:'dark'}
  });

  const c=parsed.conversation;
  assert.equal(c.sourcePlatform,'kimi_cli');
  assert.equal(c.defaultModel,'kimi-k2-thinking');
  assert.equal(c.kimiCliMeta.cwd,'/workspace/kimi-demo');
  assert.equal(c.kimiCliMeta.planMode,true);
  assert.equal(c.kimiCliMeta.wireVersion,'1.10');
  assert.equal(c.kimiCliMeta.usage.total_tokens,4350);
  assert.equal(c.kimiCliTelemetry.approvalCounts.approve_for_session,1);
  assert.equal(c.kimiCliTelemetry.hookCounts.allow,1);
  assert.equal(c.kimiCliTelemetry.compactionCount,1);
  assert.equal(c.kimiCliTelemetry.stepRetryCount,1);
  assert.equal(c.kimiCliTelemetry.btwCount,1);
  assert.equal(c.kimiCliTelemetry.steerCount,1);

  const allBlocks=c.chat_messages.flatMap(m=>m.content||[]);
  assert.ok(allBlocks.some(b=>b.kimiPlan?.content?.includes('/healthz')));
  const editBlock=allBlocks.find(b=>b.type==='tool_use'&&b.name==='StrReplaceFile');
  assert.equal(editBlock.kimiApproval.response,'approve_for_session');
  const editResult=allBlocks.find(b=>b.type==='tool_result'&&b.tool_use_id==='tc-edit');
  assert.ok(editResult.kimiDisplay.some(d=>d.type==='diff'&&d.patch.includes('+const PORT = 8080;')));

  // Workspace project link
  const records=[{meta:{uuid:c.uuid,name:c.name,created_at:c.created_at,updated_at:c.updated_at,workspaceId:c.workspaceId},raw:JSON.stringify(c)}];
  const projIdx=await analysis.calculateProjectIndex(records,r=>JSON.parse(r.raw),[parsed.project],null,async()=>{});
  assert.equal(projIdx.map[c.uuid],parsed.project.uuid);

  // Behavior Lab + Safe Redaction
  const beh=await core.behavior(records,async()=>{});
  assert.equal(beh.kimiCli.sessions,1);
  assert.equal(beh.kimiCli.planSessions,1);
  assert.equal(beh.kimiCli.tokens.total,4350);
  const redacted=core.redactConversation(c,'mask',false,{customTerms:['/workspace/kimi-demo']});
  assert.equal(JSON.stringify(redacted.conv).includes('/workspace/kimi-demo'),false);
});

test('Kimi CLI handles _system_prompt-only diagnostic stub session + kimi.log error correlation & Node ~/.kimi-code events',async()=>{
  const kimi=loadKimiCli();

  const stubUuid='stub-sess-99999999';
  const stubCtx=JSON.stringify({role:'_system_prompt',content:'Frozen prompt from Kimi CLI initialization.'});
  const hash=kimi.md5Hex('c:\\Projects\\demo');
  const logInfo=kimi.parseKimiLog([
    `2026-07-04 12:00:00.123 | INFO     | kimi_cli.cli:_run:583 |  - Created new session: ${stubUuid}`,
    '2026-07-04 12:00:00.234 | INFO     | kimi_cli.soul.toolset:load_tools:492 |  - Loaded tools: [\'kimi_cli.tools.shell:Shell\', \'kimi_cli.tools.file:ReadFile\', \'kimi_cli.tools.file:WriteFile\']',
    '2026-07-04 12:00:00.456 | WARNING  | kimi_cli.llm:create_llm:120 |  - Cannot create LLM: missing base_url or model'
  ].join('\n'));

  const stubParsed=await kimi.parseSessionAsync({
    contextText:stubCtx,
    rotatedContexts:['rot1','rot2']
  },{
    workDirHash:hash,
    workDir:'c:\\Projects\\demo',
    sessionId:stubUuid,
    logInfo:logInfo.sessions.get(stubUuid)
  });

  const stubConv=stubParsed.conversation;
  assert.equal(stubConv.sourcePlatform,'kimi_cli');
  assert.equal(stubConv.kimiCliMeta.isStub,true);
  assert.equal(stubConv.kimiCliMeta.rotatedBackupCount,2);
  assert.ok(stubConv.importWarnings.some(w=>w.startsWith('kimi_stub_session:')));
  assert.ok(stubConv.chat_messages.some(m=>m.content?.some(b=>b.injection_source==='kimi:system_prompt')));
  assert.ok(stubConv.chat_messages.some(m=>m.content?.some(b=>String(b.text||'').includes('Cannot create LLM'))));

  // Node ~/.kimi-code/ wire generation with session-scoped duplicate usage & blobref
  const nodeWire=[
    {type:'turn.prompt',ts:'2026-07-05T08:00:00Z',prompt:'Inspect failing test'},
    {type:'llm.request',ts:'2026-07-05T08:00:01Z',model:'kimi-k2.5'},
    {type:'item.ended',ts:'2026-07-05T08:00:02Z',item:{type:'thinking',text:'Checking traceback'}},
    {type:'item.ended',ts:'2026-07-05T08:00:04Z',item:{type:'text',text:'Fixed assertion in test suite.'}},
    {type:'usage.record',ts:'2026-07-05T08:00:05Z',scope:'turn',usage:{input_other:500,output:120,input_cache_read:200,input_cache_creation:0}},
    {type:'usage.record',ts:'2026-07-05T08:00:06Z',scope:'session',usage:{input_other:99999,output:99999}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const nodeParsed=await kimi.parseSessionAsync({wireText:nodeWire},{
    sessionId:'node-kimi-1',
    workDir:'/workspace/node-demo'
  });
  const nc=nodeParsed.conversation;
  assert.equal(nc.defaultModel,'kimi-k2.5');
  assert.equal(nc.kimiCliMeta.usage.total_tokens,820);
  assert.ok(nc.chat_messages.some(m=>m.sender==='human'&&m.content?.some(b=>b.text==='Inspect failing test')));
  assert.ok(nc.chat_messages.some(m=>m.sender==='assistant'&&m.content?.some(b=>String(b.text||'').includes('Fixed assertion'))));
});
