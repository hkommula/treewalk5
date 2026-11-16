/* Real touch dismissal and in-panel attribution checks. Use the local server and
 * isolated Chromium CDP browser used by midnight-qa; no new test dependency. */
import assert from 'node:assert/strict';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();
const settle=()=>c.evaluate('new Promise(r=>setTimeout(r,850))');
const tap=async point=>{
    await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
};
const emptyMap=()=>c.evaluate(`(()=>{
    const canvas=map.getCanvas(),r=canvas.getBoundingClientRect();
    for(let y=24;y<r.height;y+=32)for(let x=24;x<r.width;x+=32){
        if(document.elementFromPoint(x+r.left,y+r.top)===canvas&&!mapView.hitFeatures({x,y}).length)return {x:x+r.left,y:y+r.top};
    }throw Error('No unobstructed empty map point');
})()`);
try{
    await c.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    for(const [width,height] of [[390,844],[1440,960]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        const clear=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();'});
        await c.call('Page.navigate',{url:'http://127.0.0.1:8765/'});
        await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getStyle()?.sources?.openmaptiles',30000);
        await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:clear.identifier});await settle();
        await c.evaluate('showBrowser();activateTree(treeData[0].id);');await settle();
        const selected=await c.evaluate('activeTreeId');
        await c.evaluate('document.getElementById("map-tools-toggle").click();');
        await tap(await emptyMap());
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),true);
        assert.equal(await c.evaluate('walkView'),'detail','dismissal retains the detail view');
        assert.equal(await c.evaluate('activeTreeId'),selected,'dismissal retains the selected tree');
        await tap(await emptyMap());
        assert.equal(await c.evaluate('walkView'),'detail','empty map alone never navigates away');
        await c.evaluate('showHome();');await settle();
        await c.evaluate('map.jumpTo({center:[UOW_CENTER[1]+.001,UOW_CENTER[0]]});void 0;');await settle();
        const camera=await c.evaluate('map.getCenter().toArray()');
        await c.evaluate('document.getElementById("map-tools-toggle").click();');
        await c.evaluate('document.querySelector("#basemap input:checked").focus();');
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),false,'using a popup control leaves popup open');
        await settle();await tap(await emptyMap());
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),true);
        assert.equal(await c.evaluate('document.getElementById("map-tools-toggle").getAttribute("aria-expanded")'),'false');
        assert.deepEqual(await c.evaluate('map.getCenter().toArray()'),camera,'dismissing a popup from home keeps the camera');
        await c.evaluate('startWalking();openWalkingDetails();');await settle();
        const target=await c.evaluate('walk.target');
        const walkingView=await c.evaluate('({view:walkView,sheet:sheetState,selected:activeTreeId,camera:map.getCenter().toArray()})');
        await c.evaluate('document.getElementById("map-tools-toggle").click();');
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),false);
        await tap(await emptyMap());
        assert.equal(await c.evaluate('walk.status'),'active','outside tap never pauses the walk');
        assert.equal(await c.evaluate('walk.target'),target,'outside tap keeps the destination');
        assert.deepEqual(await c.evaluate('({view:walkView,sheet:sheetState,selected:activeTreeId,camera:map.getCenter().toArray()})'),walkingView,'outside tap keeps the view, sheet, selection and camera');
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),true);
        assert.equal(await c.evaluate('visitedStops.size'),0);
        await c.evaluate('pauseWalking();showHome();');await settle();
        console.log(`${width}px: real map touches dismiss popups and preserve view, selection, sheet, camera and walking state.`);
    }
    await c.evaluate('document.getElementById("map-tools-toggle").click();document.querySelector("#map-attribution-content a").focus()');
    assert.equal(await c.evaluate('!!document.querySelector(".maplibregl-ctrl-attrib-button")'),false);
    assert.ok(await c.evaluate('document.activeElement.closest(".map-layer-settings")'));
    await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),false,'reading credits keeps the inspector open');
    await c.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
    assert.equal(await c.evaluate('document.activeElement===document.getElementById("map-tools-toggle")'),true);
    assert.deepEqual(c.errors,[]);
    console.log('In-panel provider credits, keyboard access and inspector focus restoration passed.');
}finally{c.close();}
