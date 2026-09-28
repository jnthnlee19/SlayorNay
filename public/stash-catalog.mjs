import {effectiveHex,effectiveFamily,colorInfo} from './stash-color.mjs';
export const BRANDS = ['Kiara Sky', 'Chaun Legend', 'Aprés', 'PLA', 'DND', 'DND Diva', 'DND DC', 'SofGel'];
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’‘]/g, "'").trim();
const collator = new Intl.Collator('en', {numeric:true, sensitivity:'base'});
export function filterCatalog(catalog, { query='', brand='', view='all', sort='brand', family='' }, owned, overrides={}) {
  const terms = normalize(query).replace(/#/g, '').split(/\s+/).filter(Boolean);
  const colors=new Map(catalog.map(p=>[p.id,colorInfo(effectiveHex(p,overrides))]));
  const tie=(a,b)=>BRANDS.indexOf(a.brand)-BRANDS.indexOf(b.brand)||collator.compare(a.number,b.number)||collator.compare(a.name,b.name);
  return catalog.filter(p => (!brand || p.brand === brand) && (!family||(family==='unknown'?!colors.get(p.id):effectiveFamily(p,overrides)===family)) && (view === 'all' || (view === 'owned' ? owned.has(p.id) : !owned.has(p.id))) && terms.every(t => normalize(`${p.brand} ${p.name} ${p.number} ${(p.aliases || []).join(' ')}`).includes(t)))
    .sort((a,b) => {
      if(['light','dark','hue'].includes(sort)){
        const ca=colors.get(a.id),cb=colors.get(b.id);
        if(!ca||!cb)return ca?-1:cb?1:tie(a,b);
        return (sort==='light'?cb.luminance-ca.luminance:sort==='dark'?ca.luminance-cb.luminance:ca.hue-cb.hue||cb.luminance-ca.luminance)||tie(a,b);
      }
      return sort === 'name' ? collator.compare(a.name,b.name) || collator.compare(a.brand,b.brand) : sort === 'number' ? collator.compare(a.number,b.number) || collator.compare(a.brand,b.brand) : tie(a,b);
    });
}
