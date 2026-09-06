import { getDatabase } from '@netlify/database';
import { createApi } from '../../server/api.mjs';
let handle;
export default async (request,context)=>{
 try{
  if(!handle){const db=getDatabase();handle=createApi({query:(sql,args)=>db.sql.unsafe(sql,args)});}
  return await handle(request,context);
 }catch(error){console.error('Database unavailable',error.code||error.name);return Response.json({error:'The site is being connected. Please try again shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config={path:'/api/*'};
