import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadClaudeCode(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/claude-code-format.js',import.meta.url),'utf8'),context);
  return context.claudeCodeExportCore();
}

function loadWorkerCore(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/redaction-rules.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../src/worker-core.js',import.meta.url),'utf8'),context);
  return context.workerDomainCore();
}

test('claude code format skips prompt history.jsonl, tolerates BOM/truncated tail, and skips telemetry noise',()=>{
  const cc=loadClaudeCode();
  const historyJsonl=[
    JSON.stringify({display:'fix tests',pastedContents:{},timestamp:1760000000000,project:'/work/app',sessionId:'h1'}),
    JSON.stringify({display:'review pr',pastedContents:{},timestamp:1760000010000,project:'/work/app',sessionId:'h2'})
  ].join('\n');
  assert.equal(cc.inspectJsonlText(historyJsonl).kind,'history');
  assert.equal(cc.isClaudeCodeText(historyJsonl),false);

  const sessionJsonl='\uFEFF\n'+[
    JSON.stringify({type:'api-request-blob',sessionId:'cc-s1',hash:'abc',shape:{}}),
    JSON.stringify({type:'file-history-snapshot',sessionId:'cc-s1',snapshot:{}}),
    JSON.stringify({type:'user',sessionId:'cc-s1',uuid:'u1',parentUuid:null,cwd:'/work/app',gitBranch:'main',version:'2.1.330',timestamp:'2026-06-01T10:00:00Z',message:{role:'user',content:'Hello Claude Code'}}),
    '{"type":"assistant","sessionId":"cc-s1","truncated'
  ].join('\n');
  assert.equal(cc.inspectJsonlText(sessionJsonl).kind,'claude_code');
  const parsed=cc.parseTranscriptText(sessionJsonl,{path:'-work-app/cc-s1.jsonl'});
  assert.equal(parsed.conversation.uuid,'cc:cc-s1');
  assert.equal(parsed.conversation.sourcePlatform,'claude_code');
  assert.equal(parsed.conversation.chat_messages.length,1);
  assert.ok(parsed.warnings.includes('skipped_malformed_jsonl_lines:1'));
});

