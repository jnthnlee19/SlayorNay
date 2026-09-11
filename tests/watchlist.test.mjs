import {seedIdentity} from './email-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
test('watchlists are private, persistent, idempotent, and independent of votes',async()=>{
 const db=new PGlite();
 for(const f of ['202609060001_initial.sql','202609090002_watchlist.sql','202609080001_email_identity.sql'])await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));
 const api=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
 function client(id){return async(path,body)=>{const identityUser=id?await seedIdentity(db,id):null;const r=await api(new Request('https://example.test/api'+path,{headers:{origin:'https://example.test','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{ip:'test',identityUser});return {status:r.status,data:await r.json()};};}
 const a=client('alice'),b=client('bob'),anon=client();
 const save={product_id:'opi-top-coat',watching:true};
 assert.equal((await anon('/watchlist',save)).status,401);
 assert.ok((await Promise.all(Array.from({length:5},()=>a('/watchlist',save)))).every(r=>r.status===200));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM watchlist')).rows[0].n,1);
 assert.equal((await a('/products')).data.products.find(p=>p.id===save.product_id).watching,true);
 assert.equal((await b('/products')).data.products.find(p=>p.id===save.product_id).watching,false);
 await b('/watchlist',{...save,watching:false});
 const again=client('alice');
 assert.equal((await again('/products')).data.products.find(p=>p.id===save.product_id).watching,true);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM votes')).rows[0].n,0);
 assert.equal((await a('/watchlist',{product_id:'missing',watching:true})).status,404);
 await a('/watchlist',{...save,watching:false});assert.equal((await db.query('SELECT count(*)::int AS n FROM watchlist')).rows[0].n,0);
 await a('/watchlist',save);await db.query('DELETE FROM products WHERE id=$1',[save.product_id]);assert.equal((await db.query('SELECT count(*)::int AS n FROM watchlist')).rows[0].n,0);
 await db.close();
});
