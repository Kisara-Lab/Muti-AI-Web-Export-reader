import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const pngBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function syntheticAntigravityTranscript(){
  return [
    {step_index:0,type:'USER_SETTINGS_CHANGE',source:'SYSTEM',status:'DONE',created_at:'2026-07-04T09:00:00Z',content:'Model Selection: gemini-3.8-pro-high'},
    {step_index:1,type:'USER_INPUT',source:'USER_EXPLICIT',status:'DONE',created_at:'2026-07-04T09:00:02Z',content:'<USER_REQUEST>\nBuild Antigravity & Gemini CLI native support\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nWorkspace: /workspace/ag-demo\n</ADDITIONAL_METADATA>'},
    {step_index:2,type:'PLANNER_RESPONSE',source:'MODEL',status:'DONE',created_at:'2026-07-04T09:00:05Z',input_tokens:1800,output_tokens:260,cache_read_tokens:900,thinking:'Inspecting codebase and drafting Brain task & plan.',content:'I have updated `viewer.html` and created the walkthrough.',tool_calls:[
      {name:'task_boundary',args:{Mode:'"EXECUTION"',TaskName:'"Antigravity UI Replication"'}},
      {name:'replace_file_content',args:{TargetFile:'"/workspace/ag-demo/viewer.html"',StartLine:'100',EndLine:'104',TargetContent:'"const mode = 1;"',ReplacementContent:'"const mode = 2;"'}}
    ]},
    {step_index:3,type:'TASK_BOUNDARY',source:'SYSTEM',status:'DONE',created_at:'2026-07-04T09:00:06Z',content:'Task boundary set'},
    {step_index:4,type:'REPLACE_FILE_CONTENT',source:'SYSTEM',status:'DONE',created_at:'2026-07-04T09:00:07Z',content:'Updated viewer.html successfully'}
  ].map(o=>JSON.stringify(o)).join('\n');
}

function syntheticGeminiCliTranscript(){
  return [
    {sessionId:'gem-e2e-1',projectHash:'ph1',startTime:'2026-07-04T10:00:00Z',lastUpdated:'2026-07-04T10:04:00Z',kind:'main'},
    {id:'gu1',timestamp:'2026-07-04T10:00:01Z',type:'user',content:'Fix port config in server.ts'},
    {id:'g-old',timestamp:'2026-07-04T10:00:02Z',type:'gemini',model:'gemini-2.5-pro',content:'Old draft'},
    {'$rewindTo':'g-old'},
    {id:'ga1',timestamp:'2026-07-04T10:00:10Z',type:'gemini',model:'gemini-2.5-pro',
      thoughts:[{subject:'Inspect Server Config',description:'Verify port constant in server.ts',timestamp:'2026-07-04T10:00:08Z'}],
      tokens:{input:600,output:110,cached:300,thoughts:150,tool:30,total:1190},
      toolCalls:[{id:'gtc-1',name:'replace',status:'success',args:{file_path:'server.ts'},resultDisplay:{filePath:'/workspace/gem-demo/server.ts',originalContent:'const PORT = 3000;',newContent:'const PORT = 8080;'}}],
      content:'Port updated cleanly to 8080.'
    },
    {'$set':{summary:'Update server.ts port (Gemini CLI)'}}
  ].map(o=>JSON.stringify(o)).join('\n');
}

function syntheticGeminiSubagent(){
  return [
    {sessionId:'gem-sub-1',projectHash:'ph1',startTime:'2026-07-04T10:02:00Z',lastUpdated:'2026-07-04T10:03:00Z',kind:'subagent',parentSessionId:'gem-e2e-1'},
    {id:'su1',timestamp:'2026-07-04T10:02:01Z',type:'user',content:'Run smoke check'},
    {id:'sa1',timestamp:'2026-07-04T10:02:05Z',type:'gemini',model:'gemini-2.5-flash',content:'Smoke check passed.'}
  ].map(o=>JSON.stringify(o)).join('\n');
}

