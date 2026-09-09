import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi,communityRating} from '../server/api.mjs';
test('verdict thresholds use exact share and require ten votes',()=>{
 for(const [slays,total,expected] of [[9,9,'pending'],[0,10,'nay'],[49,100,'nay'],[50,100,'slay'],[849,1000,'slay'],[85,100,'grail'],[10,10,'grail']])assert.equal(communityRating({slays,total}).verdict,expected);
});
test('trend requires both windows and a five point change',()=>{
 const rate=(a,b,n=20)=>communityRating({recent_total:n,previous_total:20,recent_slays:a,previous_slays:b}).trend;
 assert.equal(rate(16,10).direction,'up');assert.equal(rate(10,16).direction,'down');assert.equal(rate(10,10).direction,'steady');assert.equal(rate(11,10).direction,'up');assert.equal(rate(9,10).direction,'down');assert.equal(rate(4,10,4).direction,'pending');
 assert.equal(communityRating({recent_total:10,recent_slays:10,previous_total:0}).trend.change,null);
});
test('rolling windows exclude older votes and compare approval independently of all-time score',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('netlify/database/migrations/202609060001_initial.sql','utf8'));
await db.exec(await readFile('netlify/database/migrations/202609090002_watchlist.sql','utf8'));
 for(let i=0;i<16;i++){
 await db.query('INSERT INTO users(id,username,password_hash,recovery_hash) VALUES($1,$1,$2,$2)',['trend'+i,'unused']);
 await db.query("INSERT INTO votes(user_id,product_id,choice,created_at) VALUES($1,'opi-bubble-bath',$2,now()-$3*interval '1 hour')",['trend'+i,i<5?'slay':'nay',i<5?1:i<10?25:49]);
 }
 const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
 const response=await handle(new Request('https://test.example/api/products'));assert.equal(response.status,200);
 const p=(await response.json()).products.find(p=>p.id==='opi-bubble-bath');
 assert.equal(p.total,16);assert.equal(p.verdict,'nay');assert.equal(p.recent_total,5);assert.equal(p.previous_total,5);assert.equal(p.trend.direction,'up');assert.equal(p.trend.change,100);
 }finally{await db.close();}
});
