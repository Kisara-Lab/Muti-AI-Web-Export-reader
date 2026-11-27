import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';

const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const root='00000000-0000-4000-8000-000000000000';

async function syntheticXlsx(){
  const wb=new JSZip();
  wb.file('xl/workbook.xml','<workbook><sheets><sheet name="User Profile" sheetId="1"/><sheet name="User Preferences" sheetId="2"/><sheet name="Collections &amp; Shared Content" sheetId="3"/><sheet name="Account Information" sheetId="4"/></sheets></workbook>');
  wb.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>USER_ID</t></is></c><c r="B1" t="inlineStr"><is><t>USERNAME</t></is></c><c r="C1" t="inlineStr"><is><t>USER_EMAIL</t></is></c></row><row r="2"><c r="A2" t="n"><v>998877</v></c><c r="B2" t="inlineStr"><is><t>pplx_demo</t></is></c><c r="C2" t="inlineStr"><is><t>pplx@example.test</t></is></c></row></sheetData></worksheet>');
  wb.file('xl/worksheets/sheet2.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>USER_ID</t></is></c><c r="B1" t="inlineStr"><is><t>DEFAULT_MODEL</t></is></c></row><row r="2"><c r="A2" t="n"><v>998877</v></c><c r="B2" t="inlineStr"><is><t>sonar</t></is></c></row></sheetData></worksheet>');
  wb.file('xl/worksheets/sheet3.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ID</t></is></c><c r="B1" t="inlineStr"><is><t>COLLECTION_ID</t></is></c><c r="G1" t="inlineStr"><is><t>TITLE</t></is></c><c r="H1" t="inlineStr"><is><t>DESCRIPTION</t></is></c></row><row r="2"><c r="A2" t="n"><v>1</v></c><c r="B2" t="n"><v>5501</v></c><c r="G2" t="inlineStr"><is><t>Synthetic Perplexity Space</t></is></c><c r="H2" t="inlineStr"><is><t>Space notes</t></is></c></row></sheetData></worksheet>');
  wb.file('xl/worksheets/sheet4.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>NAME</t></is></c><c r="B1" t="inlineStr"><is><t>EMAIL</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Demo Perplexity</t></is></c><c r="B2" t="inlineStr"><is><t>pplx@example.test</t></is></c></row></sheetData></worksheet>');
  return wb.generateAsync({type:'nodebuffer'});
}

async function perplexityArchive(){
  const zip=new JSZip();
  zip.file('conversations-20250701_080000-abcd1234.json',JSON.stringify({
    conversations:[
      {
        context_uuid:'pplx-conv-1',
        context_title:'Synthetic Perplexity Query',
        created_at:'2025-07-01T08:00:00Z',
        updated_at:'2025-07-01T08:05:00Z',
        mode:'CONCISE',
        collection_uuid:null,
        entries:[
          {
            entry_uuid:'e-1',
            query:'Explain quantum dots for sample@example.test',
            answer:'Quantum dots are semiconductor nanocrystals [1].',
            created_at:'2025-07-01T08:00:05.000000',
            query_status:'COMPLETED',
            engine_mode:'pro'
          }
        ]
      }
    ]
  }));
  zip.file('user-data-20250701_080000-abcd1234.xlsx',await syntheticXlsx());
  return {name:'synthetic-perplexity.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})};
}

async function setup(page){
  await page.goto(viewer);
  await page.route('https://**',route=>route.abort());
}

async function add(page,file,count){
  await page.setInputFiles('#zip-input',file);
  await page.waitForFunction(expected=>exportSession.packages.length===expected,count);
}

test('Perplexity ZIP imports conversations + XLSX profile/spaces, filters with Claude, and exports safely',async({page})=>{
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});

  await setup(page);
  await add(page,await perplexityArchive(),1);
  await page.evaluate(()=>openConv('perplexity:pplx-conv-1'));

  await expect(page.locator('#messages')).toContainText('Perplexity');
  await expect(page.locator('#messages .msg-wrap.perplexity .msg-avatar')).toContainText('❖');
  await expect(page.locator('#messages')).toContainText('Quantum dots are semiconductor nanocrystals');

  // Safe export redacts email and uses Perplexity label
  expect(await page.evaluate(async()=>{
    const result=await featureRequest('task','export',{uuid:'perplexity:pplx-conv-1',safe:true});
    const text=await result.blob.text();
    return {email:text.includes('sample@example.test'),perplexity:text.includes('**Perplexity**')};
  })).toEqual({email:false,perplexity:true});

  // Append Claude ZIP cleanly without account mismatch
  const claudeZip=new JSZip();
  claudeZip.file('conversations.json',JSON.stringify([{uuid:'claude-p1',name:'Synthetic Claude',account:{uuid:'claude-acc-p1'},chat_messages:[{uuid:'m1',sender:'assistant',parent_message_uuid:root,content:[{type:'text',text:'Claude answer'}]}]}]));
  await add(page,{name:'claude.zip',mimeType:'application/zip',buffer:await claudeZip.generateAsync({type:'nodebuffer'})},2);

  await page.click('#platform-filter [data-platform="perplexity"]');
  await expect(page.locator('#conv-list .conv-item')).toHaveCount(1);
  await expect(page.locator('#conv-list')).toContainText('Perplexity (Beta)');

  // Analytics filter supports perplexity
  const stats=await page.evaluate(async()=>{
    const query=platforms=>analyticsRequest('query',{filters:{range:'all',platforms}});
    const pplx=await query(['perplexity']),claude=await query(['claude']),all=await query([]);
    return {pplx:pplx.current.conversations,claude:claude.current.conversations,all:all.current.conversations};
  });
  expect(stats).toEqual({pplx:1,claude:1,all:2});

  // XLSX Spaces & User Profile imported
  const info=await page.evaluate(()=>({
    projects:allProjects.map(p=>p.name),
    users:exportSession.users.map(u=>u.sourcePlatform)
  }));
  expect(info.projects).toContain('Synthetic Perplexity Space');
  expect(info.users).toContain('perplexity');

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
