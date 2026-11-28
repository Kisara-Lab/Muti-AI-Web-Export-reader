import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadCodex(){
  const context=vm.createContext({URL,TextEncoder});
  vm.runInContext(fs.readFileSync(new URL('../src/codex-format.js',import.meta.url),'utf8'),context);
  return context.codexExportCore();
}

function loadKimi(){
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

test('Codex rollout parser extracts codexTelemetry and worker-core aggregates out.codex',async()=>{
  const codex=loadCodex();
  const lines=[
    {timestamp:'2026-08-01T10:00:00Z',type:'session_meta',payload:{id:'codex-main-1',cwd:'/workspace/unified-repo',cli_version:'0.29.0',model:'gpt-5.3-codex',originator:'codex_cli_rs'}},
    {timestamp:'2026-08-01T10:00:01Z',type:'turn_context',payload:{model:'gpt-5.3-codex',sandbox_mode:'workspace-write',approval_policy:'on-request'}},
    {timestamp:'2026-08-01T10:00:02Z',type:'event_msg',payload:{type:'user_message',message:'Refactor parser and spawn worker'}},
    {timestamp:'2026-08-01T10:00:03Z',type:'response_item',payload:{type:'reasoning',summary:[{type:'summary_text',text:'Checking modules'}]}},
    {timestamp:'2026-08-01T10:00:04Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'c1',name:'apply_patch',input:'*** Begin Patch\n*** End Patch'}},
    {timestamp:'2026-08-01T10:00:05Z',type:'response_item',payload:{type:'custom_tool_call_output',call_id:'c1',output:'Patched 1 file'}},
    {timestamp:'2026-08-01T10:00:06Z',type:'response_item',payload:{type:'function_call',call_id:'c2',name:'exec_command',arguments:'{"cmd":"npm test"}'}},
    {timestamp:'2026-08-01T10:00:07Z',type:'response_item',payload:{type:'function_call_output',call_id:'c2',output:'Process exited with code 1\nFAIL test'}},
    {timestamp:'2026-08-01T10:00:08Z',type:'response_item',payload:{type:'function_call',call_id:'c3',name:'spawn_agent',arguments:'{"message":"Audit docs"}'}},
    {timestamp:'2026-08-01T10:00:09Z',type:'response_item',payload:{type:'function_call_output',call_id:'c3',output:'{"agent_id":"codex-sub-1","nickname":"auditor"}'}},
    {timestamp:'2026-08-01T10:00:10Z',type:'event_msg',payload:{type:'item_completed',item:{type:'Plan',text:'Step 1: Verify workspace merge'}}},
    {timestamp:'2026-08-01T10:00:11Z',type:'compacted',payload:{message:'Compacted early context'}},
    {timestamp:'2026-08-01T10:00:12Z',type:'event_msg',payload:{type:'turn_aborted',reason:'user_interrupt'}},
    {timestamp:'2026-08-01T10:00:13Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:2000,cached_input_tokens:1200,output_tokens:450,reasoning_output_tokens:180,total_tokens:2450}}}}
  ].map(x=>JSON.stringify(x)).join('\n');

  const parsed=codex.parseRolloutText(lines,{fileName:'rollout-main.jsonl'});
  const tel=parsed.conversation.codexTelemetry;
  assert.ok(tel);
  assert.deepEqual(Array.from(tel.models),['gpt-5.3-codex']);
  assert.equal(tel.sandboxModes['workspace-write'],1);
  assert.equal(tel.approvalPolicies['on-request'],1);
  assert.equal(tel.reasoningCount,1);
  assert.equal(tel.planCount,1);
  assert.equal(tel.applyPatchCount,1);
  assert.equal(tel.execCount,1);
  assert.equal(tel.subagentSpawns,1);
  assert.equal(tel.compactedWindows,1);
  assert.equal(tel.abortedTurns,1);
  assert.equal(tel.toolErrorCount,1);
  assert.equal(tel.tokens.total,2450);
  assert.equal(tel.tokens.cachedInput,1200);
  assert.ok(tel.events.length>=3);

  const worker=loadWorkerCore();
  const behavior=await worker.behavior([{raw:JSON.stringify(parsed.conversation)}],async()=>{});
  assert.ok(behavior.codex);
  assert.equal(behavior.codex.sessions,1);
  assert.equal(behavior.codex.reasoningCount,1);
  assert.equal(behavior.codex.planCount,1);
  assert.equal(behavior.codex.applyPatchCount,1);
  assert.equal(behavior.codex.execCount,1);
  assert.equal(behavior.codex.toolErrorCount,1);
  assert.equal(behavior.codex.abortedTurns,1);
  assert.equal(behavior.codex.tokens.total,2450);
});

test('Kimi CLI subagent metadata includes parentThreadId and analysis-core prioritizes unified ws:cwd projects',async()=>{
  const kimi=loadKimi();
  const subCtx=[
    JSON.stringify({role:'user',content:'Run subagent task'}),
    JSON.stringify({role:'assistant',content:[{type:'text',text:'Subagent done'}]})
  ].join('\n');
  const res=kimi.parseSessionText({contextText:subCtx},{
    sessionId:'kimi-main-1',
    agentId:'agent-42',
    workDir:'/workspace/unified-repo'
  });
  assert.equal(res.conversation.kimiCliMeta.isSubagent,true);
  assert.equal(res.conversation.kimiCliMeta.parentThreadId,'kimi-main-1');

  const analysis=loadAnalysisCore();
  const wsId=res.conversation.workspaceId;
  const projects=[
    {uuid:'ws:cwd:'+wsId,name:'unified-repo (Multi-CLI Workspace)',docs:[]}
  ];
  const records=[
    {meta:{uuid:'codex:1',workspaceId:wsId,name:'Codex task'},conversation:{uuid:'codex:1',workspaceId:wsId,chat_messages:[]}},
    {meta:{uuid:'kimi:1',workspaceId:wsId,name:'Kimi task'},conversation:{uuid:'kimi:1',workspaceId:wsId,chat_messages:[]}}
  ];
  const indexed=await analysis.calculateProjectIndex(records,r=>r.conversation,projects,null,async()=>{});
  assert.equal(indexed.map['codex:1'],'ws:cwd:'+wsId);
  assert.equal(indexed.map['kimi:1'],'ws:cwd:'+wsId);
  assert.equal(indexed.evidence['codex:1'].method,'workspace');
});
