import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const init=source.slice(source.indexOf('async function init('),source.indexOf('\n',source.indexOf('async function init(')));
test('startup overlaps account/catalog reads but renders only after both finish',async()=>{
 const pending={},events=[],main={};
 const context=vm.createContext({initRequest:0,catalogRequest:0,state:{},$:()=>main,api:path=>new Promise(resolve=>{pending[path]=resolve;}),refresh:async data=>events.push(data),resetQueue:()=>events.push('queue'),render:async()=>events.push('render'),esc:s=>s});
 vm.runInContext(init,context);
 const run=context.init();
 assert.deepEqual(Object.keys(pending),['/me','/products']);
 pending['/products']({products:[{id:'visible',active:true}]});await Promise.resolve();assert.equal(events.length,0);
 pending['/me']({user:{id:'member'},emailIdentityEnabled:true});await run;
 assert.equal(context.state.user.id,'member');assert.equal(events[0].products[0].id,'visible');assert.deepEqual(events.slice(1),['queue','render']);
});
test('superseded startup response cannot render a stale catalog',async()=>{
 const pending=[],events=[],main={};const context=vm.createContext({initRequest:0,catalogRequest:0,state:{},$:()=>main,api:()=>new Promise(resolve=>pending.push(resolve)),refresh:async()=>events.push('refresh'),resetQueue:()=>{},render:async()=>events.push('render'),esc:s=>s});vm.runInContext(init,context);
 const first=context.init();const second=context.init();pending[2]({user:null});pending[3]({products:[]});await second;pending[0]({user:{id:'old'}});pending[1]({products:[{active:false}]});await first;
 assert.deepEqual(events,['refresh','render']);assert.equal(context.state.user,null);
});
