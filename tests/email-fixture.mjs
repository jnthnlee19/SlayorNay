// Test-only provider identities. Production always validates the JWT with Netlify.
export async function seedIdentity(db,id,admin=false){
 await db.query("INSERT INTO users(id,username,password_hash,recovery_hash,is_admin) VALUES($1,$1,'identity-only','identity-only',$2) ON CONFLICT(id) DO NOTHING",[id,admin]);
 await db.query('INSERT INTO identity_links(identity_id,user_id,email) VALUES($1,$1,$2) ON CONFLICT DO NOTHING',[id,id+'@example.test']);
 return {id,email:id+'@example.test',confirmedAt:'2026-09-10'};
}
