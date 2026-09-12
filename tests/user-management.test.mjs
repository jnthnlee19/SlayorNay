import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';
import {verifiedIdentityFromRequest} from '../server/identity.mjs';
import hooks from '../netlify/functions/identity-access.mjs';

test('admin suspension, restoration and deletion enforce access and preserve shared records',async()=>{
 const db=new PGlite();try{
  for(const f of ['202609060001_initial.sql','202609080001_email_identity.sql','202609090002_watchlist.sql','202609100001_community_photos.sql'])await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));
  const owner=await seedIdentity(db,'owner',true),member=await seedIdentity(db,'member');
  await db.exec(await readFile('netlify/database/migrations/202609100002_email_accounts_only.sql','utf8'));
  let account={id:member.id,email:member.email,appMetadata:{roles:['member'],other:'preserved'}},deletionFails=false;
  const missing=()=>{const e=new Error('not found');e.status=404;throw e;};
  const provider={getUser:async()=>account||missing(),updateUser:async(id,updates)=>{account={...account,appMetadata:updates.app_metadata};return account;},deleteUser:async()=>{if(deletionFails)throw Error('provider outage');account=null;}};
  const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
  const call=async(user,path,body,origin='https://example.test')=>{
   const r=await handle(new Request('https://example.test/api'+path,{headers:{origin,'content-type':'application/json'},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})}),{identityUser:user?{...user,suspended:user.id===member.id&&account?.appMetadata.gloss_or_toss_suspended===true}:null,identityAdmin:provider,ip:'test'});
   return {status:r.status,data:await r.json()};
  };
  const action=(action,extra={})=>({id:member.id,action,...extra});
  assert.equal((await call(null,'/admin/user-action',action('suspend'))).status,401);
  assert.equal((await call(member,'/admin/user-action',action('suspend'))).status,403);
  assert.equal((await call(member,'/admin/user-access?id=owner')).status,403);
  assert.equal((await call(owner,'/admin/user-action',action('suspend'),'https://evil.test')).status,403);
  assert.equal((await call(owner,'/admin/user-action',{id:'owner',action:'delete',confirmation:owner.email})).status,403);
  assert.equal((await call(owner,'/admin/user-access?id=member')).data.status,'active');
  await call(member,'/vote',{product_id:'opi-top-coat',choice:'slay'});
  await call(member,'/watchlist',{product_id:'opi-top-coat',watching:true});
  await db.query("INSERT INTO submissions(id,user_id,name,brand,category,submitter_type,consent_text,reviewed_by) VALUES('keep','member','Photo','Brand','Gel','tech','Original photo permission','member')");
  assert.equal((await call(owner,'/admin/user-action',action('suspend'))).status,200);
  assert.deepEqual(account.appMetadata.roles,['member']);assert.equal(account.appMetadata.other,'preserved');
  assert.equal((await call(owner,'/admin/user-access?id=member')).data.status,'suspended');
  for(const [path,body] of [['/vote',{product_id:'opi-bubble-bath',choice:'slay'}],['/vote/change',{product_id:'opi-top-coat',choice:'nay'}],['/watchlist',{product_id:'opi-top-coat',watching:false}],['/submissions',{}],['/profile/stats',undefined],['/identity/session',{}]])assert.equal((await call(member,path,body)).status,403,path);
  assert.equal((await call(member,'/me')).data.user,null);
  assert.ok((await call(member,'/products')).data.products.every(p=>!p.my_vote&&!p.watching));
  assert.equal((await db.query('SELECT count(*)::int n FROM votes')).rows[0].n,1);
  assert.equal((await call(owner,'/admin/user-action',action('enable'))).status,200);
  assert.equal((await call(member,'/profile/stats')).data.watchlist,1);
  assert.equal((await call(member,'/identity/session',{})).status,200);
  assert.equal((await call(owner,'/admin/user-action',action('delete',{confirmation:'wrong'}))).status,400);
  assert.equal((await call(member,'/profile/stats')).status,200);
  deletionFails=true;
  assert.equal((await call(owner,'/admin/user-action',action('delete',{confirmation:member.email}))).status,503);
  assert.equal((await call(owner,'/admin/user-access?id=member')).data.status,'deletion-pending');
  assert.equal((await call(member,'/identity/session',{})).status,403);
  assert.equal((await call(owner,'/admin/user-action',action('enable'))).status,409);
  deletionFails=false;
  assert.equal((await call(owner,'/admin/user-action',action('delete',{confirmation:member.email}))).status,200);
  // Even a previously verified/in-flight identity cannot recreate the profile.
  assert.equal((await call(member,'/identity/session',{})).status,403);
  assert.equal(account,null);
  assert.equal((await db.query('SELECT count(*)::int n FROM votes')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM watchlist')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM products')).rows[0].n,4);
  const sub=(await db.query("SELECT * FROM submissions WHERE id='keep'")).rows[0];
  assert.equal(sub.user_id,null);assert.equal(sub.reviewed_by,null);assert.equal(sub.consent_text,'Original photo permission');
 }finally{await db.close();}
});

test('provider protected metadata blocks login and is read fresh for existing sessions',async()=>{
 let denied=false;hooks.userLogin({user:{appMetadata:{gloss_or_toss_suspended:true}},deny(){denied=true;}});assert.equal(denied,true);
 denied=false;hooks.userLogin({user:{appMetadata:{},userMetadata:{gloss_or_toss_suspended:true}},deny(){denied=true;}});assert.equal(denied,false);
 const identity=await verifiedIdentityFromRequest(new Request('https://glossortoss.com/api/me',{headers:{cookie:'nf_jwt=existing'}}),async()=>Response.json({id:'member',email:'a@example.test',confirmed_at:'2026-01-01',app_metadata:{gloss_or_toss_suspended:true}}));
 assert.equal(identity.suspended,true);
});
