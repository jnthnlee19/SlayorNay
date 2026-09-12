import { mkdir, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild-wasm';
// Check every shipped JavaScript module, not just the three entry points.
for (const directory of ['public','server','netlify/functions','scripts']) {
 for (const file of await readdir(directory)) {
  if (/\.m?js$/.test(file)) execFileSync(process.execPath,['--check',directory+'/'+file]);
 }
}
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await build({entryPoints:['public/identity-client.js'],outfile:'dist/identity-client.js',bundle:true,format:'esm',platform:'browser',minify:true});
console.log(`Built ${ (await readdir('dist')).length } public files. Netlify Functions and database migrations remain server-side.`);
