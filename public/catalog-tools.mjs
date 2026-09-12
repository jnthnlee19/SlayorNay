// Public UI fails closed: only explicitly visible products may enter the deck.
export const visibleProducts=products=>(Array.isArray(products)?products:[]).filter(p=>p.active===true);
export function reconcileQueue(queue,index,products){
 const allowed=new Set(visibleProducts(products).map(p=>p.id));
 return {queue:queue.filter(id=>allowed.has(id)),index:queue.slice(0,index).filter(id=>allowed.has(id)).length};
}
export function adminProducts(products,search='',sort='new'){
 const query=search.trim().toLowerCase();
 const list=products.filter(p=>(p.name+' '+p.brand).toLowerCase().includes(query));
 const name=(a,b)=>(a.brand+' '+a.name).localeCompare(b.brand+' '+b.name);
 const sorts={category:(a,b)=>a.category.localeCompare(b.category)||name(a,b),missing:(a,b)=>Number(!!a.image)-Number(!!b.image)||name(a,b),image:(a,b)=>Number(!!b.image)-Number(!!a.image)||name(a,b),hidden:(a,b)=>Number(a.active)-Number(b.active)||name(a,b),visible:(a,b)=>Number(b.active)-Number(a.active)||name(a,b),name};
 return sorts[sort]?list.sort(sorts[sort]):list;
}
