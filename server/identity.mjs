const endpoint='https://glossortoss.com/.netlify/identity';
export async function verifiedIdentityFromRequest(request,fetcher=fetch){
 const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('nf_jwt='))?.slice(7);
 if(!raw)return null;
 let token;try{token=decodeURIComponent(raw);}catch{return null;}
 if(token.length>16000)return null;
 const r=await fetcher(endpoint+'/user',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 if(!r.ok)return null;
 const u=await r.json();
 return u.id&&u.email&&u.confirmed_at?{id:u.id,email:u.email,confirmedAt:u.confirmed_at,suspended:u.app_metadata?.gloss_or_toss_suspended===true}:null;
}
export async function identityPasswordLogin(email,password,fetcher=fetch){
 let r;
 try{r=await fetcher(endpoint+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',username:email,password}).toString(),signal:AbortSignal.timeout(10000)});}
 catch{const e=new Error('Email sign-in is temporarily unavailable. Please try again.');e.status=503;throw e;}
 if(!r.ok){
  const details=await r.json().catch(()=>({}));
  const unverified=/email.*(not confirmed|not verified|unconfirmed)/i.test(details.error_description||details.msg||details.message||'');
  const e=new Error(r.status===429?'Too many attempts. Please wait a minute and try again.':r.status>=500?'The sign-in service is temporarily unavailable. Please try again.':unverified?'Your email hasn’t been verified yet.':'Your email or password is incorrect.');
  e.status=r.status===429?429:r.status>=500?503:401;
  if(unverified)e.code='EMAIL_UNVERIFIED';
  throw e;
 }
 return r.json();
}
