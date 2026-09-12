import {createHash,randomUUID} from 'node:crypto';
export const suspendedKey='gloss_or_toss_suspended';
export const deletedKey=id=>'deleted-identity:'+createHash('sha256').update(id).digest('hex');
const failure=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const absent=e=>e.status===404||e.statusCode===404;

export async function manageUser({rows,provider,actor,id,action,confirmation,selfDelete=false,media}){
 const target=(await rows('SELECT u.id,u.is_admin,i.identity_id,i.email FROM users u JOIN identity_links i ON i.user_id=u.id WHERE u.id=$1',[id]))[0];
 if(!target)failure(404,'User not found. Refresh the user list.');
 if(!provider)failure(503,'Identity management is unavailable. No account changes were made.');
 const pending=async()=>!!(await rows('SELECT key FROM settings WHERE key=$1',[deletedKey(target.identity_id)])).length;
 const get=async()=>{try{return await provider.getUser(target.identity_id);}catch(e){if(absent(e))return null;throw e;}};
 if(action==='inspect'){
  const account=await get();
  return {id:target.id,email:account?.email||target.email,protected:target.is_admin||target.id===actor.id,status:await pending()?'deletion-pending':!account?'identity-missing':account.appMetadata?.[suspendedKey]===true?'suspended':'active'};
 }
 if(!['suspend','enable','delete'].includes(action))failure(400,'Choose a valid account action.');
 if(!selfDelete&&(target.is_admin||target.id===actor.id))failure(403,'Admin accounts are protected from suspension and deletion here.');
 const lockKey='manage-user:'+target.identity_id,lockValue=(Date.now()+120000)+':'+randomUUID();
 const lock=await rows(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value WHERE split_part(settings.value,':',1)::bigint<$3 RETURNING key`,[lockKey,lockValue,Date.now()]);
 if(!lock.length)failure(409,'Another account action is in progress. Wait a moment and try again.');
 try{
  const account=await get(),email=account?.email||target.email;
  if(action==='delete'){
   if(selfDelete && target.id!==actor.id)failure(403,'You can only delete your own account.');
   if(typeof confirmation!=='string'||confirmation.trim().toLowerCase()!==email.toLowerCase())failure(400,'Type the user’s full email address to confirm permanent deletion.');
   // Keep a non-email provider-ID tombstone so in-flight sessions cannot recreate
   // this deleted profile. A new registration has a different provider ID.
   await rows('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING',[deletedKey(target.identity_id),new Date().toISOString()]);
   try{
    if(selfDelete)await rows('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING',['self-delete:'+target.identity_id,'requested']);
    const eraseContent=selfDelete||(await rows('SELECT key FROM settings WHERE key=$1',['self-delete:'+target.identity_id])).length;
    if(eraseContent){
     const submissions=await rows('SELECT photo_key,edited_photo_key,image FROM submissions WHERE user_id=$1',[target.id]);
     const keys=[...new Set(submissions.flatMap(s=>[s.photo_key,s.edited_photo_key,s.image?.startsWith('/api/images/')?s.image.slice(12):'']).filter(Boolean))];
     if(keys.length&&!media?.delete)failure(503,'Photo deletion is unavailable. Please retry shortly.');
     // Delete bytes before dropping their provenance, making partial failures retryable.
     for(const key of keys)await media.delete(key);
     await rows(`WITH cleared AS (UPDATE products p SET image=CASE WHEN EXISTS(SELECT 1 FROM submissions s WHERE s.user_id=$1 AND s.image<>'' AND s.image=p.image) THEN '' ELSE p.image END, description=CASE WHEN EXISTS(SELECT 1 FROM submissions s WHERE s.user_id=$1 AND s.approved_product_id=p.id AND s.description=p.description) THEN '' ELSE p.description END RETURNING p.id) DELETE FROM submissions WHERE user_id=$1 AND (SELECT count(*) FROM cleared)>=0`,[target.id]);
     await rows('DELETE FROM content_reports WHERE user_id=$1',[target.id]);
    }
    if(account){
     await provider.updateUser(target.identity_id,{app_metadata:{...account.appMetadata,[suspendedKey]:true}});
     try{await provider.deleteUser(target.identity_id);}catch(e){if(!absent(e))throw e;}
    }
    // Existing FKs remove private votes/watchlists and detach submissions while
    // preserving their content, consent records, and all catalog products.
    await rows('DELETE FROM users WHERE id=$1',[target.id]);
    await rows('DELETE FROM settings WHERE key=$1',['self-delete:'+target.identity_id]);
   }catch(e){console.error('User deletion incomplete',actor.id,target.id,e.status||e.name);failure(503,'Deletion is incomplete. App access is blocked; some records remain. Retry permanent deletion to finish safely.');}
  }else{
   if(await pending())failure(409,'Deletion has already started. Retry permanent deletion to finish cleanup.');
   if(!account)failure(409,'The Identity account is missing. Permanent deletion can clean up its remaining app records.');
   const updated=await provider.updateUser(target.identity_id,{app_metadata:{...account.appMetadata,[suspendedKey]:action==='suspend'}});
   if(updated.appMetadata?.[suspendedKey]!== (action==='suspend'))failure(503,'Identity did not confirm the account status. Reopen Manage access to check before retrying.');
  }
  console.info('Admin user action completed',{actor:actor.id,target:target.id,action});
  return {ok:true,message:selfDelete?'Your account, votes, Watchlist, and submitted photos have been deleted.':action==='delete'?'User permanently deleted. Their votes and Watchlist were removed; products and submissions were preserved.':action==='suspend'?'User suspended. Their saved data is unchanged.':'User re-enabled. They can sign in again with their saved data intact.'};
 }finally{await rows('DELETE FROM settings WHERE key=$1 AND value=$2',[lockKey,lockValue]);}
}
