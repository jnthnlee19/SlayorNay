import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { lookupProduct, sanitizeImage, fetchSharePhoto, normalizeSharePhoto } from './product-media.mjs';
import {PHOTO_CONSENT, PHOTO_CONSENT_VERSION} from '../public/photo-tools.mjs';
const digest = s => createHash('sha256').update(s).digest('hex');
const categories = ['Polish','Gel','Extensions','Tools','Prep & finish','Nail care'];
class HttpError extends Error { constructor(status,message){ super(message); this.status=status; } }
const fail=(status,message)=>{throw new HttpError(status,message)};
const clean=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const safeEqual=(a,b)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
function passwordInput(value){if(typeof value!=='string'||value.length<8||value.length>128)fail(400,'Use a password between 8 and 128 characters.');return value;}
function urlInput(value){const raw=clean(value,2000);if(!raw)return '';try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)throw 0;return u.href;}catch{fail(400,'Product and image links must begin with https://.');}}
function productInput(body){const image=typeof body.image==='string'&&/^\/api\/images\/[a-f0-9-]{36}\.webp$/.test(body.image)?body.image:urlInput(body.image);const p={name:clean(body.name,120),brand:clean(body.brand,80),category:clean(body.category,40),description:clean(body.description,1500),image,url:urlInput(body.url),affiliate:body.affiliate===true,active:body.active!==false};if(!p.name||!p.brand||!p.category)fail(400,'Add a product name, brand, and category.');return p;}
const publicUser=u=>u?{id:u.id,username:u.username,is_admin:u.is_admin,email:u.email||null,email_verified:!!u.email_verified}:null;
export function communityRating(p){
 const verdict=p.total<10?'pending':p.slays/p.total>=.85?'grail':p.slays/p.total>=.5?'slay':'nay';
 const ready=p.recent_total>=5&&p.previous_total>=5;
 const change=ready?100*(p.recent_slays/p.recent_total-p.previous_slays/p.previous_total):null;
 return {...p,verdict,trend:{direction:!ready?'pending':change>=5-1e-9?'up':change<=-5+1e-9?'down':'steady',change:ready?Math.round(change*10)/10:null}};
}
export function createApi({query,preview=false,adminToken=process.env.ADMIN_SETUP_TOKEN,media,lookup=lookupProduct,sharePhoto=fetchSharePhoto}){
 const sharePhotoCache=new Map();
 return async function handle(request,context={}){
  const url=new URL(request.url), path=url.pathname.replace(/^\/\.netlify\/functions\/api/,'').replace(/^\/api/,'')||'/';
  const secure=!preview;const cookieName=secure?'__Host-son_session':'son_session';
  let setCookie;
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})}});
  const rows=async(sql,args=[])=>query(sql,args);
  const rate=async(key,max,seconds)=>{const r=await rows(`INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.expires_at END RETURNING hits`,[key,seconds]);if(r[0].hits>max)fail(429,'Too many attempts. Please try again in a little while.');};
  try{
   if(!['GET','POST'].includes(request.method))fail(405,'Method not allowed.');
   if(request.method==='GET'&&path.startsWith('/share-photo/')){
    const id=path.slice('/share-photo/'.length);
    if(!/^[a-f0-9-]{36}$/.test(id))fail(404,'Product not found.');
    const p=(await rows('SELECT image FROM products WHERE id=$1 AND active=true',[id]))[0];
    if(!p?.image)fail(404,'Product photo unavailable.');
    const key=digest(p.image),cached=sharePhotoCache.get(key);
    let bytes=cached?.expires>Date.now()?cached.bytes:null;
    if(!bytes){
     await rate('share-photo:'+digest(context.ip||'unknown'),60,600);
     const stored=p.image.match(/^\/api\/images\/([a-f0-9-]{36}\.webp)$/);
     bytes=stored?await normalizeSharePhoto(await media?.get(stored[1])):await sharePhoto(p.image);
     if(sharePhotoCache.size>=12)sharePhotoCache.delete(sharePhotoCache.keys().next().value);
     sharePhotoCache.set(key,{bytes,expires:Date.now()+300000});
    }
    return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
   }
   if(request.method==='GET'&&/^\/images\/[a-f0-9-]{36}\.webp$/.test(path)){
    const image=await media?.get(path.slice('/images/'.length));if(!image)fail(404,'Photo not found.');
    return new Response(image,{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
   }
   let body={};
   if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)fail(403,'Please submit this from the website.');
    if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected a JSON request.');
    const maxBody=['/admin/upload','/submissions'].includes(path)?2900000:20000;
    if(Number(request.headers.get('content-length')||0)>maxBody)fail(413,'That submission is too large.');
    const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>maxBody){await reader.cancel();fail(413,'That submission is too large.');}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
    try{body=JSON.parse(raw);}catch{fail(400,'Invalid request.');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid request.');
   }
   const identity=context.identityUser;
   const verifiedIdentity=identity?.id&&identity?.email&&identity?.confirmedAt?identity:null;
   const linked=verifiedIdentity?(await rows('SELECT u.* FROM users u JOIN identity_links i ON i.user_id=u.id WHERE i.identity_id=$1',[verifiedIdentity.id]))[0]:null;
   const user=linked?{...linked,email:verifiedIdentity.email,email_verified:true}:null;
   const requireUser=()=>{if(!user)fail(401,'Sign in with a verified email to continue.');};
   const requireVoter=requireUser;
   const requireAdmin=()=>{requireUser();if(!user.is_admin)fail(403,'This page is for the site administrator.');};
   if(request.method==='GET'&&path==='/me')return json({user:publicUser(user),preview,emailIdentityEnabled:true});
   if(request.method==='GET'&&path==='/profile/stats'){
    requireUser();
    const stats=(await rows(`SELECT count(*)::int AS rated,
     count(*) FILTER(WHERE choice='slay')::int AS gloss,
     count(*) FILTER(WHERE choice='nay')::int AS toss,
     (SELECT count(*)::int FROM watchlist WHERE user_id=$1) AS watchlist
     FROM votes WHERE user_id=$1`,[user.id]))[0];
    return json(stats);
   }
   if(request.method==='POST'&&path==='/email-signin'){
    await rate('email-login-ip:'+digest(context.ip||'unknown'),30,900);
    const email=clean(body.email,254).toLowerCase(),password=passwordInput(body.password);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter your email address.');
    await rate('email-login-user:'+digest(email),12,900);
    if(!context.identityPasswordLogin)fail(503,'Email sign-in is temporarily unavailable.');
    const tokens=await context.identityPasswordLogin(email,password);
    if(!tokens.access_token||!tokens.refresh_token)fail(503,'Sign-in could not be completed.');
    const response=json({ok:true});
    // Same cookie contract as the Netlify browser client, which manages refresh.
    for(const [name,value] of [['nf_jwt',tokens.access_token],['nf_refresh',tokens.refresh_token]])response.headers.append('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; Secure; SameSite=Lax`);
    return response;
   }
   if(request.method==='POST'&&path==='/identity/session'){
    if(!verifiedIdentity)fail(401,'Verify your email and sign in first.');
    await rate('identity-profile:'+verifiedIdentity.id,30,900);
    if(linked){
     await rows('UPDATE identity_links SET email=$2 WHERE identity_id=$1',[verifiedIdentity.id,verifiedIdentity.email]);
     return json({user:publicUser(user)});
    }
    // A stable provider ID makes concurrent first sign-ins idempotent. Never match
    // by an email or a user-supplied username: existing links retain their owner.
    const id='identity:'+verifiedIdentity.id,username='member_'+digest(verifiedIdentity.id).slice(0,23);
    const created=await rows(`WITH created AS (
     INSERT INTO users(id,username,password_hash,recovery_hash) VALUES($1,$2,'identity-only','identity-only')
     ON CONFLICT(id) DO UPDATE SET id=users.id RETURNING *
    ), connected AS (
     INSERT INTO identity_links(identity_id,user_id,email) SELECT $3,id,$4 FROM created
     ON CONFLICT(identity_id) DO UPDATE SET email=EXCLUDED.email RETURNING user_id
    ) SELECT created.* FROM created JOIN connected ON connected.user_id=created.id`,[id,username,verifiedIdentity.id,verifiedIdentity.email]);
    if(!created[0])fail(409,'Please sign in again to finish loading your account.');
    return json({user:publicUser({...created[0],email:verifiedIdentity.email,email_verified:true})},201);
   }
   if(request.method==='GET'&&path==='/products'){
    const watched=user?await rows('SELECT product_id FROM watchlist WHERE user_id=$1',[user.id]):[];
    const saved=new Set(watched.map(w=>w.product_id));
    const products=await rows(`SELECT p.*,COALESCE(w.watchlist_count,0)::int AS watchlist_count,count(v.user_id)::int AS total,count(v.user_id) FILTER(WHERE v.choice='slay')::int AS slays,max(CASE WHEN v.user_id=$1 THEN v.choice ELSE NULL END) AS my_vote FROM products p LEFT JOIN votes v ON v.product_id=p.id LEFT JOIN (SELECT product_id,count(*)::int AS watchlist_count FROM watchlist GROUP BY product_id) w ON w.product_id=p.id WHERE p.active=true GROUP BY p.id,w.watchlist_count ORDER BY p.created_at,p.id`,[user?.id||'']);
    const daily=await rows(`SELECT p.id,count(*)::int AS total,count(*) FILTER(WHERE v.choice='slay')::int AS slays FROM products p JOIN votes v ON v.product_id=p.id WHERE p.active=true AND v.created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 day' AND v.created_at < (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') GROUP BY p.id HAVING count(*)>=10 ORDER BY p.id`);
    const sort=(a,b)=>b.slays/b.total-a.slays/a.total||b.total-a.total||a.id.localeCompare(b.id);
    const slay=daily.filter(p=>p.slays/p.total>.5).sort(sort)[0]||null;
    const nay=daily.filter(p=>p.slays/p.total<.5).sort((a,b)=>sort(b,a))[0]||null;
    const recent=await rows(`SELECT product_id,
     count(*) FILTER(WHERE created_at>=now()-interval '24 hours')::int AS recent_total,
     count(*) FILTER(WHERE created_at>=now()-interval '24 hours' AND choice='slay')::int AS recent_slays,
     count(*) FILTER(WHERE created_at<now()-interval '24 hours')::int AS previous_total,
     count(*) FILTER(WHERE created_at<now()-interval '24 hours' AND choice='slay')::int AS previous_slays
     FROM votes WHERE created_at>=now()-interval '48 hours' AND created_at<=now() GROUP BY product_id`);
    const windows=new Map(recent.map(p=>[p.product_id,p]));
    return json({products:products.map(p=>communityRating({...p,watching:saved.has(p.id),recent_total:0,recent_slays:0,previous_total:0,previous_slays:0,...windows.get(p.id)})),daily:{slay,nay},minimum:10});
   }
   if(request.method==='POST'&&path==='/watchlist'){
    requireUser();await rate('watchlist:'+user.id,120,60);
    if(typeof body.watching!=='boolean')fail(400,'Choose whether to save or remove this product.');
    const id=clean(body.product_id,100);
    if(body.watching){
     if(!(await rows('SELECT id FROM products WHERE id=$1 AND active=true',[id])).length)fail(404,'This product is no longer available.');
     await rows('INSERT INTO watchlist(user_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,id]);
    }else await rows('DELETE FROM watchlist WHERE user_id=$1 AND product_id=$2',[user.id,id]);
    return json({watching:body.watching});
   }
   if(request.method==='POST'&&path==='/signout'){
    const response=json({ok:true});
    for(const name of [cookieName,'nf_jwt','nf_refresh'])response.headers.append('Set-Cookie',`${name}=; Path=/; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`);
    return response;
   }
   if(request.method==='POST'&&path==='/vote/change'){
    requireVoter();await rate('vote:'+user.id,120,60);
    if(!['slay','nay'].includes(body.choice))fail(400,'Choose Gloss or Toss.');
    const updated=await rows(`UPDATE votes v SET choice=$3,created_at=CASE WHEN v.choice<>$3 THEN NOW() ELSE v.created_at END FROM products p WHERE v.user_id=$1 AND v.product_id=$2 AND p.id=v.product_id AND p.active=true RETURNING v.product_id`,[user.id,clean(body.product_id,100),body.choice]);
    if(!updated.length)fail(404,'No saved vote is available to change for this product.');
    return json({ok:true});
   }
   if(request.method==='POST'&&path==='/vote'){
    requireVoter();await rate('vote:'+user.id,120,60);
    if(!['slay','nay'].includes(body.choice))fail(400,'Choose Gloss or Toss.');
    const id=clean(body.product_id,100);
    const inserted=await rows(`INSERT INTO votes(user_id,product_id,choice) SELECT $1,p.id,$3 FROM products p WHERE p.id=$2 AND p.active=true ON CONFLICT(user_id,product_id) DO NOTHING RETURNING *`,[user.id,id,body.choice]);
    if(!inserted.length){const p=await rows('SELECT id FROM products WHERE id=$1 AND active=true',[id]);if(!p.length)fail(404,'This product is no longer available.');fail(409,'Your vote for this product is already saved.');}
    return json({ok:true},201);
   }
   if(request.method==='GET'&&path.startsWith('/submission-photo/')){
    requireUser();const id=path.slice('/submission-photo/'.length);
    const submission=(await rows('SELECT user_id,photo_key FROM submissions WHERE id=$1',[id]))[0];
    if(!submission||(!user.is_admin&&submission.user_id!==user.id))fail(404,'Photo not found.');
    const bytes=submission.photo_key?await media?.get(submission.photo_key):null;if(!bytes)fail(404,'Photo not found.');
    return new Response(bytes,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(request.method==='POST'&&path==='/submissions'){
    requireUser();await rate('submit:'+user.id,20,86400);
    const target=clean(body.product_id,100);
    const existing=target?(await rows('SELECT * FROM products WHERE id=$1 AND active=true',[target]))[0]:null;
    if(target&&!existing)fail(404,'This product is no longer available.');
    const p=existing||productInput({...body,image:''});
    if(body.image)fail(400,'Upload your own photo instead of a website image link.');
    if(!['tech','brand'].includes(body.submitter_type))fail(400,'Tell us whether you are a nail tech or a brand.');
    if(target&&!body.base64)fail(400,'Choose a photo to submit for this product.');
    if(body.base64&&(body.photo_consent!==true||body.consent_version!==PHOTO_CONSENT_VERSION))fail(400,'Read and agree to the photo permission before submitting.');
    const id=randomUUID();let key='';
    if(body.base64){if(!media)fail(503,'Photo storage is unavailable.');const image=await sanitizeImage(body.base64);key='pending/'+id+'.webp';await media.set(key,image);}
    await rows(`INSERT INTO submissions(id,user_id,name,brand,category,description,image,url,submitter_type,target_product_id,submission_kind,photo_key,original_filename,consent_text,consent_version,consent_at)
      VALUES($1,$2,$3,$4,$5,$6,'',$7,$8,$9,$10,$11,$12,$13,$14,CASE WHEN $11<>'' THEN now() ELSE NULL END)`,
      [id,user.id,p.name,p.brand,p.category,clean(body.description,1500),p.url,body.submitter_type,target||null,target?'photo':'product',key,key?clean(body.original_filename,200):'',key?PHOTO_CONSENT:'',key?PHOTO_CONSENT_VERSION:'']);
    return json({ok:true,id},201);
   }
   if(request.method==='POST'&&path==='/admin/claim'){
    requireUser();await rate('claim:'+user.id,5,3600);
    if(!adminToken||adminToken.length<24)fail(503,'Admin setup is not enabled. Add ADMIN_SETUP_TOKEN in Netlify first.');
    if(!safeEqual(clean(body.token,256),adminToken))fail(403,'The setup code is incorrect.');
    // One atomic claim prevents both first-signup admin takeover and concurrent claims.
    const claimed=await rows(`WITH claim AS (INSERT INTO settings(key,value) VALUES('admin_claimed',$1) ON CONFLICT(key) DO NOTHING RETURNING value) UPDATE users SET is_admin=true WHERE id=(SELECT value FROM claim) RETURNING *`,[user.id]);
    if(!claimed.length)fail(409,'The administrator has already been set up.');return json({user:publicUser(claimed[0])});
   }
   if(path.startsWith('/admin/')){
    requireAdmin();
    if(request.method==='POST'&&path==='/admin/delete-products'){
     if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>100||body.ids.some(id=>typeof id!=='string'||id.length>100))fail(400,'Select between 1 and 100 products.');
     const removed=await rows(`WITH removed_votes AS (DELETE FROM votes WHERE product_id=ANY($1::text[]) RETURNING product_id) DELETE FROM products WHERE id=ANY($1::text[]) AND (SELECT count(*) FROM removed_votes)>=0 RETURNING id`,[body.ids]);
     return json({deleted:removed.map(p=>p.id)});
    }
    if(request.method==='POST'&&path==='/admin/category'){
     const from=clean(body.from,40),to=clean(body.to,40);if(!from||!to||from===to)fail(400,'Choose a category and a different destination name.');
     const changed=await rows('UPDATE products SET category=$2 WHERE category=$1 RETURNING id',[from,to]);return json({updated:changed.length});
    }
    if(request.method==='GET'&&path==='/admin/users'){
     const search=clean(url.searchParams.get('search'),254),offset=Math.max(0,Math.min(1000000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
     return json({users:await rows(`SELECT u.id,u.username,i.email,u.is_admin,u.created_at,(SELECT count(*)::int FROM votes v WHERE v.user_id=u.id) AS vote_count FROM users u JOIN identity_links i ON i.user_id=u.id WHERE strpos(lower(u.username),$1)>0 OR strpos(lower(i.email),$1)>0 ORDER BY u.created_at DESC,u.id LIMIT 51 OFFSET $2`,[search.toLowerCase(),offset])});
    }
    if(request.method==='POST'&&path==='/admin/lookup'){await rate('lookup:'+user.id,20,300);return json(await lookup(urlInput(body.url)));}
    if(request.method==='POST'&&path==='/admin/upload'){
     await rate('upload:'+user.id,200,86400);if(!media)fail(503,'Photo storage is not available right now.');
     const image=await sanitizeImage(body.base64),key=randomUUID()+'.webp';await media.set(key,image);return json({image:'/api/images/'+key},201);
    }
    if(request.method==='POST'&&path==='/admin/product-photo'){
     const id=clean(body.id,100),image=clean(body.image,2000);
     if(!/^\/api\/images\/[a-f0-9-]{36}\.webp$/.test(image))fail(400,'Upload a photo first.');
     if(!await media?.get(image.slice('/api/images/'.length)))fail(400,'Uploaded photo not found.');
     const updated=await rows('UPDATE products SET image=$2 WHERE id=$1 RETURNING id',[id,image]);
     if(!updated.length)fail(404,'Product not found.');return json({ok:true});
    }
    if(request.method==='GET'&&path==='/admin/data')return json({products:await rows('SELECT * FROM products ORDER BY created_at DESC'),submissions:await rows("SELECT s.*,COALESCE(u.username,'Deleted account') AS username FROM submissions s LEFT JOIN users u ON u.id=s.user_id WHERE s.status='pending' ORDER BY s.created_at")});
    if(request.method==='POST'&&path==='/admin/products'){
     const p=productInput(body);const id=clean(body.id,100)||randomUUID();
     const found=await rows('SELECT id FROM products WHERE id=$1',[id]);
     if(found.length)await rows('UPDATE products SET name=$1,brand=$2,category=$3,description=$4,image=$5,url=$6,affiliate=$7,active=$8 WHERE id=$9',[p.name,p.brand,p.category,p.description,p.image,p.url,p.affiliate,p.active,id]);
     else await rows('INSERT INTO products(id,name,brand,category,description,image,url,affiliate,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,p.name,p.brand,p.category,p.description,p.image,p.url,p.affiliate,p.active]);
     return json({ok:true,id});
    }
    if(request.method==='POST'&&path==='/admin/review'){
     const id=clean(body.id,100);if(!['approve','reject'].includes(body.action))fail(400,'Choose approve or reject.');
     const submission=(await rows("SELECT * FROM submissions WHERE id=$1 AND status='pending'",[id]))[0];
     if(!submission)fail(409,'This submission has already been reviewed.');
     if(body.action==='reject'){
      const changed=await rows("UPDATE submissions SET status='rejected',reviewed_at=now(),reviewed_by=$2 WHERE id=$1 AND status='pending' RETURNING id",[id,user.id]);
      if(!changed.length)fail(409,'This submission has already been reviewed.');
     }else{
      if(submission.submission_kind==='photo'&&(!submission.target_product_id||!(await rows('SELECT id FROM products WHERE id=$1',[submission.target_product_id])).length))fail(409,'The original product was deleted. Decline this submission.');
      let image='';
      if(submission.photo_key){
       if(!submission.consent_text||!submission.consent_at)fail(400,'Photo permission is missing.');
       const bytes=await media?.get(submission.photo_key);if(!bytes)fail(404,'Submitted photo is unavailable.');
       const key=randomUUID()+'.webp';await media.set(key,bytes);image='/api/images/'+key;
      }
      const approved=submission.submission_kind==='photo'
       ?await rows(`WITH reviewed AS (UPDATE submissions SET status='approved',image=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING *) UPDATE products SET image=reviewed.image FROM reviewed WHERE products.id=reviewed.target_product_id RETURNING products.id`,[id,image,user.id])
       :await rows(`WITH reviewed AS (UPDATE submissions SET status='approved',image=$3,reviewed_at=now(),reviewed_by=$4 WHERE id=$1 AND status='pending' RETURNING *) INSERT INTO products(id,name,brand,category,description,image,url) SELECT $2,name,brand,category,description,image,url FROM reviewed RETURNING id`,[id,randomUUID(),image,user.id]);
      if(!approved.length)fail(409,'This submission has already been reviewed.');
     }
     return json({ok:true});
    }
   }
   fail(404,'This page could not be found.');
  }catch(error){
   if(error.status)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);
   if(error.code==='23505')return json({error:'This brand and product already exist. Edit the existing product instead.'},409);
   console.error('API failure',error.code||error.name);return json({error:'The service is not ready right now. Please try again shortly.'},503);
  }
 };
}
