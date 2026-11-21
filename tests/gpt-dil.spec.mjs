import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';
const fixture=`Before components
{@body const tasks = ["First task","Second task"]}
{@body const [done,setDone] = DIL.useState([])}
{@body const [city,setCity] = DIL.useState("North")}
{@body const [month,setMonth] = DIL.useState("2027-03")}
<box border radius="lg" padding={3} gap={3}>
<title>Travel planner</title><row gap={3}><badge color="warning">Historical</badge><text size="xs">**Visible markdown**</text></row>
<radio-group value={city} onChange={setCity}><radio value="North">North</radio><radio value="South">South</radio></radio-group>
<input value={month} onChange={setMonth} placeholder="Month"/>
<text>{done.length}/{tasks.length}</text><box height="6px" width={\`\${done.length/tasks.length*100}%\`}/>
{#each tasks as task,i}<checkbox checked={done.includes(i)} onChange={v=>setDone(old=>v?[...old,i]:old.filter(x=>x!==i))}>{task}</checkbox>{/each}
<button block onClick={()=>GenUI.issueNewTurn("Trip: "+city+" "+month)}>Confirm locally</button>
</box>
<row align=center gap={3}><Entity ref="turn1business0" value={turn1business0.name}/><Rating data={turn1business0.rating}/><Link ref="turn1business0" title="Restaurant link"/><Cite refs={["turn1business0"]}/></row>
<Chart content={{"chartType":"bar","meta":{"title":"Synthetic scores","description":"Synthetic chart"},"xKey":"name","series":[{"dataKey":"score","label":"Score"}],"yAxisMin":0,"yAxisMax":5,"data":[{"name":"First","score":4.5}]}}/>
<MapWidgetV2 title="Synthetic route" origin="North" points={[{"ref":"turn1business0"},{"id":"second","name":"South place","address":"South address","latitude":34,"longitude":-118}]} groups={[{"title":"First stage","locations":[{"point_id":"turn1business0","notes":"First stop"}]}]} show_route={true}/>
<AsyncImage query="Synthetic restaurant image" aspectRatio="5:4"/>
<ReservationTimePillsRefWidget ref="turn1business0"/>
<grid columns={2}><grid-item><list><list-item><icon name="check"/>List entry</list-item></list></grid-item><grid-item><caption>Caption</caption><mark>Marked</mark><divider/></grid-item></grid>
After components`;
async function load(page,options={}){
  await page.goto(pathToFileURL(path.resolve(options.offline?'dist/offline/viewer.html':'viewer.html')).href);await page.route(/^https?:/,route=>route.abort());
  const metadata={view_state:{root:{done:[1]},widgets:{map:{points:[{name:'Synthetic restaurant',latitude:37,longitude:-122,refs:[{turn_index:1,ref_type:'business',ref_index:0}],entity:{name:'Synthetic restaurant',website_url:'https://example.test/restaurant',rating:4.5,rating_scale:5,reservations:[{date:'2027-03-04',time:'19:00',party_size:2,url:'https://example.test/book'}]}}]}}},content_references:[{type:'client_defined_widget'}]};
  const conversation={id:'dil-synthetic',title:'Synthetic components',current_node:'answer',mapping:{root:{parent:null,message:null},answer:{parent:'root',message:{id:'answer',author:{role:'assistant'},content:{content_type:'text',parts:[fixture]},metadata}}}};
  const zip=new JSZip();zip.file('conversations.json',JSON.stringify([conversation]));await page.setInputFiles('#zip-input',{name:'dil-synthetic.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});await page.waitForFunction(()=>allConvs.length===1);await page.evaluate(()=>openConv('gpt:dil-synthetic'));await expect(page.locator('.gpt-dil-title')).toContainText('Travel planner');
}
test('DIL original layout, controls, generated message, chart, map, entity and snapshot export',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await load(page);const host=page.locator('[data-gpt-program]');await expect(host).not.toContainText('Component data missing');await expect(host).not.toContainText('组件解析提示');await expect(host.locator('input[type=checkbox]').nth(1)).toBeChecked();await host.locator('input[type=radio][value=South]').check();await host.locator('input[type=text]').fill('2027-04');await host.locator('input[type=text]').dispatchEvent('change');await host.locator('input[type=checkbox]').first().check();await expect(host).toContainText('2/2');await host.getByRole('button',{name:'Confirm locally'}).click();await expect(host.locator('textarea')).toHaveValue('Trip: South 2027-04');await expect(host.locator('.gpt-dil-chart svg rect')).toHaveCount(1);await expect(host.locator('.gpt-dil-map svg circle')).toHaveCount(2);await expect(host).toContainText('Synthetic restaurant');await expect(host).toContainText('2027-03-04');await expect(host.locator('strong',{hasText:'Visible markdown'})).toBeVisible();await expect(host.locator('mark')).toContainText('Marked');
  const results=await page.evaluate(async()=>{const payload=conversationTaskPayload(),preview=await featureRequest('task','preview',payload),markdown=await featureRequest('task','export',payload),pdf=await featureRequest('task','pdfPage',{...payload,pdfId:'synthetic-dil'});return {markdown:await markdown.blob.text(),pdf:JSON.stringify(pdf),complete:preview.complete};});expect(results.complete).toBe(true);expect(results.markdown).toContain('2027-04');expect(results.markdown).toContain('[x] First task');expect(results.markdown).not.toContain('useState');expect(results.pdf).toContain('2027-04');expect(results.pdf).not.toContain('issueNewTurn');expect(errors).toEqual([]);await page.screenshot({path:'test-results/gpt-dil-synthetic-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/gpt-dil-synthetic-mobile.png',fullPage:true});
});
test('DIL reset, state isolation, literal code, hostile actions and safe snapshots',async({page})=>{
  await load(page);const host=page.locator('[data-gpt-program]');await host.locator('input[type=radio][value=South]').check();await host.getByRole('button',{name:'重置为导出状态'}).click();await expect(host.locator('input[type=radio][value=North]')).toBeChecked();
  const result=await page.evaluate(async()=>{const program=gptDilCore().parse('<box><text>private@example.test</text><button onClick={()=>fetch("https://evil.test")}>Unsafe</button></box>',{entities:{}}),conversation={uuid:'safe-synthetic',chat_messages:[{uuid:'safe-message',sender:'assistant',content:[{type:'text',text:'private@example.test',gptProgram:program}]}]};const pdf=await featureRequest('task','pdfPage',{conversation,safe:true,pdfId:'safe-dil'});return JSON.stringify(pdf);});expect(result).not.toContain('private@example.test');expect(result).not.toContain('https://evil.test');
  await page.evaluate(()=>newExportArchive());expect(await page.evaluate(()=>gptDilPrograms.size)).toBe(0);
});
test('DIL complete offline bundle restores controls with network unavailable',async({page})=>{
  await load(page,{offline:true});await expect(page.locator('[data-gpt-program] input[type=radio]')).toHaveCount(2);await expect(page.locator('.gpt-dil-chart')).toContainText('Synthetic scores');
});
