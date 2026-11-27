import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadGrok(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/grok-format.js',import.meta.url),'utf8'),context);
  return context.grokExportCore();
}

function loadWorkerCore(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/redaction-rules.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../src/worker-core.js',import.meta.url),'utf8'),context);
  return context.workerDomainCore();
}

test('grok format detects backend, single conversation, and auth exports',()=>{
  const grok=loadGrok();
  const sampleConv={
    conversation:{id:'conv-001',title:'Synthetic Grok Chat'},
    responses:[]
  };
  assert.equal(grok.isConversation(sampleConv),true);
  assert.equal(grok.isConversation({mapping:{}}),false);
  assert.equal(grok.isBackendExport({conversations:[sampleConv],projects:[],tasks:[],media_posts:[]}),true);
  assert.equal(grok.isBackendExport({conversations:[]}),false);
  assert.equal(grok.isBackendExport({conversations:[],projects:[]}),true);
  assert.equal(grok.isAuthExport({user:{userId:'user-001'},sessions:[]}),true);
  assert.equal(grok.isAuthExport({user:{id:'user-001'},sessions:[]}),false);
});

test('grok format parses MongoDB Extended JSON dates, ISO strings, and epoch numbers',()=>{
  const grok=loadGrok();
  assert.equal(grok.parseDate({$date:{$numberLong:'1700000000000'}}),'2023-11-14T22:13:20.000Z');
  assert.equal(grok.parseDate('2025-01-15T10:20:30Z'),'2025-01-15T10:20:30.000Z');
  assert.equal(grok.parseDate(1700000000),'2023-11-14T22:13:20.000Z');
  assert.equal(grok.parseDate(''), '');
  assert.equal(grok.parseDate(null),'');
});

