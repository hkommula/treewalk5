/* Full Walk close-pair regression: native circles, label callouts and stable IDs. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,750))');
const capture=async name=>writeFile(`.qa/stops-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const check=async label=>{
    await c.waitFor('map.isSourceLoaded("uow-trees")&&map.isSourceLoaded("uow-stop-labels")&&!map.isMoving()');await settle();
    await c.evaluate('new Promise(resolve=>{map.once("idle",()=>resolve(true));map.triggerRepaint()})');
    const result=await c.evaluate(`(()=>{const rendered=map.queryRenderedFeatures({layers:['uow-tree-points','uow-stop-callouts']}),ids=new Set(rendered.map(f=>f.id)),callouts=mapView.data.get('uow-stop-labels').data.features;return currentRoute.slice(1,3).map(t=>({id:t.id,stop:currentRoute.indexOf(t)+1,visible:ids.has(t.id),normal:mapView.displayMarkerIds.has(t.id),callout:mapView.stopCalloutIds.has(t.id),calloutNumber:callouts.find(f=>f.id===t.id)?.properties.stopNumber,exact:mapView.data.get('uow-trees').data.features.some(f=>f.id===t.id&&f.geometry.coordinates[0]===t.lng&&f.geometry.coordinates[1]===t.lat)}))})()`);
    assert.ok(result.every(t=>t.visible&&t.exact&&(t.normal||t.callout)&&(!t.callout||t.calloutNumber===t.stop)),`${label}: ${JSON.stringify(result)}`);
    assert.equal(await c.evaluate('mapView.data.get("uow-explore").data.features.length'),0,'Full Walk numbered stops are never clustered');
    const missing=await c.evaluate(`(()=>{const ids=new Set(map.queryRenderedFeatures({layers:['uow-tree-points','uow-stop-callouts']}).map(f=>f.id)),features=[...mapView.data.get('uow-trees').data.features.filter(f=>mapView.displayMarkerIds.has(f.id)),...mapView.data.get('uow-stop-labels').data.features],canvas=map.getContainer();return features.filter(f=>{const p=map.project(f.geometry.coordinates);return p.x>20&&p.y>20&&p.x<canvas.clientWidth-20&&p.y<canvas.clientHeight-20&&!ids.has(f.id)}).map(f=>f.id)})()`);
    assert.deepEqual(missing,[],`${label}: every displayed marker has a native query entry`);
};
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?crowded-stops'});await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await c.waitFor('mapView.ready&&mapView.basemap==="dark"&&mapView.boundary&&map.getSource("openmaptiles")&&map.loaded()',30000);
    await c.evaluate('selectWalkMode("full",false);showHome();fitHomeView({animate:false})');await settle();
    assert.deepEqual(await c.evaluate('currentRoute.slice(1,3).map(t=>t.name)'),['Bolwarra','Coachwood']);
    const distance=await c.evaluate('getDistance(currentRoute[1].lat,currentRoute[1].lng,currentRoute[2].lat,currentRoute[2].lng)');assert.ok(distance>2&&distance<3);
    const geometry=await c.evaluate('JSON.stringify({trees:treeData.map(t=>[t.id,t.lng,t.lat]),route:mapView.data.get("uow-route-network").data})');
    await check('Full Walk fit');await capture('full-fit');
    for(let cycle=0;cycle<2;cycle++){
        await c.call('Page.reload');await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.loaded()');
        await c.evaluate('selectWalkMode("full",false);showHome();fitHomeView({animate:false})');await check(`reload ${cycle+1}`);
    }
    for(const [width,height]of [[320,640],[390,844],[800,1024],[1440,960]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});await settle();
        for(const zoom of [15,16,17,18,19]){
            await c.evaluate(`flyToVisible([currentRoute[1].lat,currentRoute[1].lng],${zoom},{animate:false})`);await check(`${width}@${zoom}`);
            assert.equal(await c.evaluate('JSON.stringify({trees:treeData.map(t=>[t.id,t.lng,t.lat]),route:mapView.data.get("uow-route-network").data})'),geometry,'label layout never changes canonical points or routing geometry');
        }
        console.log(`${width}px: both stops visible at zoom 15–19; tree and route geometry unchanged.`);
    }
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await settle();
    for(const mode of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        for(const threeD of [false,true]){
            await c.evaluate(`mapView.set3D(${threeD},false);flyToVisible([currentRoute[1].lat,currentRoute[1].lng],19,{animate:false})`);await check(`${mode}/${threeD?'3D':'2D'}`);
            if(threeD)assert.ok(await c.evaluate('(()=>{const layers=map.getStyle().layers.map(l=>l.id);return layers.indexOf("uow-buildings-3d")<layers.indexOf("uow-tree-points")&&layers.indexOf("uow-buildings-3d")<layers.indexOf("uow-stop-callouts")})()'));
        }
    }
    await c.evaluate('mapView.set3D(false,false);flyToVisible([currentRoute[1].lat,currentRoute[1].lng],19,{animate:false})');await check('before selection');
    const label=await c.evaluate('mapView.data.get("uow-stop-labels").data.features.find(f=>f.id===currentRoute[2].id)?.geometry.coordinates');assert.ok(label);
    const click=await c.evaluate(`(()=>{const p=map.project(${JSON.stringify(label)});return {x:p.x,y:p.y}})()`);
    await c.call('Input.dispatchMouseEvent',{type:'mousePressed',...click,button:'left',clickCount:1});await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',...click,button:'left',clickCount:1});await settle();await check('after selecting Coachwood');
    assert.equal(await c.evaluate('activeTreeId'),await c.evaluate('currentRoute[2].id'));
    assert.equal(await c.evaluate('document.querySelector(".detail-badge").textContent'),'Stop 3');
    await c.evaluate('activateTree(currentRoute[1].id);findTreeOnMap(currentRoute[1].id,false)');await check('before exact anchor click');
    const anchor=await c.evaluate('(()=>{const t=currentRoute[2],p=map.project([t.lng,t.lat]);return {x:p.x,y:p.y}})()');
    await c.call('Input.dispatchMouseEvent',{type:'mousePressed',...anchor,button:'left',clickCount:1});await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',...anchor,button:'left',clickCount:1});await settle();
    assert.equal(await c.evaluate('activeTreeId'),await c.evaluate('currentRoute[2].id'),'the small exact-position anchor opens its own tree');
    await c.evaluate('toggleVisited(currentRoute[1].id)');await settle();await check('visited neighbour');
    assert.equal(await c.evaluate('map.getFeatureState({source:"uow-stop-labels",id:currentRoute[1].id}).visited'),true);
    const recovery=await c.evaluate('window.crowdedLoss=map.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context");!!crowdedLoss');assert.ok(recovery);
    await c.evaluate('crowdedLoss.loseContext();void 0');await c.waitFor('mapView.contextLost');await c.evaluate('new Promise(r=>setTimeout(r,350))');await c.evaluate('crowdedLoss.restoreContext();void 0');await c.waitFor('mapView.ready&&!mapView.contextLost',30000);await check('graphics recovery');
    await capture('selection');assert.deepEqual(c.errors,[]);
    console.log(`2/3 are ${distance.toFixed(2)} m apart. Native click, Stop 3 ID, visited state, styles/3D and real context recovery passed.`);
}finally{c.close();}
