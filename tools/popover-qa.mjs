/* Real touch dismissal and attribution timeout checks. Use the local server and
 * isolated Chromium CDP browser used by midnight-qa; no new test dependency. */
import assert from 'node:assert/strict';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();
const settle=()=>c.evaluate('new Promise(r=>setTimeout(r,400))');
const creditsOpen='document.querySelector(".maplibregl-ctrl-attrib").classList.contains("maplibregl-compact-show")';
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
        await c.evaluate('document.getElementById("map-tools").querySelector("select").focus();');
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),false,'using a popup control leaves popup open');
        await settle();await tap(await emptyMap());
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),true);
        assert.equal(await c.evaluate('document.getElementById("map-tools-toggle").getAttribute("aria-expanded")'),'false');
        assert.deepEqual(await c.evaluate('map.getCenter().toArray()'),camera,'dismissing a popup from home keeps the camera');
        await c.evaluate('startWalking();openWalkingDetails();');await settle();
        const target=await c.evaluate('walk.target');
        const walkingView=await c.evaluate('({view:walkView,sheet:sheetState,selected:activeTreeId,camera:map.getCenter().toArray()})');
        await c.evaluate('document.getElementById("custom-toggle").click();document.getElementById("menu-settings").click();');
        assert.equal(await c.evaluate('document.getElementById("custom-panel").classList.contains("show")'),true);
        await tap(await emptyMap());
        assert.equal(await c.evaluate('walk.status'),'active','outside tap never pauses the walk');
        assert.equal(await c.evaluate('walk.target'),target,'outside tap keeps the destination');
        assert.deepEqual(await c.evaluate('({view:walkView,sheet:sheetState,selected:activeTreeId,camera:map.getCenter().toArray()})'),walkingView,'outside tap keeps the view, sheet, selection and camera');
        assert.equal(await c.evaluate('document.getElementById("custom-panel").classList.contains("show")'),false);
        assert.equal(await c.evaluate('visitedStops.size'),0);
        await c.evaluate('pauseWalking();showHome();');await settle();
        console.log(`${width}px: real map touches dismiss popups and preserve view, selection, sheet, camera and walking state.`);
    }
    await c.waitFor('document.querySelector(".maplibregl-ctrl-attrib").dataset.autoCollapse');
    const opened=Date.now();
    await c.evaluate('document.querySelector(".maplibregl-ctrl-attrib-button").click();');
    await c.waitFor(creditsOpen);await c.waitFor(`!(${creditsOpen})`,6500);
    assert.ok(Date.now()-opened>=4700,'credits must remain readable for five seconds');
    await c.evaluate('document.querySelector(".maplibregl-ctrl-attrib-button").click();document.querySelector(".maplibregl-ctrl-attrib-inner a").focus();');
    await c.waitFor(creditsOpen);
    await c.evaluate('new Promise(r=>setTimeout(r,3000))');
    await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await c.evaluate('new Promise(r=>setTimeout(r,3000))');
    assert.equal(await c.evaluate(creditsOpen),true,'keyboard reading renews the timeout');
    await c.waitFor(`!(${creditsOpen})`,3500);
    assert.equal(await c.evaluate('document.activeElement===document.querySelector(".maplibregl-ctrl-attrib-button")'),true,'collapse restores focus to the disclosure');
    assert.deepEqual(c.errors,[]);
    console.log('Five-second attribution collapse, keyboard timer renewal and focus restoration passed.');
}finally{c.close();}
