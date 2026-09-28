import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';
import catalog from '../public/stash-catalog.json' with {type:'json'};
test('stash and color edits persist per account, enforce auth, and follow account deletion',async()=>{
 const db=new PGlite();try{
 for(const f of (await readdir('netlify/database/migrations')).sort())if(!f.includes('link_owner_email'))await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));
 const alice=await seedIdentity(db,'alice'),bob=await seedIdentity(db,'bob');
 const handler=()=>createApi({query:async(s,p)=>(await db.query(s,p)).rows});let handle=handler();
 const call=async(user,path,body,origin='https://example.test')=>{const r=await handle(new Request('https://example.test/api'+path,{headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})}),{identityUser:user,ip:'test'});return {status:r.status,data:await r.json(),cache:r.headers.get('Cache-Control')};};
 const id=catalog.polishes[0].id,body={polish_id:id,expected_user_id:alice.id};
 assert.equal((await call(null,'/stash')).status,401);
 assert.equal((await call({...alice,suspended:true},'/stash')).status,403);
 assert.equal((await call(alice,'/stash/item',{...body,owned:true},'https://evil.test')).status,403);
 assert.equal((await call(alice,'/stash/item',{...body,owned:'yes'})).status,400);
 assert.equal((await call(alice,'/stash/item',{...body,polish_id:'invented',owned:true})).status,400);
 assert.equal((await call(bob,'/stash/item',{...body,owned:true})).status,409);
 assert.equal((await call(alice,'/stash/item',{...body,owned:true})).status,200);
 await call(alice,'/stash/item',{...body,owned:true}); // idempotent retry
 assert.equal((await call(alice,'/stash/color',{...body,color:{hex:'#ABC',family:'pinks'}})).status,200);
 for(const color of [{hex:'red'}, {hex:'#abc',family:'invented'}, {}, [], 'pink'])assert.equal((await call(alice,'/stash/color',{...body,color})).status,400);
 handle=handler(); // persists beyond a function instance
 const a=await call(alice,'/stash');assert.equal(a.cache,'no-store');assert.deepEqual(a.data.owned,[id]);assert.deepEqual(a.data.colors[id],{hex:'#aabbcc',family:'pinks'});
 assert.deepEqual((await call(bob,'/stash')).data,{user:{id:'bob'},owned:[],colors:{}});
 await call(bob,'/stash/item',{polish_id:id,expected_user_id:'bob',owned:true});
 await call(alice,'/stash/item',{...body,owned:false});
 assert.equal((await call(alice,'/stash')).data.owned.length,0);assert.equal((await call(bob,'/stash')).data.owned.length,1);
 assert.ok((await call(alice,'/stash')).data.colors[id]); // removing ownership retains personal colors
 await call(alice,'/stash/color',{...body,color:{hex:null,family:'reds'}});assert.deepEqual((await call(alice,'/stash')).data.colors[id],{hex:null,family:'reds'});
 await call(alice,'/stash/color',{...body,color:null});assert.deepEqual((await call(alice,'/stash')).data.colors,{});
 await call(alice,'/stash/item',{...body,owned:true});await call(alice,'/stash/color',{...body,color:{hex:'#123456'}});
 await db.query("DELETE FROM users WHERE id='alice'");
 assert.equal((await db.query("SELECT count(*)::int n FROM stash_items WHERE user_id='alice'")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM stash_colors WHERE user_id='alice'")).rows[0].n,0);
 assert.equal((await call(bob,'/stash')).data.owned.length,1);
 }finally{await db.close();}
});
