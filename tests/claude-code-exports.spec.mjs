import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const root='00000000-0000-4000-8000-000000000000';

function syntheticClaudeCodeSession(){
  return [
    {type:'api-request-blob',sessionId:'cc-e2e-1',hash:'skip-me',shape:{}},
    {type:'mode',mode:'plan',sessionId:'cc-e2e-1',timestamp:'2026-06-10T09:00:00Z'},
    {type:'user',sessionId:'cc-e2e-1',uuid:'u1',parentUuid:null,cwd:'/workspace/cc-alpha-repo',gitBranch:'feat/cc-alpha',version:'2.1.330',entrypoint:'claude-vscode',timestamp:'2026-06-10T09:00:01Z',message:{role:'user',content:'Update app.js and email ci@example.test'}},
    {type:'assistant',sessionId:'cc-e2e-1',uuid:'a1',parentUuid:'u1',thinkingDurationMs:185,timestamp:'2026-06-10T09:00:02Z',message:{id:'msg_cc1',model:'claude-opus-5-5',stop_reason:null,usage:{input_tokens:300,output_tokens:15},content:[{type:'thinking',thinking:'',signature:'enc-sig'}]}},
    {type:'assistant',sessionId:'cc-e2e-1',uuid:'a2',parentUuid:'a1',timestamp:'2026-06-10T09:00:03Z',message:{id:'msg_cc1',model:'claude-opus-5-5',stop_reason:'tool_use',usage:{input_tokens:300,output_tokens:40},content:[{type:'tool_use',id:'tu-edit1',name:'Edit',input:{file_path:'/workspace/cc-alpha-repo/app.js',old_string:'let v=1;',new_string:'let v=2;'}}]}},
    {type:'user',sessionId:'cc-e2e-1',uuid:'u2',parentUuid:'a2',timestamp:'2026-06-10T09:00:04Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tu-edit1',content:'File edited'}]},toolUseResult:{filePath:'/workspace/cc-alpha-repo/app.js',structuredPatch:[{oldStart:1,oldLines:1,newStart:1,newLines:1,lines:['-let v=1;','+let v=2;']}]}},
    {type:'assistant',sessionId:'cc-e2e-1',uuid:'a3',parentUuid:'u2',timestamp:'2026-06-10T09:00:05Z',message:{id:'msg_cc2',model:'claude-opus-5-5',stop_reason:'end_turn',usage:{input_tokens:450,output_tokens:55},content:[{type:'text',text:'Updated `app.js` cleanly.'},{type:'tool_use',id:'tu-plan1',name:'ExitPlanMode',input:{plan:'# Migration Roadmap\n\n1. Patch `app.js`.\n2. Run E2E checks.'}}]}},
    {type:'user',sessionId:'cc-e2e-1',uuid:'u3',parentUuid:'a3',timestamp:'2026-06-10T09:00:06Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tu-plan1',content:'Plan accepted'}]},toolUseResult:{plan:'# Migration Roadmap\n\n1. Patch `app.js`.\n2. Run E2E checks.'}},
    {type:'ai-title',sessionId:'cc-e2e-1',aiTitle:'Refactor app.js (Claude Code)'},
    {type:'cost-state',sessionId:'cc-e2e-1',totalCostUSD:0.1234,totalLinesAdded:8,totalLinesRemoved:2,totalDuration:4500}
  ].map(o=>JSON.stringify(o)).join('\n');
}

function syntheticClaudeCodeSubagent(){
  return [
    {type:'user',sessionId:'cc-e2e-1',isSidechain:true,cwd:'/workspace/cc-alpha-repo',gitBranch:'feat/cc-alpha',version:'2.1.330',timestamp:'2026-06-10T09:01:00Z',message:{role:'user',content:'Verify lint rules'}},
    {type:'assistant',sessionId:'cc-e2e-1',isSidechain:true,timestamp:'2026-06-10T09:01:05Z',message:{id:'msg_sub_1',model:'claude-sonnet-4-6',stop_reason:'end_turn',usage:{input_tokens:90,output_tokens:20},content:[{type:'text',text:'No lint errors found.'}]}}
  ].map(o=>JSON.stringify(o)).join('\n');
}

async function setup(page){
  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());
}