test('grok format resolves inline citations and file cards outside code fences and blocks unsafe URLs',()=>{
  const grok=loadGrok();
  const cards=[
    JSON.stringify({id:'c1',cardType:'citation_card',title:'Example Spec',url:'https://example.com/spec'}),
    JSON.stringify({id:'c2',cardType:'citation_card',title:'Unsafe',url:'javascript:alert(1)'}),
    JSON.stringify({id:'f1',cardType:'rendered_file_card',file_name:'report.pdf',mime_type:'application/pdf',url:'https://example.com/report.pdf'})
  ];
  const raw=[
    'See detail<grok:render card_id="c1" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">1</argument></grok:render>',
    'and unsafe<grok:render card_id="c2" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">2</argument></grok:render>',
    '<grok:render card_id="f1" card_type="rendered_file_card" type="render_file"><argument name="file_path">report.pdf</argument></grok:render>',
    '```xml',
    '<grok:render card_id="c1" card_type="citation_card" type="render_inline_citation"></grok:render>',
    '```'
  ].join('\n');
  const parsed=grok.parseMessage(raw,cards);
  assert.match(parsed.text,/See detail\[1\]/);
  assert.match(parsed.text,/\[1\] \[Example Spec\]\(<https:\/\/example\.com\/spec>\)/);
  assert.doesNotMatch(parsed.text,/javascript:/);
  assert.match(parsed.text,/report\.pdf/);
  assert.match(parsed.text,/```xml\n<grok:render card_id="c1"/);
  assert.equal(parsed.files.length,1);
  assert.equal(parsed.files[0].name,'report.pdf');
});

test('grok format converts steps, tools, web search, attachments, branching leaf_response_id, projects, and auth',async()=>{
  const grok=loadGrok();
  const core=loadWorkerCore();
  const entry={
    conversation:{
      id:'conv-branch-1',
      user_id:'u-123',
      title:'Synthetic Branching Grok',
      summary:'Summary text',
      workspace_id:'ws-9',
      create_time:'2025-05-01T10:00:00Z',
      modify_time:'2025-05-01T10:05:00Z',
      leaf_response_id:'r-a2'
    },
    responses:[
      {
        response:{
          _id:'r-u1',
          parent_response_id:'',
          sender:'human',
          message:'Check this note',
          create_time:{$date:{$numberLong:'1746093600000'}},
          file_attachments:['asset-txt-1']
        }
      },
      {
        response:{
          _id:'r-a1',
          parent_response_id:'r-u1',
          sender:'assistant',
          model:'grok-3',
          message:'Old branch answer',
          create_time:{$date:{$numberLong:'1746093610000'}}
        }
      },
      {
        response:{
          _id:'r-a2',
          parent_response_id:'r-u1',
          sender:'assistant',
          model:'grok-3',
          thinking_start_time:{$date:{$numberLong:'1746093620000'}},
          thinking_end_time:{$date:{$numberLong:'1746093625500'}},
          message:'Active branch answer<grok:render card_id="cite-1" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">1</argument></grok:render>',
          card_attachments_json:[JSON.stringify({id:'cite-1',cardType:'citation_card',title:'Docs',url:'https://example.com/docs'})],
          create_time:{$date:{$numberLong:'1746093626000'}},
          steps:[
            {
              tagged_text:{
                header:'Inspecting workspace files',
                tool_usage_card:'<xai:tool_usage_card><xai:tool_usage_card_id>tc-1</xai:tool_usage_card_id><xai:tool_name>WebSearch</xai:tool_name><xai:tool_args><![CDATA[{"query":"synthetic grok test"}]]></xai:tool_args></xai:tool_usage_card>'
              },
              tool_usage_results:[{tool_usage_card_id:'tc-1',result:'search ok'}],
              web_search_results:[{title:'Synthetic Result',url:'https://example.com/result',preview:'preview'}]
            }
          ],
          xpost_ids:['1900000000000000001']
        }
      }
    ]
  };
  const conv=grok.convert(entry);
  assert.equal(conv.uuid,'grok:conv-branch-1');
  assert.equal(conv.sourcePlatform,'grok');
  assert.equal(conv.account.uuid,'grok:u-123');
  assert.equal(conv.workspaceId,'ws-9');
  assert.deepEqual([...conv.defaultPath],['grok:conv-branch-1:r-u1','grok:conv-branch-1:r-a2']);

  const humanMsg=conv.chat_messages.find(m=>m.originalId==='r-u1');
  assert.equal(humanMsg.attachments.length,1);
  assert.equal(humanMsg.attachments[0].file_id,'asset-txt-1');

  const activeMsg=conv.chat_messages.find(m=>m.originalId==='r-a2');
  const thinking=activeMsg.content.find(b=>b.type==='thinking');
  assert.equal(thinking.thinking,'Inspecting workspace files');
  assert.equal(thinking.duration_ms,5500);
  const toolUse=activeMsg.content.find(b=>b.type==='tool_use');
  assert.equal(toolUse.name,'WebSearch');
  assert.equal(toolUse.input.query,'synthetic grok test');
  const toolRes=activeMsg.content.find(b=>b.type==='tool_result');
  assert.equal(toolRes.tool_use_id,'tc-1');
  assert.equal(toolRes.name,'WebSearch');
  const webRes=activeMsg.content.find(b=>b.type==='web_search_tool_result');
  assert.equal(webRes.content.length,1);
  assert.equal(webRes.content[0].url,'https://example.com/result');
  const textBlock=activeMsg.content.find(b=>b.type==='text');
  assert.match(textBlock.text,/Active branch answer\[1\]/);
  assert.match(textBlock.text,/x\.com\/i\/web\/status\/1900000000000000001/);

  // Tree honors defaultPath for Grok
  const built=core.tree(conv);
  assert.deepEqual([...built.messages.map(m=>m.originalId)],['r-u1','r-a2']);

  // Markdown export uses Grok label
  const md=await core.markdown(conv,'longest',{},async()=>{});
  assert.match(md,/\*\*Grok\*\*/);

  // Projects & Auth conversion
  const projects=grok.convertProjects([{workspace_id:'ws-9',name:'Synthetic Workspace',custom_personality:'Be concise',preferred_model:'grok-3',create_time:'2025-05-01T00:00:00Z'}]);
  assert.equal(projects.length,1);
  assert.equal(projects[0].uuid,'grok:ws:ws-9');
  assert.equal(projects[0].prompt_template,'Be concise');

  const auth=grok.convertAuth({
    user:{userId:'u-123',email:'demo@example.com',givenName:'Demo',familyName:'User'},
    sessions:[{sessionId:'s-1',userId:'u-123',createTime:'2025-05-01T08:00:00Z',cfMetadata:{ipAddress:'198.51.100.1',city:'Testville',country:'US'}}]
  });
  assert.deepEqual([...auth.accounts],['grok:u-123']);
  assert.equal(auth.users[0].sourcePlatform,'grok');
  assert.equal(auth.logins[0].ip_address,'198.51.100.1');
});
