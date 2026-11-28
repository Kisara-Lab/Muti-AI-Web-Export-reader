import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const md5=s=>crypto.createHash('md5').update(s,'utf8').digest('hex');

test('v2.1 Consolidation E2E: unified multi-CLI workspace, bidirectional subagent navigation, Codex telemetry & Agent Arena',async({page})=>{
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));

  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());

  const zip=new JSZip();
  const sharedCwd='/workspace/unified-repo';
  const soloCwd='/workspace/solo-codex';

  // 1. Codex parent session + child subagent on sharedCwd + solo Codex session on soloCwd
  zip.file('.codex/sessions/2026/08/01/rollout-2026-08-01T10-00-00-aaaa1111-1111-4111-8111-111111111111.jsonl',[
    {timestamp:'2026-08-01T10:00:00Z',type:'session_meta',payload:{id:'aaaa1111-1111-4111-8111-111111111111',cwd:sharedCwd,cli_version:'0.29.0',model:'gpt-5.3-codex',originator:'codex_cli_rs'}},
    {timestamp:'2026-08-01T10:00:01Z',type:'turn_context',payload:{model:'gpt-5.3-codex',sandbox_mode:'workspace-write',approval_policy:'on-request'}},
    {timestamp:'2026-08-01T10:00:02Z',type:'event_msg',payload:{type:'user_message',message:'Implement unified workspace and verify tests'}},
    {timestamp:'2026-08-01T10:00:03Z',type:'response_item',payload:{type:'reasoning',summary:[{type:'summary_text',text:'Auditing modules first'}]}},
    {timestamp:'2026-08-01T10:00:04Z',type:'response_item',payload:{type:'function_call',call_id:'sp1',name:'spawn_agent',arguments:JSON.stringify({nickname:'auditor',message:'Inspect schema'})}},
    {timestamp:'2026-08-01T10:00:05Z',type:'response_item',payload:{type:'function_call_output',call_id:'sp1',output:'{"agent_id":"bbbb2222-2222-4222-8222-222222222222","nickname":"auditor"}'}},
    {timestamp:'2026-08-01T10:00:06Z',type:'event_msg',payload:{type:'item_completed',item:{type:'Plan',text:'Step 1: Unify cwd'}}},
    {timestamp:'2026-08-01T10:00:07Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'ap1',name:'apply_patch',input:'*** Begin Patch\n*** End Patch'}},
    {timestamp:'2026-08-01T10:00:08Z',type:'response_item',payload:{type:'custom_tool_call_output',call_id:'ap1',output:'Updated 1 file'}},
    {timestamp:'2026-08-01T10:00:09Z',type:'event_msg',payload:{type:'agent_message',message:'Delegated audit to subagent and patched index.'}},
    {timestamp:'2026-08-01T10:00:10Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:3000,cached_input_tokens:1800,output_tokens:600,reasoning_output_tokens:200,total_tokens:3600}}}}
  ].map(x=>JSON.stringify(x)).join('\n'));

  zip.file('.codex/sessions/2026/08/01/rollout-2026-08-01T10-00-04-bbbb2222-2222-4222-8222-222222222222.jsonl',[
    {timestamp:'2026-08-01T10:00:04Z',type:'session_meta',payload:{id:'bbbb2222-2222-4222-8222-222222222222',cwd:sharedCwd,cli_version:'0.29.0',model:'gpt-5.3-codex',parent_thread_id:'aaaa1111-1111-4111-8111-111111111111',agent_nickname:'auditor'}},
    {timestamp:'2026-08-01T10:00:05Z',type:'event_msg',payload:{type:'user_message',message:'Audit workspace schema details'}},
    {timestamp:'2026-08-01T10:00:06Z',type:'event_msg',payload:{type:'agent_message',message:'Schema audit clean: all keys normalized.'}},
    {timestamp:'2026-08-01T10:00:07Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:500,cached_input_tokens:200,output_tokens:120,total_tokens:620}}}}
  ].map(x=>JSON.stringify(x)).join('\n'));

  zip.file('.codex/sessions/2026/08/01/rollout-2026-08-01T11-00-00-cccc3333-3333-4333-8333-333333333333.jsonl',[
    {timestamp:'2026-08-01T11:00:00Z',type:'session_meta',payload:{id:'cccc3333-3333-4333-8333-333333333333',cwd:soloCwd,cli_version:'0.29.0',model:'gpt-5.3-codex'}},
    {timestamp:'2026-08-01T11:00:01Z',type:'event_msg',payload:{type:'user_message',message:'Solo codex workspace task'}},
    {timestamp:'2026-08-01T11:00:02Z',type:'event_msg',payload:{type:'agent_message',message:'Done in solo codex repo.'}}
  ].map(x=>JSON.stringify(x)).join('\n'));

  // 2. Claude Code session on sharedCwd
  zip.file('.claude/projects/-workspace-unified-repo/cc-sess-1.jsonl',[
    {type:'user',uuid:'cc-u1',parentUuid:null,sessionId:'cc-sess-1',cwd:sharedCwd,timestamp:'2026-08-01T12:00:00Z',message:{role:'user',content:'Review unified workspace tests in Claude Code'}},
    {type:'assistant',uuid:'cc-a1',parentUuid:'cc-u1',sessionId:'cc-sess-1',cwd:sharedCwd,timestamp:'2026-08-01T12:00:03Z',message:{role:'assistant',model:'claude-sonnet-4-6',content:[{type:'text',text:'Claude Code reviewed unified workspace tests.'}],usage:{input_tokens:1200,output_tokens:300,cache_read_input_tokens:800,cache_creation_input_tokens:100}}}
  ].map(x=>JSON.stringify(x)).join('\n'));

  // 3. Kimi CLI main session + subagent on sharedCwd
  const khash=md5(sharedCwd);
  const ksId='kimi-sess-1';
  zip.file('.kimi/kimi.json',JSON.stringify({work_dirs:[{path:sharedCwd,kaos:'local',last_session_id:ksId}]}));
  zip.file(`.kimi/sessions/${khash}/${ksId}/context.jsonl`,[
    {role:'user',content:'Check Kimi workspace alignment'},
    {role:'assistant',content:[{type:'text',text:'Kimi CLI main session verified alignment.'}]}
  ].map(x=>JSON.stringify(x)).join('\n'));
  zip.file(`.kimi/sessions/${khash}/${ksId}/wire.jsonl`,[
    {timestamp:1760200001,message:{type:'TurnBegin',payload:{user_input:'Check Kimi workspace alignment'}}},
    {timestamp:1760200002,message:{type:'StatusUpdate',payload:{context_usage:0.25,token_usage:{input_other:600,output:200,input_cache_read:400,input_cache_creation:0}}}},
    {timestamp:1760200003,message:{type:'TurnEnd',payload:{}}}
  ].map(x=>JSON.stringify(x)).join('\n'));
  zip.file(`.kimi/sessions/${khash}/${ksId}/subagents/helper-7/context.jsonl`,[
    {role:'user',content:'Subagent helper task'},
    {role:'assistant',content:[{type:'text',text:'Helper subagent finished cleanly.'}]}
  ].map(x=>JSON.stringify(x)).join('\n'));

  await page.setInputFiles('#zip-input',{name:'v2-1-unified.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>allConvs.length===6);

  // Verify Unified Multi-CLI Workspace project + standalone Codex project in Projects tab
  await page.click('.tab-btn[data-ui-value="projects"]');
  await page.waitForSelector('.proj-card');
  const unifiedCard=page.locator('.proj-card').filter({hasText:'unified-repo (多 Agent 统一工作区)'});
  await expect(unifiedCard).toHaveCount(1);
  await expect(unifiedCard.locator('.platform-pill')).toHaveCount(3);
  await expect(page.locator('.proj-card').filter({hasText:'solo-codex (Codex)'})).toHaveCount(1);

  await unifiedCard.click();
  await expect(page.locator('#chat-title')).toContainText('unified-repo (多 Agent 统一工作区)');
  await expect(page.locator('#chat-header-meta')).toContainText('5条关联对话');

  // Verify bidirectional Subagent navigation on Codex parent <-> child
  await page.click('.tab-btn[data-ui-value="convs"]');
  await page.locator('#conv-list .conv-item').filter({hasText:'Implement unified workspace and verify tests'}).click();
  await expect(page.locator('.subagent-nav-strip .subagent-nav-btn').filter({hasText:'auditor'})).toBeVisible();
  await expect(page.locator('.step-group .step-agent-jump')).toHaveCount(1);
  await page.locator('.step-group .step-pill').first().click();
  await page.locator('.step-group .step-agent-jump').click();
  await expect(page.locator('#messages')).toContainText('Schema audit clean: all keys normalized.');
  await expect(page.locator('.subagent-nav-strip .subagent-nav-btn').filter({hasText:'返回父会话'})).toBeVisible();
  await page.locator('.subagent-nav-strip .subagent-nav-btn').filter({hasText:'返回父会话'}).click();
  await expect(page.locator('#messages')).toContainText('Delegated audit to subagent and patched index.');

  // Verify Kimi parent -> subagent navigation too
  await page.locator('#conv-list .conv-item').filter({hasText:'Check Kimi workspace alignment'}).click();
  await expect(page.locator('.subagent-nav-strip .subagent-nav-btn')).toBeVisible();
  await page.locator('.subagent-nav-strip .subagent-nav-btn').first().click();
  await expect(page.locator('#messages')).toContainText('Helper subagent finished cleanly.');
  await expect(page.locator('.subagent-nav-strip .subagent-nav-btn').filter({hasText:'返回父会话'})).toBeVisible();

  // Verify Coding Agent Behavior Arena + Codex Alpha Telemetry in Behavior Lab
  await page.click('.tab-btn[data-ui-value="behavior"]');
  await page.waitForSelector('[data-behavior-arena="true"]');
  await page.waitForSelector('[data-behavior-codex="true"]');
  await expect(page.locator('[data-behavior-arena="true"] tr[data-arena-platform]')).toHaveCount(3);
  await expect(page.locator('[data-behavior-codex="true"]')).toContainText('Codex α 专项观测台');
  await expect(page.locator('[data-behavior-codex="true"]')).toContainText('workspace-write');

  expect(errors).toEqual([]);
});
