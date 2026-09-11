import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {verifiedIdentityFromRequest,identityPasswordLogin} from '../server/identity.mjs';
import {seedIdentity} from './email-fixture.mjs';
async function database(){const db=new PGlite();for(const f of ['202609060001_initial.sql','202609080001_email_identity.sql','202609090002_watchlist.sql','202609100001_community_photos.sql'])await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));return db;}

test('email-only cleanup preserves admin, products, votes and photo permissions; users stay private',async()=>{
 const db=await database();try{
 const owner=await seedIdentity(db,'owner',true),member=await seedIdentity(db,'member');
 await db.query("INSERT INTO users(id,username,password_hash,recovery_hash) VALUES('old','old','secret','secret')");
 await db.query("INSERT INTO votes(user_id,product_id,choice) VALUES('owner','opi-top-coat','slay'),('old','opi-top-coat','nay')");
 await db.query("INSERT INTO submissions(id,user_id,name,brand,category,submitter_type,consent_text,reviewed_by) VALUES('photo','old','Test','Test','Gel','tech','Recorded photo permission','old')");
 await db.query("INSERT INTO sessions VALUES('old-token','owner',now()+interval '1 day')");await db.query("INSERT INTO settings VALUES('password-reset:old','obsolete')");
 await db.exec(await readFile('netlify/database/migrations/202609100002_email_accounts_only.sql','utf8'));
 assert.deepEqual((await db.query('SELECT id FROM users ORDER BY id')).rows.map(u=>u.id),['member','owner']);assert.equal((await db.query("SELECT is_admin FROM users WHERE id='owner'")).rows[0].is_admin,true);
 assert.equal((await db.query('SELECT count(*)::int n FROM products')).rows[0].n,4);assert.equal((await db.query('SELECT count(*)::int n FROM votes')).rows[0].n,1);
 const submission=(await db.query('SELECT * FROM submissions')).rows[0];assert.equal(submission.user_id,null);assert.equal(submission.reviewed_by,null);assert.equal(submission.consent_text,'Recorded photo permission');
 assert.equal((await db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,0);
 const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
 const call=async(path,identityUser)=>{const r=await handle(new Request('https://example.test/api'+path),{identityUser});return {status:r.status,data:await r.json()};};
 assert.equal((await call('/admin/users')).status,401);assert.equal((await call('/admin/users',member)).status,403);
 const users=(await call('/admin/users?search=owner%40example.test',owner)).data.users;assert.equal(users.length,1);assert.equal(users[0].email,owner.email);assert.equal(users[0].password_hash,undefined);
 assert.equal((await call('/admin/data',owner)).data.submissions[0].username,'Deleted account');
 }finally{await db.close();}
});
