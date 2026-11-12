/* Walking overview/reading, safe planning controls and anchored-menu regression.
 * Uses the same static server and isolated CDP browser as the existing QA suites. */
import assert from 'node:assert/strict';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();
const settle=()=>c.evaluate('new Promise(r=>setTimeout(r,450))');
const snapshot=()=>c.evaluate('({mode:walk.mode,route:currentRoute.map(t=>t.key),target:walk.target,skipped:[...walk.skipped],visited:[...visitedStops],elapsed:walk.elapsed,tick:walk.tick})');
const checkPopup=async id=>{
    await settle();
    const geometry=await c.evaluate(`(()=>{const panel=document.getElementById('${id}'),r=panel.getBoundingClientRect(),anchor='${id}'==='custom-panel'?panel.popoverAnchor:openUtility.toggle,a=anchor.getBoundingClientRect(),v=visualViewport;return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:v.width,height:v.height,gap:Math.min(Math.abs(r.bottom-a.top),Math.abs(r.top-a.bottom)),font:parseFloat(getComputedStyle(document.documentElement).fontSize)};})()`);
    assert.ok(geometry.left>=0&&geometry.top>=0&&geometry.right<=geometry.width+1&&geometry.bottom<=geometry.height+1,`${id} stays inside visual viewport: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.gap<=geometry.font*1.5,`${id} stays near its trigger`);
};
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getStyle()?.sources?.openmaptiles',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    assert.equal(await c.evaluate('!!document.querySelector(".map-controls #mode-3d")'),false);
    assert.equal(await c.evaluate('!!document.querySelector("#map-tools #mode-3d")'),true);
    assert.equal(await c.evaluate('!!document.querySelector("#btn-recommended,#btn-auto")'),false);
    for(const [width,height] of [[320,844],[375,812],[390,844],[430,932],[640,360],[768,1024],[1024,768],[1440,960]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('startWalking();');await settle();
        const state=await snapshot();
        assert.equal(await c.evaluate('walkingDetailsOpen'),false);
        assert.equal(await c.evaluate('document.getElementById("walk-strip").hidden'),false,'guidance visible in overview');
        if(width>=900)assert.ok(await c.evaluate('uiPanel.getBoundingClientRect().height<innerHeight*.6'),'desktop overview is compact');
        await c.evaluate('document.getElementById("nav-primary").click();');await settle();
        assert.equal(await c.evaluate('walkingDetailsOpen'),true,'View tree opens reading without a visit');
        assert.equal(await c.evaluate('document.getElementById("detail-back").textContent.trim()'),'Back to walk');
        assert.equal(await c.evaluate('document.getElementById("current-walk-badge").textContent'),'Quick Walk');
        await c.evaluate('document.getElementById("current-walk-badge").click();');
        assert.deepEqual(await snapshot(),state,'read-only badge does not reset the walk');
        await c.evaluate('document.getElementById("detail-back").click();');await settle();
        assert.equal(await c.evaluate('walkingDetailsOpen'),false);
        assert.equal(await c.evaluate('document.getElementById("walk-strip").hidden'),false);
        assert.deepEqual(await snapshot(),state,'reading round trip retains route, timing, target and visits');
        await c.evaluate('document.getElementById("walk-menu-toggle").click();');await checkPopup('walk-menu');
        await c.evaluate('document.getElementById("menu-settings").click();');await checkPopup('custom-panel');
        await c.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));document.getElementById("map-tools-toggle").click();');await checkPopup('map-tools');
        await c.evaluate('closeUtility();');
        console.log(`${width}x${height}: compact overview, reading return, stable walk and anchored menus passed.`);
    }
    await c.evaluate(`userLoc={lat:UOW_CENTER[0],lng:UOW_CENTER[1],accuracy:100,timestamp:Date.now()};document.body.dataset.gpsQuality='weak';document.body.classList.add('outdoor');updateNavigation();`);
    const warning=await c.evaluate(`(()=>{
        const status=document.getElementById('nav-guidance'),fg=getComputedStyle(status).color,bg=getComputedStyle(document.querySelector('.panel-header')).backgroundColor;
        const luminance=color=>{const c=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
        const a=luminance(fg),b=luminance(bg);return {text:status.textContent,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size:parseFloat(getComputedStyle(status).fontSize)};
    })()`);
    assert.match(warning.text,/Weak GPS/);assert.ok(warning.contrast>=4.5);assert.ok(warning.size>=14);
    await c.evaluate('userLoc=null;document.body.classList.remove("outdoor");updateNavigation();');
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false,'no permission requested during UI changes');
    await c.evaluate('document.getElementById("map-tools-toggle").click();document.getElementById("mode-3d").click();');await settle();
    assert.equal(await c.evaluate('mapView.settings.threeD'),true);
    await c.evaluate('document.getElementById("mode-3d").click();closeUtility();');
    for(const width of [320,390,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('document.documentElement.style.fontSize="200%";scheduleLayout();');await settle();
        await c.evaluate('document.getElementById("walk-menu-toggle").click();');await checkPopup('walk-menu');
        await c.evaluate('document.getElementById("menu-settings").click();');await checkPopup('custom-panel');
        await c.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));document.documentElement.style.fontSize="";scheduleLayout();');await settle();
    }
    assert.equal(await c.evaluate('map.getLayoutProperty("uow-stop-numbers","text-allow-overlap")'),false);
    assert.ok(await c.evaluate('mapView.data.get("uow-trees").data.features.every(f=>{const t=treeById.get(f.id);return f.geometry.coordinates[0]===t.lng&&f.geometry.coordinates[1]===t.lat})'),'label changes never move geographic positions');
    assert.ok(await c.evaluate('mapView.data.get("uow-trees").data.features.find(f=>f.id===walk.target).properties.priority'));
    assert.deepEqual(c.errors,[]);
    console.log(`Outdoor weak-GPS contrast ${warning.contrast.toFixed(2)}:1; enlarged menus, Map tools 3D and collision priorities passed.`);
}finally{c.close();}
