import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import sharp from 'sharp';

const error = (message,status=422) => Object.assign(new Error(message),{status});
export const isAmazon = hostname => /(^|\.)(amazon\.[a-z.]+|amzn\.to|a\.co)$/i.test(hostname);
export function publicAddress(address){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
export function pageUrl(value){
 let url;try{url=new URL(value);}catch{throw error('Paste a complete product link beginning with https://.',400);}
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!host.includes('.')||host.endsWith('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)||(isIP(host)&&!publicAddress(host)))throw error('Use a public HTTPS product page.',400);
 return url;
}
async function fetchPage(url,signal){
 const hostname=url.hostname.replace(/^\[|\]$/g,'');
 const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await Promise.race([lookup(hostname,{all:true}),new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(error('The product page took too long to respond.')),{once:true}))]);
 if(signal.aborted)throw error('The product page took too long to respond.');
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw error('This link does not point to a public product page.',400);
 const pinned=addresses[0];
 return new Promise((resolve,reject)=>{
  // Pin the connection to the validated address; no second DNS lookup/rebinding.
  const req=request(url,{signal,headers:{'User-Agent':'SlayorNay-ProductPreview/1.0','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},lookup:(_host,options,cb)=>options?.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.destroy();resolve({redirect:res.headers.location});return;}
   if(res.statusCode!==200){res.destroy();reject(error('This store did not allow an automatic lookup. You can still enter details and upload a photo.'));return;}
   if(!/text\/html|application\/xhtml\+xml/i.test(res.headers['content-type']||'')){res.destroy();reject(error('This link is not a product web page.'));return;}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>1500000){res.destroy(error('This page is too large to read. Try the brand’s direct product page or upload a photo.'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
  });req.on('error',reject);req.end();
 });
}
function imageUrl(value,base){if(typeof value!=='string'||!value.trim()||value.length>2000)return '';try{const u=pageUrl(new URL(value,base).href);return u.href;}catch{return '';}}
export function extractDetails(html,base){
 const $=load(html);const meta=name=>$(`meta[property="${name}"],meta[name="${name}"]`).first().attr('content')||'';
 const nodes=[];const walk=(value,depth=0)=>{if(depth>8||nodes.length>200)return;if(Array.isArray(value)){value.forEach(v=>walk(v,depth+1));return;}if(value&&typeof value==='object'){nodes.push(value);if(value['@graph'])walk(value['@graph'],depth+1);if(value.mainEntity)walk(value.mainEntity,depth+1);}};
 $('script[type="application/ld+json"]').slice(0,15).each((_,el)=>{try{walk(JSON.parse($(el).text()));}catch{}});
 const product=nodes.find(n=>[n['@type']].flat().some(t=>t==='Product'||t==='https://schema.org/Product'))||{};
 const rawImages=[product.image,meta('og:image:secure_url'),meta('og:image'),meta('twitter:image')].flat(2).map(i=>typeof i==='object'?i?.url||i?.contentUrl:i);
 const images=[...new Set(rawImages.map(i=>imageUrl(i,base)).filter(Boolean))].slice(0,5);
 const text=v=>typeof v==='string'?load(v).text().replace(/\s+/g,' ').trim():'';
 return {name:text(product.name||meta('og:title')||$('title').text()).slice(0,120),brand:text(typeof product.brand==='object'?product.brand?.name:product.brand).slice(0,80),description:text(product.description||meta('og:description')||meta('description')).slice(0,1500),images,source:base};
}
export async function lookupProduct(value,{fetchHtml=fetchPage}={}){
 let url=pageUrl(value);const signal=AbortSignal.timeout(10000);
 for(let hop=0;hop<5;hop++){
  if(isAmazon(url.hostname))return {name:'',brand:'',description:'',images:[],source:value,message:'Keep your Amazon affiliate link for buying. For the photo, use your own image, one the brand permits, or Amazon’s approved product-content tools. Automatic Amazon image import is not connected.'};
  let response;try{response=await fetchHtml(url,signal);}catch(e){if(e.status)throw e;throw error('We couldn’t read this page. It may block automatic lookups. Try a direct brand link or upload your photo.');}
  if(response.redirect){url=pageUrl(new URL(response.redirect,url).href);continue;}
  const details=extractDetails(response.html,url.href);
  if(!details.name&&!details.images.length)throw error('No product details were available on that page. You can enter the details and upload a photo.');
  return {...details,message:details.images.length?'Review the suggested details before applying them.':'We found some text, but no product photo. You can upload one below.'};
 }
 throw error('This link redirects too many times. Try the final product page.');
}
export async function sanitizeImage(base64){
 if(typeof base64!=='string'||base64.length>2800000||!base64.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw error('Choose a JPEG, PNG, or WebP photo smaller than 2 MB after resizing.',400);
 const bytes=Buffer.from(base64,'base64');if(bytes.length>2000000)throw error('This image is too large. Try a smaller photo.',413);
 try{const image=sharp(bytes,{limitInputPixels:25000000,animated:false});const metadata=await image.metadata();if(!['jpeg','png','webp'].includes(metadata.format))throw 0;return await image.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}catch{throw error('That file isn’t a readable JPEG, PNG, or WebP image.',400);}
}
