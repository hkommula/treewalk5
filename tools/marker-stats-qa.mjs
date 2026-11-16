/* Minimal focused-tree cards: thumbnails, placement, state and cached access. */
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
        const ui=await c.evaluate(`(()=>{const label=mapView.focusLabel,r=label.getBoundingClientRect(),media=label.querySelector('.focus-label-media'),name=label.querySelector('.focus-label-name'),chevron=label.querySelector('.focus-label-chevron'),m=media.getBoundingClientRect(),n=name.getBoundingClientRect(),ch=chevron.getBoundingClientRect();return {hidden:label.hidden,bounds:r.left>=0&&r.top>=0&&r.right<=visualViewport.width+1&&r.bottom<=visualViewport.height+1,overflow:label.scrollWidth>label.clientWidth,text:label.textContent,name:activeTree.name,metadata:!!label.querySelector('.marker-stats,.marker-stat'),inline:m.right<=n.left&&n.right<=ch.left,centred:Math.abs(m.top+m.height/2-n.top-n.height/2)<1,thumbnail:!media.hidden,chevron:!chevron.hidden,touch:r.height>=44&&r.width>=44,height:r.height,blur:getComputedStyle(label).backdropFilter,ellipsis:getComputedStyle(name).textOverflow,nowrap:getComputedStyle(name).whiteSpace}})()`);
        if(ui.hidden){assert.ok(height<400&&width>height,`${width}x${height}: only hide when the short landscape map has no clear placement: ${JSON.stringify(ui)}`);console.log(`${width}x${height}: hides rather than overlap the route/sheet when no clear placement remains.`);continue;}
        assert.ok(ui.bounds&&!ui.overflow&&ui.inline&&ui.centred&&ui.thumbnail&&ui.chevron&&ui.touch,`${width}: ${JSON.stringify(ui)}`);
        assert.equal(ui.text,ui.name);assert.equal(ui.metadata,false);assert.ok(ui.height<=50,'compact card retains a full touch target');
        assert.equal(ui.blur,'none');assert.equal(ui.ellipsis,'ellipsis');assert.equal(ui.nowrap,'nowrap');
        assert.equal(await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),target:walk.target,visited:[...visitedStops]})'),snapshot);
        if([390,1440].includes(width))await capture(width===390?'mobile':'desktop');
        console.log(`${width}x${height}: thumbnail/name/chevron, compact touch target and responsive bounds passed.`);
    }
    const cached=await c.evaluate(`(()=>{mapView.updateFocusLabel();const original=walkingLeg;let count=0;walkingLeg=(...args)=>{count++;return original(...args)};for(let i=0;i<20;i++)mapView.updateFocusLabel();const idle=count;userLoc={lat:treeData[0].lat+.0001,lng:treeData[0].lng,accuracy:5,timestamp:Date.now()};for(let i=0;i<20;i++)mapView.updateFocusLabel();const gps=count;walkingLeg=original;userLoc=null;mapView.updateFocusLabel();return {idle,gps}})()`);
    assert.deepEqual(cached,{idle:0,gps:1},'camera updates reuse the leg; a new location computes it once');
    await c.evaluate('toggleVisited(activeTree.id)');await settle();
    assert.equal(await c.evaluate('map.getFeatureState({source:"uow-trees",id:activeTree.id}).visited'),true);
    assert.equal(await c.evaluate('mapView.focusLabel.textContent'),await c.evaluate('activeTree.name'));
    assert.match(await c.evaluate('mapView.focusLabel.getAttribute("aria-label")'),/Visited/);
    await c.evaluate('toggleVisited(activeTree.id);walk.skipped.add(activeTree.id);refreshWalk()');await settle();
    assert.equal(await c.evaluate('map.getFeatureState({source:"uow-trees",id:activeTree.id}).skipped'),true);
    assert.equal(await c.evaluate('mapView.focusLabel.textContent'),await c.evaluate('activeTree.name'));
    assert.match(await c.evaluate('mapView.focusLabel.getAttribute("aria-label")'),/Skipped/);
    await c.evaluate('walk.skipped.clear();refreshWalk()');
    for(const mode of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        assert.equal(await c.evaluate('document.querySelectorAll(".tree-focus-label .marker-stats").length'),0);
        assert.ok(await c.evaluate('!mapView.focusLabel.querySelector(".focus-label-media").hidden&&!mapView.focusLabel.querySelector(".focus-label-chevron").hidden'));
        assert.match(await c.evaluate('mapView.focusLabel.getAttribute("aria-label")'),/Tour stop 3 of 49.*distance.*GPS is off/);
    }
    const before=await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),visited:[...visitedStops],target:walk.target})');
    await c.evaluate('mapView.focusLabel.click()');assert.equal(await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),visited:[...visitedStops],target:walk.target})'),before);
    for(const width of [390,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1024});
        await c.evaluate('document.documentElement.style.fontSize="200%";scheduleLayout()');await settle();
        assert.equal(await c.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false);
        assert.equal(await c.evaluate('mapView.focusLabel.querySelector(".focus-label-name").textContent'),await c.evaluate('activeTree.name'));
        const longName=await c.evaluate(`(()=>{const label=mapView.focusLabel,name=label.querySelector('.focus-label-name'),original=name.textContent;name.textContent=original.repeat(12);label.hidden=false;const r=name.getBoundingClientRect(),card=label.getBoundingClientRect(),result={truncated:name.scrollWidth>name.clientWidth,contained:r.left>=card.left&&r.right<=card.right,height:r.height,lineHeight:parseFloat(getComputedStyle(name).lineHeight)};name.textContent=original;return result})()`);
        assert.ok(longName.truncated&&longName.contained&&longName.height<=longName.lineHeight+1,'long names truncate on one line within the card');
        await c.evaluate('document.documentElement.style.fontSize=""');
    }
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    for(const action of ['showHome()','startWalking()','openWalkingDetails()','showWalkSummary()','showBrowser()']){
        await c.evaluate(action);await settle();
        assert.ok(await c.evaluate(`(()=>{const label=mapView.focusLabel;return !!mapView.labelTree&&label.children.length===3&&label.textContent===mapView.labelTree.name&&!label.querySelector('.marker-stats')&&!label.querySelector('.focus-label-media').hidden&&!label.querySelector('.focus-label-chevron').hidden})()`),action+' uses the same minimal popup');
    }
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false);assert.deepEqual(c.errors,[]);
    console.log('Unchanged visit/skip markers, cached accessible GPS context, all themes, native click, enlarged text and session preservation passed.');
}finally{c.close();}