test('Claude Code Alpha banner renders on Welcome, imports session/subagent/memory ZIP, renders Edit diff + Plan Canvas, and exports safely',async({page})=>{
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    const u=request.url();
    if(/^https?:/.test(u)&&!/^https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(u))network.push(u);
  });

  await setup(page);

  // Welcome 2x3 card + filter chip explicitly mark Alpha Test · 最缺少实测
  await expect(page.locator('.platform-guide-card.claude_code')).toContainText('Claude Code');
  await expect(page.locator('.platform-guide-card.claude_code .platform-alpha-badge')).toContainText('Alpha Test');
  await expect(page.locator('#platform-filter [data-platform="claude_code"]')).toContainText('Claude Code α');

  // Build synthetic Claude Code project archive (main session + subagent + memory + prompt history.jsonl to skip)
  const ccZip=new JSZip();
  ccZip.file('-workspace-cc-alpha-repo/cc-e2e-1.jsonl',syntheticClaudeCodeSession());
  ccZip.file('-workspace-cc-alpha-repo/cc-e2e-1/subagents/agent-a55443322.jsonl',syntheticClaudeCodeSubagent());
  ccZip.file('-workspace-cc-alpha-repo/cc-e2e-1/subagents/agent-a55443322.meta.json',JSON.stringify({agentType:'Verifier',description:'Verify lint rules'}));
  ccZip.file('-workspace-cc-alpha-repo/memory/MEMORY.md','---\nname: Project Memory\ndescription: Workspace notes\n---\n\nAlways run E2E smoke tests.');
  ccZip.file('history.jsonl',JSON.stringify({display:'old prompt',timestamp:1760000000000,project:'/workspace/cc-alpha-repo',sessionId:'old-1'})+'\n');

  await page.setInputFiles('#zip-input',{name:'claude-code-sample.zip',mimeType:'application/zip',buffer:await ccZip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>exportSession.packages.length===1&&allConvs.length===2);

  // Subagent badge renders in conversation list
  await expect(page.locator('#conv-list .conv-item.is-subagent .subagent-pill')).toContainText('Verifier');

  await page.evaluate(()=>openConv('cc:cc-e2e-1'));

  await expect(page.locator('#messages .claude-code-alpha-notice')).toContainText('Alpha Test · Claude Code CLI / IDE');
  await expect(page.locator('#messages .msg-wrap.claude_code .msg-avatar')).toContainText('❯_');
  await expect(page.locator('#messages .injected-context.mode-plan')).toContainText('Plan Mode');

  // Plan Card + Side Canvas Markdown preview
  await expect(page.locator('#messages .plan-card-title')).toContainText('Migration Roadmap');
  await expect(page.locator('#messages .plan-card-body .md-alert')).toHaveCount(0);
  await page.click('#messages .plan-card [data-ui-click="open-canvas-file"]');
  await expect(page.locator('#canvas-pane .canvas-md-stage')).toContainText('Run E2E checks.');
  await expect(page.locator('#canvas-pane .canvas-md-stage .md-alert')).toHaveCount(0);
  await page.click('#canvas-close-btn');

  // Steps 2.0 reveals compact hidden thinking duration pill & Edit Unified Diff
  await page.click('#messages .step-pill');
  await expect(page.locator('#messages .step-think-hidden')).toContainText('185ms');
  await page.locator('#messages .step-tool-head', {hasText:'Edit'}).click();
  await expect(page.locator('#messages code.language-diff')).toContainText('+let v=2;');

  // Metadata panel displays Alpha label, cwd, cost, diff stats, branch & version
  await page.click('#toggle-summary');
  await expect(page.locator('#meta-box')).toContainText('Claude Code (Alpha)');
  await expect(page.locator('#meta-box')).toContainText('/workspace/cc-alpha-repo');
  await expect(page.locator('#meta-box')).toContainText('$0.1234');
  await expect(page.locator('#meta-box')).toContainText('+8 / -2');
  await expect(page.locator('#meta-box')).toContainText('2.1.330');

  // Workspace cwd grouping in Projects tab
  await page.click('.tab-btn[data-ui-value="projects"]');
  const ccProj=page.locator('#conv-list [role="button"]', {hasText:'cc-alpha-repo (Claude Code)'});
  await expect(ccProj).toBeVisible();
  await ccProj.click();
  await expect(page.locator('#messages')).toContainText('Claude Code');

  // Memory tab displays memory/MEMORY.md
  await page.click('.tab-btn[data-ui-value="memory"]');
  await expect(page.locator('#conv-list')).toContainText('Project Memory');

  // Append Claude Web export ZIP, verify claude_code filter isolation + Analytics + safe redaction export
  const webClaudeZip=new JSZip();
  webClaudeZip.file('conversations.json',JSON.stringify([{uuid:'web-claude-1',name:'Claude Web Chat',account:{uuid:'acc-web-1'},chat_messages:[{uuid:'m1',sender:'assistant',parent_message_uuid:root,content:[{type:'text',text:'Web Claude reply'}]}]}]));
  await page.setInputFiles('#zip-input',{name:'claude-web.zip',mimeType:'application/zip',buffer:await webClaudeZip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>exportSession.packages.length===2&&allConvs.length===3);

  await page.click('.tab-btn[data-ui-value="convs"]');
  await page.click('#platform-filter [data-platform="claude_code"]');
  await expect(page.locator('#conv-list .conv-item')).toHaveCount(2);

  const stats=await page.evaluate(async()=>{
    const query=platforms=>analyticsRequest('query',{filters:{range:'all',platforms}});
    const ccStats=await query(['claude_code']),webStats=await query(['claude']),allStats=await query([]);
    const exported=await featureRequest('task','export',{uuid:'cc:cc-e2e-1',safe:true});
    const mdText=await exported.blob.text();
    return {
      claudeCode:ccStats.current.conversations,
      claudeWeb:webStats.current.conversations,
      all:allStats.current.conversations,
      redactedEmail:!mdText.includes('ci@example.test'),
      hasClaudeCodeHeading:mdText.includes('**Claude Code**')
    };
  });
  expect(stats).toEqual({claudeCode:2,claudeWeb:1,all:3,redactedEmail:true,hasClaudeCodeHeading:true});

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
