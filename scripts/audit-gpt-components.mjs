import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import JSZip from 'jszip';
import {chromium} from '@playwright/test';

const archive=process.argv[2];
if(!archive)throw new Error('Usage: node scripts/audit-gpt-components.mjs <authorized-export.zip> [--browser]');
const output=path.resolve('dist/private-gpt-audit');await fs.mkdir(output,{recursive:true});
const zip=await JSZip.loadAsync(await fs.readFile(archive)),context=vm.createContext({URL,TextEncoder,structuredClone});
vm.runInContext(await fs.readFile('src/gpt-dil.js','utf8')+'\n'+await fs.readFile('src/gpt-format.js','utf8'),context);
const gpt=vm.runInContext('gptExportCore()',context),dil=vm.runInContext('gptDilCore()',context),conversations=[];
for(const entry of Object.values(zip.files))if(/(?:^|\/)conversations(?:[-_\d]*)\.json$/.test(entry.name))conversations.push(...JSON.parse(await entry.async('string')));
const report={conversations:conversations.length,messages:0,programs:0,tags:{},attributeCombinations:{},expressionKinds:{},stateDeclarations:0,diagnostics:[],missing:[],screenshots:[],browserErrors:[],elapsedMs:0};
function inventory(value){if(!value||typeof value!=='object')return;if(value.kind)report.expressionKinds[value.kind]=(report.expressionKinds[value.kind]||0)+1;if(value.kind==='element'){const combination=value.name+': '+Object.keys(value.attrs||{}).sort().join(', ');report.attributeCombinations[combination]=(report.attributeCombinations[combination]||0)+1;}for(const child of Object.values(value))if(child&&typeof child==='object'){if(Array.isArray(child))for(const item of child)inventory(item);else inventory(child);}}
const started=performance.now(),converted=conversations.map(value=>gpt.convert(value));
for(const [conversationIndex,conversation]of converted.entries())for(const [messageIndex,message]of conversation.chat_messages.entries()){
  report.messages++;
  for(const [blockIndex,block]of message.content.entries())if(block.gptProgram){report.programs++;inventory(block.gptProgram.nodes);inventory(block.gptProgram.declarations);report.stateDeclarations+=block.gptProgram.declarations.filter(item=>item.setter).length;for(const [tag,count]of Object.entries(block.gptProgram.counts||{}))report.tags[tag]=(report.tags[tag]||0)+count;const result=dil.materialize(block.gptProgram);for(const item of result.diagnostics)report.diagnostics.push({conversationIndex,messageIndex,blockIndex,...item});}
}
report.elapsedMs=Math.round(performance.now()-started);
if(process.argv.includes('--browser')){
  const executable=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined,browser=await chromium.launch({headless:true,...(executable&&existsSync(executable)?{executablePath:executable}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',error=>report.browserErrors.push(error.message));await page.goto(pathToFileURL(path.resolve('viewer.html')).href);await page.route(/^https?:/,route=>route.abort());
    await page.setInputFiles('#zip-input',path.resolve(archive));await page.waitForFunction(count=>allConvs.length===count,conversations.length);
    for(const [conversationIndex,conversation]of converted.entries()){
      await page.evaluate(uuid=>openConv(uuid),conversation.uuid);
      const targets=conversation.chat_messages.map((message,index)=>message.content.some(block=>block.gptProgram)?index:-1).filter(index=>index>=0);
      for(const messageIndex of targets){
        const message=conversation.chat_messages[messageIndex];
        await page.evaluate(async uuid=>{const selected=await featureRequest('reader','window',{mode:'full',start:0,end:100});let target=selected.messages.find(message=>message.uuid===uuid);if(!target){for(let start=selected.end;start<selected.total&&!target;){const next=await featureRequest('reader','window',{mode:'full',start,end:Math.min(start+100,selected.total)});target=next.messages.find(message=>message.uuid===uuid);if(next.end<=start)break;start=next.end;}}if(!target)throw Error('Audit message missing');document.getElementById('messages').innerHTML=renderMsg(target);},message.uuid);
        await page.locator('#messages').screenshot({path:path.join(output,'conversation-'+conversationIndex+'-message-'+messageIndex+'.png')});report.screenshots.push({conversationIndex,messageIndex});
        const missing=await page.locator('#messages .gpt-dil-missing').allTextContents();for(const reason of missing)report.missing.push({conversationIndex,messageIndex,reason});
      }
    }
  }finally{await browser.close();}
}
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({conversations:report.conversations,messages:report.messages,programs:report.programs,tags:report.tags,diagnostics:report.diagnostics.length,missing:report.missing.length,screenshots:report.screenshots.length,browserErrors:report.browserErrors,elapsedMs:report.elapsedMs}));
if(report.diagnostics.length||report.browserErrors.length)process.exitCode=1;
