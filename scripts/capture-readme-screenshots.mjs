import {chromium} from 'playwright';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const imageDir=path.join(root,'docs','images');
await fs.mkdir(imageDir,{recursive:true});
const systemChrome=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined;
const executablePath=process.env.CHROME_PATH||systemChrome;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(root,'viewer.html')).href);
  await page.setInputFiles('#zip-input',path.join(root,'docs','demo','claude-rescue-reader-synthetic-demo.zip'));
  await page.waitForFunction(()=>allConvs.length===50&&allProjects.length===5);
  await page.locator('.conv-item').filter({hasText:'北辰咖啡'}).first().click();
  await page.waitForFunction(()=>currentConv&&currentConv.name.includes('北辰咖啡')&&document.querySelectorAll('.msg-wrap').length>=5);
  await page.waitForTimeout(500);
  await page.evaluate(()=>{document.getElementById('messages').scrollTo(0,0);});
  await page.waitForTimeout(100);
  await page.screenshot({path:path.join(imageDir,'viewer-overview.png')});

  await page.setViewportSize({width:1700,height:900});
  await page.locator('#toggle-summary').click();
  await page.waitForFunction(()=>!document.getElementById('summary').classList.contains('hidden'));
  await page.locator('#summary').screenshot({path:path.join(imageDir,'conversation-summary.png')});
  await page.evaluate(()=>{if(!document.getElementById('summary').classList.contains('hidden'))toggleSummary();document.getElementById('summary').style.display='none';});

  await page.setViewportSize({width:1440,height:1600});
  await page.locator('.tab-btn[data-ui-value="projects"]').click();
  await page.waitForFunction(()=>convProjectMapReady);
  await page.locator('.proj-card').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.match-panel').length>=3);
  const methods=await page.evaluate(()=>[...new Set(Object.values(convProjectEvidence).map(item=>item.method))]);
  for(const method of['file','knowledge','keyword'])if(!methods.includes(method))throw new Error(`README demo is missing ${method} project evidence`);
  await page.evaluate(()=>document.getElementById('messages').scrollTo(0,0));
  await page.screenshot({path:path.join(imageDir,'project-associations.png')});

  await page.setViewportSize({width:1440,height:900});
  await page.locator('.tab-btn[data-ui-value="memory"]').click();
  await page.waitForFunction(()=>document.getElementById('conv-list').textContent.includes('工作背景')&&document.getElementById('conv-list').textContent.includes('北辰咖啡'));
  await page.screenshot({path:path.join(imageDir,'memory-view.png')});

  await page.locator('.tab-btn[data-ui-value="behavior"]').click();
  await page.waitForSelector('[data-behavior-arena="true"]');
  await page.waitForSelector('[data-behavior-codex="true"]');
  await page.locator('[data-behavior-arena="true"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(imageDir,'behavior-arena.png')});
  console.log(`README screenshots written to ${path.relative(root,imageDir)}`);
}finally{await browser.close();}
