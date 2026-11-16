/* Focused marker name + inline stats: live data, sizing, placement and caching. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,750))');
const capture=async name=>writeFile(`.qa/marker-stats-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?marker-stats-qa'});await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.loaded()',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await c.evaluate('selectWalkMode("full",false);showBrowser();activateTree(currentRoute[2].id)');
    const snapshot=await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),target:walk.target,visited:[...visitedStops]})');
    for(const [width,height]of [[320,640],[375,812],[390,844],[430,932],[640,360],[768,1024],[1024,768],[1440,960]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});await settle();
        await c.evaluate('findTreeOnMap(activeTree.id,false)');await settle();
        await c.waitFor('map.loaded()&&!map.isMoving()&&!mapView.annotationsPending&&!mapView.annotationFrame&&!mapView.annotationTimer&&!mapView.labelFrame',30000);
        const ui=await c.evaluate(`(()=>{const label=mapView.focusLabel,row=label.querySelector('.marker-stats'),r=label.getBoundingClientRect(),items=[...row.children],values=items.map(e=>e.querySelector('.metric-'+(label.dataset.compact==='true'?'compact':'full')).getBoundingClientRect());return {hidden:label.hidden,bounds:r.left>=0&&r.top>=0&&r.right<=visualViewport.width+1&&r.bottom<=visualViewport.height+1,overflow:label.scrollWidth>label.clientWidth,font:getComputedStyle(row).fontSize,weight:getComputedStyle(row).fontWeight,gap:getComputedStyle(row).columnGap,fill:getComputedStyle(row).backgroundColor,icons:items.map(e=>{const s=getComputedStyle(e.querySelector('i'));return {width:s.width,height:s.height,mask:s.maskImage}}),values:items.map(e=>e.innerText),baseline:values.every(v=>Math.abs(v.top-values[0].top)<1),compact:label.dataset.compact}})()`);
        if(ui.hidden){assert.ok(height<400&&width>height,`${width}x${height}: only hide when the short landscape map has no clear placement: ${JSON.stringify(ui)}`);console.log(`${width}x${height}: hides rather than overlap the route/sheet when no clear placement remains.`);continue;}
        assert.ok(ui.bounds&&!ui.overflow&&ui.baseline,`${width}: ${JSON.stringify(ui)}`);
        assert.equal(ui.font,'12px');assert.equal(ui.weight,'500');assert.equal(ui.gap,'8px');assert.equal(ui.fill,'rgba(0, 0, 0, 0)');
        assert.equal(ui.icons.length,3);assert.ok(ui.icons.every(i=>i.width==='13px'&&i.height==='13px'&&i.mask.includes('/icons/')));
        assert.equal(ui.values[0],ui.compact==='true'?'#3':'Tree 3');assert.equal(ui.values[2],ui.compact==='true'?'Unvisited':'Not visited');
        assert.match(ui.values[1],/\d.* m/);if(width>=1024)assert.equal(ui.compact,'false');
        assert.equal(await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),target:walk.target,visited:[...visitedStops]})'),snapshot);
        if([390,1440].includes(width))await capture(width===390?'mobile':'desktop');
        console.log(`${width}x${height}: inline stats, 13px icons/12px medium text, responsive labels and bounds passed.`);
    }
    const cached=await c.evaluate(`(()=>{mapView.updateFocusLabel();const original=walkingLeg;let count=0;walkingLeg=(...args)=>{count++;return original(...args)};for(let i=0;i<20;i++)mapView.updateFocusLabel();const idle=count;userLoc={lat:treeData[0].lat+.0001,lng:treeData[0].lng,accuracy:5,timestamp:Date.now()};for(let i=0;i<20;i++)mapView.updateFocusLabel();const gps=count;walkingLeg=original;userLoc=null;mapView.updateFocusLabel();return {idle,gps}})()`);
    assert.deepEqual(cached,{idle:0,gps:1},'camera updates reuse the leg; a new location computes it once');
    await c.evaluate('toggleVisited(activeTree.id)');await settle();
    assert.ok(await c.evaluate('mapView.focusLabel.querySelector(".lucide-circle-check")!==null'));
    assert.match(await c.evaluate('mapView.focusLabel.getAttribute("aria-label")'),/Visited/);
    await c.evaluate('toggleVisited(activeTree.id);walk.skipped.add(activeTree.id);refreshWalk()');await settle();
    assert.ok(await c.evaluate('mapView.focusLabel.querySelector(".lucide-circle-minus")!==null'));
    assert.match(await c.evaluate('mapView.focusLabel.getAttribute("aria-label")'),/Skipped/);
    await c.evaluate('walk.skipped.clear();refreshWalk()');
    for(const mode of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        assert.equal(await c.evaluate('document.querySelectorAll(".tree-focus-label .marker-stats").length'),1);
        assert.match(await c.evaluate('mapView.focusLabel.getAttribute("aria-label")'),/Tour stop 3 of 49.*distance.*GPS is off/);
    }
    const before=await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),visited:[...visitedStops],target:walk.target})');
    await c.evaluate('mapView.focusLabel.click()');assert.equal(await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),visited:[...visitedStops],target:walk.target})'),before);
    for(const width of [390,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1024});
        await c.evaluate('document.documentElement.style.fontSize="200%";scheduleLayout()');await settle();
        assert.equal(await c.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false);
        assert.equal(await c.evaluate('getComputedStyle(mapView.focusLabel.querySelector(".marker-stats")).fontSize'),'24px');
        await c.evaluate('document.documentElement.style.fontSize=""');
    }
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false);assert.deepEqual(c.errors,[]);
    console.log('Live visit/skip/GPS data, cached routing, all themes, native click, enlarged text and session preservation passed.');
}finally{c.close();}
