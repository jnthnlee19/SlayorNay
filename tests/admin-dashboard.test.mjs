import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';
test('admin dashboard counts and recent-user search use actual profiles, with pagination and admin access',async()=>{
 const db=new PGlite();try{
  for(const f of (await readdir('netlify/database/migrations')).sort())if(!f.includes('link_owner_email'))await db.exec(await readFile('netlify/database/migrations/'+f,'utf8'));
  const owner=await seedIdentity(db,'owner',true),member=await seedIdentity(db,'member');
  await seedIdentity(db,'old');await db.query("UPDATE users SET created_at=now()-interval '8 days' WHERE id='old'");
  for(let i=0;i<51;i++)await seedIdentity(db,'recent'+String(i).padStart(2,'0'));
  const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows});
  const call=async(user,path)=>{const r=await handle(new Request('https://example.test/api'+path),{identityUser:user,ip:'test'});return {status:r.status,data:await r.json()};};
  for(const path of ['/admin/data','/admin/users?scope=new']){assert.equal((await call(null,path)).status,401);assert.equal((await call(member,path)).status,403);}
  assert.deepEqual((await call(owner,'/admin/data')).data.user_counts,{total:54,recent:53});
  const first=(await call(owner,'/admin/users?scope=new')).data.users;
  assert.equal(first.length,51);assert.ok(first.every(u=>u.id!=='old'));
  const next=(await call(owner,'/admin/users?scope=new&offset=50')).data.users;
  assert.equal(next.length,3);assert.ok(next.every(u=>!first.slice(0,50).some(v=>u.id===v.id)));
  assert.equal((await call(owner,'/admin/users?scope=new&search=old')).data.users.length,0);
  assert.equal((await call(owner,'/admin/users?search=OLD%40example.test')).data.users[0].id,'old');
  assert.equal((await call(owner,'/admin/users?scope=new&search=MEMBER%40example.test')).data.users[0].id,'member');
  await db.query("DELETE FROM users WHERE id='member'");
  assert.deepEqual((await call(owner,'/admin/data')).data.user_counts,{total:53,recent:52});
 }finally{await db.close();}
});
