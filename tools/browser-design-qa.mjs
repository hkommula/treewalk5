/* Collection browser, synchronized selection and the existing walking session. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,750))');
const capture=async name=>writeFile(`.qa/browser-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?browser-design-qa'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.loaded()',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    assert.ok(await c.evaluate('document.getElementById("home-navigation-slot").contains(document.querySelector(".browser-navigation"))&&document.getElementById("close-browser").getAttribute("aria-current")==="page"'));
    await c.evaluate('document.getElementById("browser-trees-tab").click()');assert.equal(await c.evaluate('walkView'),'browse');
    await c.evaluate('selectWalkMode("full",false);showBrowser()');
    const session=await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),target:walk.target,elapsed:walk.elapsed,skipped:[...walk.skipped],visited:[...visitedStops]})');
    const blue=await c.evaluate('treeData.find(t=>t.name==="Blue Box").id');
    assert.equal(await c.evaluate('document.querySelectorAll(".tree-card").length'),49);
    const names=await c.evaluate('[...document.querySelectorAll(".card-name")].map(e=>e.textContent)');assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b)));
    await c.evaluate(`document.getElementById('card-${blue}').click()`);await settle();
    assert.equal(await c.evaluate('walkView'),'browse');assert.equal(await c.evaluate('activeTreeId'),blue);
    assert.equal(await c.evaluate('document.querySelectorAll(".tree-row[data-selected=true]").length'),1);
    assert.ok(await c.evaluate(`document.getElementById('card-${blue}').getAttribute('aria-pressed')==='true'`));
    assert.ok(await c.evaluate('mapView.selectedId===activeTreeId&&mapView.focusLabel.dataset.preview==="true"'));
    await c.waitFor('!mapView.focusLabel.hidden&&mapView.focusLabel.querySelector("img").complete&&mapView.focusLabel.querySelector("img").naturalWidth');
    assert.ok(await c.evaluate('mapView.focusLabel.querySelector("img").currentSrc.endsWith(".webp")'));
    await c.evaluate('mapView.focusLabel.querySelector("img").dispatchEvent(new Event("error"))');assert.equal(await c.evaluate('mapView.focusLabel.querySelector("img").hidden'),true);
    await c.evaluate('mapView.focusPhotoSignature=null;mapView.updateFocusLabel()');
    await c.evaluate('stopsList.scrollTop=stopsList.scrollHeight');await settle();
    const fixed=await c.evaluate('document.getElementById("browse-controls").getBoundingClientRect().top');
    await c.evaluate('stopsList.scrollTop=0');await settle();
    assert.equal(await c.evaluate('document.getElementById("browse-controls").getBoundingClientRect().top'),fixed,'desktop list scrolls independently');
    await c.evaluate('mapView.focusLabel.click()');assert.equal(await c.evaluate('walkView'),'detail');
    assert.equal(await c.evaluate('activeTreeId'),blue);await c.evaluate('document.getElementById("detail-back").click()');assert.equal(await c.evaluate('walkView'),'browse');
    await c.evaluate(`document.querySelector('[data-tree-details="${blue}"]').click()`);assert.equal(await c.evaluate('walkView'),'detail','list details works without relying on map preview');
    await c.evaluate('document.getElementById("detail-back").click();document.getElementById("tree-search").value="baueriana";document.getElementById("tree-search").dispatchEvent(new Event("input"))');await settle();
    assert.equal(await c.evaluate('document.querySelectorAll(".tree-card").length'),1);assert.equal(await c.evaluate('document.getElementById("tree-count").textContent'),'1 tree');
    await c.evaluate('document.getElementById("tree-search").value="";document.getElementById("tree-search").dispatchEvent(new Event("input"))');await settle();
    await c.evaluate(`toggleVisited(${blue});document.querySelector('[data-filter=visited]').click()`);
    assert.equal(await c.evaluate('document.querySelectorAll(".tree-card").length'),1);assert.equal(await c.evaluate('Number(document.querySelector(".tree-card").dataset.treeId)'),blue);
    await c.evaluate(`document.querySelector('[data-filter=unvisited]').click()`);assert.equal(await c.evaluate('document.querySelectorAll(".tree-card").length'),48);
    await c.evaluate(`toggleVisited(${blue});document.querySelector('[data-filter=nearby]').click()`);
    assert.equal(await c.evaluate('document.getElementById("tree-sort").value'),'distance');assert.equal(await c.evaluate('document.getElementById("tree-sort").disabled'),true);
    const distances=await c.evaluate('[...document.querySelectorAll(".tree-card")].map(e=>walkingLeg(walkOrigin(),treeById.get(Number(e.dataset.treeId))).distance)');assert.ok(distances.every((d,i)=>!i||d>=distances[i-1]));
    await c.evaluate('document.querySelector("[data-filter=all]").click();document.getElementById("tree-sort").value="route";document.getElementById("tree-sort").dispatchEvent(new Event("change"))');
    assert.deepEqual(await c.evaluate('[...document.querySelectorAll(".tree-card")].map(e=>Number(e.dataset.treeId))'),await c.evaluate('currentRoute.map(t=>t.id)'));
    assert.equal(await c.evaluate('JSON.stringify({route:currentRoute.map(t=>t.key),target:walk.target,elapsed:walk.elapsed,skipped:[...walk.skipped],visited:[...visitedStops]})'),session);
    await c.evaluate('document.getElementById("tree-sort").value="name";document.getElementById("tree-sort").dispatchEvent(new Event("change"))');
    for(const [width,height,font]of [[320,640,100],[375,812,100],[390,844,100],[430,932,100],[600,960,100],[640,360,100],[844,390,100],[768,1024,100],[1024,768,100],[1440,960,100],[320,640,200],[390,844,200],[640,360,200],[1440,960,200]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});
        await c.evaluate(`document.documentElement.style.fontSize='${font}%';showBrowser();selectBrowserTree(${blue});document.querySelector('.panel-body').scrollTop=0`);await settle();
        const ui=await c.evaluate(`(()=>{const body=document.querySelector('.panel-body'),controls=[...document.querySelectorAll('#browse-controls button,#tree-search,#tree-sort,.card-details,.tree-card')].filter(e=>e.getClientRects().length);return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||body.scrollWidth>body.clientWidth,targets:controls.every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44}),selected:document.querySelectorAll('.tree-row[data-selected=true]').length,sorts:document.querySelectorAll('#tree-sort').length,half:!isSheetLayout()||uiPanel.offsetHeight<=visualViewport.height*.5+1}})()`);
        assert.ok(!ui.overflow&&ui.targets&&ui.half&&ui.selected===1&&ui.sorts===1,`${width}@${font}: ${JSON.stringify(ui)}`);
        if(font===100&&[320,390,1440].includes(width))await capture(`${width}`);
        console.log(`${width}x${height}@${font}%: fluid browser, single sort control, selection and accessible targets passed.`);
    }
    await c.evaluate('document.documentElement.style.fontSize=""');await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await settle();
    await c.evaluate('document.getElementById("tree-sort").focus()');
    for(const width of [390,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<1024});await settle();
        assert.ok(await c.evaluate('document.activeElement===document.getElementById("tree-sort")'),'sort focus survives responsive reparenting');
    }
    await c.call('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true});
    await c.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await settle();
    assert.equal(await c.evaluate('getComputedStyle(document.getElementById("tree-search")).fontSize'),'16px');
    assert.ok(await c.evaluate('document.querySelector(".panel-body").scrollWidth<=document.querySelector(".panel-body").clientWidth'));
    await c.call('Emulation.setTouchEmulationEnabled',{enabled:false});await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await settle();
    for(const [width,height,insets]of [[390,844,{top:44,bottom:34,left:0,right:0}],[844,390,{top:0,bottom:21,left:44,right:44}]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await c.call('Emulation.setSafeAreaInsetsOverride',{insets});await settle();
        assert.ok(await c.evaluate(`(()=>{const body=document.querySelector('.panel-body'),p=getComputedStyle(body);return parseFloat(p.paddingLeft)>=${insets.left}&&parseFloat(p.paddingRight)>=${insets.right}&&body.scrollWidth<=body.clientWidth&&(document.body.classList.contains('browser-scroll-all')||stopsList.clientHeight>=stopsList.querySelector('.tree-row').offsetHeight)})()`),'safe-area spacing and a reachable tree list');
        await c.evaluate('document.querySelector(".panel-body").scrollTop=document.querySelector(".panel-body").scrollHeight');await settle();
        assert.ok(await c.evaluate('(()=>{const b=document.querySelector(".panel-body").getBoundingClientRect(),r=stopsList.querySelector(".tree-row:last-child").getBoundingClientRect();return r.top<b.bottom&&r.bottom>b.top})()'),'last tree stays reachable on short/notched screens');
    }
    await c.call('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}});await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await settle();
    for(const theme of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${theme}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${theme}'&&map.loaded()`,30000);await settle();
        assert.ok(await c.evaluate(`activeTreeId===${blue}&&mapView.selectedId===${blue}&&walkView==='browse'&&document.querySelector('.tree-row[data-selected=true]')!==null`));
        assert.deepEqual(await c.evaluate('map.getPaintProperty("uow-route-network-line","line-dasharray")'),[2.5,2.5]);
    }
    await c.evaluate('mapView.set3D(true,false);map.easeTo({bearing:40,duration:0});void 0');await settle();
    const centre=await c.evaluate('map.getCenter().toArray()');await c.evaluate('document.getElementById("map-north").click()');await settle();
    assert.ok(Math.abs(await c.evaluate('map.getBearing()'))<.01);assert.ok((await c.evaluate('map.getCenter().toArray()')).every((v,i)=>Math.abs(v-centre[i])<1e-8),'north reset preserves geographic centre');
    await c.evaluate('mapView.set3D(false,false);findTreeOnMap(activeTree.id,false)');await settle();
    // Move the intended marker into the clear map area before native selection.
    await c.evaluate('flyToVisible([currentRoute[0].lat,currentRoute[0].lng],19,{animate:false})');await settle();
    const native=await c.evaluate('(()=>{const t=currentRoute[0],p=map.project([t.lng,t.lat]);return {x:p.x,y:p.y}})()');
    await c.call('Input.dispatchMouseEvent',{type:'mousePressed',...native,button:'left',clickCount:1});await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',...native,button:'left',clickCount:1});await settle();
    assert.equal(await c.evaluate('walkView'),'browse');assert.ok(await c.evaluate('activeTreeId===currentRoute[0].id&&document.getElementById(`card-${activeTreeId}`).getAttribute("aria-pressed")==="true"'));
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false);assert.deepEqual(c.errors,[]);
    console.log('Search, A–Z/nearest/tour order, visited filters, preview/details, native selection, compass, themes and preserved session passed.');
}finally{c.close();}
