import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';

test('profile stats use only the signed-in member’s saved rows and track edits and removals',async()=>{
 const db=new PGlite();try{
  for(const f of ['202609060001_initial.sql','202609080001_email_identity.sql','202609090002_watchlist.sql','202609100001_community_photos.sql'])await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));
  const alice=await seedIdentity(db,'alice',true),bob=await seedIdentity(db,'bob');
  const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
  const call=async(identityUser,path,body)=>{
   const r=await handle(new Request('https://example.test/api'+path,{headers:{origin:'https://example.test','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{identityUser,ip:'test'});
   return {status:r.status,data:await r.json()};
  };
  const stats=async user=>(await call(user,'/profile/stats')).data;
  assert.equal((await call(null,'/profile/stats')).status,401);
  assert.deepEqual(await stats(alice),{rated:0,gloss:0,toss:0,watchlist:0});
  await call(alice,'/vote',{product_id:'opi-top-coat',choice:'slay'});
  await call(alice,'/vote',{product_id:'cnd-solaroil',choice:'nay'});
  await call(alice,'/watchlist',{product_id:'cnd-solaroil',watching:true});
  await call(bob,'/vote',{product_id:'opi-bubble-bath',choice:'nay'});
  assert.deepEqual(await stats(alice),{rated:2,gloss:1,toss:1,watchlist:1});
  assert.deepEqual(await stats(bob),{rated:1,gloss:0,toss:1,watchlist:0});
  await call(alice,'/vote/change',{product_id:'cnd-solaroil',choice:'slay'});
  assert.deepEqual(await stats(alice),{rated:2,gloss:2,toss:0,watchlist:1});
  await call(alice,'/watchlist',{product_id:'cnd-solaroil',watching:false});
  assert.equal((await stats(alice)).watchlist,0);
  await db.query("UPDATE products SET active=false WHERE id='cnd-solaroil'");
  assert.equal((await stats(alice)).rated,2);
  await call(alice,'/admin/delete-products',{ids:['cnd-solaroil']});
  assert.deepEqual(await stats(alice),{rated:1,gloss:1,toss:0,watchlist:0});
 }finally{await db.close();}
});
