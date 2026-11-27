import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const root='00000000-0000-4000-8000-000000000000';

function syntheticCodexRollout(){
  return [
    {timestamp:'2026-04-02T09:00:00Z',type:'session_meta',payload:{id:'codex-e2e-1',cwd:'/workspace/codex-alpha-repo',cli_version:'0.104.0',model_provider:'openai',git:{branch:'feat/codex'}}},
    {timestamp:'2026-04-02T09:00:01Z',type:'turn_context',payload:{cwd:'/workspace/codex-alpha-repo',model:'gpt-5.4'}},
    {timestamp:'2026-04-02T09:00:02Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Update main.js and reach dev@example.test'}]}},
    {timestamp:'2026-04-02T09:00:02Z',type:'event_msg',payload:{type:'user_message',message:'Update main.js and reach dev@example.test'}},
    {timestamp:'2026-04-02T09:00:03Z',type:'response_item',payload:{type:'reasoning',summary:[{type:'summary_text',text:'Inspecting workspace before applying patch'}]}},
    {timestamp:'2026-04-02T09:00:04Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'call-p1',name:'apply_patch',input:'*** Begin Patch\n*** Update File: main.js\n@@\n-console.log("old");\n+console.log("new");\n*** End Patch'}},
    {timestamp:'2026-04-02T09:00:05Z',type:'response_item',payload:{type:'custom_tool_call_output',call_id:'call-p1',output:'Updated main.js'}},
    {timestamp:'2026-04-02T09:00:06Z',type:'response_item',payload:{type:'function_call',call_id:'call-t1',name:'exec_command',arguments:JSON.stringify({cmd:'npm test'})}},
    {timestamp:'2026-04-02T09:00:07Z',type:'response_item',payload:{type:'function_call_output',call_id:'call-t1',output:'Process exited with code 1\n1 test failed'}},
    {timestamp:'2026-04-02T09:00:08Z',type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:'Applied patch to `main.js`. `npm test` failed on one assertion.'}]}},
    {timestamp:'2026-04-02T09:00:08Z',type:'event_msg',payload:{type:'item_completed',item:{type:'Plan',id:'plan-1',text:'# Release Checklist\n\n1. Verify `main.js` patch.\n2. Run smoke suite.'}}},
    {timestamp:'2026-04-02T09:00:09Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:900,output_tokens:210,total_tokens:1110}}}}
  ].map(o=>JSON.stringify(o)).join('\n');
}

async function setup(page){
  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());
}

