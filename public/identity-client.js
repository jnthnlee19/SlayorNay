import {getUser as providerGetUser,refreshSession,onAuthChange} from '@netlify/identity';
export {getSettings,signup,login,logout,handleAuthCallback,requestPasswordRecovery,updateUser,acceptInvite} from '@netlify/identity';
// Keep the provider's existing cookie contract, including rotated refresh tokens.
function persistCookies(){
 for(const name of ['nf_jwt','nf_refresh']){
  const value=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));
  if(value)document.cookie=value+'; Path=/; Secure; SameSite=Lax; Max-Age=2592000';
 }
}
onAuthChange(event=>{if(event!=='logout')persistCookies();});
let restoring;
export function getUser(){
 if(!restoring)restoring=(async()=>{
  const user=await providerGetUser();
  if(user){await refreshSession();persistCookies();}
  return user;
 })().finally(()=>{restoring=null;});
 return restoring;
}
