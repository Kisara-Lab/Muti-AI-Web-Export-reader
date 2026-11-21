import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({URL,TextEncoder,structuredClone});
const core=vm.runInContext(fs.readFileSync('src/gpt-dil.js','utf8')+';gptDilCore()',context);
const gpt=vm.runInContext(fs.readFileSync('src/gpt-format.js','utf8')+';gptExportCore()',context);
const sample='Before\n{@body const tasks = ["First","Second"]}\n{@body const [done,setDone] = DIL.useState([])}\n{@body const [city,setCity] = DIL.useState("North")}\n<box border radius="lg" padding={3}><row><text>{done.length}/{tasks.length}</text></row><box width={`${done.length/tasks.length*100}%`}/>{#each tasks as task,i}<checkbox checked={done.includes(i)} onChange={v=>setDone(old=>v?[...old,i]:old.filter(x=>x!==i))}>{task}</checkbox>{/each}<radio-group value={city} onChange={setCity}><radio value="North">North</radio><radio value="South">South</radio></radio-group><button onClick={()=>GenUI.issueNewTurn("Chosen: "+city)}>Confirm</button></box>\nAfter';
test('DIL parses nested mixed markdown, state, loops and exports visible text only',()=>{
  const program=core.parse(sample,{entities:{},state:{done:[1]}});assert.deepEqual(Array.from(program.diagnostics),[]);const result=core.materialize(program);assert.deepEqual(Array.from(result.diagnostics),[]);const text=core.summary(result.nodes);assert.match(text,/Before/);assert.match(text,/First/);assert.match(text,/\[x\] Second/);assert.match(text,/After/);assert.doesNotMatch(text,/useState|setDone|issueNewTurn/);
  const box=result.nodes.find(node=>node.name==='box'),checkbox=box.children.find(node=>node.name==='checkbox');let update=core.action(program,checkbox.events.onChange,checkbox.locals,true,program.initial);assert.deepEqual(Array.from(update.state.done),[1,0]);update=core.action(program,checkbox.events.onChange,checkbox.locals,false,update.state);assert.deepEqual(Array.from(update.state.done),[1]);const group=box.children.find(node=>node.name==='radio-group');update=core.action(program,group.events.onChange,group.locals,'South',update.state);const button=box.children.find(node=>node.name==='button');assert.equal(core.action(program,button.events.onClick,button.locals,null,update.state).message,'Chosen: South');
});
test('expression interpreter rejects prototype and arbitrary calls without execution',()=>{
  for(const source of ['globalThis.alert(1)','fetch("https://evil.test")','obj.constructor','obj["__proto__"]()'])assert.throws(()=>core.evaluate(core.expression(source),{}));assert.equal(core.evaluate(core.expression('2+3*4'),{}),14);assert.equal(core.evaluate(core.expression('true?"yes":"no"'),{}),'yes');
});
test('code and escaped tags remain literal, unknown and oversized components diagnose locally',()=>{
  const program=core.parse('`<box/>`\n```html\n<Chart/>\n```\n\\<radio/>\n<box>visible <Mystery/> suffix</box>');assert.equal(program.counts.box,1);assert.equal(program.counts.Chart,undefined);assert.ok(program.diagnostics.some(item=>item.code==='tag'));assert.match(core.summary(core.materialize(program).nodes),/suffix/);assert.equal(core.parse('x'.repeat(1048577)).diagnostics[0].code,'source-limit');assert.ok(core.parse('<box>'.repeat(65)+'</box>'.repeat(65)).diagnostics.length);
});
test('all discovered tags survive parsing and malicious actions stay inert',()=>{
  for(const name of core.tags){const result=core.parse('<'+name+'/>');assert.equal(result.counts[name],1);assert.equal(result.diagnostics.length,0);}const program=core.parse('<button onClick={()=>fetch("https://evil.test")}>No</button>');const node=core.materialize(program).nodes[0];assert.throws(()=>core.action(program,node.events.onClick,node.locals,null,{}));
});
test('conversation entity lookup follows ancestors, retains current overrides and isolates branches',()=>{
  const node=(parent,parts,metadata={})=>({parent,message:{id:parent||'root',author:{role:'assistant'},content:{content_type:'text',parts:[parts]},metadata}}),point=(name)=>({name,refs:[{turn_index:1,ref_type:'business',ref_index:0}],entity:{name,rating:4.5}}),metadata=name=>({view_state:{widgets:{map:{points:[point(name)]}}}});
  const value={id:'tree',current_node:'answer',mapping:{root:node(null,'',metadata('Ancestor')),left:node('root','',metadata('Other branch')),answer:node('root','<Entity ref="turn1business0" value={turn1business0.name}/><Rating data={turn1business0.rating}/>',{content_references:[{type:'client_defined_widget'}]})}};let result=gpt.convert(value),blocks=result.chat_messages.at(-1).content;assert.equal(blocks.length,1);assert.match(blocks[0].text,/Ancestor/);assert.doesNotMatch(blocks[0].text,/Other branch|Component data missing/);value.mapping.answer.message.metadata=metadata('Current');result=gpt.convert(value);assert.match(result.chat_messages.at(-1).content[0].text,/Current/);
});
