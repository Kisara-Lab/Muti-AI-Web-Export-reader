import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadPerplexity(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/perplexity-format.js',import.meta.url),'utf8'),context);
  return context.perplexityExportCore();
}

function loadWorkerCore(){
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../src/redaction-rules.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../src/worker-core.js',import.meta.url),'utf8'),context);
  return context.workerDomainCore();
}

test('perplexity format detects export wrapper and single conversation',()=>{
  const pplx=loadPerplexity();
  const conv={context_uuid:'ctx-001',context_title:'Synthetic Perplexity',entries:[]};
  assert.equal(pplx.isConversation(conv),true);
  assert.equal(pplx.isConversation({mapping:{}}),false);
  assert.equal(pplx.isExport({conversations:[conv]}),true);
  assert.equal(pplx.isExport({conversations:[]}),false);
});

test('perplexity format converts multi-turn entries into chained human/assistant messages and Markdown',async()=>{
  const pplx=loadPerplexity();
  const core=loadWorkerCore();
  const conv=pplx.convert({
    context_uuid:'ctx-100',
    context_title:'Synthetic Perplexity Thread',
    created_at:'2025-07-01T08:00:00Z',
    updated_at:'2025-07-01T08:05:00Z',
    mode:'CONCISE',
    collection_uuid:'col-uuid-1',
    entries:[
      {
        entry_uuid:'e-1',
        query:'First synthetic question?',
        answer:'First synthetic answer [1].',
        created_at:'2025-07-01T08:00:05.123456',
        query_status:'COMPLETED',
        engine_mode:'pro',
        sources:[{title:'Example Doc',url:'https://example.test/doc'}]
      },
      {
        entry_uuid:'e-2',
        query:'Follow-up question?',
        answer:'',
        created_at:'2025-07-01T08:02:00Z',
        query_status:'FAILED',
        engine_mode:'pro'
      }
    ]
  });

  assert.equal(conv.uuid,'perplexity:ctx-100');
  assert.equal(conv.sourcePlatform,'perplexity');
  assert.equal(conv.collectionUuid,'col-uuid-1');
  assert.equal(conv.chat_messages.length,4);
  assert.deepEqual([...conv.chat_messages.map(m=>m.sender)],['human','assistant','human','assistant']);
  assert.equal(conv.chat_messages[1].parent_message_uuid,conv.chat_messages[0].uuid);
  assert.equal(conv.chat_messages[2].parent_message_uuid,conv.chat_messages[1].uuid);
  assert.equal(conv.chat_messages[1].model,'perplexity-pro');
  assert.equal(conv.chat_messages[1].content.some(b=>b.type==='web_search_tool_result'),true);
  assert.match(conv.chat_messages[3].content[0].text,/\[Status: FAILED\]/);

  const md=await core.markdown(conv,'longest',{},async()=>{});
  assert.match(md,/\*\*Perplexity\*\*/);
});

test('perplexity format parses inlineStr and sharedStrings XLSX workbook sheets',()=>{
  const pplx=loadPerplexity();
  const workbookXml='<workbook><sheets><sheet name="User Profile" sheetId="1"/><sheet name="User Preferences" sheetId="2"/><sheet name="Collections &amp; Shared Content" sheetId="3"/><sheet name="Account Information" sheetId="4"/></sheets></workbook>';
  const sheet1='<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>USER_ID</t></is></c><c r="B1" t="inlineStr"><is><t>USERNAME</t></is></c><c r="C1" t="inlineStr"><is><t>USER_EMAIL</t></is></c></row><row r="2"><c r="A2" t="n"><v>424242</v></c><c r="B2" t="inlineStr"><is><t>demo_user</t></is></c><c r="C2" t="inlineStr"><is><t>demo@example.test</t></is></c></row></sheetData></worksheet>';
  const sheet2='<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>USER_ID</t></is></c><c r="B1" t="inlineStr"><is><t>DEFAULT_MODEL</t></is></c></row><row r="2"><c r="A2" t="n"><v>424242</v></c><c r="B2" t="inlineStr"><is><t>sonar</t></is></c></row></sheetData></worksheet>';
  const sheet3='<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ID</t></is></c><c r="B1" t="inlineStr"><is><t>COLLECTION_ID</t></is></c><c r="G1" t="inlineStr"><is><t>TITLE</t></is></c><c r="H1" t="inlineStr"><is><t>DESCRIPTION</t></is></c></row><row r="2"><c r="A2" t="n"><v>101</v></c><c r="B2" t="n"><v>9001</v></c><c r="G2" t="inlineStr"><is><t>Synthetic Space</t></is></c><c r="H2" t="inlineStr"><is><t>Research notes</t></is></c></row></sheetData></worksheet>';
  const sheet4='<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>NAME</t></is></c><c r="B1" t="inlineStr"><is><t>EMAIL</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Demo Name</t></is></c><c r="B2" t="inlineStr"><is><t>demo@example.test</t></is></c></row></sheetData></worksheet>';

  const parsed=pplx.parseWorkbook({
    workbookXml,
    sheets:{
      'xl/worksheets/sheet1.xml':sheet1,
      'xl/worksheets/sheet2.xml':sheet2,
      'xl/worksheets/sheet3.xml':sheet3,
      'xl/worksheets/sheet4.xml':sheet4
    }
  });
  assert.deepEqual([...parsed.accounts],['perplexity:424242']);
  assert.equal(parsed.users.length,1);
  assert.equal(parsed.users[0].sourcePlatform,'perplexity');
  assert.equal(parsed.users[0].full_name,'Demo Name');
  assert.equal(parsed.projects.length,1);
  assert.equal(parsed.projects[0].uuid,'perplexity:col:9001');
  assert.equal(parsed.projects[0].name,'Synthetic Space');
});
