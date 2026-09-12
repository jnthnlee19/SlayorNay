import {admin as identityAdmin} from '@netlify/identity';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { createApi } from '../../server/api.mjs';
import { verifiedIdentityFromRequest, identityPasswordLogin } from '../../server/identity.mjs';
let handle;
export default async (request,context)=>{
 try{
  if(!handle){const db=getDatabase();const store=getStore({name:'product-photos',consistency:'strong'});handle=createApi({query:(sql,args)=>db.sql.unsafe(sql,args),media:{delete:key=>store.delete(key),set:(key,data)=>store.set(key,data),get:key=>store.get(key,{type:'arrayBuffer'})}});}
  return await handle(request,{...context,emailIdentityEnabled:true,identityUser:await verifiedIdentityFromRequest(request),identityPasswordLogin,identityAdmin});
 }catch(error){console.error('Database unavailable',error.code||error.name);return Response.json({error:'The site is being connected. Please try again shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config={path:'/api/*'};
