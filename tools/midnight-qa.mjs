/* Focused visual/layout QA. Run after maplibre-smoke with the same local server
 * and isolated Chromium. Viewport sweeps use a tile-free native style. */
import assert from 'node:assert/strict';
import {readFile,access,writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),networkErrors=[],localRequests=new Set(),logs=[];
c.on('Network.responseReceived',({response})=>{
    if(response.url.startsWith('http://127.0.0.1:8765/'))localRequests.add(decodeURI(response.url));
    if(response.status>=400)networkErrors.push({url:response.url,status:response.status});
});
c.on('Log.entryAdded',({entry})=>{if(entry.level==='error')logs.push(entry.text);});
await c.call('Network.enable');await c.call('Log.enable');
const settle=()=>c.evaluate('new Promise(r=>setTimeout(r,350))');
const capture=async name=>writeFile(`.qa/midnight-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const viewports=[[320,640],[375,812],[390,844],[430,932],[640,360],[768,1024],[844,390],[1024,768],[1440,960]];
try{
    const clear=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getLayer("uow-buildings-fill")',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:clear.identifier});
    await c.evaluate('document.fonts.ready.then(()=>true)');
    await c.waitFor('document.querySelector(".maplibregl-ctrl-attrib").dataset.initialised');
    await c.evaluate('document.querySelector(".maplibregl-ctrl-attrib-button").focus();');
    for(const [key,code,virtual,expected] of [['Enter','Enter',13,true],[' ','Space',32,false]]){
        await c.call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual,text:key==='Enter'?'\r':' '});
        await c.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});
        assert.equal(await c.evaluate('document.querySelector(".maplibregl-ctrl-attrib").classList.contains("maplibregl-compact-show")'),expected,'native attribution keyboard toggle');
    }
    await c.evaluate('dragHandleContainer.focus();');
    await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
    assert.equal(await c.evaluate('sheetState'),'expanded');
    await c.evaluate('setSheetState("half");');
    await c.waitFor('map.queryRenderedFeatures({layers:["uow-buildings-fill"]}).length>0',30000);
    await c.evaluate('new Promise(r=>setTimeout(r,600))');
    await capture('home-phone');
    await c.evaluate('startWalking();');await settle();await capture('next-stop-phone');
    await c.evaluate('openWalkingDetails();');await settle();
    await c.waitFor('document.querySelector(".popup-img-hi").complete&&document.querySelector(".popup-img-hi").naturalWidth');
    await capture('detail-phone');
    await c.evaluate('pauseWalking();showBrowser();');await settle();await capture('browse-phone');
    assert.ok(await c.evaluate('document.querySelector("img.card-thumb").currentSrc.includes("-photo-")'));
    await c.evaluate('showHome();mapView.set3D(true,false);');await settle();
    assert.ok(await c.evaluate('map.queryRenderedFeatures({layers:["uow-buildings-3d"]}).length>0'));
    await capture('3d-phone');
    await c.evaluate('mapView.set3D(false,false);mapView.setBasemap("aerial");');
    await c.waitFor('mapView.ready&&mapView.basemap==="aerial"&&map.getSource("nsw-imagery")');
    assert.ok(await c.evaluate('document.querySelector(".maplibregl-ctrl-attrib-inner").textContent.includes("OpenStreetMap contributors")'),'path attribution retained over aerial');
    assert.equal(await c.evaluate('!!map.getSource("uow-scene-buildings")'),false,'2D aerial loads no extra building tiles');
    await c.evaluate('mapView.set3D(true,false);');assert.equal(await c.evaluate('map.getSource("uow-scene-buildings").type'),'vector');
    await c.evaluate('mapView.set3D(false,false);');assert.equal(await c.evaluate('!!map.getSource("uow-scene-buildings")'),false);
    await c.evaluate('mapView.setBasemap("light");');await c.waitFor('mapView.ready&&mapView.basemap==="light"');
    await c.evaluate('new Promise(r=>setTimeout(r,600))');await capture('outdoor-phone');
    await c.evaluate('mapView.setBasemap("dark");');await c.waitFor('mapView.ready&&mapView.basemap==="dark"');
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.evaluate('showHome();fitHomeView({animate:false,maxZoom:18});');await settle();await capture('home-desktop');
    // Subsequent layout checks do not repeatedly download public map tiles.
    await c.evaluate('map.setStyle({version:8,glyphs:MidnightTheme.GLYPHS,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#001641"}}]});void 0;');
    await c.waitFor('mapView.ready&&map.getLayer("uow-stop-numbers")');
    let layouts=0;
    for(const [width,height] of viewports){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        for(const view of ['home','browse','walking','detail','summary']){
            await c.evaluate(({home:'showHome()',browse:'showBrowser()',walking:'startWalking()',detail:'openWalkingDetails()',summary:'pauseWalking();showWalkSummary()'})[view]);
            await settle();
            const layout=await c.evaluate(`(()=>{const p=uiPanel.getBoundingClientRect(),tools=document.querySelector('.map-controls').getBoundingClientRect(),body=document.querySelector('.panel-body');return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panelOverflow:body.scrollWidth>body.clientWidth,toolsCovered:isSheetLayout()&&tools.bottom>p.top+1,viewportHeight:visualViewport.height,panelHeight:p.height};})()`);
            assert.equal(layout.overflow,false,`${view} ${width}x${height}: page overflow`);
            assert.equal(layout.panelOverflow,false,`${view} ${width}x${height}: panel overflow`);
            assert.equal(layout.toolsCovered,false,`${view} ${width}x${height}: map controls covered`);
            assert.ok(layout.panelHeight<=layout.viewportHeight,`${view}: panel outside viewport`);layouts++;
            assert.deepEqual(await c.evaluate(`([...document.querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.textContent.trim()&&!b.getAttribute('aria-label')&&!b.title&&!b.querySelector('img[alt]')).map(b=>b.id||b.className))`),[],`${view}: icon controls need accessible names`);
            assert.deepEqual(await c.evaluate(`([...document.querySelectorAll('i.bi')].filter(i=>i.getClientRects().length&&getComputedStyle(i,'::before').content==='none').map(i=>i.className))`),[],`${view}: icon glyphs must exist`);
        }
        await c.evaluate('showHome();document.getElementById("custom-toggle").click();');await settle();
        const settings=await c.evaluate('(()=>{const r=document.getElementById("custom-panel").getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,top:r.top,w:innerWidth,h:visualViewport.height};})()');
        assert.ok(settings.left>=0&&settings.right<=settings.w+1&&settings.top>=0&&settings.bottom<=settings.h+1,`Settings ${width}x${height}`);
        await c.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));');
    }
    for(const width of [320,390,900,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('document.documentElement.style.fontSize="200%";showHome();scheduleLayout();');await settle();
        assert.equal(await c.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false,`200% ${width}`);
        await c.evaluate('showBrowser();');await settle();
        assert.equal(await c.evaluate('document.querySelector(".panel-body").scrollWidth>document.querySelector(".panel-body").clientWidth'),false,`200% filters ${width}`);
        await c.evaluate('document.documentElement.style.fontSize="";scheduleLayout();');
    }
    assert.equal([...localRequests].some(url=>/buildings\.(geojson|json)/.test(url)),false);
    assert.deepEqual(networkErrors,[],'no HTTP failures during normal map and media use');
    assert.deepEqual(logs,[],'no browser console errors');assert.deepEqual(c.errors,[]);
    const manifest=JSON.parse(await readFile('photos/optimized/manifest.json','utf8'));
    assert.equal(Object.keys(manifest).length,49);
    let assets=0;for(const [original,variants] of Object.entries(manifest)){
        await access(original);for(const size of ['160','320','640','1280','photo160','photo320']){await access(variants[size]);assets++;}
    }
    console.log(`${layouts} layouts across five views, four 200% text layouts, visible controls/settings, live 3D, lazy aerial buildings and ${assets} image assets passed.`);
    console.log('No JavaScript/console/HTTP errors or local-building requests. Visuals saved in .qa/midnight-*.png.');
}finally{c.close();}
