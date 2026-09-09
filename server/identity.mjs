const endpoint='https://glossortoss.com/.netlify/identity';
export async function verifiedIdentityFromRequest(request,fetcher=fetch){
 const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('nf_jwt='))?.slice(7);
 if(!raw)return null;
 let token;try{token=decodeURIComponent(raw);}catch{return null;}
 if(token.length>16000)return null;
 const r=await fetcher(endpoint+'/user',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 if(!r.ok)return null;
 const u=await r.json();
 return u.id&&u.email&&u.confirmed_at?{id:u.id,email:u.email,confirmedAt:u.confirmed_at}:null;
}
export async function identityPasswordLogin(email,password){
 const r=await fetch(endpoint+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',username:email,password}).toString(),signal:AbortSignal.timeout(10000)});
 if(!r.ok){const e=new Error('The username/email or password is incorrect, or your email still needs verification.');e.status=r.status===429?429:401;throw e;}
 return r.json();
}
