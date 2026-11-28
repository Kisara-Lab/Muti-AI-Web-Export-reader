import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const md5=s=>crypto.createHash('md5').update(s,'utf8').digest('hex');

function syntheticPythonWire(){
  return [
    {type:'metadata',protocol_version:'1.10'},
    {timestamp:1760100001,message:{type:'TurnBegin',payload:{user_input:'Switch to Plan Mode and update server.js port config'}}},
    {timestamp:1760100002,message:{type:'StepBegin',payload:{n:1}}},
    {timestamp:1760100003,message:{type:'ContentPart',payload:{type:'think',think:'Inspecting server.js and drafting implementation plan.'}}},
    {timestamp:1760100004,message:{type:'PlanDisplay',payload:{file_path:'/workspace/kimi-demo/.kimi/plans/fuzzy-plan.md',content:'# Kimi Port Migration Plan\n\n- Update `PORT` to `8080` in `server.js`\n- Run smoke tests'}}},
    {timestamp:1760100005,message:{type:'ToolCall',payload:{id:'kt-todo',function:{name:'SetTodoList',arguments:JSON.stringify({todos:[{title:'Plan port migration',status:'done'},{title:'Patch server.js',status:'in_progress'},{title:'Verify tests',status:'pending'}]})}}}},
    {timestamp:1760100006,message:{type:'ToolResult',payload:{tool_call_id:'kt-todo',return_value:{is_error:false,output:'Updated todo list',display:[{type:'todo',items:[{title:'Plan port migration',status:'done'},{title:'Patch server.js',status:'in_progress'},{title:'Verify tests',status:'pending'}]}]}}}},
    {timestamp:1760100007,message:{type:'ToolCall',payload:{id:'kt-edit',function:{name:'StrReplaceFile',arguments:JSON.stringify({path:'/workspace/kimi-demo/server.js',edits:[{old:'3000',new:'8080'}]})}}}},
    {timestamp:1760100008,message:{type:'ApprovalRequest',payload:{id:'kap-1',tool_call_id:'kt-edit',sender:'StrReplaceFile',action:'edit file',description:'Apply port change to server.js?'}}},
    {timestamp:1760100009,message:{type:'ApprovalResponse',payload:{request_id:'kap-1',response:'approve_for_session'}}},
    {timestamp:1760100010,message:{type:'ToolResult',payload:{tool_call_id:'kt-edit',return_value:{is_error:false,output:'Replaced 1 occurrence',display:[{type:'diff',path:'/workspace/kimi-demo/server.js',old_text:'const PORT = 3000;',new_text:'const PORT = 8080;'}]}}},},
    {timestamp:1760100011,message:{type:'ToolCall',payload:{id:'kt-ask',function:{name:'AskUserQuestion',arguments:JSON.stringify({questions:[{header:'Restart',question:'Restart API worker now?',options:[{label:'Yes',description:'Reload daemon'},{label:'No',description:'Skip restart'}]}]})}}}},
    {timestamp:1760100012,message:{type:'QuestionRequest',payload:{id:'kq-1',tool_call_id:'kt-ask',questions:[{header:'Restart',question:'Restart API worker now?'}],answers:{'Restart API worker now?':'Yes'}}}},
    {timestamp:1760100013,message:{type:'ToolResult',payload:{tool_call_id:'kt-ask',return_value:{is_error:false,output:'Restart API worker now?: Yes'}}}},
    {timestamp:1760100014,message:{type:'ToolCall',payload:{id:'kt-sh',function:{name:'Shell',arguments:JSON.stringify({command:'npm test'})}}}},
    {timestamp:1760100015,message:{type:'ToolResult',payload:{tool_call_id:'kt-sh',return_value:{is_error:false,output:'12 passed',display:[{type:'shell',command:'npm test',language:'bash'},{type:'brief',text:'Suite passed (12/12)'}]}}}},
    {timestamp:1760100016,message:{type:'BtwBegin',payload:{id:'kbtw-1',question:'Does port 8080 clash with proxy?'}}},
    {timestamp:1760100017,message:{type:'BtwEnd',payload:{id:'kbtw-1',response:'Proxy listens on 9090, no conflict.'}}},
    {timestamp:1760100018,message:{type:'HookTriggered',payload:{hook_name:'pre-commit',target:'Shell'}}},
    {timestamp:1760100019,message:{type:'HookResolved',payload:{hook_name:'pre-commit',action:'allow'}}},
    {timestamp:1760100020,message:{type:'ContentPart',payload:{type:'text',text:'Updated `server.js` to listen on port `8080` and verified the suite passes.'}}},
    {timestamp:1760100021,message:{type:'StatusUpdate',payload:{context_usage:0.38,context_tokens:48640,max_context_tokens:128000,plan_mode:true,yolo_mode:false,thinking_enabled:true,token_usage:{input_other:1400,output:420,input_cache_read:3200,input_cache_creation:300}}}},
    {timestamp:1760100022,message:{type:'TurnEnd',payload:{}}}
  ].map(o=>JSON.stringify(o)).join('\n');
}

