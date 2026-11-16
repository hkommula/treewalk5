/* Planner controls and intentional route exit, retaining the campus collection. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,750))');
const capture=async name=>writeFile(`.qa/change-walk-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const idle=async()=>{await c.waitFor('map.loaded()&&!map.isMoving()&&!mapView.annotationsPending&&!mapView.annotationFrame',30000);await settle();};
const checkAll=async()=>{
    await idle();
    const result=await c.evaluate(`(()=>{const features=mapView.data.get('uow-trees').data.features,ids=new Set(map.queryRenderedFeatures({layers:['uow-tree-points']}).map(f=>f.id)),p=map.getPadding(),canvas=map.getContainer();return {status:walk.status,route:currentRoute.length,target:walk.target,all:mapView.allTreesVisible,display:mapView.displayMarkerIds.size,native:ids.size,total:treeData.length,clusters:mapView.data.get('uow-explore').data.features.length,clean:['route-network','route-direct','repeats','repeat-labels','endpoints'].every(id=>mapView.data.get('uow-'+id).data.features.length===0),coordinates:features.every(f=>{const t=treeById.get(f.id);return f.geometry.coordinates[0]===t.lng&&f.geometry.coordinates[1]===t.lat&&f.properties.stopNumber===0}),fit:treeData.every(t=>{const q=map.project([t.lng,t.lat]);return q.x>=p.left-1&&q.x<=canvas.clientWidth-p.right+1&&q.y>=p.top-1&&q.y<=canvas.clientHeight-p.bottom+1})}})()`);
    assert.equal(result.status,'exploring');assert.equal(result.route,0);assert.equal(result.target,null);assert.ok(result.all&&result.clean&&result.coordinates&&result.fit,JSON.stringify(result));
    assert.equal(result.display,result.total);assert.equal(result.native,result.total);assert.equal(result.clusters,0);
};
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?change-walk-qa'});await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.loaded()',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await c.evaluate('toggleVisited(treeData.at(-1).id);document.getElementById("route-options").open=true');await settle();
    const visits=await c.evaluate('JSON.stringify([...visitedStops])'),route=await c.evaluate('JSON.stringify(currentRoute.map(t=>t.key))');
    assert.ok(await c.evaluate('[...document.getElementById("walk-mode").options].filter(o=>o.value).every(o=>/~[0-9]+ min/.test(o.textContent))'));
    assert.ok(await c.evaluate('document.getElementById("walk-exit").getClientRects().length>0&&document.getElementById("walk-exit").closest("summary")===null'));
    const cache=await c.evaluate('(()=>{const original=walkingLeg;let calls=0;walkingLeg=(...a)=>{calls++;return original(...a)};for(let i=0;i<10;i++)updateWalkChoices();walkingLeg=original;return calls})()');assert.equal(cache,0);
    assert.equal(await c.evaluate('JSON.stringify(currentRoute.map(t=>t.key))'),route,'displaying estimates must not replace the route');
    await c.evaluate('document.getElementById("walk-mode").value="casual";document.getElementById("walk-mode").dispatchEvent(new Event("change"))');
    assert.equal(await c.evaluate('walk.mode'),'casual');assert.equal(await c.evaluate('document.getElementById("route-options").open'),true);
    await c.evaluate('document.getElementById("walk-start").value=String(treeData.find(t=>t.name==="Blue Box").id);document.getElementById("walk-start").dispatchEvent(new Event("change"))');
    assert.ok(await c.evaluate('currentRoute[0].id===walk.startId&&walk.useGPSStart===false'));
    await c.evaluate('document.getElementById("walk-mode").value="full";document.getElementById("walk-mode").dispatchEvent(new Event("change"))');
    assert.ok(await c.evaluate('Number(document.getElementById("walk-mode").selectedOptions[0].textContent.match(/[0-9]+/)[0])===Math.ceil(remainingMetrics().minutes)'),'full-walk estimate excludes already visited stops');
    await c.evaluate('document.getElementById("walk-exit").click()');await checkAll();
    assert.equal(await c.evaluate('JSON.stringify([...visitedStops])'),visits);assert.equal(await c.evaluate('walk.tick'),null);assert.equal(await c.evaluate('locationTracker.isTracking()'),false);
    assert.equal(await c.evaluate('document.getElementById("walk-mode").value'),'');
    assert.equal(await c.evaluate('JSON.parse(localStorage.getItem(WALK_KEY)).status'),'exploring');
    await c.call('Page.reload');await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.loaded()',30000);await checkAll();
    assert.equal(await c.evaluate('walkView'),'browse');assert.equal(await c.evaluate('JSON.stringify([...visitedStops])'),visits);
    for(const theme of ['light','aerial','dark']){await c.evaluate(`mapView.setBasemap('${theme}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${theme}'`);await checkAll();}
    await c.evaluate('window.plannerLoss=map.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context");plannerLoss.loseContext();void 0');await c.waitFor('mapView.contextLost');await settle();
    await c.evaluate('plannerLoss.restoreContext();void 0');await c.waitFor('mapView.ready&&!mapView.contextLost',30000);await checkAll();
    await c.evaluate('activateTree(treeData[1].id)');
    assert.equal(await c.evaluate('document.querySelectorAll(".tree-stepper button")[1].disabled'),false);
    await c.evaluate('document.querySelectorAll(".tree-stepper button")[1].click()');assert.ok(await c.evaluate('activeTreeId===treeData[2].id'));
    await c.evaluate('document.querySelectorAll(".tree-stepper button")[0].click()');assert.ok(await c.evaluate('activeTreeId===treeData[1].id'));
    await c.evaluate('returnFromTreeDetails()');await settle();await c.evaluate('fitHomeView({animate:false})');await checkAll();
    for(const [width,height,font]of [[320,640,100],[375,812,100],[390,844,100],[430,932,100],[600,960,100],[640,360,100],[844,390,100],[768,1024,100],[1440,960,100],[320,640,200],[390,844,200],[640,360,200],[1440,960,200]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});
        await c.evaluate(`document.documentElement.style.fontSize='${font}%';showHome();document.getElementById('route-options').open=true`);await settle();
        assert.equal(await c.evaluate('document.querySelector(".home-stop-preview").hidden'),true,'no empty Along the walk section after restoring exploration');
        const ui=await c.evaluate(`(()=>{const body=document.querySelector('.panel-body'),summary=document.querySelector('#route-options summary').getBoundingClientRect(),close=document.getElementById('walk-exit').getBoundingClientRect(),controls=[...document.querySelectorAll('#route-options select,#walk-exit')];return {overflow:body.scrollWidth>body.clientWidth||document.documentElement.scrollWidth>document.documentElement.clientWidth,clear:summary.right<=close.left+1,targets:controls.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44}),icons:[...document.querySelectorAll('.walk-planner .lucide-icon')].filter(e=>e.getClientRects().length).every(e=>getComputedStyle(e).maskImage.includes('/icons/'))}})()`);
        assert.ok(!ui.overflow&&ui.clear&&ui.targets&&ui.icons,`${width}@${font}: ${JSON.stringify(ui)}`);
        await c.evaluate('document.getElementById("walk-start").value=String(treeData[1].id);document.getElementById("walk-start").dispatchEvent(new Event("change"))');
        assert.equal(await c.evaluate('currentRoute.length'),0,'changing the start alone does not recreate an exited walk');
        if(font===100&&[390,1440].includes(width))await capture(width===390?'mobile':'desktop');
        console.log(`${width}x${height}@${font}%: compact controls, header separation, icons and no overflow passed.`);
    }
    await c.evaluate('document.documentElement.style.fontSize=""');await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await settle();
    await c.evaluate('document.getElementById("walk-mode").value="quick";document.getElementById("walk-mode").dispatchEvent(new Event("change"))');
    assert.equal(await c.evaluate('walk.status'),'preview');assert.ok(await c.evaluate('currentRoute.length>0&&!mapView.allTreesVisible&&mapView.data.get("uow-explore").data.features.length>0'));
    await c.call('Browser.grantPermissions',{origin:'http://127.0.0.1:8765',permissions:['geolocation']});
    const location=await c.evaluate('({latitude:UOW_CENTER[0],longitude:UOW_CENTER[1],accuracy:8})');await c.call('Emulation.setGeolocationOverride',location);
    await c.evaluate('startWalking();document.getElementById("gps-toggle").click()');await c.waitFor('locationTracker.isTracking()&&userLoc');
    await c.evaluate('showHome();document.getElementById("route-options").open=true');await settle();
    await c.evaluate('document.getElementById("walk-exit").focus()');
    await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await checkAll();
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false);assert.equal(await c.evaluate('walk.tick'),null);assert.equal(await c.evaluate('JSON.stringify([...visitedStops])'),visits);
    await c.call('Browser.resetPermissions');assert.deepEqual(c.errors,[]);
    console.log('Network estimates/cache, manual start, exit/fit all native markers, visited persistence, refresh/themes, re-planning and keyboard/GPS exit passed.');
}finally{try{await c.call('Browser.resetPermissions');}finally{c.close();}}
