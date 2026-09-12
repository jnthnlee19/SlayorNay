import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';
import {PHOTO_CONSENT_VERSION} from '../public/photo-tools.mjs';
test('review edits stay private, retain originals and permissions, and publish edited content only on approval',async()=>{
 const db=new PGlite();
 try{
 for(const file of ['202609060001_initial.sql','202609080001_email_identity.sql','202609090002_watchlist.sql','202609100001_community_photos.sql','202609120001_submission_review_edits.sql','202609120002_app_readiness.sql'])await db.exec(await readFile('netlify/database/migrations/'+file,'utf8'));
 const owner=await seedIdentity(db,'review_owner',true),member=await seedIdentity(db,'review_member'),other=await seedIdentity(db,'review_other');
 const blobs=new Map(),api=createApi({query:async(s,p)=>(await db.query(s,p)).rows,media:{get:async k=>blobs.get(k),set:async(k,v)=>blobs.set(k,v)}});
 const call=(path,user,body)=>api(new Request('https://example.test/api'+path,{headers:{origin:'https://example.test','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{identityUser:user,ip:'review-test'});
 const photo=async color=>(await sharp({create:{width:12,height:18,channels:3,background:color}}).png().toBuffer()).toString('base64');
 const res=await call('/submissions',member,{submitter_type:'tech',name:'Original',brand:'Test',category:'Gel',base64:await photo('pink'),photo_consent:true,consent_version:PHOTO_CONSENT_VERSION,original_filename:'original.png'});
 assert.equal(res.status,201);const {id}=await res.json();
 const original=(await db.query('SELECT * FROM submissions WHERE id=$1',[id])).rows[0];
 const edit={id,name:'Edited',brand:'Test',category:'Top Coats',description:'Reviewed',url:'https://example.test/product',base64:await photo('white')};
 assert.equal((await call('/admin/submission-edit',member,edit)).status,403);
 assert.equal((await call('/admin/submission-edit',owner,{...edit,base64:'not an image'})).status,400);
 assert.equal((await call('/admin/submission-edit',owner,edit)).status,200);
 const draft=(await db.query('SELECT * FROM submissions WHERE id=$1',[id])).rows[0];
 assert.equal(draft.status,'pending');assert.equal(draft.photo_key,original.photo_key);assert.equal(draft.consent_text,original.consent_text);assert.ok(draft.edited_photo_key.startsWith('pending/'));
 assert.equal((await call('/submission-photo/'+id+'?edited=1',other)).status,404);
 const download=await call('/submission-photo/'+id+'?download=1',owner);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);
 assert.deepEqual(Buffer.from(await download.arrayBuffer()),blobs.get(original.photo_key));
 assert.equal((await db.query("SELECT count(*)::int n FROM products WHERE name='Edited'")).rows[0].n,0);
 assert.equal((await call('/admin/review',owner,{id,action:'approve'})).status,200);
 const product=(await db.query("SELECT * FROM products WHERE name='Edited'")).rows[0];assert.equal(product.category,'Top Coats');assert.deepEqual(blobs.get(product.image.split('/').pop()),blobs.get(draft.edited_photo_key));
 assert.equal((await call('/admin/submission-edit',owner,edit)).status,409);
 assert.equal((await call('/admin/review',owner,{id,action:'approve'})).status,409);
 // Brand-new accounts and anonymous visitors receive visible products only.
 await db.query('UPDATE products SET active=false WHERE id=$1',[product.id]);
 for(const user of [null,other,owner]){const catalog=await call('/products',user);assert.equal(catalog.headers.get('cache-control'),'no-store');assert.ok(!(await catalog.json()).products.some(p=>p.id===product.id));}
 assert.equal((await call('/vote',other,{product_id:product.id,choice:'slay'})).status,404);
 }finally{await db.close();}
});

