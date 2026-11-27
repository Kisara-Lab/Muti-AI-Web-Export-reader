import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const root='00000000-0000-4000-8000-000000000000';

function syntheticGrokBackend(){
  return {
    conversations:[
      {
        conversation:{
          id:'synthetic-grok-conv-1',
          user_id:'synthetic-grok-user-1',
          create_time:'2025-06-01T10:00:00Z',
          modify_time:'2025-06-01T10:05:00Z',
          leaf_response_id:'resp-a2',
          title:'Synthetic Grok Investigation',
          summary:'Grok summary text',
          workspace_id:'ws-synthetic-1'
        },
        responses:[
          {
            response:{
              _id:'resp-u1',
              conversation_id:'synthetic-grok-conv-1',
              parent_response_id:'',
              sender:'human',
              message:'Please inspect the attached notes and image for sample@example.test',
              create_time:{$date:{$numberLong:'1748772000000'}},
              file_attachments:['asset-text-01','asset-png-01']
            }
          },
          {
            response:{
              _id:'resp-a1',
              conversation_id:'synthetic-grok-conv-1',
              parent_response_id:'resp-u1',
              sender:'assistant',
              model:'grok-3',
              message:'Superseded Grok branch reply',
              create_time:{$date:{$numberLong:'1748772010000'}}
            }
          },
          {
            response:{
              _id:'resp-a2',
              conversation_id:'synthetic-grok-conv-1',
              parent_response_id:'resp-u1',
              sender:'assistant',
              model:'grok-3',
              thinking_start_time:{$date:{$numberLong:'1748772020000'}},
              thinking_end_time:{$date:{$numberLong:'1748772024000'}},
              message:'Verified Grok answer<grok:render card_id="cite-1" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">1</argument></grok:render>',
              card_attachments_json:[JSON.stringify({id:'cite-1',cardType:'citation_card',title:'Synthetic Grok Source',url:'https://example.test/grok-source'})],
              create_time:{$date:{$numberLong:'1748772025000'}},
              steps:[
                {
                  tagged_text:{
                    header:'Checking synthetic logs',
                    tool_usage_card:'<xai:tool_usage_card><xai:tool_usage_card_id>card-1</xai:tool_usage_card_id><xai:tool_name>WebSearch</xai:tool_name><xai:tool_args><![CDATA[{"query":"synthetic grok"}]]></xai:tool_args></xai:tool_usage_card>'
                  },
                  tool_usage_results:[{tool_usage_card_id:'card-1',result:'tool output ok'}],
                  web_search_results:[{title:'Synthetic Search Hit',url:'https://example.test/hit',preview:'hit preview'}]
                }
              ]
            }
          }
        ]
      }
    ],
    projects:[
      {
        workspace_id:'ws-synthetic-1',
        user_id:'synthetic-grok-user-1',
        name:'Synthetic Grok Workspace',
        custom_personality:'Answer with precision',
        preferred_model:'grok-3',
        create_time:'2025-05-20T00:00:00Z',
        last_use_time:'2025-06-01T10:05:00Z'
      }
    ],
    tasks:[],
    media_posts:[]
  };
}

