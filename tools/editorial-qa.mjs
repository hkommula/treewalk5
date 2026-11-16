/* Mockup layout and settings regression. Uses tools/preview.py and CDP :9222. */
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();
const settle=()=>c.evaluate('new Promise(r=>setTimeout(r,750))');
const capture=async name=>writeFile(`.qa/editorial-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
try{
    await mkdir('.qa',{recursive:true});
    await c.call('Network.enable');
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?editorial'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getLayer("uow-tree-points")',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await c.evaluate('document.fonts.ready');await settle();
    await c.evaluate('startWalking();showWalkSummary()');await settle();await capture('summary');
    await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();await capture('tools');
    await c.evaluate('mapView.boundaryReady');
    const limits=await c.evaluate('map.getMaxBounds().toArray()');
    assert.deepEqual(limits,await c.evaluate('CampusScene.expandedBounds(mapView.boundary,2)'));
    assert.equal(await c.evaluate('document.querySelectorAll(".map-layer-settings select").length'),0);
    // Native radio arrows operate the pills, including asynchronous style loads.
    await c.evaluate('document.querySelector("#basemap input:checked").focus()');
    await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await c.waitFor('mapView.ready&&mapView.basemap==="light"');
    for(const mode of ['aerial','dark']){
        await c.evaluate(`document.querySelector('#basemap input[value="${mode}"]').click()`);
        await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);
        assert.equal(await c.evaluate('document.querySelector("#basemap input:checked").value'),mode);
        assert.deepEqual(await c.evaluate('map.getMaxBounds().toArray()'),limits);
    }
    const state=()=>c.evaluate('({route:currentRoute.map(t=>t.key),target:walk.target,skipped:[...walk.skipped],visited:[...visitedStops],elapsed:walk.elapsed})');
    const original=await state();
    for(const [width,height] of [[320,640],[375,812],[430,932],[640,360],[768,1024],[1440,960]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('closeUtility();showWalkSummary()');await settle();
        const summary=await c.evaluate(`(()=>{const s=document.getElementById('walk-summary'),grid=s.querySelector('.summary-grid');return {values:[...grid.querySelectorAll('strong')].map(el=>el.textContent),columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:s.scrollWidth>s.clientWidth,panelOverflow:document.querySelector('.panel-body').scrollWidth>document.querySelector('.panel-body').clientWidth}})()`);
        assert.equal(summary.overflow,false,`${width}: summary overflow`);assert.equal(summary.panelOverflow,false);
        assert.equal(summary.columns,3,`${width}: two-row, three-column statistics`);
        const progress=await c.evaluate('TreeWalkCore.progress(currentRoute,visitedStops,walk.skipped)');
        assert.equal(summary.values[0],`${progress.done} / ${progress.total}`);
        await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();
        await c.evaluate('document.getElementById("tools-advanced").open=true');await settle();
        const inspector=await c.evaluate(`(()=>{const el=document.getElementById('map-tools'),r=el.getBoundingClientRect(),arrival=document.querySelector('.arrival-setting');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:visualViewport.height,overflow:el.scrollWidth>el.clientWidth,arrival:getComputedStyle(arrival).flexDirection}})()`);
        assert.ok(inspector.left>=0&&inspector.top>=0&&inspector.right<=width+1&&inspector.bottom<=inspector.height+1,JSON.stringify(inspector));
        assert.equal(inspector.overflow,false,`${width}: inspector overflow`);
        assert.equal(inspector.arrival,'row');
        assert.ok(await c.evaluate(`(()=>{const r=document.querySelector('.arrival-setting .setting-label').getBoundingClientRect(),i=document.querySelector('.number-control').getBoundingClientRect();return Math.abs((r.top+r.bottom)/2-(i.top+i.bottom)/2)<1})()`),'arrival distance remains one row');
        const segments=await c.evaluate(`([...document.querySelectorAll('.segmented-control')].map(group=>{const r=[...group.querySelectorAll('label')].map(el=>el.getBoundingClientRect());return {id:group.id,singleLine:r.every(b=>Math.abs(b.top-r[0].top)<1),touch:r.every(b=>b.width>=43&&b.height>=43)}}))`);
        for(const segment of segments){assert.ok(segment.singleLine,`${width}: ${segment.id} single line`);assert.ok(segment.touch,`${width}: ${segment.id} touch targets`);}
        assert.deepEqual(await c.evaluate('map.getMaxBounds().toArray()'),limits,'geographic limits do not change with screen size');
        assert.deepEqual(await state(),original,'reading tools never resets progress');
        if([375,768,1440].includes(width))await capture(`tools-${width}`);
        if(width===1440)await c.evaluate('closeUtility()'),await capture('summary-desktop');
        console.log(`${width}x${height}: summary data, columns, inspector rows and bounds passed.`);
    }
    await c.evaluate('closeUtility();startWalking();skipStop();toggleVisited(walk.target);walk.elapsed=180000;walk.estimatedDistance=240;showWalkSummary()');
    assert.deepEqual(await c.evaluate('[...document.querySelectorAll("#walk-summary .summary-grid strong")].map(el=>el.textContent)'),['1 / 7','240 m','3 min']);
    await c.evaluate('document.getElementById("walk-summary").querySelector("[data-summary-action]").click()');
    assert.equal(await c.evaluate('walk.status'),'active');
    await c.evaluate('document.getElementById("map-tools-toggle").click();document.getElementById("tools-advanced").open=true');
    assert.equal(await c.evaluate('walk.status'),'active','opening inspector does not pause navigation');
    const active=await state();
    for(const [id,setting,layers] of [['layer-route','route',['uow-route-network-line','uow-route-direct-line','uow-endpoints-circle']],['layer-buildings','buildings',['uow-buildings-fill','uow-building-labels']]]){
        await c.evaluate(`document.querySelector('#${id} input[value="off"]').click()`);
        assert.equal(await c.evaluate(`mapView.settings.${setting}`),false);
        for(const layer of layers)assert.equal(await c.evaluate(`map.getLayoutProperty('${layer}','visibility')`),'none');
    }
    await c.evaluate('document.getElementById("auto-centre-selection").click();saveWalk();');
    assert.equal(await c.evaluate('walkingPreferences.autoCentreSelection'),false);
    await c.call('Page.reload',{ignoreCache:true});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getStyle()?.sources?.openmaptiles',30000);
    assert.equal(await c.evaluate('walkingPreferences.autoCentreSelection'),false);
    assert.equal(await c.evaluate('mapView.settings.route||mapView.settings.buildings'),false);
    assert.deepEqual(await c.evaluate('({route:currentRoute.map(t=>t.key),target:walk.target,skipped:[...walk.skipped],visited:[...visitedStops]})'),{route:active.route,target:active.target,skipped:active.skipped,visited:active.visited});
    await c.evaluate('mapView.setBasemap("light")');await c.waitFor('mapView.basemap==="light"&&mapView.ready');
    assert.equal(await c.evaluate('map.getLayoutProperty("uow-route-network-line","visibility")'),'none','hidden layers survive a basemap switch');
    await c.evaluate('mapView.setBuildingsVisible(true);mapView.setRouteVisible(true);startWalking();closeUtility();');await settle();
    const centre=await c.evaluate('map.getCenter().toArray()');
    await c.evaluate('mapView.options.onTreeClick(treeData.at(-1).id)');await settle();
    assert.deepEqual(await c.evaluate('map.getCenter().toArray()'),centre,'disabled selection centring respects the camera');
    await c.evaluate('findTreeOnMap(treeData.at(-1).id,false)');await settle();
    assert.notDeepEqual(await c.evaluate('map.getCenter().toArray()'),centre,'explicit Find on map still works');
    const beforeFit=await c.evaluate('({target:walk.target,route:currentRoute.map(t=>t.key)})');
    await c.evaluate('document.getElementById("map-tools-toggle").click();document.getElementById("home-view").click()');await settle();
    assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),false,'Fit walk keeps the inspector open');
    assert.equal(await c.evaluate('uiPanel.inert'),true);
    assert.deepEqual(await c.evaluate('({target:walk.target,route:currentRoute.map(t=>t.key)})'),beforeFit);
    await c.evaluate('closeUtility()');
    for(const width of [320,375,430,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('document.documentElement.style.fontSize="200%";showWalkSummary();');await settle();
        await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();
        assert.equal(await c.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false,`${width}: 200% page overflow`);
        assert.equal(await c.evaluate('document.getElementById("map-tools").scrollWidth>document.getElementById("map-tools").clientWidth'),false,`${width}: 200% inspector overflow`);
        assert.ok(await c.evaluate(`(()=>{const row=document.querySelector('.arrival-setting'),r=row.getBoundingClientRect(),n=row.querySelector('.number-control').getBoundingClientRect();return getComputedStyle(row).flexDirection==='row'&&n.right<=r.right+1})()`),`${width}: enlarged arrival row fits`);
        await c.evaluate('closeUtility();document.documentElement.style.fontSize="";');
    }
    await c.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await c.evaluate('motionOK()'),false);
    await c.call('Emulation.setEmulatedMedia',{features:[]});
    assert.deepEqual(c.errors,[]);
    console.log('Resume, live statistics, visit/skip preservation, layer/preferences persistence, camera selection and 200% text passed.');
}finally{c.close();}
