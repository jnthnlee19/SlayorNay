// Derive rankings from the existing catalog response, without extra requests.
export function exploreSections(products){
 const all=products.filter(p=>p.active!==false), rated=all.filter(p=>p.total>=10);
 const share=p=>p.slays/p.total;
 const tie=(a,b)=>b.total-a.total||a.id.localeCompare(b.id);
 const activity=p=>2*(p.recent_total||0)+(p.previous_total||0);
 const sections=[
  {id:'trending',title:'Trending',description:'Voting activity over 48 hours, weighted toward the latest 24 hours. At least 3 recent votes; changed votes count once.',products:all.filter(p=>(p.recent_total||0)+(p.previous_total||0)>=3).sort((a,b)=>activity(b)-activity(a)||tie(a,b))},
  {id:'gloss',title:'Biggest Glosses',description:'Highest Gloss percentage with at least 10 votes and a Gloss majority.',products:rated.filter(p=>share(p)>.5).sort((a,b)=>share(b)-share(a)||tie(a,b))},
  {id:'toss',title:'Biggest Tosses',description:'Highest Toss percentage with at least 10 votes and a Toss majority.',products:rated.filter(p=>share(p)<.5).sort((a,b)=>share(a)-share(b)||tie(a,b))},
  {id:'divided',title:'Beauty Divided',description:'Closest to 50/50, with 40–60% Gloss and at least 10 votes.',products:rated.filter(p=>share(p)>=.4&&share(p)<=.6).sort((a,b)=>Math.abs(share(a)-.5)-Math.abs(share(b)-.5)||tie(a,b))},
  {id:'watchlisted',title:'Most Watchlisted',description:'The products saved by the most community members.',products:all.filter(p=>p.watchlist_count>0).sort((a,b)=>b.watchlist_count-a.watchlist_count||tie(a,b))},
  {id:'new',title:'New Products',description:'The latest additions to the voting desk.',products:[...all].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||a.id.localeCompare(b.id))}
 ];
 // Keep ranking order, but limit any product to two featured rows.
 const appearances=new Map();
 return sections.map(section=>({...section,products:section.products.filter(p=>(appearances.get(p.id)||0)<2).slice(0,6).map(p=>{appearances.set(p.id,(appearances.get(p.id)||0)+1);return p;})}));
}
