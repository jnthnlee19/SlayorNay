import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createApi } from '../server/api.mjs';
const db=new PGlite();
await db.exec(await readFile('netlify/database/migrations/202609060001_initial.sql','utf8'));
const adminToken='test-only-admin-setup-token-000000000000000';
const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows,adminToken});
function client(){let cookie='';return {get cookie(){return cookie;},async call(path,body,extra={}){const response=await handle(new Request('https://example.test/api'+path,{headers:{cookie,origin:'https://example.test','content-type':'application/json',...extra},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})}),{ip:'127.0.0.1'});const newCookie=response.headers.get('set-cookie');if(newCookie)cookie=newCookie.split(';')[0];return {status:response.status,data:await response.json(),headers:response.headers};}};}
const alice=client(),bob=client(),anon=client();let recovery;
test('public catalog starts without fabricated votes; anonymous writes are blocked',async()=>{
 const r=await anon.call('/products');assert.equal(r.status,200);assert.equal(r.data.products.length,4);assert.ok(r.data.products.every(p=>p.total===0));assert.equal(r.data.daily.slay,null);
 assert.equal((await anon.call('/vote',{product_id:'opi-bubble-bath',choice:'slay'})).status,401);
 assert.equal((await anon.call('/admin/data')).status,401);
});
test('signup stores password hashes and sets secure HttpOnly cookies',async()=>{
 const r=await alice.call('/signup',{username:'alice',password:'test-password-12345'});assert.equal(r.status,201);assert.equal(r.data.user.is_admin,false);assert.equal(r.data.recovery.length,40);recovery=r.data.recovery;
 assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
 const stored=(await db.query("SELECT * FROM users WHERE username='alice'")).rows[0];assert.notEqual(stored.password_hash,'test-password-12345');assert.notEqual(stored.recovery_hash,recovery);
 assert.equal((await alice.call('/me')).data.user.username,'alice');
 assert.equal((await bob.call('/signup',{username:'bob',password:'other-password-123'})).status,201);
 assert.equal((await anon.call('/signup',{username:'ALICE',password:'other-password-123'})).status,409);
});
test('duplicate and concurrent votes count once; saved vote belongs to account',async()=>{
 const responses=await Promise.all(Array.from({length:8},()=>alice.call('/vote',{product_id:'opi-bubble-bath',choice:'slay'})));
 assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(responses.filter(r=>r.status===409).length,7);
 const p=(await alice.call('/products')).data.products.find(p=>p.id==='opi-bubble-bath');assert.equal(p.total,1);assert.equal(p.slays,1);assert.equal(p.my_vote,'slay');
 assert.equal((await bob.call('/vote',{product_id:'opi-bubble-bath',choice:'nay'})).status,201);
 assert.equal((await bob.call('/vote',{product_id:'opi-big-apple-red',choice:'evil'})).status,400);
 assert.equal((await bob.call('/vote',{product_id:'missing',choice:'nay'})).status,404);
 const otherDevice=client();assert.equal((await otherDevice.call('/signin',{username:'alice',password:'test-password-12345'})).status,200);assert.equal((await otherDevice.call('/products')).data.products.find(p=>p.id==='opi-bubble-bath').my_vote,'slay');
});
test('cross-origin requests and unsafe links are rejected',async()=>{
 assert.equal((await bob.call('/submissions',{}, {origin:'https://evil.test'})).status,403);
 assert.equal((await bob.call('/submissions',{name:'X',brand:'Y',category:'Gel',url:'javascript:alert(1)',submitter_type:'tech'})).status,400);
 assert.equal((await bob.call('/admin/products',{name:'X',brand:'Y',category:'Gel'})).status,403);
});
test('admin claim requires secret and is single-use; submissions are moderated',async()=>{
 assert.equal((await alice.call('/admin/claim',{token:'wrong'})).status,403);
 assert.equal((await alice.call('/admin/claim',{token:adminToken})).status,200);
 assert.equal((await bob.call('/admin/claim',{token:adminToken})).status,409);
 assert.equal((await bob.call('/submissions',{name:'Test Gel',brand:'Test Brand',category:'Gel',url:'https://example.com/product',submitter_type:'brand'})).status,201);
 const before=(await bob.call('/products')).data.products.length;
 const submission=(await alice.call('/admin/data')).data.submissions[0];assert.equal(submission.submitter_type,'brand');
 assert.equal((await alice.call('/admin/review',{id:submission.id,action:'approve'})).status,200);
 assert.equal((await alice.call('/admin/review',{id:submission.id,action:'approve'})).status,409);
 assert.equal((await bob.call('/products')).data.products.length,before+1);
 const added=await alice.call('/admin/products',{name:'Test Finish',brand:'Test Brand',category:'Prep & finish',affiliate:true,url:'https://example.com/buy'});assert.equal(added.status,200);
 assert.equal((await alice.call('/admin/products',{id:added.data.id,name:'Test Finish',brand:'Test Brand',category:'Prep & finish',active:false})).status,200);
 assert.equal((await bob.call('/vote',{product_id:added.data.id,choice:'slay'})).status,404);
});
test('password recovery rotates code and revokes old sessions',async()=>{
 const previous=alice.cookie;const r=await anon.call('/recover',{username:'alice',password:'replacement-password-123',recovery});assert.equal(r.status,200);assert.notEqual(r.data.recovery,recovery);
 assert.equal((await alice.call('/me')).data.user,null);
 assert.equal((await bob.call('/recover',{username:'alice',password:'replacement-password-456',recovery})).status,401);
 assert.equal((await anon.call('/signout',{})).status,200);assert.equal((await anon.call('/me')).data.user,null);assert.ok(previous);
});
test('daily highlights use only yesterday and require at least ten votes',async()=>{
 for(let i=0;i<12;i++){await db.query('INSERT INTO users(id,username,password_hash,recovery_hash) VALUES($1,$2,$3,$4)',['seed'+i,'seed'+i,'unused','unused']);await db.query("INSERT INTO votes(user_id,product_id,choice,created_at) VALUES($1,'opi-big-apple-red','slay',(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '2 hours')",['seed'+i]);}
 const r=await anon.call('/products');assert.equal(r.data.daily.slay.id,'opi-big-apple-red');assert.equal(r.data.daily.slay.total,12);assert.equal(r.data.daily.nay,null);
});
test('expired sessions are rejected and repeated sign-in failures are limited',async()=>{
 await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");assert.equal((await bob.call('/me')).data.user,null);
 let last;for(let i=0;i<35;i++)last=await anon.call('/signin',{username:'missing',password:'incorrect-password-123'});assert.equal(last.status,429);
});
test.after(async()=>db.close());
test('admin can add a custom category and edit a product without replacing its votes',async()=>{
 await db.query("DELETE FROM rate_limits"); const owner=client(),voter=client();await owner.call('/signup',{username:'categoryowner',password:'category-test-password'});await voter.call('/signup',{username:'categoryvoter',password:'category-test-password'});await db.query("UPDATE users SET is_admin=true WHERE username='categoryowner'");
 const created=await owner.call('/admin/products',{name:'Custom category fixture',brand:'Fixture',category:'Nail art supplies'});assert.equal(created.status,200);
 const id=created.data.id;assert.equal((await voter.call('/vote',{product_id:id,choice:'slay'})).status,201);
 assert.equal((await owner.call('/admin/products',{id,name:'Renamed fixture',brand:'Fixture',category:'Storage & organizers',active:false})).status,200);
 const row=(await db.query('SELECT * FROM products WHERE id=$1',[id])).rows[0];assert.equal(row.category,'Storage & organizers');assert.equal(row.active,false);assert.equal((await db.query('SELECT count(*)::int AS n FROM votes WHERE product_id=$1',[id])).rows[0].n,1);
});
test('deletion is admin-only and removes product votes; category moves preserve data',async()=>{
 await db.query('DELETE FROM rate_limits');const owner=client(),voter=client();await owner.call('/signup',{username:'deleteowner',password:'deletion-test-password'});await voter.call('/signup',{username:'deletevoter',password:'deletion-test-password'});await db.query("UPDATE users SET is_admin=true WHERE username='deleteowner'");
 const a=(await owner.call('/admin/products',{name:'Delete fixture',brand:'Fixture',category:'Delete category'})).data.id;
 await voter.call('/vote',{product_id:a,choice:'slay'});
 assert.equal((await voter.call('/admin/delete-products',{ids:[a]})).status,403);assert.equal((await anon.call('/admin/delete-products',{ids:[a]})).status,401);
 assert.equal((await voter.call('/admin/category',{from:'Delete category',to:'Moved'})).status,403);
 const move=await owner.call('/admin/category',{from:'Delete category',to:'Moved'});assert.equal(move.data.updated,1);assert.equal((await db.query('SELECT category FROM products WHERE id=$1',[a])).rows[0].category,'Moved');assert.equal((await db.query('SELECT count(*)::int n FROM votes WHERE product_id=$1',[a])).rows[0].n,1);
 const gone=await owner.call('/admin/delete-products',{ids:[a]});assert.equal(gone.status,200);assert.deepEqual(gone.data.deleted,[a]);assert.equal((await db.query('SELECT * FROM products WHERE id=$1',[a])).rows.length,0);assert.equal((await db.query('SELECT * FROM votes WHERE product_id=$1',[a])).rows.length,0);assert.equal((await voter.call('/vote',{product_id:a,choice:'nay'})).status,404);
 assert.equal((await owner.call('/admin/delete-products',{ids:[]})).status,400);
});