test('Antigravity & Gemini CLI full E2E: Brain Strip, Side Canvas snapshots, Carousel, Diffs, Behavior Lab & visual layout',async({page})=>{
  const errors=[],network=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',req=>{
    const u=req.url();
    if(/^https?:/.test(u)&&!/^https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(u))network.push(u);
  });

  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());

  // 1. Welcome Bento 8 cards + platform filter pills
  await expect(page.locator('.platform-guide-card.antigravity')).toContainText('Antigravity');
  await expect(page.locator('.platform-guide-card.gemini_cli')).toContainText('Gemini CLI');
  await expect(page.locator('#platform-filter [data-platform="antigravity"]')).toContainText('Antigravity α');
  await expect(page.locator('#platform-filter [data-platform="gemini_cli"]')).toContainText('Gemini CLI α');

  const shotDir=process.env.AG_SHOT_DIR||'';
  if(shotDir){
    await page.screenshot({path:path.join(shotDir,'ag_welcome_light.png')});
  }

  // 2. Build combined synthetic ZIP
  const agId='aaaa1111-2222-3333-4444-555555555555';
  const zip=new JSZip();
  zip.file(`.gemini/antigravity/brain/${agId}/.system_generated/logs/transcript_full.jsonl`,syntheticAntigravityTranscript());
  zip.file(`.gemini/antigravity/brain/${agId}/task.md`,'# UI Replication Tasks\n\n- [x] Research schemas\n- [/] Build Antigravity Strip\n- [ ] Capture final shots\n');
  zip.file(`.gemini/antigravity/brain/${agId}/task.md.resolved.0`,'# UI Replication Tasks\n\n- [ ] Research schemas\n- [ ] Build Antigravity Strip\n');
  zip.file(`.gemini/antigravity/brain/${agId}/task.md.metadata.json`,JSON.stringify({summary:'Checklist',updatedAt:'2026-07-04T09:00:10Z',userFacing:true}));
  zip.file(`.gemini/antigravity/brain/${agId}/implementation_plan.md`,'# Antigravity Plan\n\n- [NEW] `src/antigravity-format.js`\n- [MODIFY] `viewer.html`\n');
  zip.file(`.gemini/antigravity/brain/${agId}/implementation_plan.md.metadata.json`,JSON.stringify({summary:'Plan',updatedAt:'2026-07-04T09:00:11Z',userFacing:true,requestFeedback:true}));
  zip.file(`.gemini/antigravity/brain/${agId}/walkthrough.md`,'# Walkthrough\n\n```carousel\n![Preview Shot](preview.png)\n<!-- slide -->\nSecond slide verification notes.\n```\n');
  zip.file(`.gemini/antigravity/brain/${agId}/preview.png`,Buffer.from(pngBase64,'base64'));
  zip.file(`.gemini/antigravity/brain/${agId}/PR_Demo.url.json`,JSON.stringify({url:'https://github.com/example/demo/pull/22',title:'PR #22: Antigravity Support',description:'Native Brain artifacts'}));
  zip.file(`.gemini/antigravity/annotations/${agId}.pbtxt`,'title: "Antigravity Native Experience"');
  zip.file(`.gemini/antigravity/conversations/${agId}.pb`,Buffer.from([0x0a,0x04,0x74,0x65,0x73,0x74]));

  zip.file('.gemini/projects.json',JSON.stringify({projects:{'/workspace/gem-demo':'gem-demo'}}));
  zip.file('.gemini/tmp/gem-demo/chats/session-2026-07-04-gem1.jsonl',syntheticGeminiCliTranscript());
  zip.file('.gemini/tmp/gem-demo/chats/gem-e2e-1/gem-sub-1.jsonl',syntheticGeminiSubagent());
  zip.file('.gemini/GEMINI.md','# Gemini Global Memory\n\nPrefer crisp pure JS modules without bundler overhead.');

  await page.setInputFiles('#zip-input',{name:'ag-gemini-pack.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>exportSession.packages.length===1&&allConvs.length===3);

  // 3. Open Antigravity conversation & test Brain Strip + Side Canvas + Snapshot switcher + URL card + Steps 2.0 Diff
  await page.evaluate(id=>openConv('ag:'+id),agId);
  await expect(page.locator('#chat-title')).toContainText('Antigravity Native Experience');
  await expect(page.locator('.import-notice.ag-alpha-notice')).toContainText('pb');
  await expect(page.locator('.ag-artifact-strip')).toContainText('task.md');
  await expect(page.locator('.ag-artifact-strip')).toContainText('1/3');
  await expect(page.locator('.ag-url-card')).toContainText('PR #22: Antigravity Support');

  // Open walkthrough.md in Side Canvas -> test Carousel & Snapshot bar hidden -> open task.md -> test Snapshot switcher
  await page.locator('.ag-art-pill',{hasText:'walkthrough.md'}).click();
  await expect(page.locator('#workspace-body')).toHaveClass(/canvas-open/);
  await expect(page.locator('#canvas-body .ag-carousel')).toBeVisible();
  await expect(page.locator('#canvas-body .ag-car-pos')).toHaveText('1');
  await page.locator('#canvas-body [data-ui-click="ag-carousel-step"]').last().click();
  await expect(page.locator('#canvas-body .ag-car-pos')).toHaveText('2');
  await expect(page.locator('#canvas-body .ag-carousel-slide.active')).toContainText('Second slide');

  if(shotDir){
    await page.screenshot({path:path.join(shotDir,'ag_conv_light_canvas.png')});
  }

  // Open task.md and verify Snapshot version switcher + tri-state checkboxes
  await page.locator('.ag-art-pill',{hasText:'task.md'}).click();
  await expect(page.locator('#canvas-version-bar')).toBeVisible();
  await expect(page.locator('#canvas-body .ag-check.doing')).toHaveCount(1);
  await expect(page.locator('#canvas-body .ag-check.done')).toHaveCount(1);
  await page.selectOption('#canvas-version-select','0');
  await expect(page.locator('#canvas-body .ag-check.doing')).toHaveCount(0);

  // Expand Steps 2.0 & check Antigravity Unified Diff view
  await page.locator('#messages .step-pill').first().click();
  await page.locator('#messages .step-tool-head').nth(1).click();
  await expect(page.locator('#messages .ag-diff-line.add')).toContainText('+const mode = 2;');

  // Switch to Dark Mode and inspect Antigravity conversation
  if(shotDir){
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
    await page.screenshot({path:path.join(shotDir,'ag_conv_dark_steps.png')});
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
  }

  // 4. Open Gemini CLI conversation -> verify thought chapter subject & FileDiff
  await page.evaluate(()=>openConv('gemini:gem-e2e-1'));
  await expect(page.locator('#chat-title')).toContainText('Update server.ts port');
  await expect(page.locator('.import-notice.gemini-alpha-notice')).toContainText('$rewindTo');
  await page.locator('#messages .step-pill').first().click();
  await expect(page.locator('#messages .step-think-subject')).toContainText('Inspect Server Config');

  // 5. Open Behavior Lab -> verify both Antigravity & Gemini CLI sections render cleanly
  await page.locator('.tab-btn[data-ui-value="behavior"]').click();
  await expect(page.locator('[data-behavior-ag="true"]')).toContainText('Antigravity α');
  await expect(page.locator('[data-behavior-gem="true"]')).toContainText('Gemini CLI α');
  await expect(page.locator('[data-behavior-gem="true"]')).toContainText('150');

  if(shotDir){
    await page.screenshot({path:path.join(shotDir,'ag_behavior_light.png')});
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
    await page.screenshot({path:path.join(shotDir,'ag_behavior_dark.png')});
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
  }

  // 6. Verify Memory & Projects tabs (on desktop viewport)
  await page.locator('.tab-btn[data-ui-value="memory"]').click();
  await expect(page.locator('#conv-list')).toContainText('GEMINI.md');
  await page.locator('.tab-btn[data-ui-value="projects"]').click();
  await expect(page.locator('#conv-list')).toContainText('(Antigravity)');
  await expect(page.locator('#conv-list')).toContainText('(Gemini CLI)');

  if(shotDir){
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{openConv('ag:'+ 'aaaa1111-2222-3333-4444-555555555555');});
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(shotDir,'ag_mobile_light.png')});
  }

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
