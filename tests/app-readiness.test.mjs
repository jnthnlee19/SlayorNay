import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';
test('self deletion and report moderation preserve shared products and other members',async()=>{
 const db=new PGlite();try{
 for(const f of (await readdir('netlify/database/migrations')).sort()){if(f.includes('owner_repair'))continue; if(f==='202609090001_owner_email_repair.sql')continue; const sql=await readFile('netlify/database/migrations/'+f,'utf8');if(sql.includes('glossortossapp@gmail.com'))continue;await db.exec(sql);}
 const owner=await seedIdentity(db,'owner',true),member=await seedIdentity(db,'member'),other=await seedIdentity(db,'other');
 const photo='12345678-1234-1234-1234-123456789abc.webp',bytes=new Map([['pending/photo.webp',new Uint8Array([1])],[photo,new Uint8Array([2])]]);
 let account={email:member.email,appMetadata:{}},failPhoto=true;
 const provider={getUser:async()=>account,updateUser:async(id,u)=>{account={...account,appMetadata:u.app_metadata};return account;},deleteUser:async()=>{account=null;}};
 const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows,media:{get:async k=>bytes.get(k),delete:async k=>{if(failPhoto)throw Error('storage outage');bytes.delete(k);}}});
 const call=async(u,path,body)=>{const r=await handle(new Request('https://example.test/api'+path,{headers:{origin:'https://example.test','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{identityUser:u,identityAdmin:provider,ip:'fixture'});return {status:r.status,data:await r.json()};};
 assert.equal((await call(null,'/account/delete',{confirmation:member.email})).status,401);
 await call(member,'/vote',{product_id:'opi-top-coat',choice:'slay'});await call(other,'/vote',{product_id:'opi-top-coat',choice:'nay'});await call(member,'/watchlist',{product_id:'opi-top-coat',watching:true});
 assert.equal((await call(member,'/reports',{product_id:'opi-top-coat',reason:'Inappropriate content',details:'Please review'})).status,200);
 assert.equal((await call(member,'/admin/reports')).status,403);
 const reports=(await call(owner,'/admin/reports')).data.reports;assert.equal(reports.length,1);
 assert.equal((await call(owner,'/admin/report-resolve',{id:reports[0].id})).status,200);
 await db.query("INSERT INTO submissions(id,user_id,name,brand,category,submitter_type,photo_key,image,approved_product_id,description,status) VALUES('photo','member','OPI Top Coat','OPI','Gel','tech','pending/photo.webp',$1,'opi-top-coat','My description','approved')",['/api/images/'+photo]);
 await db.query("UPDATE products SET image=$1,description='My description' WHERE id='opi-top-coat'",['/api/images/'+photo]);
 assert.equal((await call(member,'/account/delete',{confirmation:other.email,id:other.id})).status,400);
 assert.equal((await call(member,'/account/delete',{confirmation:member.email})).status,503);
 assert.equal((await db.query("SELECT count(*)::int n FROM submissions WHERE user_id='member'")).rows[0].n,1);
 failPhoto=false;assert.equal((await call(member,'/account/delete',{confirmation:member.email})).status,200);
 assert.equal(account,null);assert.equal(bytes.size,0);
 for(const table of ['users','votes','watchlist','submissions','content_reports']){const column=table==='users'?'id':'user_id';assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE ${column}='member'`)).rows[0].n,0,table);}
 const p=(await db.query("SELECT * FROM products WHERE id='opi-top-coat'")).rows[0];assert.equal(p.image,'');assert.equal(p.description,'');assert.equal(p.active,true);
 assert.equal((await db.query("SELECT count(*)::int n FROM votes WHERE user_id='other'")).rows[0].n,1);
 assert.equal((await call(member,'/identity/session',{})).status,403);
 }finally{await db.close();}
});