test('claude code format aggregates assistant message fragments, Edit diffs, string tool denials, omitted thinking duration, queued prompts, Plan, and costs',async()=>{
  const cc=loadClaudeCode();
  const core=loadWorkerCore();
  const lines=[
    {type:'mode',mode:'plan',sessionId:'cc-s2',timestamp:'2026-06-01T11:00:00Z'},
    {type:'user',sessionId:'cc-s2',uuid:'u-caveat',parentUuid:null,isMeta:true,timestamp:'2026-06-01T11:00:01Z',message:{role:'user',content:'<local-command-caveat>Command caveat notice</local-command-caveat>'}},
    {type:'user',sessionId:'cc-s2',uuid:'u-1',parentUuid:'u-caveat',cwd:'/workspace/my-repo',gitBranch:'feat/cc',version:'2.1.320',entrypoint:'claude-vscode',timestamp:'2026-06-01T11:00:02Z',message:{role:'user',content:[{type:'text',text:'<ide_opened_file>The user opened src/app.js</ide_opened_file>\nRefactor src/app.js and contact ops@example.test'}]}},
    {type:'assistant',sessionId:'cc-s2',uuid:'a-1',parentUuid:'u-1',thinkingDurationMs:142,timestamp:'2026-06-01T11:00:03Z',message:{id:'msg_01',model:'claude-opus-5-5',stop_reason:null,usage:{input_tokens:500,output_tokens:12},content:[{type:'thinking',thinking:'',signature:'sig123'}]}},
    {type:'assistant',sessionId:'cc-s2',uuid:'a-2',parentUuid:'a-1',timestamp:'2026-06-01T11:00:04Z',message:{id:'msg_01',model:'claude-opus-5-5',stop_reason:'tool_use',usage:{input_tokens:500,output_tokens:45},content:[{type:'tool_use',id:'tu-edit',name:'Edit',input:{file_path:'/workspace/my-repo/src/app.js',old_string:'const a=1;',new_string:'const a=2;'}}]}},
    {type:'user',sessionId:'cc-s2',uuid:'u-res1',parentUuid:'a-2',timestamp:'2026-06-01T11:00:05Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tu-edit',content:'Edited file'}]},toolUseResult:{filePath:'/workspace/my-repo/src/app.js',structuredPatch:[{oldStart:1,oldLines:1,newStart:1,newLines:1,lines:['-const a=1;','+const a=2;']}]}},
    {type:'assistant',sessionId:'cc-s2',uuid:'a-3',parentUuid:'u-res1',timestamp:'2026-06-01T11:00:06Z',message:{id:'msg_02',model:'claude-opus-5-5',stop_reason:'tool_use',usage:{input_tokens:600,output_tokens:25},content:[{type:'tool_use',id:'tu-bash',name:'Bash',input:{command:'rm -rf /tmp/x',description:'Run cleanup'}}]}},
    {type:'user',sessionId:'cc-s2',uuid:'u-res2',parentUuid:'a-3',timestamp:'2026-06-01T11:00:07Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tu-bash',is_error:true,content:'Error: Permission denied'}]},toolUseResult:'Error: Permission for this action was denied by classifier'},
    {type:'attachment',sessionId:'cc-s2',uuid:'att-q',parentUuid:'u-res2',timestamp:'2026-06-01T11:00:08Z',attachment:{type:'queued_command',commandMode:'prompt',humanTurn:true,prompt:[{type:'text',text:'Proceed with plan instead'}]}},
    {type:'assistant',sessionId:'cc-s2',uuid:'a-4',parentUuid:'att-q',timestamp:'2026-06-01T11:00:09Z',message:{id:'msg_03',model:'claude-opus-5-5',stop_reason:'end_turn',usage:{input_tokens:700,output_tokens:30},content:[{type:'tool_use',id:'tu-plan',name:'ExitPlanMode',input:{plan:'# App Cleanup Plan\n\n- Keep safe changes'}}]}},
    {type:'user',sessionId:'cc-s2',uuid:'u-res3',parentUuid:'a-4',timestamp:'2026-06-01T11:00:10Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tu-plan',content:'Approved'}]},toolUseResult:{plan:'# App Cleanup Plan\n\n- Keep safe changes'}},
    {type:'system',subtype:'model_refusal_no_fallback',level:'warning',sessionId:'cc-s2',timestamp:'2026-06-01T11:00:11Z',content:''},
    {type:'ai-title',sessionId:'cc-s2',aiTitle:'Refactor src/app.js Safely'},
    {type:'cost-state',sessionId:'cc-s2',totalCostUSD:0.245,totalLinesAdded:12,totalLinesRemoved:3,totalDuration:9000}
  ].map(o=>JSON.stringify(o)).join('\n');

  const {conversation,project}=cc.parseTranscriptText(lines,{path:'cc-s2.jsonl'});
  assert.equal(conversation.name,'Refactor src/app.js Safely');
  assert.equal(project.uuid,'cc:cwd:'+conversation.workspaceId);
  assert.equal(project.sourcePlatform,'claude_code');
  assert.equal(conversation.claudeCodeMeta.totalCostUSD,0.245);
  assert.equal(conversation.claudeCodeMeta.totalLinesAdded,12);
  assert.equal(conversation.claudeCodeMeta.totalLinesRemoved,3);
  // Usage must sum msg_01 last fragment (500+45) + msg_02 (600+25) + msg_03 (700+30) = 1900 (NOT double-counting msg_01 fragment 1)
  assert.equal(conversation.claudeCodeMeta.usage.total_tokens,1900);

  // Expect 2 human messages (u-1 and queued_command att-q) and 2 assistant turns
  const humans=conversation.chat_messages.filter(m=>m.sender==='human');
  const assistants=conversation.chat_messages.filter(m=>m.sender==='assistant');
  assert.equal(humans.length,2);
  assert.equal(assistants.length,2);
  assert.ok(!humans[0].content.some(b=>b.type==='text'&&b.text.includes('<ide_opened_file>')));
  assert.equal(humans[1].content[0].text,'Proceed with plan instead');

  const firstAsstBlocks=assistants[0].content;
  const hiddenThink=firstAsstBlocks.find(b=>b.type==='thinking');
  assert.equal(hiddenThink.thinking_hidden,true);
  assert.equal(hiddenThink.duration_ms,142);

  const editUse=firstAsstBlocks.find(b=>b.type==='tool_use'&&b.name==='Edit');
  assert.ok(editUse.input.patch.includes('*** Update File: /workspace/my-repo/src/app.js'));
  assert.ok(editUse.input.patch.includes('+const a=2;'));

  const bashRes=firstAsstBlocks.find(b=>b.type==='tool_result'&&b.tool_use_id==='tu-bash');
  assert.equal(bashRes.is_error,true);

  const planBlock=assistants[1].content.find(b=>b.type==='text'&&b.text.includes('**Claude Code Plan**'));
  assert.ok(planBlock);
  assert.ok(assistants[1].content.some(b=>b.type==='text'&&b.text.includes('_[Turn aborted:')));

  const {conv:safeConv}=await core.redactAsync(conversation,'standard',false,async()=>{},false,{});
  const md=await core.markdown(safeConv,'longest',{},async()=>{});
  assert.ok(md.includes('**Claude Code**'));
  assert.ok(!md.includes('ops@example.test'));
});

