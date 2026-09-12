import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreSections} from '../public/explore-rankings.mjs';
test('Explore uses qualifying real activity and limits repeated features',()=>{
 const p=(id,total,slays,extra={})=>({id,total,slays,created_at:'2026-01-01',...extra});
 const products=[p('one',1,1),p('gloss',20,19),p('toss',20,1),p('split',20,10),p('old',10,8,{previous_total:5}),p('recent',10,8,{recent_total:4}),p('saved',0,0,{watchlist_count:3}),p('new',0,0,{created_at:'2026-09-01'}),p('hidden',100,100,{active:false,recent_total:100,watchlist_count:100})];
 const sections=exploreSections(products),get=id=>sections.find(s=>s.id===id).products;
 assert.equal(get('trending')[0].id,'recent');
 assert.equal(get('gloss')[0].id,'gloss');
 assert.equal(get('toss')[0].id,'toss');
 assert.equal(get('divided')[0].id,'split');
 assert.equal(get('watchlisted')[0].id,'saved');
 assert.equal(get('new')[0].id,'new');
 for(const id of ['gloss','toss','divided'])assert.ok(get(id).every(p=>p.total>=10));
 const counts={};for(const s of sections)for(const p of s.products)counts[p.id]=(counts[p.id]||0)+1;
 assert.ok(Object.values(counts).every(n=>n<=2));assert.equal(counts.hidden,undefined);
 assert.ok(exploreSections([]).every(s=>!s.products.length));
 assert.equal(products[0].id,'one');
});
