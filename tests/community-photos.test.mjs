import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {createApi} from '../server/api.mjs';
import {PHOTO_CONSENT,PHOTO_CONSENT_VERSION,photoFilename,matchPhotoFilename} from '../public/photo-tools.mjs';

test('photo filenames match exact product IDs, including starter IDs',()=>{
 const products=[{id:'cnd-solaroil',brand:'CND',name:'SolarOil'}, {id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',brand:'Test',name:'Gel'}];
 assert.equal(matchPhotoFilename(photoFilename(products[0]),products),products[0]);
 assert.equal(matchPhotoFilename(products[1].id+'.PNG',products),products[1]);
 assert.equal(matchPhotoFilename('cnd-solaroil-wrong.jpg',products),null);
 assert.equal(matchPhotoFilename('random.jpg',products),null);
});

test('image retirement preserves products and votes; photos stay private until approved and cannot duplicate products',async()=>{
 const db=new PGlite();
 try{
 await db.exec(await readFile('netlify/database/migrations/202609060001_initial.sql','utf8'));
 await db.query("INSERT INTO users(id,username,password_hash,recovery_hash,is_admin) VALUES('owner','owner','test','test',true),('member','member','test','test',false),('other','other','test','test',false)");
 await db.query("INSERT INTO votes(user_id,product_id,choice) VALUES('member','cnd-solaroil','slay')");
 await db.exec(await readFile('netlify/database/migrations/202609100001_community_photos.sql','utf8'));
 assert.equal((await db.query("SELECT count(*)::int n FROM products WHERE image<>''")).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM retired_product_images')).rows[0].n,4);
 assert.equal((await db.query('SELECT count(*)::int n FROM votes')).rows[0].n,1);
 for(const id of ['owner','member','other'])await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[createHash('sha256').update(id).digest('hex'),id]);
 const store=new Map(),api=createApi({query:async(s,p)=>(await db.query(s,p)).rows,preview:true,media:{set:async(k,v)=>store.set(k,v),get:async k=>store.get(k)}});
 const call=async(path,user,body)=>{const res=await api(new Request('https://example.test/api'+path,{method:body?'POST':'GET',headers:{origin:'https://example.test','content-type':'application/json',...(user?{cookie:'son_session='+user}:{})},...(body?{body:JSON.stringify(body)}:{})}),{ip:'test'});return res;};
 const base64=(await sharp({create:{width:20,height:30,channels:3,background:'pink'}}).png().toBuffer()).toString('base64');
 const data={product_id:'cnd-solaroil',submitter_type:'tech',base64,photo_consent:true,consent_version:PHOTO_CONSENT_VERSION,original_filename:'my-photo.png'};
 assert.equal((await call('/submissions',null,data)).status,401);
 assert.equal((await call('/submissions','member',{...data,photo_consent:false})).status,400);
 assert.equal((await call('/submissions','member',{...data,consent_version:'old'})).status,400);
 assert.equal((await call('/submissions','member',{...data,product_id:'not-real'})).status,404);
 assert.equal((await call('/submissions','member',{...data,base64:'not an image'})).status,400);
 let res=await call('/submissions','member',data);assert.equal(res.status,201);const {id}=await res.json();
 const pending=(await db.query('SELECT * FROM submissions WHERE id=$1',[id])).rows[0];
 assert.equal(pending.consent_text,PHOTO_CONSENT);assert.ok(pending.consent_at);assert.equal(pending.image,'');
 assert.equal((await call('/submission-photo/'+id,null)).status,401);
 assert.equal((await call('/submission-photo/'+id,'other')).status,404);
 assert.equal((await call('/submission-photo/'+id,'member')).status,200);
 assert.equal((await call('/submission-photo/'+id,'owner')).status,200);
 assert.equal((await call('/images/'+id+'.webp',null)).status,404);
 assert.equal((await call('/admin/review','member',{id,action:'approve'})).status,403);
 assert.equal((await call('/admin/review','owner',{id,action:'approve'})).status,200);
 assert.equal((await call('/admin/review','owner',{id,action:'approve'})).status,409);
 const image=(await db.query("SELECT image FROM products WHERE id='cnd-solaroil'")).rows[0].image;
 assert.match(image,/^\/api\/images\//);assert.equal((await call(image.slice(4),null)).status,200);
 assert.equal((await db.query('SELECT count(*)::int n FROM products')).rows[0].n,4);
 assert.equal((await db.query('SELECT count(*)::int n FROM votes')).rows[0].n,1);
 res=await call('/submissions','member',data);const rejected=await res.json();
 assert.equal((await call('/admin/review','owner',{id:rejected.id,action:'reject'})).status,200);
 assert.equal((await db.query("SELECT image FROM products WHERE id='cnd-solaroil'")).rows[0].image,image);
 assert.equal((await call('/admin/product-photo','member',{id:'cnd-solaroil',image})).status,403);
 assert.equal((await call('/admin/product-photo','owner',{id:'cnd-solaroil',image:'/api/images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp'})).status,400);
 assert.equal((await call('/admin/product-photo','owner',{id:'cnd-solaroil',image})).status,200);
 }finally{await db.close();}
});
