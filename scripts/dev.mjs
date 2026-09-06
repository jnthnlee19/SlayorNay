import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createApi } from '../server/api.mjs';
await mkdir('.local-data',{recursive:true});
const db=new PGlite('.local-data');
await db.exec('CREATE TABLE IF NOT EXISTS local_migrations(name text PRIMARY KEY)');
for(const name of (await readdir('netlify/database/migrations')).sort()){
 if(!(await db.query('SELECT name FROM local_migrations WHERE name=$1',[name])).rows.length){
  await db.transaction(async tx=>{await tx.exec(await readFile('netlify/database/migrations/'+name,'utf8'));await tx.query('INSERT INTO local_migrations VALUES($1)',[name]);});
 }
}
const media=new Map();
const handle=createApi({query:async(s,p)=>(await db.query(s,p)).rows,preview:true,adminToken:process.env.ADMIN_SETUP_TOKEN,media:{set:async(k,v)=>media.set(k,v),get:async k=>media.get(k)}});
const root=resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:4173');
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>2900000){res.writeHead(413);res.end();return;}chunks.push(part);}
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await handle(request,{ip:req.socket.remoteAddress});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
