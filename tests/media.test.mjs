import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {publicAddress,pageUrl,extractDetails,lookupProduct,sanitizeImage} from '../server/product-media.mjs';
import {createApi} from '../server/api.mjs';
import {seedIdentity} from './email-fixture.mjs';

test('lookup rejects internal addresses, credentials, non-HTTPS and private redirects',async()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1','fc00::1','0.0.0.0'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);
 for(const url of ['http://example.com','https://localhost','https://127.1','https://user:pass@example.com','https://example.com:8443'])assert.throws(()=>pageUrl(url));
 let calls=0;await assert.rejects(lookupProduct('https://example.com/product',{fetchHtml:async()=>{calls++;return {redirect:'https://169.254.169.254/latest/meta-data'};}}));assert.equal(calls,1);
});
test('extracts product JSON-LD and Open Graph without executing page scripts',()=>{
 const html=`<meta property="og:image" content="/photo.jpg"><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Gel & Glow","brand":{"name":"Nail Co"},"description":"<b>A gel</b>","image":["https://images.example.com/gel.png","javascript:alert(1)"]}]}</script>`;
 const d=extractDetails(html,'https://example.com/product');assert.equal(d.name,'Gel & Glow');assert.equal(d.brand,'Nail Co');assert.equal(d.description,'A gel');assert.deepEqual(d.images,['https://images.example.com/gel.png','https://example.com/photo.jpg']);
});
test('Amazon links stay usable without scraping Amazon product content',async()=>{
 let fetched=false;const result=await lookupProduct('https://amzn.to/test',{fetchHtml:()=>{fetched=true;}});assert.equal(fetched,false);assert.deepEqual(result.images,[]);assert.match(result.message,/affiliate link/);
});
test('blocked stores and missing photos have useful fallback messages',async()=>{
 const result=await lookupProduct('https://example.com/product',{fetchHtml:async()=>({html:'<title>Gel Kit</title>'})});assert.equal(result.name,'Gel Kit');assert.equal(result.images.length,0);assert.match(result.message,/upload/);
 await assert.rejects(lookupProduct('https://example.com',{fetchHtml:async()=>{throw new Error('blocked');}}),/upload/);
});
test('uploads decode and re-encode real photos, reject disguised files',async()=>{
 const input=await sharp({create:{width:20,height:10,channels:3,background:'#f33490'}}).png().toBuffer();const output=await sanitizeImage(input.toString('base64'));const meta=await sharp(output).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,20);
 await assert.rejects(sanitizeImage(Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')));
 await assert.rejects(sanitizeImage('A'.repeat(2800001)));
});
test('media endpoints require admin and uploaded photos can be saved and retrieved',async()=>{
 const db=new PGlite();await db.exec(await readFile('netlify/database/migrations/202609060001_initial.sql','utf8'));
await db.exec(await readFile('netlify/database/migrations/202609090002_watchlist.sql','utf8'));
 await db.exec(await readFile('netlify/database/migrations/202609080001_email_identity.sql','utf8'));let identityUser=null;
 const blobs=new Map();const handler=createApi({query:async(s,p)=>(await db.query(s,p)).rows,media:{set:async(k,v)=>blobs.set(k,v),get:async k=>blobs.get(k)},lookup:async()=>({name:'Test product',images:[]})});
 const call=async(path,body)=>{const response=await handler(new Request('https://example.test/api'+path,{headers:{origin:'https://example.test','content-type':'application/json'},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})}),{ip:'test',identityUser});return response;};
 assert.equal((await call('/admin/lookup',{url:'https://example.com'})).status,401);
 identityUser=await seedIdentity(db,'media_admin');
 assert.equal((await call('/admin/upload',{base64:'AA=='})).status,403);
 await db.query("UPDATE users SET is_admin=true WHERE username='media_admin'");
 assert.equal((await call('/admin/lookup',{url:'https://example.com'})).status,200);
 const photo=await sharp({create:{width:16,height:16,channels:3,background:'pink'}}).png().toBuffer();
 const uploaded=await call('/admin/upload',{base64:photo.toString('base64')});assert.equal(uploaded.status,201);const data=await uploaded.json();assert.match(data.image,/^\/api\/images\//);
 const saved=await call('/admin/products',{name:'Photo test',brand:'Test',category:'Gel',image:data.image});assert.equal(saved.status,200);
 const image=await call(data.image.slice(4));assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');assert.ok((await image.arrayBuffer()).byteLength);
 assert.equal((await call('/admin/upload',{base64:Buffer.from('not an image').toString('base64')})).status,400);
 await db.close();
});
