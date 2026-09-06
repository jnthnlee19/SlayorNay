import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
test('admin reset links are private, expiring, replaceable, single use and revoke sessions',async()=>{
 const db=new PGlite();try{await db.exec(await readFile('netlify/database/migrations/202609060001_initial.sql','utf8'));const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows,adminToken:'a'.repeat(30)});
 const client=()=>{let cookie='';return async(path,body)=>{const r=await handle(new Request('https://example.test/api'+path,{headers:{cookie,origin:'https://example.test','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{ip:'test'});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};};
 const admin=client(),user=client(),anon=client();await admin('/signup',{username:'owner',password:'original-password'});await admin('/admin/claim',{token:'a'.repeat(30)});const account=await user('/signup',{username:'member',password:'original-password'});const id=account.data.user.id;
 assert.equal((await anon('/admin/users')).status,401);assert.equal((await user('/admin/users')).status,403);assert.equal((await user('/admin/reset-link',{user_id:id})).status,403);
 const list=await admin('/admin/users');assert.equal(list.data.users.length,2);assert.equal(list.data.users[0].password_hash,undefined);assert.equal(list.data.users[0].recovery_hash,undefined);
 const issue=async()=>{const r=await admin('/admin/reset-link',{user_id:id});assert.equal(r.status,200);return r.data.link.split('token=')[1];};
 const old=await issue(),token=await issue();assert.equal((await anon('/reset-password',{token:old,password:'replacement-password'})).status,400);
 const attempts=await Promise.all([1,2].map(()=>anon('/reset-password',{token,password:'replacement-password'})));assert.equal(attempts.filter(r=>r.status===200).length,1);assert.equal((await user('/me')).data.user,null);
 assert.equal((await user('/signin',{username:'member',password:'original-password'})).status,401);assert.equal((await user('/signin',{username:'member',password:'replacement-password'})).status,200);
 const expired=await issue();await db.query("UPDATE settings SET value=jsonb_set(value::jsonb,'{expires}',to_jsonb((now()-interval '1 minute')::text))::text WHERE key=$1",['password-reset:'+id]);assert.equal((await anon('/reset-password',{token:expired,password:'third-password-123'})).status,400);
 }finally{await db.close();}
});
