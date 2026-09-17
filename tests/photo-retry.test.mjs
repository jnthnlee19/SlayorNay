import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const retry=source.slice(source.indexOf('function retryProductPhoto('),source.indexOf("document.addEventListener('error'",source.indexOf('function retryProductPhoto(')));
test('failed product image retries once without replacing the card or voting',()=>{
 let pending;const p={image:'/api/images/photo.webp'};
 const context=vm.createContext({setTimeout:fn=>pending=fn,product:()=>p});vm.runInContext(retry,context);
 const img={dataset:{productPhoto:'a'},getAttribute:()=>p.image,isConnected:true};
 assert.equal(context.retryProductPhoto(img),true);pending();assert.equal(img.src,p.image);assert.equal(img.loading,'eager');
 assert.equal(context.retryProductPhoto(img),false);
});
test('retry ignores cards removed by navigation or products with changed images',()=>{
 let pending;const p={image:'old'};const context=vm.createContext({setTimeout:fn=>pending=fn,product:()=>p});vm.runInContext(retry,context);
 const img={dataset:{productPhoto:'a'},getAttribute:()=> 'old',isConnected:false};
 context.retryProductPhoto(img);pending();assert.equal(img.src,undefined);
 img.dataset={productPhoto:'a'};img.isConnected=true;context.retryProductPhoto(img);p.image='new';pending();assert.equal(img.src,undefined);
});
