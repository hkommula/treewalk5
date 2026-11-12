/* Start the static server on 8765 and Chromium CDP on 9222. Native WebGL is
 * required (software WebGL is suitable for regression testing). */
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();const {call,evaluate,waitFor}=c;
const settle=()=>evaluate('new Promise(r=>setTimeout(r,400))');
const screenshot=async name=>writeFile(`.qa/${name}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const waitMap=()=>waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map&&map.getLayer("uow-tree-points")',30000);
try{
    await mkdir('.qa',{recursive:true});
    const init=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
        localStorage.clear();window.__gps={starts:0,active:new Set()};
        const watch=navigator.geolocation.watchPosition.bind(navigator.geolocation),clear=navigator.geolocation.clearWatch.bind(navigator.geolocation);
        navigator.geolocation.watchPosition=(...args)=>{const id=watch(...args);window.__gps.starts++;window.__gps.active.add(id);return id;};
        navigator.geolocation.clearWatch=id=>{window.__gps.active.delete(id);return clear(id);};
    `});
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await call('Page.navigate',{url:'http://127.0.0.1:8765/'});await waitMap();
    await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await waitFor('map.getStyle()?.sources?.openmaptiles&&map.getLayer("uow-buildings-fill")',30000);
    assert.equal(await evaluate('maplibregl.getVersion()'),'5.24.0');
    assert.equal(await evaluate('typeof L'),'undefined');
    assert.equal(await evaluate('window.__gps.starts'),0);
    assert.equal(await evaluate('treeData.length'),49);
    assert.equal(await evaluate('networkSegments.length'),923);
    assert.equal(await evaluate('map.getLayer("uow-buildings-fill").source'),'openmaptiles');
    assert.equal(await evaluate('!!map.getSource("uow-buildings")'),false,'no local building source');
    assert.equal(await evaluate('getComputedStyle(document.body).fontFamily.split(",")[0]'),'Montserrat');
    await waitFor('document.querySelector(".maplibregl-ctrl-attrib").dataset.initialised');
    assert.equal(await evaluate('document.querySelector(".maplibregl-ctrl-attrib").classList.contains("maplibregl-compact-show")'),false);
    await evaluate('document.querySelector(".maplibregl-ctrl-attrib-button").click();');
    assert.equal(await evaluate('document.querySelector(".maplibregl-ctrl-attrib").classList.contains("maplibregl-compact-show")'),true);
    await evaluate('document.querySelector(".maplibregl-ctrl-attrib-button").click();');
    assert.equal(await evaluate('document.querySelectorAll(".maplibregl-canvas").length'),1);
    console.log('Phase 1: native map, GIS sources and renderer loaded');

    for(const mode of ['quick','casual','full','nearby']){
        const route=await evaluate(`selectWalkMode('${mode}');({count:currentRoute.length,...remainingMetrics()})`);
        assert.ok(route.count>0);
        if(['quick','nearby'].includes(mode))assert.ok(route.minutes<=15);
        if(mode==='casual')assert.ok(route.minutes<=30);
    }
    await evaluate('selectWalkMode("quick");startWalking();');
    assert.equal(await evaluate('walkView'), 'walking');
    assert.equal(await evaluate('sheetState'),'peek');
    const oldTarget=await evaluate('walk.target');
    await evaluate('skipStop();');assert.notEqual(await evaluate('walk.target'),oldTarget);
    assert.equal(await evaluate(`map.getFeatureState({source:'uow-trees',id:${oldTarget}}).skipped`),true);
    assert.ok(await evaluate('mapView.data.get("uow-trees").data.features.every(f=>f.properties.stopNumber===(currentRoute.findIndex(t=>t.id===f.id)+1))'));
    await evaluate('toggleVisited(walk.target);');
    assert.equal(await evaluate('visitedStops.size'),1);
    assert.equal(await evaluate('map.getFeatureState({source:"uow-trees",id:[...visitedStops][0]}).visited'),true);

    await call('Browser.setPermission',{permission:{name:'geolocation'},setting:'denied',origin:'http://127.0.0.1:8765'});
    await evaluate('document.getElementById("gps-toggle").click();');
    await waitFor('!locationTracker.isTracking()&&document.getElementById("app-status").textContent.includes("permission denied")');
    await call('Browser.setPermission',{permission:{name:'geolocation'},setting:'granted',origin:'http://127.0.0.1:8765'});
    const destination=await evaluate('({latitude:targetTree().lat,longitude:targetTree().lng,accuracy:5})');
    await call('Emulation.setGeolocationOverride',destination);
    await evaluate('document.getElementById("gps-toggle").click();');
    await waitFor('locationTracker.isTracking()&&userLoc&&mapView.data.get("uow-gps").data.features.length>=2');
    assert.equal(await evaluate('window.__gps.active.size'),1);
    assert.notEqual(await evaluate('document.getElementById("app-status").dataset.category'),'gps','a fresh fix clears an old GPS warning');
    await evaluate('updateDynamicGPSContexts();');
    assert.ok(await evaluate('mapView.data.get("uow-nearby").data.features.length>0'));
    await evaluate('document.getElementById("custom-nearby-labels").checked=false;document.getElementById("custom-nearby-labels").dispatchEvent(new Event("change"));');
    assert.equal(await evaluate('mapView.data.get("uow-nearby").data.features.length'),0);
    await evaluate('document.getElementById("custom-nearby-labels").checked=true;document.getElementById("custom-nearby-labels").dispatchEvent(new Event("change"));');
    assert.equal(await evaluate('locationTracker._normalizeHeading(null)'),null);
    assert.equal(await evaluate('locationTracker.heading=null;locationTracker._onOrientation({alpha:90,absolute:false});locationTracker.getHeading()'),null);
    assert.equal(await evaluate('locationTracker._onOrientation({alpha:90,absolute:true});locationTracker.getHeading()'),270);
    await settle();
    assert.ok(await evaluate('mapView.data.get("uow-gps").data.features.some(f=>f.properties.kind==="heading")'));
    await evaluate('const now=Date.now();for(const t of [now-6000,now-3000,now])checkArrival({...userLoc,timestamp:t});updateNavigation();');
    assert.equal(await evaluate('document.getElementById("arrival").hidden'),false);
    assert.equal(await evaluate('visitedStops.size'),1,'arrival never marks a tree automatically');
    await evaluate('document.getElementById("nav-primary").click();');
    assert.equal(await evaluate('visitedStops.size'),2);
    await call('Emulation.setGeolocationOverride',{...destination,accuracy:100});
    await waitFor('userLoc&&userLoc.accuracy===100');
    assert.equal(await evaluate('walk.arrivalReadings.length'),0);
    await call('Emulation.setGeolocationOverride',destination);await waitFor('userLoc&&userLoc.accuracy===5');
    await evaluate('walk.follow=true;map.fire("dragstart");void 0;');
    assert.equal(await evaluate('walk.follow'),false);
    assert.equal(await evaluate('document.getElementById("resume-follow").hidden'),false);
    console.log('Phase 2: route modes, states, GPS, compass, arrival and follow passed');

    await evaluate('openWalkingDetails();');await settle();
    assert.equal(await evaluate('document.body.classList.contains("tree-card-open")'),true);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".header-stats")).display'),'grid');
    assert.equal(await evaluate('document.querySelectorAll(".about-row").length'),2);
    assert.equal(await evaluate('document.getElementById("detail-back").getAttribute("aria-label")'),'Back to walk');
    assert.equal(await evaluate('document.querySelector(".detail-badge").textContent'),await evaluate('`Stop ${currentRoute.findIndex(t=>t.id===activeTreeId)+1}`'));
    await waitFor('document.querySelector(".popup-img-hi").complete&&document.querySelector(".popup-img-hi").naturalWidth');
    assert.ok(await evaluate('(()=>{const img=document.querySelector(".popup-img-hi");return getComputedStyle(img).objectFit==="contain"&&Math.abs(img.clientWidth/img.clientHeight-img.naturalWidth/img.naturalHeight)<.03;})()'));
    await evaluate('openLightbox(imageVariant(activeTree,"640"));');
    await waitFor('document.getElementById("lightbox").style.display==="flex"&&document.getElementById("lightbox-img").complete');
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));');await settle();
    assert.equal(await evaluate('document.getElementById("lightbox").style.display'),'none');
    await screenshot('maplibre-card');
    await evaluate('document.getElementById("detail-back").click();');
    assert.equal(await evaluate('walkView'),'walking');
    assert.equal(await evaluate('walkingDetailsOpen'),false);
    await evaluate('showBrowser();');
    assert.equal(await evaluate('walkView'),'browse');
    assert.ok(await evaluate('document.querySelector("img.card-thumb").getAttribute("src").includes("-photo-")'));
    await evaluate('document.getElementById("tree-search").value="palm";document.getElementById("tree-search").dispatchEvent(new Event("input"));');await settle();
    assert.ok(await evaluate('[...document.querySelectorAll(".card-name")].every(e=>e.textContent.toLowerCase().includes("palm"))'));
    await evaluate('searchText="";document.getElementById("tree-search").value="";document.getElementById("close-browser").click();');
    console.log('Phase 3: original card structure, poster ratio, route badge and browsing passed');

    await evaluate('pauseFollow();mapView.set3D(true,false);');
    assert.equal(await evaluate('map.getPitch()'),48);
    assert.equal(await evaluate('map.getLayoutProperty("uow-buildings-3d","visibility")'),'visible');
    assert.equal(await evaluate('map.getLayoutProperty("uow-buildings-fill","visibility")'),'none');
    assert.equal(await evaluate('map.getStyle().layers.filter(l=>l.type==="fill-extrusion").length'),1);
    assert.ok(await evaluate('(()=>{const ids=map.getStyle().layers.map(l=>l.id);return ids.indexOf("uow-buildings-3d")>ids.indexOf("uow-repeats-line")&&ids.indexOf("uow-buildings-3d")<ids.indexOf("uow-tree-points")})()'));
    await evaluate('map.jumpTo({bearing:32});void 0;');
    const baseline=await evaluate('({target:walk.target,visited:[...visitedStops],skipped:[...walk.skipped],center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),watches:window.__gps.starts})');
    for(const mode of ['light','aerial','dark']){
        assert.equal(await evaluate(`mapView.setBasemap('${mode}')`),true);
        await waitFor(`mapView.ready&&mapView.basemap==='${mode}'&&map.getLayer('uow-gps-point')`);
        const state=await evaluate('({target:walk.target,visited:[...visitedStops],skipped:[...walk.skipped],center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),watches:window.__gps.starts})');
        assert.ok(state.center.every((value,index)=>Math.abs(value-baseline.center[index])<1e-8),`camera moved switching to ${mode}`);
        assert.deepEqual({...state,center:undefined},{...baseline,center:undefined},`state changed switching to ${mode}`);
        assert.ok(await evaluate('mapView.data.get("uow-gps").data.features.length>=2'));
        assert.equal(await evaluate('map.getFeatureState({source:"uow-trees",id:[...visitedStops][0]}).visited'),true);
        if(mode==='aerial')assert.equal(await evaluate('map.getSource("uow-scene-buildings").type'),'vector');
        assert.ok(await evaluate('(()=>{const ids=map.getStyle().layers.map(l=>l.id);return ids.indexOf("uow-buildings-3d")>ids.indexOf("uow-route-direct-line")})()'),'buildings stay above route geometry on style changes');
    }
    await screenshot('maplibre-3d');
    await evaluate('mapView.set3D(false,false);');
    assert.equal(await evaluate('map.getBearing()'),0);assert.equal(await evaluate('map.getPitch()'),0);
    assert.equal(await evaluate('map.dragRotate.isEnabled()'),false);
    await evaluate('map.getCanvas().focus();');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',modifiers:8,windowsVirtualKeyCode:38});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',modifiers:8,windowsVirtualKeyCode:38});await settle();
    assert.equal(await evaluate('map.getPitch()'),0,'2D stays overhead during keyboard gestures');
    c.on('Fetch.requestPaused',params=>call('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{}').toString('base64')}).catch(()=>{}));
    await call('Fetch.enable',{patterns:[{urlPattern:'https://tiles.openfreemap.org/styles/positron'}]});
    await evaluate('mapView.styleCache.delete("light");void 0;');
    assert.equal(await evaluate('mapView.setBasemap("light")'),false);
    assert.equal(await evaluate('mapView.basemap'),'dark');
    assert.ok(await evaluate('!!(map.getLayer("uow-tree-points")&&map.getSource("uow-route-network"))'));
    await call('Fetch.disable');
    console.log('Phase 4: all live basemaps, retained state, 3D extrusion and north-up 2D passed');

    // Use a source-free basemap for automated viewport sweeps, avoiding repeated
    // viewport tile requests to public services. App layers remain native WebGL.
    await evaluate('window.sweepStyle={version:8,glyphs:MidnightTheme.GLYPHS,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#001641"}}]};map.setStyle(sweepStyle);void 0;');
    await waitFor('mapView.ready&&map.getLayer("uow-tree-points")');
    await evaluate('openWalkingDetails();');
    let layouts=0;
    for(const width of [320,347,375,390,411,430,560,768,900,1024,1280,1440]){
        for(const height of [430,844]){
            await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});
            await evaluate('new Promise(r=>setTimeout(r,80))');
            const result=await evaluate('({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panel:document.querySelector(".panel-body").scrollWidth>document.querySelector(".panel-body").clientWidth})');
            assert.equal(result.overflow,false,`${width}x${height}`);assert.equal(result.panel,false,`panel ${width}x${height}`);layouts++;
        }
    }
    for(let width=320;width<=900;width+=17){
        await call('Emulation.setDeviceMetricsOverride',{width,height:640,deviceScaleFactor:1,mobile:true});
        await evaluate('new Promise(r=>setTimeout(r,25))');
        assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false);layouts++;
    }
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate('document.documentElement.style.fontSize="200%";scheduleLayout();');await settle();
    assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false);
    assert.equal(await evaluate('document.querySelector(".panel-body").scrollWidth>document.querySelector(".panel-body").clientWidth'),false);
    await evaluate('document.documentElement.style.fontSize="";setSheetState("half");');await settle();
    await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    const handle=await evaluate('(()=>{const r=dragHandleContainer.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[handle]});
    await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handle.x,y:handle.y+300}]});
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
    assert.equal(await evaluate('sheetState'),'peek');

    for(const [id,key,layer]of [['custom-campus-paths','campusPaths','uow-paths-line'],['custom-repeat-paths','repeatPaths','uow-repeats-line']]){
        await evaluate(`document.getElementById('${id}').checked=false;document.getElementById('${id}').dispatchEvent(new Event('change'));`);
        assert.equal(await evaluate(`customSettings.${key}`),false);
        assert.equal(await evaluate(`map.getLayoutProperty('${layer}','visibility')`),'none');
        await evaluate(`document.getElementById('${id}').checked=true;document.getElementById('${id}').dispatchEvent(new Event('change'));`);
    }
    await evaluate('openWalkingDetails();const img=document.querySelector(".popup-img-hi");img.dataset.fallback="true";handleTreeImageError(img,activeTreeId,"detail");');
    assert.ok(await evaluate('document.querySelector(".image-fallback")'));
    await evaluate('locationTracker._onLocationError({code:2,message:"Temporary unavailable"});void 0;');
    assert.equal(await evaluate('locationTracker.isTracking()'),true);
    await evaluate('showBrowser();map.jumpTo({center:[UOW_CENTER[1],UOW_CENTER[0]],zoom:16,padding:{top:0,right:0,bottom:0,left:0}});void 0;');
    await waitFor('map.queryRenderedFeatures({layers:["uow-clusters"]}).length>0');
    await evaluate('const cluster=map.queryRenderedFeatures({layers:["uow-clusters"]})[0];mapView.handleClick({point:map.project(cluster.geometry.coordinates)});');await settle();
    assert.ok(await evaluate('map.getZoom()>16&&map.getZoom()<=19'));
    await evaluate('flyToVisible([treeData[0].lat,treeData[0].lng],19,{animate:false});');await settle();
    await evaluate('mapView.handleClick({point:map.project([treeData[0].lng,treeData[0].lat])});');
    assert.equal(await evaluate('activeTreeId'),1,'native layer clicks select the correct stable tree');
    await evaluate('walk.lastReroute=0;walk.offRouteSince=0;userLoc={lat:treeData[0].lat,lng:treeData[0].lng,accuracy:5,timestamp:Date.now()};walk.lastRouteOrigin={...userLoc};checkReroute({...userLoc,lat:userLoc.lat+.00001});');
    assert.equal(await evaluate('walk.offRouteSince'),0);
    await evaluate('userLoc={lat:UOW_CENTER[0]+.003,lng:UOW_CENTER[1]-.003,accuracy:5,timestamp:Date.now()};walk.offRouteSince=Date.now()-15000;checkReroute(userLoc);');
    await evaluate('new Promise(r=>setTimeout(r,2300))');assert.ok(await evaluate('walk.lastReroute>0'));
    console.log(`Phase 5: ${layouts} fluid layouts, 200% text, touch gestures, settings and image/GPS failures passed`);

    // Force a real WebGL context loss and restoration while a single GPS watch runs.
    const hasLoss=await evaluate('window.lossExtension=map.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context");!!lossExtension');
    assert.equal(hasLoss,true);
    await evaluate('lossExtension.loseContext();void 0;');
    await waitFor('mapView.contextLost');
    assert.equal(await evaluate('document.getElementById("map-fallback").hidden'),false);
    await evaluate('saveWalk();');
    await evaluate('new Promise(r=>setTimeout(r,400))');
    await evaluate('lossExtension.restoreContext();void 0;');
    await waitFor('!mapView.contextLost&&mapView.ready',30000);
    assert.equal(await evaluate('document.getElementById("map-fallback").hidden'),true);
    assert.equal(await evaluate('window.__gps.active.size'),1);
    await evaluate('mapView.setBasemap("light");');await waitFor('mapView.ready&&mapView.basemap==="light"');
    await evaluate('mapView.set3D(true,false);pauseWalking();showWalkSummary();');
    assert.equal(await evaluate('walkView'),'summary');
    const saved=await evaluate('({target:treeById.get(walk.target)?.key,visited:visitedStops.size,skipped:walk.skipped.size})');
    await call('Page.reload');await waitMap();
    assert.deepEqual(await evaluate('({target:treeById.get(walk.target)?.key,visited:visitedStops.size,skipped:walk.skipped.size})'),saved);
    assert.equal(await evaluate('locationTracker.isTracking()'),false);
    assert.equal(await evaluate('mapView.basemap'),'light');
    assert.equal(await evaluate('mapView.settings.threeD'),true);
    console.log('Real context loss/restoration and saved progress passed');

    const noGL=await call('Page.addScriptToEvaluateOnNewDocument',{source:'const nativeContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes("webgl")?null:nativeContext.call(this,type,...args);};'});
    await call('Page.reload');await waitFor('typeof walkingReady!=="undefined"&&walkingReady',30000);
    assert.equal(await evaluate('map'),null);
    assert.equal(await evaluate('document.getElementById("map-fallback").hidden'),false);
    await evaluate('showBrowser();');assert.equal(await evaluate('document.querySelectorAll(".tree-card").length'),49);
    await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:noGL.identifier});
    assert.equal(c.errors.length,0,JSON.stringify(c.errors));
    console.log('No-WebGL browsing fallback passed; no uncaught JavaScript exceptions');
}finally{c.close();}