test('claude code format links subagent transcripts with .meta.json sidecar metadata',()=>{
  const cc=loadClaudeCode();
  const subLines=[
    {type:'user',sessionId:'11111111-2222-3333-4444-555555555555',isSidechain:true,cwd:'/work/sub',version:'2.1.330',timestamp:'2026-06-01T12:00:00Z',message:{role:'user',content:'Audit tests in /work/sub'}},
    {type:'assistant',sessionId:'11111111-2222-3333-4444-555555555555',isSidechain:true,timestamp:'2026-06-01T12:00:05Z',message:{id:'msg_sub1',model:'claude-sonnet-4-6',stop_reason:'end_turn',usage:{input_tokens:120,output_tokens:40},content:[{type:'text',text:'All tests verified.'}]}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const sidecar={agentType:'code-reviewer',description:'Audit tests',parentAgentId:'parent-a1',model:'claude-sonnet-4-6'};
  const parsed=cc.parseTranscriptText(subLines,{
    path:'11111111-2222-3333-4444-555555555555/subagents/agent-a99887766.jsonl',
    meta:sidecar
  });
  assert.equal(parsed.conversation.uuid,'cc:11111111-2222-3333-4444-555555555555:agent:agent-a99887766');
  assert.equal(parsed.conversation.claudeCodeMeta.isSubagent,true);
  assert.equal(parsed.conversation.claudeCodeMeta.agentType,'code-reviewer');
  assert.equal(parsed.conversation.claudeCodeMeta.parentThreadId,'11111111-2222-3333-4444-555555555555');
  assert.ok(parsed.conversation.name.startsWith('[code-reviewer] '));
});

test('claude code telemetry captures api-request, refusals, fallback swaps, classifier interceptors, and retry overhead cleanly',async()=>{
  const cc=loadClaudeCode();
  const core=loadWorkerCore();
  const lines=[
    {type:'permission-mode',permissionMode:'auto',sessionId:'cc-obs-1'},
    {type:'attachment',sessionId:'cc-obs-1',timestamp:'2026-06-02T10:00:00Z',attachment:{type:'auto_mode',autoModeConsentFlow:false,bashFirst:true,bashFirstSteer:'relaxed',steerOnly:true,bypass:false}},
    {type:'api-request-shape',sessionId:'cc-obs-1',shapeHash:'h1',shape:{system:[],tools:[]}},
    {type:'api-request-blob',sessionId:'cc-obs-1',hash:'b1',message:{}},
    {type:'api-request',sessionId:'cc-obs-1',id:'req-1',timestamp:'2026-06-02T10:00:01Z',querySource:'sdk',cacheControl:[{path:['system',0]}],params:{model:'claude-opus-5-5',output_config:{effort:'medium'},thinking:{type:'adaptive',display:'updates'},betas:['claude-code-20250219','fallback-credit-2026-06-01']}},
    {type:'user',sessionId:'cc-obs-1',uuid:'u-1',parentUuid:null,cwd:'/work/obs',timestamp:'2026-06-02T10:00:01Z',message:{role:'user',content:'Run audit tool'}},
    {type:'assistant',sessionId:'cc-obs-1',uuid:'a-1',parentUuid:'u-1',serverClassifierRequest:'cls-uuid-1',requestedModel:'claude-opus-5-5',timestamp:'2026-06-02T10:00:02Z',message:{id:'msg_cls1',model:'claude-opus-5-5',stop_reason:'tool_use',usage:{input_tokens:200,output_tokens:20},content:[{type:'tool_use',id:'tu-1',name:'Bash',input:{command:'curl https://x'}}]}},
    {type:'user',sessionId:'cc-obs-1',uuid:'u-2',parentUuid:'a-1',timestamp:'2026-06-02T10:00:03Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tu-1',is_error:true,content:'Permission denied'}]},toolUseResult:'Error: Permission for this action was denied by the Claude Code auto mode classifier [Data Exfiltration].'},
    {type:'assistant',sessionId:'cc-obs-1',uuid:'a-2',parentUuid:'u-2',serverClassifierRequest:'cls-uuid-2',requestedModel:'claude-opus-5-5',timestamp:'2026-06-02T10:00:04Z',message:{id:'msg_ref1',model:'claude-opus-5-5',stop_reason:'refusal',usage:{input_tokens:300,output_tokens:10},content:[{type:'text',text:'Cannot proceed'}]}},
    {type:'system',subtype:'informational',level:'notice',sessionId:'cc-obs-1',timestamp:'2026-06-02T10:00:05Z',content:"Opus 5.5's safeguards stopped the response above — continuing once with that noted"},
    {type:'assistant',sessionId:'cc-obs-1',uuid:'a-3',parentUuid:'a-2',requestedModel:'claude-opus-5-5',timestamp:'2026-06-02T10:00:06Z',message:{id:'msg_fb1',model:'claude-opus-4-8',stop_reason:'end_turn',usage:{input_tokens:300,cache_read_input_tokens:700,output_tokens:50},content:[{type:'text',text:'Fallback reply completed'}]}},
    {type:'system',subtype:'model_refusal_no_fallback',level:'warning',sessionId:'cc-obs-1',originalModel:'claude-opus-5-5',apiRefusalCategory:'cyber',timestamp:'2026-06-02T10:00:07Z',content:''},
    {type:'assistant',sessionId:'cc-obs-1',uuid:'a-4',parentUuid:'a-3',isApiErrorMessage:true,error:'invalid_request',refusedMessageId:'msg_ref1',timestamp:'2026-06-02T10:00:08Z',message:{id:'msg_syn1',model:'<synthetic>',stop_reason:'refusal',content:[{type:'text',text:'API Error: invalid_request'}]}},
    {type:'system',subtype:'stop_hook_summary',sessionId:'cc-obs-1',hookCount:1,preventedContinuation:true,hookErrors:[],timestamp:'2026-06-02T10:00:09Z'},
    {type:'system',subtype:'compact_boundary',sessionId:'cc-obs-1',compactMetadata:{trigger:'auto',preTokens:42000},timestamp:'2026-06-02T10:00:10Z'},
    {type:'cost-state',sessionId:'cc-obs-1',totalCostUSD:0.5,totalAPIDuration:5200,totalAPIDurationWithoutRetries:4000,totalToolDuration:900,totalDuration:6500,totalLinesAdded:10,totalLinesRemoved:2,modelUsage:{'claude-opus-5-5':{inputTokens:500,outputTokens:80,cacheReadInputTokens:700,cacheCreationInputTokens:0}}}
  ].map(o=>JSON.stringify(o)).join('\n');

  const {conversation}=cc.parseTranscriptText(lines,{path:'cc-obs-1.jsonl'});
  const tel=conversation.claudeCodeTelemetry;
  assert.equal(tel.apiRequests.total,1);
  assert.equal(tel.apiRequests.fallbackCreditRequests,1);
  assert.equal(tel.apiRequests.cacheControlBreakpoints,1);
  assert.equal(tel.refusals.stopRefusal,1);
  assert.equal(tel.refusals.syntheticErrors,1);
  assert.equal(tel.refusals.safeguardNotices,1);
  assert.equal(tel.refusals.noFallback,1);
  assert.equal(tel.fallbacks.modelSwapCount,1);
  assert.equal(tel.fallbacks.modelSwaps['claude-opus-5-5 → claude-opus-4-8'],1);
  assert.equal(tel.interceptors.serverClassifierRequests,2);
  assert.equal(tel.interceptors.serverClassifierRefusals,1);
  assert.equal(tel.interceptors.autoModeDenials,1);
  assert.equal(tel.interceptors.autoModeRules['Data Exfiltration'],1);
  assert.equal(tel.interceptors.hookBlocks,1);
  assert.equal(tel.interceptors.stopHooksPrevented,1);
  assert.equal(tel.compaction.boundaries,1);
  assert.equal(tel.compaction.preTokensMax,42000);
  assert.equal(tel.costTiming.retryOverheadMs,1200);

  async function* oneRecord(){yield{raw:JSON.stringify(conversation),meta:{uuid:conversation.uuid}};}
  const behavior=await core.behavior(oneRecord(),async()=>{});
  assert.equal(behavior.claudeCode.sessions,1);
  assert.equal(behavior.claudeCode.telemetry.apiRequests,1);
  assert.equal(behavior.claudeCode.refusals.stopRefusal,1);
  assert.equal(behavior.claudeCode.fallbacks.modelSwapCount,1);
  assert.equal(behavior.claudeCode.efficiency.retryOverheadMs,1200);
  assert.ok(behavior.claudeCode.events.length>=4);

  const {conv:safeConv}=await core.redactAsync(conversation,'standard',false,async()=>{},false,{});
  assert.equal(safeConv.claudeCodeTelemetry,'[REDACTED:metadata]');
});

