import catalog from '../public/stash-catalog.json' with {type:'json'};
import {normalizeHex,COLOR_FAMILIES} from '../public/stash-color.mjs';
const polishIds=new Set(catalog.polishes.map(p=>p.id));
const families=new Set(COLOR_FAMILIES.map(([key])=>key).filter(key=>key!=='unknown'));
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
export async function stashRequest({path,method,body,user,rows,rate}){
 if(path==='/stash'&&method==='GET'){
  const [items,colors]=await Promise.all([rows('SELECT polish_id FROM stash_items WHERE user_id=$1 ORDER BY polish_id',[user.id]),rows('SELECT polish_id,hex,family FROM stash_colors WHERE user_id=$1 ORDER BY polish_id',[user.id])]);
  return {user:{id:user.id},owned:items.map(p=>p.polish_id),colors:Object.fromEntries(colors.map(p=>[p.polish_id,{hex:p.hex,family:p.family}]))};
 }
 if(method!=='POST'||!['/stash/item','/stash/color'].includes(path))fail(404,'Stash action not found.');
 // The authenticated account is always authoritative. Reject stale tabs after an account switch.
 if(body.expected_user_id!==user.id)fail(409,'Your signed-in account changed. Reload your stash before editing.');
 const id=body.polish_id;
 if(typeof id!=='string'||!polishIds.has(id))fail(400,'Choose a polish from the catalog.');
 await rate('stash:'+user.id,180,60);
 if(path==='/stash/item'){
  if(typeof body.owned!=='boolean')fail(400,'Choose whether you own this polish.');
  if(body.owned)await rows('INSERT INTO stash_items(user_id,polish_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,id]);
  else await rows('DELETE FROM stash_items WHERE user_id=$1 AND polish_id=$2',[user.id,id]);
  return {owned:body.owned};
 }
 const value=body.color;
 if(value===null){await rows('DELETE FROM stash_colors WHERE user_id=$1 AND polish_id=$2',[user.id,id]);return {color:null};}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Choose a valid color or group.');
 const hex=value.hex==null?null:normalizeHex(value.hex),family=value.family??null;
 if((value.hex!=null&&(typeof value.hex!=='string'||!hex))||(family!==null&&!families.has(family))||(!hex&&!family))fail(400,'Choose a valid hex color or group.');
 await rows('INSERT INTO stash_colors(user_id,polish_id,hex,family) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,polish_id) DO UPDATE SET hex=EXCLUDED.hex,family=EXCLUDED.family,updated_at=now()',[user.id,id,hex,family]);
 return {color:{hex,family}};
}
