export const productShareUrl=id=>'https://glossortoss.com/#product/'+encodeURIComponent(id);
export function shareModel(product){
 const choice=['slay','nay'].includes(product.my_vote)?product.my_vote:null;
 const total=Number(product.total)||0,slays=Number(product.slays)||0;
 return {id:product.id,name:product.name,brand:product.brand,image:product.image,choice,
  // Unvoted cards never contain scores, even when the catalog has them.
  total:choice?total:null,percentage:choice&&total?Math.round(slays/total*100):null,
  headline:choice==='slay'?'I GLOSSED IT ✨':choice==='nay'?'I TOSSED IT ✕':'GLOSS OR TOSS?',url:productShareUrl(product.id)};
}
function loadImage(src){
 return new Promise((resolve,reject)=>{
  const image=new Image();let timer;
  image.onload=()=>{clearTimeout(timer);resolve(image);};
  image.onerror=()=>{clearTimeout(timer);reject(new Error(src==='/logo.png'?'The Gloss or Toss logo could not be loaded. Please try again.':'The product photo could not be loaded.'));};
  timer=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error('The image took too long to load.'));},12000);
  image.src=src;
 });
}
function contain(ctx,image,x,y,w,h){const ratio=Math.min(w/image.width,h/image.height);ctx.drawImage(image,x+(w-image.width*ratio)/2,y+(h-image.height*ratio)/2,image.width*ratio,image.height*ratio);}
function box(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function lines(ctx,text,width,maxLines){
 const words=String(text||'').split(/\s+/),out=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){out.push(line);line=word;}else line=next;}
 if(line)out.push(line);
 if(out.length>maxLines){out.length=maxLines;out[maxLines-1]+='…';}
 for(let i=0;i<out.length;i++)while(ctx.measureText(out[i]).width>width&&out[i].length>1)out[i]=out[i].slice(0,-2)+'…';
 return out;
}
// Dedicated artwork, not a screenshot. Layout is proportional to the chosen format.
export async function generateShareImage(product,{width=1080,height=1920}={}){
 const styles=getComputedStyle(document.documentElement),theme=Object.fromEntries(['bg-main','surface','text-main','pink-primary','pink-secondary','pink-muted','pink-soft','text-muted'].map(key=>[key,styles.getPropertyValue('--'+key).trim()]));
 const model=shareModel(product),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image generation is unavailable in this browser.');
 const scale=width/1080,H=height/scale;ctx.scale(scale,scale);
 // The endpoint resolves the approved catalog image; the revision avoids stale browser caches after replacement.
 const [logo,photo]=await Promise.all([loadImage('/logo.png'),product.image?loadImage('/api/share-photo/'+encodeURIComponent(product.id)+'?image='+encodeURIComponent(product.image)).catch(()=>null):null]);
 const bg=ctx.createLinearGradient(0,0,1080,H);bg.addColorStop(0,theme["bg-main"]);bg.addColorStop(.6,theme["pink-soft"]);bg.addColorStop(1,theme["bg-main"]);ctx.fillStyle=bg;ctx.fillRect(0,0,1080,H);
 const header=Math.min(220,H*.16),footer=Math.min(model.choice?560:460,H*.42),photoY=header+28,photoH=H-footer-photoY-20;
 contain(ctx,logo,48,18,header,header);
 ctx.textAlign='right';ctx.fillStyle=theme["pink-primary"];ctx.font='500 24px Arial';ctx.fillText('REAL REVIEWS.',1020,header*.43);ctx.fillText('FLAWLESS NAILS.',1020,header*.43+35);
 ctx.strokeStyle=theme["pink-muted"];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(60,header+8);ctx.lineTo(1020,header+8);ctx.stroke();
 box(ctx,48,photoY,984,photoH,32,theme["surface"]);
 if(photo){ctx.save();ctx.beginPath();ctx.roundRect(48,photoY,984,photoH,32);ctx.clip();contain(ctx,photo,84,photoY+36,912,photoH-72);ctx.restore();}
 else{contain(ctx,logo,140,photoY+40,800,photoH-140);ctx.textAlign='center';ctx.fillStyle=theme["text-muted"];ctx.font='28px Arial';ctx.fillText('Real products. Your honest verdict.',540,photoY+photoH-45);}
 let y=H-footer+24;ctx.textAlign='center';ctx.fillStyle=theme["text-main"];ctx.font='bold 25px Arial';ctx.fillText(lines(ctx,String(model.brand||'').toUpperCase(),920,1)[0]||'',540,y);
 ctx.font='bold 46px Georgia';ctx.fillStyle=theme["text-main"];y+=54;for(const line of lines(ctx,model.name,920,2)){ctx.fillText(line,540,y);y+=53;}
 const pillY=y+8,pillH=92;const gloss=model.choice!=='nay';const gradient=ctx.createLinearGradient(140,pillY,940,pillY+pillH);gradient.addColorStop(0,gloss?theme["pink-secondary"]:theme["text-main"]);gradient.addColorStop(.55,gloss?theme["pink-primary"]:theme["text-main"]);gradient.addColorStop(1,gloss?theme["pink-primary"]:theme["text-main"]);
 box(ctx,120,pillY,840,pillH,46,model.choice?gradient:theme["pink-secondary"]);ctx.strokeStyle=gloss?theme["pink-primary"]:theme["pink-muted"];ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=model.choice?theme["surface"]:theme["text-main"];ctx.font='bold 45px Georgia';
 const title=model.headline.replace(/ [✨✕]$/u,''),labelWidth=ctx.measureText(title).width,labelX=model.choice?514:540;
 ctx.fillText(title,labelX,pillY+61);
 // Draw the marks ourselves so phone emoji fonts cannot change their appearance.
 if(model.choice){const x=labelX+labelWidth/2+30,cy=pillY+46;ctx.save();ctx.translate(x,cy);ctx.beginPath();
  if(model.choice==='slay'){ctx.moveTo(0,-22);ctx.quadraticCurveTo(3,-3,19,0);ctx.quadraticCurveTo(3,3,0,22);ctx.quadraticCurveTo(-3,3,-19,0);ctx.quadraticCurveTo(-3,-3,0,-22);ctx.fill();}
  else{ctx.strokeStyle=theme["surface"];ctx.lineWidth=5;ctx.lineCap='round';ctx.moveTo(-12,-12);ctx.lineTo(12,12);ctx.moveTo(12,-12);ctx.lineTo(-12,12);ctx.stroke();}ctx.restore();}
 y=pillY+pillH+54;
 if(model.choice){ctx.font='bold 36px Arial';ctx.fillStyle=theme["pink-primary"];ctx.fillText(model.percentage===null?'Awaiting community votes':model.percentage+'% GLOSS',540,y);ctx.font='24px Arial';ctx.fillStyle=theme["text-muted"];ctx.fillText(model.total.toLocaleString()+' community '+(model.total===1?'vote':'votes')+' · at time of sharing',540,y+37);y+=90;}
 else y+=32;
 ctx.fillStyle=theme["text-main"];ctx.font='italic 37px Georgia';ctx.fillText('What do you think?',540,Math.min(y,H-110));
 ctx.fillStyle=theme["pink-primary"];ctx.font='bold 29px Arial';ctx.fillText('GlossOrToss.com',540,H-48);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not generate the share image.')),'image/png'));
 return {model,blob,photoAvailable:!!photo,file:new File([blob],'gloss-or-toss-'+String(model.name).replace(/[^a-z0-9]+/gi,'-').slice(0,60)+'.png',{type:'image/png'})};
}
export function nativeShareData(art){return {files:[art.file],title:art.model.name+' · Gloss or Toss',text:art.model.headline+' — '+art.model.brand+' '+art.model.name+'. What do you think?',url:art.model.url};}
export function canShareImage(art){if(window.webkit?.messageHandlers?.shareImage)return true;try{return !!navigator.share&&!!navigator.canShare?.({files:[art.file]});}catch{return false;}}

export async function shareImage(data){
 const bridge=window.webkit?.messageHandlers?.shareImage;
 if(!bridge)return navigator.share(data);
 const file=data.files?.[0];if(!file||file.type!=='image/png'||file.size>12*1024*1024)throw new Error('Choose a PNG image under 12 MB.');
 const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read image.'));reader.readAsDataURL(file);});
 const result=await bridge.postMessage({image,url:data.url||'',text:data.text||data.title||''});
 if(result?.cancelled){const e=new Error('Sharing cancelled');e.name='AbortError';throw e;}
}
