/* Native camera viewport, mandatory 3D scene and compact-summary regression. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();
const settle=()=>c.evaluate('new Promise(r=>setTimeout(r,1000))');
const assertCentre=async label=>{
    const state=await c.evaluate(`(()=>{const p=getMapPadding(),canvas=map.getCanvas(),point=map.project(map.getCenter());return {actual:[point.x,point.y],expected:[(p.left+canvas.clientWidth-p.right)/2,(p.top+canvas.clientHeight-p.bottom)/2],padding:map.getPadding(),wanted:p}})()`);
    assert.ok(Math.hypot(state.actual[0]-state.expected[0],state.actual[1]-state.expected[1])<1,`${label}: ${JSON.stringify(state)}`);
    for(const key of Object.keys(state.wanted))assert.ok(Math.abs(state.padding[key]-state.wanted[key])<1,`${label}: ${key}: ${JSON.stringify(state)}`);
    assert.ok(await c.evaluate('(()=>{const p=map.project(map.getCenter());return document.elementFromPoint(p.x,p.y)===map.getCanvas()})()'),`${label}: centre must be unobstructed canvas`);
    const sheet=await c.evaluate(`(()=>{const tools=document.getElementById('map-tools'),panel=!tools.hidden?tools:uiPanel;return {limited:isSheetLayout()&&(panel===uiPanel||tools.dataset.placement==='bottom'),height:panel.getBoundingClientRect().height,viewport:visualViewport.height}})()`);
    if(sheet.limited)assert.ok(sheet.height<=sheet.viewport*.5+1,`${label}: mobile panel exceeds half the viewport`);
};
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?viewport'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getSource("openmaptiles")',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await settle();
    assert.equal(await c.evaluate('document.querySelectorAll("button[aria-controls=map-tools]").length'),1);
    assert.equal(await c.evaluate('!!document.querySelector("#custom-toggle,#menu-settings")'),false);
    assert.equal(await c.evaluate('!!map.getLayer("uow-campus-boundary-line")'),false);
    for(const [width,height]of [[320,640],[375,812],[390,844],[430,932],[640,360],[768,1024],[1440,960]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('closeUtility();showHome()');await settle();await assertCentre(`${width}: home`);
        const focus=await c.evaluate('map.getCenter().toArray()');
        await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();await assertCentre(`${width}: inspector`);
        assert.deepEqual(await c.evaluate('map.getCenter().toArray()'),focus,'opening preserves geographic view');
        assert.equal(await c.evaluate('getComputedStyle(document.getElementById("arrival-threshold")).textAlign'),'center');
        if(width===1440)assert.ok(await c.evaluate('map.getPadding().right>map.getPadding().left'),'desktop inspector reserves the right side');
        await c.evaluate('closeUtility()');await settle();await assertCentre(`${width}: closed`);
        assert.deepEqual(await c.evaluate('map.getCenter().toArray()'),focus,'dismissal preserves geographic view');
        await c.evaluate('startWalking();openWalkingDetails();findTreeOnMap(walk.target,false)');await settle();await assertCentre(`${width}: tree reading`);
        const target=await c.evaluate('map.project([targetTree().lng,targetTree().lat])');
        const projected=await c.evaluate('map.project(map.getCenter())');
        assert.ok(Math.hypot(target.x-projected.x,target.y-projected.y)<1,'selected tree centred in available map');
        assert.equal(await c.evaluate('document.getElementById("walk-menu-toggle").parentElement.className'),'detail-nav');
        await c.evaluate('document.getElementById("walk-menu-toggle").click()');await settle();await assertCentre(`${width}: walk menu`);
        await c.evaluate('closeUtility()');
        await c.evaluate('returnFromTreeDetails()');await settle();await assertCentre(`${width}: overview`);
        await c.evaluate('pauseWalking();showWalkSummary()');await settle();
        const grid=await c.evaluate(`(()=>{const el=document.querySelector('#walk-summary .summary-grid');return {columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,values:[...el.querySelectorAll('strong')].map(e=>e.getBoundingClientRect().top),labels:[...el.querySelectorAll('div>span')].filter(e=>e.parentElement.parentElement===el).map(e=>e.getBoundingClientRect().top)}})()`);
        assert.equal(grid.columns,3);assert.ok(grid.values.every(y=>Math.abs(y-grid.values[0])<1));assert.ok(grid.labels.every(y=>Math.abs(y-grid.labels[0])<1));
        console.log(`${width}x${height}: free-area centre, unchanged geography, tree focus and 2×3 summary passed.`);
    }
    await c.evaluate('document.getElementById("map-tools-toggle").click();document.querySelector("#layer-buildings input[value=off]").click();document.getElementById("mode-3d").click()');await settle();
    assert.equal(await c.evaluate('map.getLayoutProperty("uow-buildings-3d","visibility")'),'visible');
    assert.equal(await c.evaluate('document.getElementById("buildings-setting").hidden'),true);
    assert.equal(await c.evaluate('mapView.settings.buildings'),false,'2D preference is retained separately');
    await assertCentre('3D');
    for(const mode of ['aerial','light','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        assert.equal(await c.evaluate('map.getLayoutProperty("uow-buildings-3d","visibility")'),'visible');
        assert.equal(await c.evaluate('!!map.getLayer("uow-campus-boundary-line")'),false);
        await assertCentre(`${mode}: 3D`);
    }
    await c.evaluate('document.getElementById("mode-2d").click()');await settle();
    assert.equal(await c.evaluate('document.getElementById("buildings-setting").hidden'),false);
    assert.equal(await c.evaluate('map.getLayoutProperty("uow-buildings-fill","visibility")'),'none','returning to 2D restores Off');
    await writeFile('.qa/viewport-tools-desktop.png',Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await c.evaluate('closeUtility();showWalkSummary()');
    await c.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await settle();
    await writeFile('.qa/viewport-summary-mobile.png',Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    for(const width of [320,375,430]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
        await c.evaluate('document.documentElement.style.fontSize="200%";closeUtility();document.getElementById("map-tools-toggle").click()');await settle();
        await assertCentre(`${width}: enlarged inspector`);
        assert.equal(await c.evaluate('document.getElementById("map-tools").scrollWidth>document.getElementById("map-tools").clientWidth'),false);
        await c.evaluate('document.documentElement.style.fontSize="";closeUtility()');
    }
    for(const [width,height]of [[320,640],[390,844],[640,360]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
        await c.evaluate('document.documentElement.style.fontSize="200%";startWalking();openWalkingDetails()');await settle();
        await assertCentre(`${width}: enlarged reading sheet`);
        assert.ok(await c.evaluate('document.querySelector(".panel-body").clientHeight>0'),'enlarged reading retains a scroll viewport');
        await c.evaluate('document.querySelector(".panel-body").scrollTop=document.querySelector(".panel-body").scrollHeight');
        assert.ok(await c.evaluate('document.querySelector(".panel-body").scrollTop>0'),'full details remain scrollable');
        await c.evaluate('document.documentElement.style.fontSize=""');
    }
    assert.deepEqual(c.errors,[]);
    console.log('Mandatory 3D buildings, remembered 2D preference, theme restoration, centred input and single Map Tools control passed.');
}finally{c.close();}
