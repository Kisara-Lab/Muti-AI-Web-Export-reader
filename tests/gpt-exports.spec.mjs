import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import http from 'node:http';
const viewer=pathToFileURL(path.resolve('viewer.html')).href;
const root='00000000-0000-4000-8000-000000000000';
const node=(id,parent,role,text,metadata={})=>({parent,message:{id,create_time:1700000000,author:{role},content:{content_type:'text',parts:[text]},metadata}});
const conversation=()=>({id:'synthetic-id',title:'Synthetic GPT conversation',current_node:'answer',create_time:1700000000,mapping:{root:{message:null,parent:null},user:node('user','root','user','Synthetic question'),answer:node('answer','user','assistant','Visible answer sample@example.test \ue200cite\ue202turn1search0\ue201\n\ue200genui\ue202{}\ue201\n\ue200map\ue202{}\ue201',{model_slug:'synthetic-model',attachments:[{id:'file_image',name:'photo.png',mime_type:'image/png'},{id:'file_text',name:'notes.md',mime_type:'text/markdown'}],content_references:[{type:'grouped_webpages',items:[{title:'Synthetic source',url:'https://example.test/source',refs:[{turn_index:1,ref_type:'search',ref_index:0}]}]},{type:'dil',dil:{type:'Box',initialState:{file_label:'Attach file'},$onVisibleAction:'fetch("https://evil.test")',children:[{type:'Button',$label:'Upload',$onClickAction:'alert(1)'}]}},{type:'map',entities:[{name:'Synthetic place',latitude:10,longitude:20}]}]})}});
async function archive(extra={}){
  const zip=new JSZip();zip.file('conversations.json',JSON.stringify([conversation()]));zip.file('export_manifest.json',JSON.stringify({version:1,logical_files:{'conversations.json':{files:['conversations.json'],shard_count:1}}}));zip.file('user.json',JSON.stringify({id:'synthetic-gpt-account',name:'Synthetic account'}));zip.file('library_files.json',JSON.stringify([{file_id:'file_image',file_name:'photo.png',mime_type:'image/png'},{file_id:'file_text',file_name:'notes.md',mime_type:'text/markdown'}]));zip.file('file_image.dat',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64'));zip.file('file_text.dat','# Local markdown\n<script>window.injected=true</script>');zip.file('index.html','<script>throw new Error("must never execute")</script>');for(const [name,value]of Object.entries(extra))zip.file(name,JSON.stringify(value));return {name:'synthetic-gpt.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})};
}
async function setup(page){await page.goto(viewer);await page.route('https://**',route=>route.abort());}
async function add(page,file,count){await page.setInputFiles('#zip-input',file);await page.waitForFunction(count=>exportSession.packages.length===count,count);}
test('GPT ZIP integrates current path, cards, attachments, search, mixed platforms and safe export offline',async({page})=>{
  const errors=[],network=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});await setup(page);await add(page,await archive(),1);await page.evaluate(()=>openConv('gpt:synthetic-id'));
  await expect(page.locator('#messages')).toContainText('ChatGPT');await expect(page.locator('#messages')).toContainText('Synthetic source');await expect(page.locator('#messages button', {hasText:'Upload'})).toBeDisabled();await expect(page.locator('#messages svg[aria-label="坐标分布图"]')).toHaveCount(1);await expect(page.locator('#messages [data-zip-media] img')).toBeVisible();
  expect(await page.evaluate(async()=>{const result=await dataWorkerRequest('search',{query:'Synthetic place'});return result.uuids;})).toEqual(['gpt:synthetic-id']);
  const download=page.waitForEvent('download');await page.locator('#messages [data-gpt-resource]').first().click();await download;await expect(page.locator('#messages pre')).toContainText('<script>window.injected=true</script>');expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  expect(await page.evaluate(async()=>{const result=await featureRequest('task','export',{uuid:'gpt:synthetic-id',safe:true});const text=await result.blob.text();return {email:text.includes('sample@example.test'),chatgpt:text.includes('ChatGPT')};})).toEqual({email:false,chatgpt:true});
  const zip=new JSZip();zip.file('conversations.json',JSON.stringify([{uuid:'synthetic-id',name:'Synthetic Claude',account:{uuid:'claude-account'},chat_messages:[{uuid:'claude-msg',sender:'assistant',parent_message_uuid:root,content:[{type:'text',text:'Claude answer'}]}]}]));await add(page,{name:'claude.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})},2);
  await page.click('#platform-filter [data-platform="gpt"]');await expect(page.locator('#conv-list .conv-item')).toHaveCount(1);await expect(page.locator('#conv-list')).toContainText('ChatGPT');expect(await page.evaluate(()=>allConvs.length)).toBe(2);await page.click('#platform-filter [data-platform="claude"]');await expect(page.locator('#conv-list')).toContainText('Synthetic Claude');expect(errors).toEqual([]);expect(network).toEqual([]);
  const stats=await page.evaluate(async()=>{const query=platforms=>analyticsRequest('query',{filters:{range:'all',platforms}});const gpt=await query(['gpt']),claude=await query(['claude']),all=await query([]),cached=await query(['gpt']),drill=await analyticsRequest('drilldown',{filters:{range:'all',platforms:['gpt']},includeIds:true});return {gpt:gpt.current.messages,claude:claude.current.messages,all:all.current.messages,cached:cached.current.messages,ids:drill.uuids};});expect(stats).toEqual({gpt:2,claude:1,all:3,cached:2,ids:['gpt:synthetic-id']});
  const pdf=await page.evaluate(async()=>{const payload={uuid:'gpt:synthetic-id',safe:true,pdfId:'synthetic-pdf'},preview=await featureRequest('task','preview',payload),result=await featureRequest('task','pdfPage',payload);return {total:result.total,complete:preview.complete,email:JSON.stringify(result.messages).includes('sample@example.test'),attachments:result.messages.flatMap(message=>message.attachments||[]).every(att=>att._redactedMedia)};});expect(pdf).toEqual({total:2,complete:true,email:false,attachments:true});
});
test('missing shards fail atomically and independent structurally identified JSON imports',async({page})=>{
  await setup(page);await page.setInputFiles('#zip-input',await archive({'export_manifest.json':{logical_files:{'conversations.json':{files:['missing.json'],shard_count:1}}}}));await expect(page.locator('#load-zip-btn')).toContainText('失败');expect(await page.evaluate(()=>allConvs.length)).toBe(0);
  await page.evaluate(async value=>{const button=document.getElementById('load-zip-btn');await appendExportPackage(null,button,[new File([JSON.stringify(value)],'unusual-name.json',{type:'application/json'})]);},conversation());expect(await page.evaluate(()=>allConvs.map(conv=>conv.uuid))).toEqual(['gpt:synthetic-id']);
});
test('HTTP and complete offline GPT reading never execute packaged HTML or component actions',async({page})=>{
  const html=await fs.readFile('viewer.html'),server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end(html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const origin='http://127.0.0.1:'+server.address().port;const external=[];await page.route(/^https?:/,route=>route.request().url().startsWith(origin)?route.continue():(external.push(route.request().url()),route.abort()));await page.goto(origin);await add(page,await archive(),1);await page.evaluate(()=>openConv('gpt:synthetic-id'));await expect(page.locator('#messages')).toContainText('Visible answer');expect(external).toEqual([]);
    await page.goto(pathToFileURL(path.resolve('dist/offline/viewer.html')).href);await add(page,await archive(),1);await page.evaluate(()=>openConv('gpt:synthetic-id'));await expect(page.locator('#messages [data-zip-media] img')).toBeVisible();expect(external).toEqual([]);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('10k GPT nodes retain metadata-first windows and cancellation at 4x CPU',async({page})=>{
  test.setTimeout(90000);await setup(page);const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4});const value={id:'large-synthetic',title:'Large synthetic GPT',current_node:'n9999',mapping:{root:{parent:null,message:null}}};for(let index=0;index<10000;index++)value.mapping['n'+index]=node('n'+index,index?'n'+(index-1):'root',index%2?'assistant':'user','Synthetic GPT needle '+index);
  const zip=new JSZip();zip.file('unusual.json',JSON.stringify([value]));const started=Date.now();await add(page,{name:'large-synthetic.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})},1);expect(Date.now()-started).toBeLessThan(20000);await page.evaluate(()=>openConv('gpt:large-synthetic'));await expect(page.locator('#messages')).toContainText('Synthetic GPT needle 9999');expect(await page.locator('.msg-wrap').count()).toBeLessThanOrEqual(100);expect(await page.evaluate(()=>allConvs.every(conv=>!('chat_messages' in conv)))).toBe(true);
  await page.evaluate(async()=>{const old=readerSearch('needle');await newExportArchive();await old;});expect(await page.evaluate(()=>({count:allConvs.length,resources:exportSession.resources?.length||0}))).toEqual({count:0,resources:0});
});
test('wrapper-folder ZIP, nested 2026 ZIP, standalone JSON via UI, WebP .dat, and platform+search filter linkage',async({page})=>{
  await setup(page);
  // 1) Standalone GPT JSON directly via #zip-input UI
  await page.setInputFiles('#zip-input',{name:'standalone-gpt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(conversation()))});
  await page.waitForFunction(()=>allConvs.length===1);
  expect(await page.evaluate(()=>allConvs[0].uuid)).toBe('gpt:synthetic-id');

  // 2) Wrapper-folder ZIP with BOM JSON + corrupt auxiliary JSON + WebP .dat + nested 2026 ZIP
  const inner=new JSZip();
  inner.file('wrapper/export_manifest.json','\uFEFF'+JSON.stringify({version:1,logical_files:{'conversations.json':{files:['conversations-000.json'],shard_count:1}}}));
  inner.file('wrapper/conversations-000.json',JSON.stringify([{...conversation(),id:'nested-gpt',title:'Nested GPT Match'}]));
  inner.file('wrapper/library_files.json',JSON.stringify([{file_id:'webp_file',library_file_id:'lib_webp',file_name:'pic.webp',mime_type:'application/octet-stream'}]));
  inner.file('wrapper/webp_file.dat',Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8L\x0d\x00\x00\x00\x2f\x00\x00\x00\x10\x07\x10\x11\x11\x88\x88\xfe\x07\x00','binary'));
  inner.file('wrapper/broken_aux.json','{corrupt json');
  const outer=new JSZip();
  outer.file('User Online Activity/Conversations__chatgpt-0001.zip',await inner.generateAsync({type:'nodebuffer'}));
  await page.setInputFiles('#zip-input',{name:'privacy-portal-2026.zip',mimeType:'application/zip',buffer:await outer.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>allConvs.some(c=>c.uuid==='gpt:nested-gpt'));
  expect(await page.evaluate(()=>exportSession.resources.find(r=>r.fileId==='webp_file')?.mime)).toBe('image/webp');

  // 3) Search box respects active #platform-filter
  const claudeZip=new JSZip();
  claudeZip.file('conversations.json',JSON.stringify([{uuid:'claude-match',name:'Nested Claude Match',chat_messages:[{uuid:'m1',sender:'assistant',parent_message_uuid:root,content:[{type:'text',text:'hello'}]}]}]));
  await page.setInputFiles('#zip-input',{name:'claude-match.zip',mimeType:'application/zip',buffer:await claudeZip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>allConvs.some(c=>c.uuid==='claude-match'));
  await page.click('#platform-filter [data-platform="gpt"]');
  await page.fill('#search-box','Nested');
  await page.waitForTimeout(300);
  await expect(page.locator('#conv-list .conv-item')).toHaveCount(1);
  await expect(page.locator('#conv-list')).toContainText('Nested GPT Match');
});
