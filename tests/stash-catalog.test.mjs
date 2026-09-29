import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/stash-catalog.json' with {type:'json'};
import {filterCatalog} from '../public/stash-catalog.mjs';
test('Gel Pro-only browsing retains saved legacy shades and real DND additions',()=>{
 const all=catalog.polishes, legacy=all.find(p=>p.brand==='Kiara Sky'&&p.retired);
 assert.equal(new Set(all.map(p=>p.id)).size,all.length);
 const gel=filterCatalog(all,{brand:'Kiara Sky'},new Set());
 assert.equal(gel.length,180);assert.ok(gel.every(p=>/^HFG\d{3}$/.test(p.number)));
 for(const number of ['HFG001','HFG150','HFG151','HFG190','HFG200'])assert.ok(gel.some(p=>p.number===number));
 for(const number of ['856','875','899','901','929','966','998'])assert.ok(all.some(p=>p.brand==='DND'&&p.number===number));
 assert.ok(!filterCatalog(all,{view:'all'},new Set([legacy.id])).some(p=>p.id===legacy.id));
 assert.ok(filterCatalog(all,{view:'owned'},new Set([legacy.id])).some(p=>p.id===legacy.id));
 assert.ok(!filterCatalog(all,{view:'unowned'},new Set()).some(p=>p.retired));
});