async function grokArchive(){
  const zip=new JSZip();
  const prefix='ttl/30d/export_data/synthetic-export-uuid/';
  zip.file(prefix+'prod-grok-backend.json',JSON.stringify(syntheticGrokBackend()));
  zip.file(prefix+'prod-mc-auth-mgmt-api.json',JSON.stringify({
    user:{userId:'synthetic-grok-user-1',email:'grok-demo@example.test',givenName:'Demo',familyName:'Grok'},
    sessions:[{sessionId:'sess-1',userId:'synthetic-grok-user-1',createTime:'2025-06-01T09:00:00Z',cfMetadata:{ipAddress:'198.51.100.10',city:'Synthetic City',country:'US'}}]
  }));
  zip.file(prefix+'prod-mc-billing.json',JSON.stringify({balance_map:{}}));
  // Double-slash paths matching real xAI Grok exports, plus extensionless /content assets
  zip.file(prefix+'prod-mc-asset-server//asset-text-01/content','Synthetic Grok plain text note\n<script>window.grokInjected=true</script>');
  zip.file(prefix+'prod-mc-asset-server//asset-png-01/content',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64'));
  return {name:'synthetic-grok-export.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})};
}

async function setup(page){
  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());
}

async function add(page,file,count){
  await page.setInputFiles('#zip-input',file);
  await page.waitForFunction(expected=>exportSession.packages.length===expected,count);
}

test('Grok nested ZIP with double-slash /content assets renders, filters with Claude & ChatGPT, and exports safely',async({page})=>{
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});

  await setup(page);
  await add(page,await grokArchive(),1);
  await page.evaluate(()=>openConv('grok:synthetic-grok-conv-1'));

  await expect(page.locator('#messages')).toContainText('Grok');
  await expect(page.locator('#messages .msg-wrap.grok .msg-avatar')).toContainText('𝕏');
  await expect(page.locator('#messages')).toContainText('Verified Grok answer');
  await expect(page.locator('#messages')).toContainText('Synthetic Grok Source');
  await expect(page.locator('#messages')).not.toContainText('Superseded Grok branch reply');
  await expect(page.locator('#messages [data-zip-media] img')).toBeVisible();

  // Clicking local text /content attachment triggers download + safe inline preview without XSS
  const download=page.waitForEvent('download');
  await page.locator('#messages [data-gpt-resource]').first().click();
  await download;
  await expect(page.locator('#messages pre').first()).toContainText('Synthetic Grok plain text note');
  expect(await page.evaluate(()=>window.grokInjected)).toBeUndefined();

  // Safe Markdown export redacts email and uses Grok role label
  expect(await page.evaluate(async()=>{
    const result=await featureRequest('task','export',{uuid:'grok:synthetic-grok-conv-1',safe:true});
    const text=await result.blob.text();
    return {email:text.includes('sample@example.test'),grok:text.includes('**Grok**')};
  })).toEqual({email:false,grok:true});

  // Append Claude + ChatGPT archives into the same workspace without account mismatch
  const claudeZip=new JSZip();
  claudeZip.file('conversations.json',JSON.stringify([{uuid:'claude-1',name:'Synthetic Claude Chat',account:{uuid:'claude-acc-1'},chat_messages:[{uuid:'c-m1',sender:'assistant',parent_message_uuid:root,content:[{type:'text',text:'Claude reply'}]}]}]));
  await add(page,{name:'claude.zip',mimeType:'application/zip',buffer:await claudeZip.generateAsync({type:'nodebuffer'})},2);

  const gptZip=new JSZip();
  gptZip.file('conversations.json',JSON.stringify([{id:'gpt-1',title:'Synthetic GPT Chat',current_node:'g-m1',create_time:1700000000,mapping:{root:{parent:null,message:null},'g-m1':{parent:'root',message:{id:'g-m1',create_time:1700000001,author:{role:'assistant'},content:{content_type:'text',parts:['GPT reply']},metadata:{}}}}}]));
  gptZip.file('user.json',JSON.stringify({id:'gpt-acc-1',name:'GPT User'}));
  await add(page,{name:'gpt.zip',mimeType:'application/zip',buffer:await gptZip.generateAsync({type:'nodebuffer'})},3);

  // Platform filter works across all 3 platforms
  expect(await page.evaluate(()=>allConvs.length)).toBe(3);
  await page.click('#platform-filter [data-platform="grok"]');
  await expect(page.locator('#conv-list .conv-item')).toHaveCount(1);
  await expect(page.locator('#conv-list')).toContainText('Synthetic Grok Investigation');
  await expect(page.locator('#conv-list')).toContainText('Grok');

  await page.click('#platform-filter [data-platform=""]');
  await expect(page.locator('#conv-list .conv-item')).toHaveCount(3);

  // Analytics platform filter supports grok
  const stats=await page.evaluate(async()=>{
    const query=platforms=>analyticsRequest('query',{filters:{range:'all',platforms}});
    const grok=await query(['grok']),claude=await query(['claude']),gpt=await query(['gpt']),all=await query([]);
    return {grok:grok.current.conversations,claude:claude.current.conversations,gpt:gpt.current.conversations,all:all.current.conversations};
  });
  expect(stats).toEqual({grok:1,claude:1,gpt:1,all:3});

  // Workspace project and account data loaded
  const sessionInfo=await page.evaluate(()=>({
    projects:allProjects.map(p=>p.name),
    users:exportSession.users.map(u=>u.sourcePlatform),
    logins:exportSession.logins.length
  }));
  expect(sessionInfo.projects).toContain('Synthetic Grok Workspace');
  expect(sessionInfo.users).toContain('grok');
  expect(sessionInfo.logins).toBe(1);

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
