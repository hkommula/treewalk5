/* Sidebar ranges, native decluttering and real carousel pointer/keyboard input. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,750))');
const capture=async name=>writeFile(`.qa/adaptive-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?adaptive-map'});await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await c.evaluate('selectWalkMode("full",false);showHome();fitHomeView({animate:false})');await settle();
    const geometry=await c.evaluate('JSON.stringify({trees:treeData.map(t=>[t.id,t.lng,t.lat]),route:mapView.data.get("uow-route-network").data})');
    for(const [width,height]of [[320,640],[375,812],[390,844],[430,932],[640,360],[767,900],[768,1024],[800,1024],[900,960],[1023,960],[1024,960],[1280,960],[1440,960],[1600,1000]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});await settle();
        await c.waitFor('!!mapView.annotationBoxes&&!mapView.annotationsPending&&!map.isMoving()');
        const layout=await c.evaluate('({sheet:isSheetLayout(),width:uiPanel.getBoundingClientRect().width,padding:parseFloat(getComputedStyle(document.querySelector(".panel-body")).paddingInlineStart),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.querySelector(".panel-body").scrollWidth>document.querySelector(".panel-body").clientWidth})');
        assert.equal(layout.overflow,false,JSON.stringify({width,...layout}));assert.equal(layout.sheet,width<768);
        const expected=width>=1024?Math.max(420,Math.min(width*.3,460)):width>=768?Math.max(320,Math.min(width*.38,380)):width;
        assert.ok(Math.abs(layout.width-expected)<1,`${width}: expected ${expected}, got ${layout.width}`);
        if(width<768)assert.equal(layout.padding,16);else if(width<1024)assert.equal(layout.padding,20);
        const spacing=await c.evaluate(`(()=>{const state=mapView.annotationBoxes,scene=mapView.projectedAnnotations();return {markers:state.markers.every((a,i)=>state.markers.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>=state.radius*2+4.9)),labels:state.labels.every((r,i)=>!state.labels.slice(i+1).some(s=>MapLabelLayout.intersects(r,s))&&!state.markers.some(p=>MapLabelLayout.intersects(r,MapLabelLayout.markerBox(p,state.radius+3)))&&!scene.segments.some(([a,b])=>MapLabelLayout.segmentHitsRect(r,a,b))),radius:state.radius}})()`);
        assert.ok(spacing.markers&&spacing.labels,`${width}: ${JSON.stringify(spacing)}`);
        await c.waitFor('map.isSourceLoaded("uow-trees")&&map.isSourceLoaded("uow-stop-labels")&&!map.isMoving()');
        // Source completion precedes symbol placement/fades after a layout
        // breakpoint. Inspect the rendered result once native placement settles.
        await c.evaluate('new Promise(resolve=>{map.once("idle",()=>resolve(true));map.triggerRepaint()})');
        const numbers=await c.evaluate(`(()=>{const ids=new Set(map.queryRenderedFeatures({layers:['uow-stop-numbers','uow-callout-numbers']}).map(f=>f.id)),circles=new Set(map.queryRenderedFeatures({layers:['uow-tree-points','uow-stop-callouts']}).map(f=>f.id)),expected=[...mapView.data.get('uow-trees').data.features.filter(f=>mapView.displayMarkerIds.has(f.id)),...mapView.data.get('uow-stop-labels').data.features];return expected.filter(f=>{const p=map.project(f.geometry.coordinates);return f.properties.stopNumber>0&&p.x>20&&p.y>20&&p.x<map.getContainer().clientWidth-20&&p.y<map.getContainer().clientHeight-20}).every(f=>ids.has(f.id)&&circles.has(f.id))})()`);
        assert.ok(numbers,`${width}: every retained tour circle has its stop number`);
        assert.deepEqual(await c.evaluate('map.getLayoutProperty("uow-stop-numbers","text-offset")'),[0,0]);
        assert.equal(await c.evaluate('JSON.stringify({trees:treeData.map(t=>[t.id,t.lng,t.lat]),route:mapView.data.get("uow-route-network").data})'),geometry,'rendering never changes tree or route geometry');
        if([390,800,1440].includes(width))await capture(`home-${width}`);
        console.log(`${width}x${height}: fluid panel range/padding, marker spacing and path-aware labels passed.`);
    }
    for(const width of [390,800,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1024});await c.evaluate('document.documentElement.style.fontSize="200%";scheduleLayout()');await settle();
        assert.equal(await c.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false);
        await c.evaluate('document.documentElement.style.fontSize=""');
    }
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.evaluate('showBrowser();activateTree(treeData[0].id);detailGalleryIndex=0;stepTreeGallery(0);document.querySelector(".panel-body").scrollTop=0');await settle();
    assert.equal(await c.evaluate('document.querySelectorAll(".gallery-arrow,.gallery-controls button").length'),0);
    const imagePoint=()=>c.evaluate(`(()=>{const r=document.querySelector('.popup-img-wrap').getBoundingClientRect(),n=document.querySelector('.detail-nav').getBoundingClientRect(),f=document.querySelector('.detail-footer').getBoundingClientRect();return {x:r.left+r.width*.75,end:r.left+r.width*.25,y:(Math.max(r.top,n.bottom+2)+Math.min(r.bottom,f.top-2))/2}})()`);
    let point=await imagePoint();
    await c.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});await c.call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
    await c.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.end,y:point.y,button:'left',buttons:1});await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.end,y:point.y,button:'left',buttons:0,clickCount:1});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),1,'mouse drag advances gallery');assert.equal(await c.evaluate('document.getElementById("lightbox").style.display'),'','drag does not enlarge');
    await c.evaluate('document.querySelector(".popup-img-wrap").focus()');await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),0);assert.equal(await c.evaluate('document.activeElement===document.querySelector(".popup-img-wrap")'),true);
    await c.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});point=await imagePoint();
    await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.end,y:point.y}]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),1,'real touch swipe advances gallery');
    assert.equal(await c.evaluate('document.querySelector(".popup-img-wrap").dataset.galleryKind'),'poster');assert.match(await c.evaluate('document.querySelector(".gallery-count").textContent'),/2\s*\/\s*2/);
    await c.evaluate('document.querySelector(".popup-img-wrap").focus()');await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await c.waitFor('document.getElementById("lightbox").style.display==="flex"');await c.evaluate('closeLightbox()');await settle();
    await c.evaluate('document.querySelector(".panel-body").scrollTop=0');const before=await c.evaluate('detailGalleryIndex');point=await imagePoint();
    await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-25}]});await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-80}]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),before,'vertical scrolling never advances gallery');
    assert.ok(await c.evaluate('document.querySelector(".panel-body").scrollTop>0'),'vertical touch still scrolls reading content');
    for(const mode of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        assert.ok(await c.evaluate('map.getLayer("uow-tree-names").source==="uow-name-labels"&&!!map.getLayer("uow-tree-name-links")'));
    }
    await settle();const idle=await c.evaluate(`new Promise(resolve=>{let calls=0;const original=mapView.updateAnnotations;mapView.updateAnnotations=function(){calls++;return original.call(this)};setTimeout(()=>{mapView.updateAnnotations=original;resolve(calls)},1200)})`);assert.ok(idle<=1,`annotation layout is not idle: ${idle}`);
    assert.deepEqual(c.errors,[]);console.log('Swipe/mouse/keyboard gallery, vertical scrolling, all themes and idle annotation layout passed.');
}finally{c.close();}
