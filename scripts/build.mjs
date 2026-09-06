import { mkdir, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const file of ['public/app.js','server/api.mjs','netlify/functions/api.mjs']) execFileSync(process.execPath,['--check',file]);
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
console.log(`Built ${ (await readdir('dist')).length } public files. Netlify Functions and database migrations remain server-side.`);