function syntheticNodeWire(){
  return [
    {type:'turn.prompt',ts:'2026-07-05T10:00:00Z',prompt:'Check build pipeline in kimi-code'},
    {type:'llm.request',ts:'2026-07-05T10:00:01Z',model:'kimi-k2.5'},
    {type:'item.ended',ts:'2026-07-05T10:00:02Z',item:{type:'thinking',text:'Inspecting CI config.'}},
    {type:'item.ended',ts:'2026-07-05T10:00:04Z',item:{type:'text',text:'Pipeline uses Node 22 and passes cleanly.'}},
    {type:'usage.record',ts:'2026-07-05T10:00:05Z',scope:'turn',usage:{input_other:400,output:100,input_cache_read:150,input_cache_creation:0}},
    {type:'usage.record',ts:'2026-07-05T10:00:06Z',scope:'session',usage:{input_other:88888,output:88888}}
  ].map(o=>JSON.stringify(o)).join('\n');
}

test('Kimi CLI full E2E: Welcome 9th card, Workspace Strip, Plan Dashed Box, Todo/Approval/Shell/Diff, Stub correlation, Behavior Lab & Mobile',async({page})=>{
  const errors=[],network=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',req=>{
    const u=req.url();
    if(/^https?:/.test(u)&&!/^https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(u))network.push(u);
  });

  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());

  // 1. Welcome 9-card Bento grid & filter pill
  await expect(page.locator('.platform-guide-card.kimi_cli')).toContainText('Kimi Code CLI');
  await expect(page.locator('#platform-filter [data-platform="kimi_cli"]')).toContainText('Kimi CLI α');

  const shotDir=process.env.KIMI_SHOT_DIR||'';
  if(shotDir){
    await page.locator('.platform-guide-card.kimi_cli').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(shotDir,'kimi_welcome_light.png')});
  }

  // 2. Build combined synthetic ZIP
  const hash=md5('/workspace/kimi-demo');
  const mainId='11111111-aaaa-4444-8888-000000000001';
  const stubId='22222222-bbbb-4444-8888-000000000002';
  const zip=new JSZip();

  zip.file('.kimi/kimi.json',JSON.stringify({work_dirs:[{path:'/workspace/kimi-demo',kaos:'local',last_session_id:mainId}]}));
  zip.file('.kimi/config.toml','default_model = "kimi-k2-thinking"\ndefault_thinking = true\ntheme = "dark"\napi_key = "sk-kimi-secret-do-not-display"\n');
  zip.file('.kimi/credentials/auth.json',JSON.stringify({token:'super-secret-oauth-token'}));
  zip.file('.kimi/plans/fuzzy-plan.md','# Kimi Port Migration Plan\n\n- Update `PORT` to `8080` in `server.js`\n- Run smoke tests');
  zip.file('.kimi/AGENTS.md','# Kimi Project Memory\n\nUse strict CSP rules and preserve viewer comments.');
  zip.file('.kimi/logs/kimi.log',[
    `2026-07-05 09:00:00.100 | INFO | Created new session: ${mainId}`,
    `2026-07-05 09:00:00.200 | INFO | Loaded tools: Shell, ReadFile, StrReplaceFile, SetTodoList, AskUserQuestion`,
    `2026-07-05 09:05:00.100 | INFO | Created new session: ${stubId}`,
    '2026-07-05 09:05:00.400 | ERROR | Cannot create LLM: missing base_url or model'
  ].join('\n'));

  // Active Python session
  zip.file(`.kimi/sessions/${hash}/${mainId}/context.jsonl`,[
    JSON.stringify({role:'_system_prompt',content:'You are Kimi Code CLI.'}),
    JSON.stringify({role:'user',content:'Switch to Plan Mode and update server.js port config'}),
    JSON.stringify({role:'assistant',content:[{type:'text',text:'Updated `server.js` to listen on port `8080` and verified the suite passes.'}]})
  ].join('\n'));
  zip.file(`.kimi/sessions/${hash}/${mainId}/wire.jsonl`,syntheticPythonWire());
  zip.file(`.kimi/sessions/${hash}/${mainId}/state.json`,JSON.stringify({plan_mode:true,approval:{yolo:false},thinking:true}));

  // Diagnostic _system_prompt-only stub session
  zip.file(`.kimi/sessions/${hash}/${stubId}/context.jsonl`,JSON.stringify({role:'_system_prompt',content:'Frozen Kimi startup prompt for diagnostics.'}));

  // Modern Node ~/.kimi-code session
  zip.file('.kimi-code/sessions/s1/session_node1/agents/main/wire.jsonl',syntheticNodeWire());

  await page.setInputFiles('#zip-input',{name:'kimi-dual-pack.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>exportSession.packages.length===1&&allConvs.length===3);

  // 3. Open primary Python session & verify Workspace Strip + Plan Dashed Box + Side Canvas
  await page.evaluate(id=>openConv('kimi:'+id),mainId);
  await expect(page.locator('.import-notice.kimi-alpha-notice')).toContainText('Kimi Code CLI');
  await expect(page.locator('.kimi-workspace-strip')).toContainText('Plan Mode');
  await expect(page.locator('.kimi-workspace-strip')).toContainText('38%');
  await expect(page.locator('.kimi-plan-card')).toContainText('Kimi Port Migration Plan');

  // Open fuzzy-plan.md in Side Canvas
  await page.locator('.kimi-plan-card [data-ui-click="open-canvas-file"]').click();
  await expect(page.locator('#workspace-body')).toHaveClass(/canvas-open/);
  await expect(page.locator('#canvas-body')).toContainText('Update PORT to 8080');

  if(shotDir){
    await page.screenshot({path:path.join(shotDir,'kimi_conv_light_canvas.png')});
  }

  // Expand Steps 2.0 and inspect Todo board, Diff + Approval, AskUserQuestion, Shell + Brief
  for(const pill of await page.locator('#messages .step-pill').all())await pill.click();
  for(const btn of await page.locator('#messages .step-tool-head').all())await btn.click();
  await expect(page.locator('#messages .kimi-todo-card')).toContainText('Patch server.js');
  await expect(page.locator('#messages .kimi-approval-card')).toContainText('approve_for_session');
  await expect(page.locator('#messages .ag-diff-line.add')).toContainText('+const PORT = 8080;');
  await expect(page.locator('#messages .kimi-question-card')).toContainText('Restart API worker now?');
  await expect(page.locator('#messages .ag-term-bar')).toContainText('npm test');
  await expect(page.locator('#messages .kimi-brief-box')).toContainText('Suite passed (12/12)');

  if(shotDir){
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
    await page.screenshot({path:path.join(shotDir,'kimi_conv_dark_steps.png')});
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
  }

  // 4. Open diagnostic stub session & verify kimi.log correlation and secret stripping
  await page.evaluate(id=>openConv('kimi:'+id),stubId);
  await expect(page.locator('.import-notice.kimi-alpha-notice')).toContainText('诊断存根会话');
  await expect(page.locator('#messages')).toContainText('Cannot create LLM');
  const bodyDump=await page.evaluate(()=>JSON.stringify(allConvs));
  expect(bodyDump).not.toContain('sk-kimi-secret-do-not-display');
  expect(bodyDump).not.toContain('super-secret-oauth-token');

  // 5. Open Behavior Lab -> check Kimi telemetry card
  await page.locator('.tab-btn[data-ui-value="behavior"]').click();
  await expect(page.locator('[data-behavior-kimi="true"]')).toContainText('Kimi Code CLI α');
  await expect(page.locator('[data-behavior-kimi="true"]')).toContainText('38%');
  await expect(page.locator('[data-behavior-kimi="true"]')).toContainText('1 session');

  if(shotDir){
    await page.screenshot({path:path.join(shotDir,'kimi_behavior_light.png')});
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
    await page.screenshot({path:path.join(shotDir,'kimi_behavior_dark.png')});
    await page.evaluate(()=>toggleTheme());
    await page.waitForTimeout(260);
  }

  // 6. Verify Memory & Projects tabs + Mobile responsive view
  await page.locator('.tab-btn[data-ui-value="memory"]').click();
  await expect(page.locator('#conv-list')).toContainText('AGENTS.md');
  await page.locator('.tab-btn[data-ui-value="projects"]').click();
  await expect(page.locator('#conv-list')).toContainText('(Kimi CLI)');

  if(shotDir){
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(id=>openConv('kimi:'+id),mainId);
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(shotDir,'kimi_mobile_light.png')});
  }

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
