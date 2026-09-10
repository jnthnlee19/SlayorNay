export const productShareUrl=id=>'https://glossortoss.com/#product/'+encodeURIComponent(id);
export function shareModel(product){
 const choice=['slay','nay'].includes(product.my_vote)?product.my_vote:null;
 const total=Number(product.total)||0,slays=Number(product.slays)||0;
 return {id:product.id,name:product.name,brand:product.brand,image:product.image,choice,
  // Unvoted cards never contain scores, even when the catalog has them.
  total:choice?total:null,percentage:choice&&total?Math.round(slays/total*100):null,
  headline:choice==='slay'?'I GLOSSED IT':choice==='nay'?'I TOSSED IT':'GLOSS OR TOSS?',url:productShareUrl(product.id)};
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
 const model=shareModel(product),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image generation is unavailable in this browser.');
 const scale=width/1080,H=height/scale;ctx.scale(scale,scale);
 const [logo,photo]=await Promise.all([loadImage('/logo.png'),product.image?loadImage('/api/share-photo/'+encodeURIComponent(product.id)).catch(()=>null):null]);
 const bg=ctx.createLinearGradient(0,0,1080,H);bg.addColorStop(0,'#0b0b0b');bg.addColorStop(.6,'#28131f');bg.addColorStop(1,'#0b0b0b');ctx.fillStyle=bg;ctx.fillRect(0,0,1080,H);
 const header=Math.min(280,H*.18),footer=Math.min(model.choice?600:480,H*.37),photoY=header+28,photoH=H-footer-photoY-20;
 contain(ctx,logo,48,18,header,header);
 ctx.textAlign='right';ctx.fillStyle='#f2cad6';ctx.font='500 24px Arial';ctx.fillText('REAL REVIEWS.',1020,header*.43);ctx.fillText('FLAWLESS NAILS.',1020,header*.43+35);
 ctx.strokeStyle='#c66a8a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(60,header+8);ctx.lineTo(1020,header+8);ctx.stroke();
 box(ctx,48,photoY,984,photoH,32,'#f3ecf0');
 if(photo){ctx.save();ctx.beginPath();ctx.roundRect(48,photoY,984,photoH,32);ctx.clip();contain(ctx,photo,60,photoY+12,960,photoH-24);ctx.restore();}
 else{ctx.textAlign='center';ctx.fillStyle='#735366';ctx.font='28px Arial';ctx.fillText('Product photo unavailable',540,photoY+photoH/2);}
 let y=H-footer+24;ctx.textAlign='center';ctx.fillStyle='#e6a1bc';ctx.font='bold 25px Arial';ctx.fillText(String(model.brand||'').toUpperCase().slice(0,55),540,y);
 ctx.font='bold 46px Georgia';ctx.fillStyle='#fff8fb';y+=54;for(const line of lines(ctx,model.name,920,2)){ctx.fillText(line,540,y);y+=53;}
 const pillY=y+8,pillH=92;const gloss=model.choice!=='nay';const gradient=ctx.createLinearGradient(140,pillY,940,pillY+pillH);gradient.addColorStop(0,gloss?'#e3a3bc':'#62565f');gradient.addColorStop(.55,gloss?'#a83764':'#141115');gradient.addColorStop(1,gloss?'#6c1e40':'#3d303c');
 box(ctx,120,pillY,840,pillH,46,gradient);ctx.strokeStyle=gloss?'#f2cad6':'#b8a8b4';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 45px Georgia';ctx.fillText(model.headline,540,pillY+61);
 y=pillY+pillH+54;
 if(model.choice){ctx.font='bold 36px Arial';ctx.fillStyle='#f2cad6';ctx.fillText(model.percentage===null?'Awaiting community votes':model.percentage+'% GLOSS',540,y);ctx.font='24px Arial';ctx.fillStyle='#d1beca';ctx.fillText(model.total.toLocaleString()+' community '+(model.total===1?'vote':'votes')+' · at time of sharing',540,y+37);y+=90;}
 else y+=32;
 ctx.fillStyle='#f9e9f0';ctx.font='italic 37px Georgia';ctx.fillText('What do you think?',540,Math.min(y,H-110));
 ctx.fillStyle='#e6a1bc';ctx.font='bold 29px Arial';ctx.fillText('GlossOrToss.com',540,H-48);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not generate the share image.')),'image/png'));
 return {model,blob,photoAvailable:!!photo,file:new File([blob],'gloss-or-toss-'+String(model.name).replace(/[^a-z0-9]+/gi,'-').slice(0,60)+'.png',{type:'image/png'})};
}
export function nativeShareData(art){return {files:[art.file],title:art.model.name+' · Gloss or Toss',text:art.model.headline+' — '+art.model.brand+' '+art.model.name+'. What do you think?',url:art.model.url};}
export function canShareImage(art){try{return !!navigator.share&&!!navigator.canShare?.({files:[art.file]});}catch{return false;}}
