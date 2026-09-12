import test from 'node:test';
import assert from 'node:assert/strict';
import {shareImage,canShareImage} from '../public/share-card.mjs';
test('native image sharing preserves the product link and rejects oversize files',async()=>{
 const oldWindow=globalThis.window,oldReader=globalThis.FileReader;
 const calls=[];
 try{
 globalThis.window={webkit:{messageHandlers:{shareImage:{postMessage:async data=>{calls.push(data);return {cancelled:false};}}}}};
 globalThis.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,fixture';this.onload();}};
 const file={type:'image/png',size:100};assert.equal(canShareImage({file}),true);
 await shareImage({files:[file],url:'https://glossortoss.com/#product/fixture',text:'I GLOSSED IT'});
 assert.equal(calls[0].url,'https://glossortoss.com/#product/fixture');assert.equal(calls[0].text,'I GLOSSED IT');
 await assert.rejects(()=>shareImage({files:[{type:'image/png',size:13*1024*1024}]}),/12 MB/);
 window.webkit.messageHandlers.shareImage.postMessage=async()=>({cancelled:true});
 await assert.rejects(()=>shareImage({files:[file]}),{name:'AbortError'});
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=oldReader;}
});
