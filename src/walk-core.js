/* Pure route/progress helpers shared by the app and dependency-free tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TreeWalkCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const MODES={quick:{label:'Quick Walk · ~15 min',minutes:15},casual:{label:'Casual Walk · ~30 min',minutes:30},full:{label:'Full Walk · all trees',minutes:Infinity},nearby:{label:'Explore Nearby',minutes:15}};
    const WALK_METRES_PER_MINUTE=72, STOP_MINUTES=1.5;
    function stableId(row){return String(row['Tree ID']||`${String(row['Common Name']).trim().toLowerCase()}|${Number(row.Latitude).toFixed(6)}|${Number(row.Longitude).toFixed(6)}`);}
    function plan(trees,start,mode,distance){
        const budget=(MODES[mode]||MODES.full).minutes;
        const remaining=[...trees],route=[];let point=start,metres=0,minutes=0;
        while(remaining.length){
            let index=-1,best=Infinity;
            remaining.forEach((tree,i)=>{const d=distance(point,tree);if(Number.isFinite(d)&&d<best){best=d;index=i;}});
            if(index<0)break;
            const cost=best/WALK_METRES_PER_MINUTE+STOP_MINUTES;
            if(minutes+cost>budget)break;
            point=remaining.splice(index,1)[0];route.push(point);metres+=best;minutes+=cost;
        }
        return {route,metres,minutes};
    }
    function progress(route,visited,skipped){const done=route.filter(t=>visited.has(t.id)).length;return {done,total:route.length,skipped:route.filter(t=>skipped.has(t.id)&&!visited.has(t.id)).length,percent:route.length?Math.round(done/route.length*100):0};}
    function restore(raw,trees){
        if(!raw||raw.version!==1||!Array.isArray(raw.route)||!Array.isArray(raw.visited))return null;
        const byKey=new Map(trees.map(t=>[t.key,t.id]));
        const ids=values=>[...new Set((Array.isArray(values)?values:[]).filter(k=>typeof k==='string'&&byKey.has(k)).map(k=>byKey.get(k)))];
        return {mode:MODES[raw.mode]?raw.mode:'full',route:ids(raw.route),visited:ids(raw.visited),skipped:ids(raw.skipped),target:byKey.get(raw.target)||null,startId:byKey.get(raw.start)||trees[0]?.id,positionId:byKey.get(raw.position)||byKey.get(raw.start)||trees[0]?.id,status:['preview','active','paused','saved','complete'].includes(raw.status)?(raw.status==='active'?'paused':raw.status):'saved',elapsed:Math.min(604800000,Math.max(0,Number(raw.elapsed)||0)),distance:Math.min(1000000,Math.max(0,Number(raw.distance)||0)),estimatedDistance:Math.min(1000000,Math.max(0,Number(raw.estimatedDistance)||0))};
    }
    function nearArrival(readings,location,target,threshold){
        if(!target||!Number.isFinite(location.accuracy)||location.accuracy>Math.min(threshold,35)||!Number.isFinite(location.timestamp)||Date.now()-location.timestamp>15000)return [];
        if(location.distance+location.accuracy*.5>threshold)return [];
        const recent=readings.filter(r=>location.timestamp-r.timestamp<=20000&&location.timestamp>r.timestamp);
        if(recent.length&&location.timestamp-recent[recent.length-1].timestamp<1500)return recent;
        return [...recent,{timestamp:location.timestamp}].slice(-3);
    }
    return {MODES,WALK_METRES_PER_MINUTE,STOP_MINUTES,stableId,plan,progress,restore,nearArrival};
});
