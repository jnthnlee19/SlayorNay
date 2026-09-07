export function parseProductCSV(text){
 if(text.length>1000000)throw new Error('Choose a CSV file smaller than 1 MB.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
 if(c==='"'){if(cell||closed)throw new Error('Invalid CSV quoting. Export the sheet as CSV again.');quoted=true;}else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()))rows.push(row);row=[];}}else{if(closed)throw new Error('Unexpected text after a quoted cell.');cell+=c;}}
 if(quoted)throw new Error('A quoted cell is unfinished. Export the sheet as CSV again.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 const aliases={link:'url','purchase link':'url','image link':'image','product name':'name'};
 const headers=(rows.shift()||[]).map(x=>{const h=x.trim().toLowerCase();return aliases[h]||h;});
 if(new Set(headers).size!==headers.length)throw new Error('The CSV has duplicate column names.');

 if(!rows.length)throw new Error('This file has column headings but no products. Open it in Excel or Google Sheets, add one product per row below the headings, save as CSV, then upload it again.');if(rows.length>100)throw new Error('Include no more than 100 product rows.');
 const categories=['Polish','Gel','Extensions','Tools','Prep & finish','Nail care'];
 return rows.map((r,i)=>{const p=Object.fromEntries(headers.map((h,j)=>[h,(r[j]||'').trim()]));p.issues=[];p.sourceRow=i+2;if(r.length>headers.length)p.issues.push('Extra cells: '+r.slice(headers.length).join(' | '));for(const key of ['name','brand','category','url','image','description','affiliate'])p[key]||='';const matched=categories.find(c=>c.toLowerCase()===p.category.toLowerCase());if(matched)p.category=matched;if(p.affiliate&&!/^(true|false|yes|no)$/i.test(p.affiliate))p.issues.push('Unrecognized affiliate value: '+p.affiliate+'. Review the link type.');p.affiliate=/^(true|yes)$/i.test(p.affiliate);return p;});
}
