const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../src/walk-core.js');
const trees=Array.from({length:50},(_,i)=>({id:i+1,key:`tree-${i+1}`,x:i*50}));
const distance=(a,b)=>Math.abs(a.x-b.x);
test('short walks include stop time and respect their budgets',()=>{
    for(const [mode,limit] of [['quick',15],['casual',30],['nearby',15]]){
        const plan=core.plan(trees,{x:-100},mode,distance);
        assert.ok(plan.route.length>0&&plan.route.length<50);
        assert.ok(plan.minutes<=limit);
        assert.ok(plan.minutes>=plan.route.length*core.STOP_MINUTES);
    }
    assert.equal(core.plan(trees,{x:0},'full',distance).route.length,50);
});
test('unreachable or over-budget starts do not create impossible short routes',()=>{
    assert.equal(core.plan(trees,{x:-100000},'quick',distance).route.length,0);
    assert.equal(core.plan(trees,{x:0},'full',()=>Infinity).route.length,0);
});
test('progress counts only visited trees on the selected route',()=>{
    assert.deepEqual(core.progress(trees.slice(0,3),new Set([1,49,50]),new Set([2])),{done:1,total:3,skipped:1,percent:33});
});
test('stable keys restore progress after CSV reordering and discard unknown trees',()=>{
    const reordered=trees.map(t=>({...t,id:51-t.id}));
    const restored=core.restore({version:1,mode:'quick',route:['tree-1','tree-2','removed','tree-1'],visited:['tree-2'],skipped:['tree-1'],target:'tree-1',status:'active',elapsed:30000,distance:120},reordered);
    assert.deepEqual(restored.route,[50,49]);assert.deepEqual(restored.visited,[49]);assert.equal(restored.target,50);assert.equal(restored.status,'paused');
    assert.equal(core.restore({version:99},trees),null);
    assert.equal(core.restore({version:1,route:'invalid'},trees),null);
});
test('arrival requires accurate, fresh, separated readings; drift resets evidence',()=>{
    const now=Date.now(),target={id:1};let readings=[];
    for(const offset of [-6000,-3000,0])readings=core.nearArrival(readings,{accuracy:8,distance:10,timestamp:now+offset},target,30);
    assert.equal(readings.length,3);
    assert.equal(core.nearArrival(readings,{accuracy:80,distance:0,timestamp:now},target,30).length,0);
    assert.equal(core.nearArrival(readings,{accuracy:8,distance:100,timestamp:now},target,30).length,0);
    assert.equal(core.nearArrival(readings,{accuracy:8,distance:0,timestamp:now-20000},target,30).length,0);
});
test('a saved route preview stays a preview until the user starts walking',()=>{
    const restored=core.restore({version:1,mode:'quick',route:['tree-1'],visited:[],status:'preview'},trees);
    assert.equal(restored.status,'preview');
});
