import test from 'node:test';
import assert from 'node:assert/strict';
import {storedPhotoKey,storedPhotoResponse,createApi} from '../server/api.mjs';
const key='12345678-1234-1234-1234-123456789abc.webp';
test('only exact public photo GETs bypass authenticated API handling',()=>{
 assert.equal(storedPhotoKey(new Request('https://example.com/api/images/'+key)),key);
 for(const path of ['/api/images/pending/'+key,'/api/admin/upload','/api/products','/api/images/'+key+'/extra'])assert.equal(storedPhotoKey(new Request('https://example.com'+path)),null);
 assert.equal(storedPhotoKey(new Request('https://example.com/api/images/'+key,{method:'POST'})),null);
});
test('stored photos use bounded private caching; missing photos are never cached',async()=>{
 const bytes=new Uint8Array([1,2,3]);const response=await storedPhotoResponse(key,{get:async()=>bytes});
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, max-age=86400');
 assert.equal(response.headers.get('Netlify-CDN-Cache-Control'),'public, durable, max-age=300');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 const missing=await storedPhotoResponse(key,{get:async()=>null});assert.equal(missing.status,404);assert.equal(missing.headers.get('Cache-Control'),'no-store');
 assert.equal(missing.headers.get('Netlify-CDN-Cache-Control'),null);
});
test('photo response does not access database or authenticated user data',async()=>{
 const handle=createApi({query:()=>{throw new Error('database must not be used');},media:{get:async()=>new Uint8Array([1])}});
 const response=await handle(new Request('https://example.com/api/images/'+key));assert.equal(response.status,200);
});
import vm from 'node:vm';
import fs from 'node:fs';
test('Netlify photo fast path never calls Identity or initializes database',async()=>{
 const source=fs.readFileSync(new URL('../netlify/functions/api.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default','const entry=').replace('export const config','const config');
 const context=vm.createContext({URL,Response,console,storedPhotoKey,storedPhotoResponse,getStore:()=>({get:async()=>new Uint8Array([1])}),getDatabase:()=>{throw Error('database called');},verifiedIdentityFromRequest:()=>{throw Error('identity called');}});
 vm.runInContext(source+'\nglobalThis.entry=entry;',context);
 assert.equal((await context.entry(new Request('https://example.com/api/images/'+key,{headers:{cookie:'nf_jwt=test-token'}}),{})).status,200);
});
