import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {verifiedIdentityFromRequest,identityPasswordLogin} from '../server/identity.mjs';
import {seedIdentity} from './email-fixture.mjs';
async function database(){const db=new PGlite();for(const f of ['202609060001_initial.sql','202609080001_email_identity.sql','202609090002_watchlist.sql','202609100001_community_photos.sql'])await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));return db;}

test('provider validates tokens, rejects unconfirmed emails and distinguishes login errors',async()=>{
 const request=new Request('https://glossortoss.com/api/me',{headers:{cookie:'nf_jwt=test-token'}});
 const user=await verifiedIdentityFromRequest(request,async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test-token');return Response.json({id:'trusted',email:'a@example.test',confirmed_at:'2026-09-08'});});assert.equal(user.id,'trusted');
 assert.equal(await verifiedIdentityFromRequest(request,async()=>new Response('',{status:401})),null);
 assert.equal(await verifiedIdentityFromRequest(request,async()=>Response.json({id:'unverified',email:'a@example.test'})),null);
 await assert.rejects(identityPasswordLogin('a@example.test','12345678',async()=>Response.json({error_description:'Email not confirmed'},{status:400})),e=>e.status===401&&e.code==='EMAIL_UNVERIFIED');
 await assert.rejects(identityPasswordLogin('a@example.test','12345678',async()=>Response.json({error_description:'Invalid user credentials'},{status:400})),e=>e.status===401&&!e.code);
 await assert.rejects(identityPasswordLogin('a@example.test','12345678',async()=>new Response('',{status:429})),e=>e.status===429);
 await assert.rejects(identityPasswordLogin('a@example.test','12345678',async()=>{throw Error('network');}),e=>e.status===503);
});

test('email sessions auto-create once, preserve admin and votes, and reject legacy authentication',async()=>{
 const db=await database();try{
 const owner=await seedIdentity(db,'original_owner',true);
 await db.query("INSERT INTO votes(user_id,product_id,choice) VALUES('original_owner','opi-top-coat','slay')");
 const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
 const call=async(path,body,identityUser=null,origin='https://example.test')=>{
  const r=await handle(new Request('https://example.test/api'+path,{headers:{origin,'content-type':'application/json',cookie:'__Host-son_session=obsolete'},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})}),{identityUser,ip:'test',identityPasswordLogin:async(email,password)=>{assert.equal(email,'owner@example.test');assert.equal(password,'12345678');return {access_token:'access',refresh_token:'refresh'};}});
  return {status:r.status,data:await r.json(),headers:r.headers};
 };
 assert.equal((await call('/identity/session',{}, {...owner,confirmedAt:null})).status,401);
 assert.equal((await call('/identity/session',{},owner,'https://evil.test')).status,403);
 const linked=await call('/identity/session',{},owner);assert.equal(linked.data.user.id,'original_owner');assert.equal(linked.data.user.is_admin,true);
 assert.equal((await call('/products',undefined,owner)).data.products.find(p=>p.id==='opi-top-coat').my_vote,'slay');
 const newbie={id:'new-id',email:'new@example.test',confirmedAt:'2026-09-10',userMetadata:{is_admin:true}};
 const attempts=await Promise.all([1,2,3].map(()=>call('/identity/session',{username:'original_owner',link:true},newbie)));
 assert.ok(attempts.every(r=>r.status===201||r.status===200));assert.equal((await db.query("SELECT count(*)::int n FROM users WHERE id='identity:new-id'")).rows[0].n,1);assert.equal(attempts[0].data.user.is_admin,false);
 for(const path of ['/signup','/signin','/recover','/reset-password','/identity/complete'])assert.equal((await call(path,{username:'original_owner',password:'12345678'})).status,404,path);
 assert.equal((await call('/me')).data.user,null);
 assert.equal((await call('/email-signin',{email:'owner',password:'12345678'})).status,400);
 assert.equal((await call('/email-signin',{email:'owner@example.test',password:'1234567'})).status,400);
 const login=await call('/email-signin',{email:'owner@example.test',password:'12345678'});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/nf_jwt=access/);assert.match(login.headers.get('set-cookie'),/Secure/);
 }finally{await db.close();}
});

