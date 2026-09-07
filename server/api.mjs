import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { lookupProduct, sanitizeImage } from './product-media.mjs';
const scrypt = promisify(scryptCallback);
const digest = s => createHash('sha256').update(s).digest('hex');
const categories = ['Polish','Gel','Extensions','Tools','Prep & finish','Nail care'];
class HttpError extends Error { constructor(status,message){ super(message); this.status=status; } }
const fail=(status,message)=>{throw new HttpError(status,message)};
const clean=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const safeEqual=(a,b)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return salt+':'+hash.toString('hex');}
async function verify(password,encoded){const [salt,hash]=(encoded||'').split(':');if(!salt||!hash)return false;const actual=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return actual.length===Buffer.from(hash,'hex').length&&timingSafeEqual(actual,Buffer.from(hash,'hex'));}
function passwordInput(value){if(typeof value!=='string'||value.length<12||value.length>128)fail(400,'Use a password between 12 and 128 characters.');return value;}
function usernameInput(value){const name=clean(value,50).toLowerCase();if(!/^[a-z0-9_]{3,30}$/.test(name))fail(400,'Use 3–30 letters, numbers, or underscores for your username.');return name;}
function urlInput(value){const raw=clean(value,2000);if(!raw)return '';try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)throw 0;return u.href;}catch{fail(400,'Product and image links must begin with https://.');}}
function productInput(body){const image=typeof body.image==='string'&&/^\/api\/images\/[a-f0-9-]{36}\.webp$/.test(body.image)?body.image:urlInput(body.image);const p={name:clean(body.name,120),brand:clean(body.brand,80),category:clean(body.category,40),description:clean(body.description,1500),image,url:urlInput(body.url),affiliate:body.affiliate===true,active:body.active!==false};if(!p.name||!p.brand||!p.category)fail(400,'Add a product name, brand, and category.');return p;}
const publicUser=u=>u?{id:u.id,username:u.username,is_admin:u.is_admin}:null;
export function communityRating(p){
 const verdict=p.total<10?'pending':p.slays/p.total>=.85?'grail':p.slays/p.total>=.5?'slay':'nay';
 const ready=p.recent_total>=5&&p.previous_total>=5;
 const change=ready?100*(p.recent_slays/p.recent_total-p.previous_slays/p.previous_total):null;
 return {...p,verdict,trend:{direction:!ready?'pending':change>=5-1e-9?'up':change<=-5+1e-9?'down':'steady',change:ready?Math.round(change*10)/10:null}};
}
export function createApi({query,preview=false,adminToken=process.env.ADMIN_SETUP_TOKEN,media,lookup=lookupProduct}){
 return async function handle(request,context={}){
  const url=new URL(request.url), path=url.pathname.replace(/^\/\.netlify\/functions\/api/,'').replace(/^\/api/,'')||'/';
  const secure=!preview;const cookieName=secure?'__Host-son_session':'son_session';
  let setCookie;
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})}});
  const rows=async(sql,args=[])=>query(sql,args);
  const rate=async(key,max,seconds)=>{const r=await rows(`INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.expires_at END RETURNING hits`,[key,seconds]);if(r[0].hits>max)fail(429,'Too many attempts. Please try again in a little while.');};
  const rawToken=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const newSession=async(user)=>{const token=randomBytes(32).toString('hex');await rows("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[digest(token),user.id]);setCookie=`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${secure?'; Secure':''}`;};
  try{
   if(!['GET','POST'].includes(request.method))fail(405,'Method not allowed.');
   if(request.method==='GET'&&/^\/images\/[a-f0-9-]{36}\.webp$/.test(path)){
    const image=await media?.get(path.slice('/images/'.length));if(!image)fail(404,'Photo not found.');
    return new Response(image,{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
   }
   let body={};
   if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)fail(403,'Please submit this from the website.');
    if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected a JSON request.');
    const maxBody=path==='/admin/upload'?2900000:20000;
    if(Number(request.headers.get('content-length')||0)>maxBody)fail(413,'That submission is too large.');
    const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>maxBody){await reader.cancel();fail(413,'That submission is too large.');}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
    try{body=JSON.parse(raw);}catch{fail(400,'Invalid request.');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid request.');
   }
   const user=rawToken?(await rows('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(rawToken)]))[0]:null;
   const requireUser=()=>{if(!user)fail(401,'Sign in to continue.');};
   const requireAdmin=()=>{requireUser();if(!user.is_admin)fail(403,'This page is for the site administrator.');};
   if(request.method==='GET'&&path==='/me')return json({user:publicUser(user),preview});
   if(request.method==='POST'&&path==='/reset-password'){
    await rate('reset-ip:'+digest(context.ip||'unknown'),20,900);
    const token=clean(body.token,100);if(!/^[a-f0-9]{64}$/.test(token))fail(400,'This reset link is invalid or expired. Ask the administrator for a new one.');
    const password=await hashPassword(passwordInput(body.password)),recovery=randomBytes(20).toString('hex');
    const changed=await rows(`WITH consumed AS (
     DELETE FROM settings WHERE CASE WHEN key LIKE 'password-reset:%' THEN value::jsonb->>'hash'=$1 AND (value::jsonb->>'expires')::timestamptz>now() ELSE false END RETURNING substring(key from 16) AS user_id,value::jsonb->>'recovery' AS recovery
    ), updated AS (UPDATE users SET password_hash=$2,recovery_hash=$3 WHERE id=(SELECT user_id FROM consumed) AND recovery_hash=(SELECT recovery FROM consumed) RETURNING id), revoked AS (DELETE FROM sessions WHERE user_id IN (SELECT id FROM updated)) SELECT id FROM updated`,[digest(token),password,digest(recovery)]);
    if(!changed.length)fail(400,'This reset link is invalid or expired. Ask the administrator for a new one.');
    return json({ok:true,recovery});
   }
   if(request.method==='GET'&&path==='/products'){
    const products=await rows(`SELECT p.*,count(v.user_id)::int AS total,count(v.user_id) FILTER(WHERE v.choice='slay')::int AS slays,max(CASE WHEN v.user_id=$1 THEN v.choice ELSE NULL END) AS my_vote FROM products p LEFT JOIN votes v ON v.product_id=p.id WHERE p.active=true GROUP BY p.id ORDER BY p.created_at,p.id`,[user?.id||'']);
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
    return json({products:products.map(p=>communityRating({...p,recent_total:0,recent_slays:0,previous_total:0,previous_slays:0,...windows.get(p.id)})),daily:{slay,nay},minimum:10});
   }
   if(request.method==='POST'&&['/signup','/signin','/recover'].includes(path)){
    const ip=clean(context.ip||'unknown',200);await rate('auth-ip:'+digest(ip),30,900);
    const username=usernameInput(body.username);await rate('auth-user:'+digest(username),12,900);
    const password=passwordInput(body.password);
    if(path==='/signup'){
     const recovery=randomBytes(20).toString('hex');const id=randomUUID();
     const inserted=await rows('INSERT INTO users(id,username,password_hash,recovery_hash) VALUES($1,$2,$3,$4) ON CONFLICT(username) DO NOTHING RETURNING *',[id,username,await hashPassword(password),digest(recovery)]);
     if(!inserted.length)fail(409,'That username is already taken. Try another or sign in.');
     await newSession(inserted[0]);return json({user:publicUser(inserted[0]),recovery},201);
    }
    const existing=(await rows('SELECT * FROM users WHERE username=$1',[username]))[0];
    if(path==='/recover'){
     const recovery=clean(body.recovery,100).toLowerCase();
     if(!existing||!safeEqual(digest(recovery),existing.recovery_hash))fail(401,'The username or recovery code is incorrect.');
     const replacement=randomBytes(20).toString('hex');
     const updated=await rows('UPDATE users SET password_hash=$1,recovery_hash=$2 WHERE id=$3 AND recovery_hash=$4 RETURNING *',[await hashPassword(password),digest(replacement),existing.id,existing.recovery_hash]);
     if(!updated.length)fail(409,'That recovery code was already used.');
     await rows('DELETE FROM sessions WHERE user_id=$1',[existing.id]);await newSession(updated[0]);return json({user:publicUser(updated[0]),recovery:replacement});
    }
    // Run the same expensive password operation even when a username does not exist.
    const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
    const valid=await verify(password,existing?.password_hash||dummy);
    if(!existing||!valid)fail(401,'The username or password is incorrect.');
    await newSession(existing);return json({user:publicUser(existing)});
   }
   if(request.method==='POST'&&path==='/signout'){
    if(rawToken)await rows('DELETE FROM sessions WHERE token_hash=$1',[digest(rawToken)]);
    setCookie=`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;return json({ok:true});
   }
   if(request.method==='POST'&&path==='/vote/change'){
    requireUser();await rate('vote:'+user.id,120,60);
    if(!['slay','nay'].includes(body.choice))fail(400,'Choose Gloss or Toss.');
    const updated=await rows(`UPDATE votes v SET choice=$3,created_at=CASE WHEN v.choice<>$3 THEN NOW() ELSE v.created_at END FROM products p WHERE v.user_id=$1 AND v.product_id=$2 AND p.id=v.product_id AND p.active=true RETURNING v.product_id`,[user.id,clean(body.product_id,100),body.choice]);
    if(!updated.length)fail(404,'No saved vote is available to change for this product.');
    return json({ok:true});
   }
   if(request.method==='POST'&&path==='/vote'){
    requireUser();await rate('vote:'+user.id,120,60);
    if(!['slay','nay'].includes(body.choice))fail(400,'Choose Gloss or Toss.');
    const id=clean(body.product_id,100);
    const inserted=await rows(`INSERT INTO votes(user_id,product_id,choice) SELECT $1,p.id,$3 FROM products p WHERE p.id=$2 AND p.active=true ON CONFLICT(user_id,product_id) DO NOTHING RETURNING *`,[user.id,id,body.choice]);
    if(!inserted.length){const p=await rows('SELECT id FROM products WHERE id=$1 AND active=true',[id]);if(!p.length)fail(404,'This product is no longer available.');fail(409,'Your vote for this product is already saved.');}
    return json({ok:true},201);
   }
   if(request.method==='POST'&&path==='/submissions'){
    requireUser();await rate('submit:'+user.id,10,86400);const p=productInput(body);
    if(!['tech','brand'].includes(body.submitter_type))fail(400,'Tell us whether you are a nail tech or a brand.');
    await rows('INSERT INTO submissions(id,user_id,name,brand,category,description,image,url,submitter_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),user.id,p.name,p.brand,p.category,p.description,p.image,p.url,body.submitter_type]);return json({ok:true},201);
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
     const search=clean(url.searchParams.get('search'),30),offset=Math.max(0,Math.min(1000000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
     return json({users:await rows(`SELECT u.id,u.username,u.is_admin,u.created_at,(SELECT count(*)::int FROM votes v WHERE v.user_id=u.id) AS vote_count FROM users u WHERE strpos(u.username,$1)>0 ORDER BY u.created_at DESC,u.id LIMIT 51 OFFSET $2`,[search.toLowerCase(),offset])});
    }
    if(request.method==='POST'&&path==='/admin/reset-link'){
     await rate('admin-reset:'+user.id,30,3600);
     const target=(await rows('SELECT id,recovery_hash FROM users WHERE id=$1',[clean(body.user_id,100)]))[0];if(!target)fail(404,'User not found.');
     const token=randomBytes(32).toString('hex'),expires=new Date(Date.now()+30*60000).toISOString();
     await rows('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',['password-reset:'+target.id,JSON.stringify({hash:digest(token),expires,recovery:target.recovery_hash})]);
     return json({link:url.origin+'/#reset-password?token='+token,expires});
    }
    if(request.method==='POST'&&path==='/admin/lookup'){await rate('lookup:'+user.id,20,300);return json(await lookup(urlInput(body.url)));}
    if(request.method==='POST'&&path==='/admin/upload'){
     await rate('upload:'+user.id,50,86400);if(!media)fail(503,'Photo storage is not available right now.');
     const image=await sanitizeImage(body.base64),key=randomUUID()+'.webp';await media.set(key,image);return json({image:'/api/images/'+key},201);
    }
    if(request.method==='GET'&&path==='/admin/data')return json({products:await rows('SELECT * FROM products ORDER BY created_at DESC'),submissions:await rows("SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.status='pending' ORDER BY s.created_at")});
    if(request.method==='POST'&&path==='/admin/products'){
     const p=productInput(body);const id=clean(body.id,100)||randomUUID();
     const found=await rows('SELECT id FROM products WHERE id=$1',[id]);
     if(found.length)await rows('UPDATE products SET name=$1,brand=$2,category=$3,description=$4,image=$5,url=$6,affiliate=$7,active=$8 WHERE id=$9',[p.name,p.brand,p.category,p.description,p.image,p.url,p.affiliate,p.active,id]);
     else await rows('INSERT INTO products(id,name,brand,category,description,image,url,affiliate,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,p.name,p.brand,p.category,p.description,p.image,p.url,p.affiliate,p.active]);
     return json({ok:true,id});
    }
    if(request.method==='POST'&&path==='/admin/review'){
     const id=clean(body.id,100);if(!['approve','reject'].includes(body.action))fail(400,'Choose approve or reject.');
     if(body.action==='reject'){const changed=await rows("UPDATE submissions SET status='rejected' WHERE id=$1 AND status='pending' RETURNING id",[id]);if(!changed.length)fail(409,'This submission has already been reviewed.');}
     else{
      const approved=await rows(`WITH reviewed AS (UPDATE submissions SET status='approved' WHERE id=$1 AND status='pending' RETURNING *) INSERT INTO products(id,name,brand,category,description,image,url) SELECT $2,name,brand,category,description,image,url FROM reviewed RETURNING id`,[id,randomUUID()]);
      if(!approved.length)fail(409,'This submission has already been reviewed.');
     }
     return json({ok:true});
    }
   }
   fail(404,'This page could not be found.');
  }catch(error){
   if(error.status)return json({error:error.message},error.status);
   if(error.code==='23505')return json({error:'This brand and product already exist. Edit the existing product instead.'},409);
   console.error('API failure',error.code||error.name);return json({error:'The service is not ready right now. Please try again shortly.'},503);
  }
 };
}
