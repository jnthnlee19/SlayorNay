import {getUser} from './identity-client.js';
async function request(path,body){
 await getUser();
 const response=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error||'Your stash could not be saved.');error.status=response.status;if(body!==undefined&&[401,403,409].includes(response.status))window.dispatchEvent(new Event('stash-session-changed'));throw error;}
 return data;
}
export const readAccountStash=()=>request('/stash');
export const setOwned=(userId,id,owned)=>request('/stash/item',{expected_user_id:userId,polish_id:id,owned});
export const saveColor=(userId,id,color)=>request('/stash/color',{expected_user_id:userId,polish_id:id,color});
