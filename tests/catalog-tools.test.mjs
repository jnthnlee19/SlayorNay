import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleProducts,reconcileQueue,adminProducts} from '../public/catalog-tools.mjs';
test('hidden and unknown visibility never enter public products; removed cards preserve deck position',()=>{
 const products=[{id:'a',active:true},{id:'b',active:false},{id:'c',active:true},{id:'d'}];
 assert.deepEqual(visibleProducts(products).map(p=>p.id),['a','c']);
 assert.deepEqual(reconcileQueue(['b','a','d','c'],2,products),{queue:['a','c'],index:1});
 assert.deepEqual(reconcileQueue(['a','b'],1,products),{queue:['a'],index:1});
});
test('admin sorting combines search with category, image, and visibility ordering without changing data',()=>{
 const products=[{name:'Z',brand:'Test',category:'Tools',image:'x',active:true},{name:'A',brand:'Test',category:'Gel',image:'',active:false},{name:'B',brand:'Other',category:'Gel',image:'',active:true}];
 for(const sort of ['category','missing','hidden','name'])assert.equal(adminProducts(products,'test',sort)[0].name,'A');
 for(const sort of ['image','visible'])assert.equal(adminProducts(products,'test',sort)[0].name,'Z');
 assert.equal(products[0].name,'Z');assert.equal(adminProducts(products,'not found').length,0);
});
