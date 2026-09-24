import test from 'node:test';
import assert from 'node:assert/strict';
import {firstPhotoState} from '../public/vote-welcome.mjs';
const main=(image,hasCard=true,error=false)=>({querySelector:s=>s.includes('retry')?(error?{}:null):hasCard?{querySelector:()=>image}:null});
test('welcome waits for the actual first image, including complete-but-broken images',()=>{
 assert.equal(firstPhotoState(main(null,false)),'loading');
 assert.equal(firstPhotoState(main({complete:false,naturalWidth:0})),'loading');
 assert.equal(firstPhotoState(main({complete:true,naturalWidth:0})),'loading');
 assert.equal(firstPhotoState(main({complete:true,naturalWidth:800})),'ready');
});
test('empty deck and missing-photo cards are usable; API errors remain accessible',()=>{
 assert.equal(firstPhotoState(main(null)),'ready');
 assert.equal(firstPhotoState(main(null,false,true)),'error');
});
