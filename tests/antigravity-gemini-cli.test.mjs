import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadAntigravity(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/antigravity-format.js',import.meta.url),'utf8'),context);
  return context.antigravityExportCore();
}

function loadGeminiCli(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/gemini-cli-format.js',import.meta.url),'utf8'),context);
  return context.geminiCliExportCore();
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

test('Antigravity unwraps USER_REQUEST, Model Selection, double-encoded tool args, positional results, diffs, and runaway loop telemetry',async()=>{
  const ag=loadAntigravity();
  const core=loadWorkerCore();
  const lines=[
    {step_index:0,type:'USER_SETTINGS_CHANGE',source:'SYSTEM',status:'DONE',created_at:'2026-07-01T10:00:00Z',content:'Model Selection: gemini-3.8-pro-high'},
    {step_index:1,type:'USER_INPUT',source:'USER_EXPLICIT',status:'DONE',created_at:'2026-07-01T10:00:05Z',content:'<USER_REQUEST>\nRefactor build script and contact admin@example.test\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nWorkspace: /workspace/demo-repo\n</ADDITIONAL_METADATA>'},
    {step_index:2,type:'PLANNER_RESPONSE',source:'MODEL',status:'DONE',created_at:'2026-07-01T10:00:08Z',input_tokens:1200,output_tokens:180,cache_read_tokens:600,thinking:'Checking git status and updating code.',content:'Sure, inspecting workspace first.',tool_calls:[
      {name:'run_command',args:{CommandLine:'"git status"',Cwd:'"/workspace/demo-repo"',WaitMsBeforeAsync:'5000'}},
      {name:'replace_file_content',args:{TargetFile:'"/workspace/demo-repo/src/app.js"',TargetContent:'"const x = 1;"',ReplacementContent:'"const x = 2;"',StartLine:'10',EndLine:'12'}}
    ]},
    {step_index:3,type:'RUN_COMMAND',source:'SYSTEM',status:'DONE',created_at:'2026-07-01T10:00:09Z',content:'On branch main\nnothing to commit'},
    {step_index:4,type:'REPLACE_FILE_CONTENT',source:'SYSTEM',status:'DONE',created_at:'2026-07-01T10:00:10Z',content:'Edited /workspace/demo-repo/src/app.js'},
    // Simulate a compact truncated duplicate of step 3 that should NOT win over the full version
    {step_index:3,type:'RUN_COMMAND',source:'SYSTEM',status:'DONE',created_at:'2026-07-01T10:00:09Z',content:'On branch (... truncated)',truncated_fields:['content']}
  ];
  // Add 8 consecutive PLANNER_RESPONSE steps to verify runaway loop detection
  for(let k=0;k<8;k++){
    lines.push({
      step_index:5+k,type:'PLANNER_RESPONSE',source:'MODEL',status:'DONE',
      created_at:`2026-07-01T10:01:${String(k).padStart(2,'0')}Z`,
      input_tokens:100,output_tokens:10,
      tool_calls:k===0?[{name:'task_boundary',args:{Mode:'"EXECUTION"',TaskName:'"Editing app"'}}]:[],
      content:`Loop step ${k}`
    });
  }
  const text=lines.map(o=>JSON.stringify(o)).join('\n')+'\n{"step_index":99,"truncated';
  assert.equal(ag.isAntigravityTranscriptText(text),true);

  const parsed=await ag.parseTranscriptAsync(text,{
    path:'brain/11111111-2222-3333-4444-555555555555/.system_generated/logs/transcript_full.jsonl',
    conversationId:'11111111-2222-3333-4444-555555555555',
    title:'Refactor Demo Repo'
  });

  const c=parsed.conversation;
  assert.equal(c.sourcePlatform,'antigravity');
  assert.equal(c.name,'Refactor Demo Repo');
  assert.equal(c.defaultModel,'gemini-3.8-pro-high');
  assert.equal(c.antigravityMeta.cwd,'/workspace/demo-repo');
  assert.equal(parsed.project.uuid,'ag:cwd:'+c.workspaceId);

  // User prompt unwrapped cleanly; metadata folded into injected_prompt_block
  const userMsg=c.chat_messages.find(m=>m.sender==='human');
  assert.equal(userMsg.text,'Refactor build script and contact admin@example.test');
  assert.ok(userMsg.content.some(b=>b.type==='injected_prompt_block'&&b.injection_source==='ag:metadata'));

  // Tool args unwrapped & step 3 retained untruncated version
  const assistantMsg=c.chat_messages.find(m=>m.sender==='assistant'&&m.content.some(b=>b.type==='tool_use'));
  const runUse=assistantMsg.content.find(b=>b.type==='tool_use'&&b.name==='run_command');
  assert.equal(runUse.input.CommandLine,'git status');
  assert.equal(runUse.input.WaitMsBeforeAsync,5000);
  const runRes=assistantMsg.content.find(b=>b.type==='tool_result'&&b.tool_use_id===runUse.id);
  assert.equal(runRes.content[0].text,'On branch main\nnothing to commit');

  const editUse=assistantMsg.content.find(b=>b.type==='tool_use'&&b.name==='replace_file_content');
  assert.ok(editUse.input.patch.includes('-const x = 1;'));
  assert.ok(editUse.input.patch.includes('+const x = 2;'));

  // Runaway planner streak telemetry detected
  assert.ok(c.antigravityTelemetry.maxPlannerStreak>=8);
  assert.ok(c.importWarnings.some(w=>w.startsWith('antigravity_runaway_planner_streak:')));
  assert.ok(c.importWarnings.includes('skipped_malformed_jsonl_lines:1'));

  // Behavior Lab aggregation + Safe Redaction
  const records=[{meta:{uuid:c.uuid,name:c.name,created_at:c.created_at,updated_at:c.updated_at},raw:JSON.stringify(c)}];
  const beh=await core.behavior(records,async()=>{});
  assert.equal(beh.antigravity.sessions,1);
  assert.equal(beh.antigravity.runawaySessions,1);
  assert.equal(beh.antigravity.phases.EXECUTION,1);

  const red=core.redactConversation(c,'tag',false,{});
  const serialized=JSON.stringify(red.conv);
  assert.equal(serialized.includes('admin@example.test'),false);
  assert.equal(serialized.includes('/workspace/demo-repo'),false);
});

test('Antigravity merges Brain artifacts (.md, .resolved, .url.json, pbtxt) including artifact-only folders',()=>{
  const ag=loadAntigravity();
  assert.equal(ag.parsePbtxtTitle('title: "Brain Design Review"'),'Brain Design Review');

  const taskMd='# Migration Tasks\n\n- [x] Research schema\n- [/] Implement UI\n- [ ] Write docs\n';
  const planMd='# Refactor Plan\n\n## Proposed Changes\n- [NEW] `src/antigravity-format.js`\n- [MODIFY] `viewer.html` (/workspace/app/viewer.html)\n';
  const walkMd='# Walkthrough\n\n```carousel\n![Shot](shot1.png)\n<!-- slide -->\nVerified cleanly\n```\n';

  const merged=ag.mergeBrainBundle(null,{
    conversationId:'22222222-3333-4444-5555-666666666666',
    title:'Artifact Only Brain',
    artifacts:[
      {name:'task.md',path:'brain/2222/task.md',content:taskMd,metadata:{summary:'Checklist',updatedAt:'2026-07-02T12:00:00Z',userFacing:true},versions:[{label:'task.md.resolved.0',content:'# Migration Tasks\n- [ ] Research schema'}]},
      {name:'implementation_plan.md',path:'brain/2222/implementation_plan.md',content:planMd,metadata:{summary:'Plan',updatedAt:'2026-07-02T12:05:00Z',userFacing:true,requestFeedback:true},versions:[]},
      {name:'walkthrough.md',path:'brain/2222/walkthrough.md',content:walkMd,metadata:{summary:'Walkthrough',updatedAt:'2026-07-02T12:10:00Z',userFacing:true},versions:[]}
    ],
    urlBookmarks:[
      {name:'PR_22.url.json',title:'Pull Request #22',url:'https://github.com/example/repo/pull/22',description:'Review changes',metadata:{userFacing:true}}
    ],
    images:[{name:'shot1.png',path:'brain/2222/shot1.png'}]
  });

  const c=merged.conversation;
  assert.equal(c.sourcePlatform,'antigravity');
  assert.equal(c.antigravityMeta.transcriptSource,'brain_only');
  assert.equal(c.antigravityMeta.cwd,'/workspace/app');
  assert.equal(c.antigravityMeta.brainArtifacts.length,3);
  assert.deepEqual({...c.antigravityMeta.brainArtifacts[0].checklist},{done:1,active:1,todo:1,total:3});
  assert.equal(c.antigravityMeta.brainArtifacts[1].requestFeedback,true);
  assert.equal(c.antigravityMeta.urlBookmarks.length,1);
});

test('Gemini CLI replays $set, $patch, $rewindTo, deduplicates toolCalls with FileDiff, extracts 5-bucket tokens & project index',async()=>{
  const gem=loadGeminiCli();
  const core=loadWorkerCore();
  const ac=loadAnalysisCore();

  const jsonl=[
    {sessionId:'gem-sess-1',projectHash:'hash123',startTime:'2026-07-03T08:00:00Z',lastUpdated:'2026-07-03T08:05:00Z',directories:['/workspace/gemini-app'],kind:'main'},
    {id:'m1',timestamp:'2026-07-03T08:00:01Z',type:'user',content:'Update config.ts'},
    {id:'m-old',timestamp:'2026-07-03T08:00:02Z',type:'gemini',model:'gemini-2.5-pro',content:'Wrong attempt to rewind'},
    {'$rewindTo':'m-old'},
    {id:'m2',timestamp:'2026-07-03T08:01:00Z',type:'gemini',model:'gemini-2.5-pro',
      thoughts:[{subject:'Plan Diff',description:'Inspect config.ts before patching',timestamp:'2026-07-03T08:00:55Z'}],
      tokens:{input:400,output:80,cached:200,thoughts:120,tool:20,total:820},
      toolCalls:[{id:'tc1',name:'replace',status:'executing',args:{file_path:'config.ts'}}],
      content:''
    },
    // Updated record for same id m2 completing tc1 with FileDiff
    {id:'m2',timestamp:'2026-07-03T08:01:04Z',type:'gemini',model:'gemini-2.5-pro',
      toolCalls:[{id:'tc1',name:'replace',status:'success',args:{file_path:'config.ts'},resultDisplay:{filePath:'/workspace/gemini-app/config.ts',originalContent:'export const port = 3000;',newContent:'export const port = 8080;'}}],
      content:'Initial text'
    },
    {'$patch':{id:'m2',content:'Updated `config.ts` to port 8080.'}},
    {'$set':{summary:'Update server port in config.ts'}}
  ].map(o=>JSON.stringify(o)).join('\n');

  assert.equal(gem.isGeminiCliJsonlText(jsonl),true);
  const parsed=await gem.parseSessionAsync(jsonl,{path:'tmp/gemini-app/chats/session-2026-07-03-gem1.jsonl'});
  const c=parsed.conversation;
  assert.equal(c.sourcePlatform,'gemini_cli');
  assert.equal(c.name,'Update server port in config.ts');
  assert.equal(c.geminiCliMeta.rewindCount,1);
  assert.equal(c.geminiCliMeta.usage.thoughts_tokens,120);
  assert.equal(c.geminiCliMeta.usage.total_tokens,820);

  // Active thread skips rewound m-old; patched text preserved; m-old preserved as branch
  const m2=c.chat_messages.find(m=>m.uuid==='m2');
  assert.equal(m2.text,'Updated `config.ts` to port 8080.');
  const editBlock=m2.content.find(b=>b.type==='tool_use'&&b.id==='tc1');
  assert.ok(editBlock.input.patch.includes('-export const port = 3000;'));
  assert.ok(editBlock.input.patch.includes('+export const port = 8080;'));
  assert.ok(c.chat_messages.some(m=>m.uuid==='m-old-rewind0'));

  // Behavior Lab & Project index integration
  const records=[{meta:{uuid:c.uuid,name:c.name,created_at:c.created_at,updated_at:c.updated_at,workspaceId:c.workspaceId},raw:JSON.stringify(c)}];
  const beh=await core.behavior(records,async()=>{});
  assert.equal(beh.geminiCli.sessions,1);
  assert.equal(beh.geminiCli.rewindCount,1);
  assert.equal(beh.geminiCli.tokens.thoughts,120);

  const pIdx=await ac.calculateProjectIndex(records,r=>JSON.parse(r.raw),[parsed.project],null,async()=>{});
  assert.equal(pIdx.map[c.uuid],'gemini:cwd:'+c.workspaceId);

  // Legacy JSON check
  assert.equal(gem.isGeminiCliJson({sessionId:'legacy-1',messages:[{id:'u1',type:'user',content:'hi'},{id:'a1',type:'gemini',content:'hello'}]}),true);
});