test('Codex Alpha banner renders on Welcome, imports rollout .jsonl, groups cwd workspaces, and exports safely',async({page})=>{
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    const u=request.url();
    if(/^https?:/.test(u)&&!/^https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(u))network.push(u);
  });

  await setup(page);

  // Welcome view shows Codex Alpha card & filter button
  await expect(page.locator('.platform-guide-card.codex')).toContainText('Codex (OpenAI)');
  await expect(page.locator('.platform-guide-card.codex .platform-alpha-badge')).toContainText('Alpha Test');
  await expect(page.locator('#platform-filter [data-platform="codex"]')).toContainText('Codex α');

  // Standalone .jsonl selection via #zip-input (alongside history.jsonl which should be safely ignored)
  await page.setInputFiles('#zip-input',[
    {name:'rollout-2026-04-02-codex-e2e-1.jsonl',mimeType:'application/x-ndjson',buffer:Buffer.from(syntheticCodexRollout(),'utf8')},
    {name:'history.jsonl',mimeType:'application/x-ndjson',buffer:Buffer.from(JSON.stringify({session_id:'h1',ts:1760000000,text:'prompt only'})+'\n','utf8')}
  ]);
  await page.waitForFunction(()=>exportSession.packages.length===1&&allConvs.length===1);

  await page.evaluate(()=>openConv('codex:codex-e2e-1'));

  await expect(page.locator('#messages .codex-alpha-notice')).toContainText('Alpha Test · Codex CLI / Desktop');
  await expect(page.locator('#messages .msg-wrap.codex .msg-avatar')).toContainText('❯');
  await expect(page.locator('#messages .step-pill')).toContainText('apply_patch, exec_command');
  await expect(page.locator('#messages')).toContainText('Applied patch to main.js.');

  // Codex Plan card + Side Canvas Markdown preview without duplicate Note/Codex Plan callout
  await expect(page.locator('#messages .plan-card-title')).toContainText('Release Checklist');
  await expect(page.locator('#messages .plan-card-body .md-alert')).toHaveCount(0);
  await page.click('#messages .plan-card [data-ui-click="open-canvas-file"]');
  await expect(page.locator('#canvas-pane .canvas-md-stage')).toContainText('Verify main.js patch.');
  await expect(page.locator('#canvas-pane .canvas-md-stage .md-alert')).toHaveCount(0);
  await page.click('#canvas-close-btn');

  // Expanding Steps 2.0 reveals apply_patch diff and failing exec_command
  await page.click('#messages .step-pill');
  await expect(page.locator('#messages .step-rail')).toBeVisible();
  await expect(page.locator('#messages .step-tool-card', {hasText:'apply_patch'})).toBeVisible();
  await page.locator('#messages .step-tool-head', {hasText:'apply_patch'}).click();
  await expect(page.locator('#messages code.language-diff')).toContainText('*** Update File: main.js');

  // Metadata panel displays Alpha label & codexMeta fields
  await page.click('#toggle-summary');
  await expect(page.locator('#meta-box')).toContainText('Codex (Alpha)');
  await expect(page.locator('#meta-box')).toContainText('/workspace/codex-alpha-repo');
  await expect(page.locator('#meta-box')).toContainText('0.104.0');
  await expect(page.locator('#meta-box')).toContainText('feat/codex');

  // Workspace cwd grouping in Projects tab
  await page.click('.tab-btn[data-ui-value="projects"]');
  const codexProj=page.locator('#conv-list [role="button"]', {hasText:'codex-alpha-repo (Codex)'});
  await expect(codexProj).toBeVisible();
  await codexProj.click();
  await expect(page.locator('#messages')).toContainText('cwd');

  // Append Claude ZIP, filter Codex α, and verify Analytics & safe export redaction
  const claudeZip=new JSZip();
  claudeZip.file('conversations.json',JSON.stringify([{uuid:'claude-c1',name:'Synthetic Claude',account:{uuid:'claude-acc-c1'},chat_messages:[{uuid:'m1',sender:'assistant',parent_message_uuid:root,content:[{type:'text',text:'Claude reply'}]}]}]));
  await page.setInputFiles('#zip-input',{name:'claude.zip',mimeType:'application/zip',buffer:await claudeZip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>exportSession.packages.length===2&&allConvs.length===2);

  await page.click('.tab-btn[data-ui-value="convs"]');
  await page.click('#platform-filter [data-platform="codex"]');
  await expect(page.locator('#conv-list .conv-item')).toHaveCount(1);
  await expect(page.locator('#conv-list')).toContainText('Codex (Alpha)');

  const stats=await page.evaluate(async()=>{
    const query=platforms=>analyticsRequest('query',{filters:{range:'all',platforms}});
    const codexStats=await query(['codex']),claudeStats=await query(['claude']),allStats=await query([]);
    const exported=await featureRequest('task','export',{uuid:'codex:codex-e2e-1',safe:true});
    const mdText=await exported.blob.text();
    return {
      codex:codexStats.current.conversations,
      claude:claudeStats.current.conversations,
      all:allStats.current.conversations,
      redactedEmail:!mdText.includes('dev@example.test'),
      hasCodexHeading:mdText.includes('**Codex**')
    };
  });
  expect(stats).toEqual({codex:1,claude:1,all:2,redactedEmail:true,hasCodexHeading:true});

  // Unsupported .jsonl.zst displays clear error message
  await page.click('#load-zip-btn', {force:true}).catch(()=>{});
  const zstResult=await page.evaluate(async()=>{
    const dt=new DataTransfer();
    dt.items.add(new File([new Uint8Array([0x28,0xb5,0x2f,0xfd])],'rollout-compressed.jsonl.zst',{type:'application/zstd'}));
    const btn=document.getElementById('load-zip-btn');
    await importExportFiles([...dt.files],btn);
    return exportSession.errors[exportSession.errors.length-1]||btn.textContent||'';
  });
  expect(zstResult).toContain('zstd -d');

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
