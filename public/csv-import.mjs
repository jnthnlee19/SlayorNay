export function parseProductCSV(text){
 if(text.length>1000000)throw new Error('Choose a CSV file smaller than 1 MB.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
 if(c==='"'){if(cell||closed)throw new Error('Invalid CSV quoting. Export the sheet as CSV again.');quoted=true;}else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()))rows.push(row);row=[];}}else{if(closed)throw new Error('Unexpected text after a quoted cell.');cell+=c;}}
 if(quoted)throw new Error('A quoted cell is unfinished. Export the sheet as CSV again.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 const aliases={link:'url','purchase link':'url','image link':'image','product name':'name'};
 const headers=(rows.shift()||[]).map(x=>{const h=x.trim().toLowerCase();return aliases[h]||h;});
 if(new Set(headers).size!==headers.length)throw new Error('The CSV has duplicate column names.');
 for(const key of ['name','brand','category'])if(!headers.includes(key))throw new Error('Missing column: '+key+'. Use the downloadable template.');
 if(!rows.length||rows.length>100)throw new Error('Include between 1 and 100 product rows.');
 const categories=['Polish','Gel','Extensions','Tools','Prep & finish','Nail care'];
 const seen=new Set();return rows.map((r,i)=>{const error=msg=>{throw new Error('Row '+(i+2)+': '+msg);};if(r.length!==headers.length)error('column count does not match the header.');const p=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));if(!p.name||!p.brand)error('name and brand are required.');p.category=categories.find(c=>c.toLowerCase()===p.category.toLowerCase());if(!p.category)error('use Polish, Gel, Extensions, Tools, Prep & finish, or Nail care.');for(const key of ['url','image']){p[key]||='';if(p[key]){try{const u=new URL(p[key]);if(u.protocol!=='https:'||u.username||u.password)throw 0;}catch{error(key+' must be a full HTTPS link.');}}}for(const [key,max] of Object.entries({name:120,brand:80,description:1500,url:2000,image:2000}))if((p[key]||'').length>max)error(key+' is too long.');if(p.affiliate&&!/^(true|false|yes|no)$/i.test(p.affiliate))error('affiliate must be true, false, yes, or no.');p.affiliate=/^(true|yes)$/i.test(p.affiliate||'');const identity=p.brand.toLowerCase()+'\n'+p.name.toLowerCase();if(seen.has(identity))error('duplicate brand and product name in this file.');seen.add(identity);return p;});
}
