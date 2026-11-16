/* Edge-to-edge canvas, compact actions, in-pane credits and reading-card QA. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,800))');
const capture=async name=>writeFile(`.qa/refined-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const coverage=async label=>{
    const r=await c.evaluate(`(()=>{const m=document.getElementById('map').getBoundingClientRect(),r=map.getCanvas().getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:visualViewport.height,gap:Math.max(Math.abs(r.width-m.width),Math.abs(r.height-m.height))}})()`);
    assert.ok(r.left<=0&&r.top<=0&&r.right>=r.width&&r.bottom>=r.height,`${label}: edge coverage ${JSON.stringify(r)}`);
    assert.ok(r.gap<=1,`${label}: canvas/container size mismatch`);
};
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:2,mobile:true});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?refinement'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getSource("openmaptiles")',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    await c.call('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true});await settle();
    assert.equal(await c.evaluate(`(()=>{document.body.classList.remove('sheet-layout');const status=document.getElementById('app-status'),saved=status.textContent;status.textContent='Map notice';const overflow=document.documentElement.scrollWidth>document.documentElement.clientWidth;status.textContent=saved;scheduleLayout();return overflow})()`),false,'narrow viewport and status stay bounded while responsive JS catches up');
    await settle();
    for(const [width,height,ratio]of [[320,640,3],[375,812,2],[390,844,3],[430,932,3],[684,504,2],[640,360,2],[768,1024,2],[1440,960,1]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:ratio,mobile:width<900});
        await c.evaluate('closeUtility();startWalking();showWalkSummary()');await settle();await coverage(`${width}x${height}`);
        const row=await c.evaluate(`(()=>{const p=document.getElementById('walk-summary'),buttons=[...p.querySelectorAll('.summary-actions button')],rects=buttons.map(el=>el.getBoundingClientRect());return {labels:buttons.map(el=>el.textContent.trim()),oneLine:rects.every(r=>Math.abs(r.top-rects[0].top)<1),saved:p.querySelector('.summary-save').getAttribute('aria-label'),captions:[...p.querySelectorAll('.summary-grid>div>span')].map(el=>({wrap:getComputedStyle(el).whiteSpace,overflow:el.scrollWidth>el.clientWidth+1})),overflow:p.scrollWidth>p.clientWidth}})()`);
        assert.deepEqual(row.labels,['Resume','New walk','Done']);assert.ok(row.oneLine);assert.equal(row.overflow,false);
        assert.equal(row.saved,'Saved on this device');assert.ok(row.captions.every(c=>c.wrap==='nowrap'&&!c.overflow),JSON.stringify(row.captions));
        assert.ok(await c.evaluate('!!document.querySelector(".summary-save[data-saved=true] .bi-phone")'));
        assert.equal(await c.evaluate('getComputedStyle(document.querySelector(".summary-save")).color'),'rgb(140, 226, 168)');
        await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();
        assert.equal(await c.evaluate('!!document.querySelector(".maplibregl-ctrl-attrib-button,.map-guide")'),false);
        assert.equal(await c.evaluate('document.getElementById("home-view").parentElement.className'),'map-heading-actions');
        assert.equal(await c.evaluate('getComputedStyle(document.querySelector(".number-control>span")).borderInlineStartWidth'),'0px');
        assert.equal(await c.evaluate('!!map.getLayer("uow-campus-mask-fill")||!!map.getSource("uow-campus-mask")'),false);
        await c.evaluate('document.getElementById("home-view").click()');await settle();
        assert.equal(await c.evaluate('document.getElementById("map-tools").hidden'),false,'Fit walk leaves tools open');
        const layers=await c.evaluate(`(()=>{const p=document.querySelector('.map-layer-settings');return {selects:p.querySelectorAll('select').length,oneLine:[...p.querySelectorAll('.segmented-control')].filter(g=>g.getBoundingClientRect().width).every(g=>{const rs=[...g.querySelectorAll('label')].map(l=>l.getBoundingClientRect());return rs.every(r=>Math.abs(r.top-rs[0].top)<1)}),creditSize:parseFloat(getComputedStyle(document.getElementById('map-attribution-content')).fontSize)}})()`);
        assert.equal(layers.selects,0);assert.ok(layers.oneLine);assert.ok(layers.creditSize<12);
        assert.deepEqual(await c.evaluate(`(()=>{const buttons=[...document.querySelectorAll('#map-tools button')].filter(b=>b.getBoundingClientRect().width&&b.getBoundingClientRect().height),hits=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].getBoundingClientRect(),b=buttons[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)hits.push([buttons[i].ariaLabel,buttons[j].ariaLabel]);}return hits})()`),[],`${width}: inspector button overlaps`);
        assert.deepEqual(await c.evaluate(`(()=>{const p=document.getElementById('map-tools').getBoundingClientRect();return [...document.querySelectorAll('.map-controls button')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&Math.min(p.right,r.right)-Math.max(p.left,r.left)>1&&Math.min(p.bottom,r.bottom)-Math.max(p.top,r.top)>1}).map(b=>b.id)})()`),[],`${width}: floating controls overlap inspector`);
        await c.evaluate('closeUtility();startWalking();openWalkingDetails()');await settle();
        const card=await c.evaluate(`(()=>{const f=document.querySelector('.tree-family'),img=document.querySelector('.popup-img-wrap'),features=document.querySelector('.feature-info'),button=document.querySelector('.popup-btns button');return {family:!f.closest('details'),order:!!(img.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(f.compareDocumentPosition(features)&Node.DOCUMENT_POSITION_FOLLOWING),actions:!document.querySelector('.detail-actions').closest('details'),stepper:document.querySelectorAll('.tree-stepper button').length,gap:button.querySelector('span').getBoundingClientRect().left-button.querySelector('i').getBoundingClientRect().right,overflow:document.querySelector('.panel-body').scrollWidth>document.querySelector('.panel-body').clientWidth}})()`);
        assert.ok(card.family&&card.order&&card.actions);assert.equal(card.stepper,2);assert.ok(card.gap>=12);assert.equal(card.overflow,false);
        const hero=await c.evaluate(`(()=>{const h=document.querySelector('.tree-hero').getBoundingClientRect(),t=document.querySelector('.detail-head').getBoundingClientRect(),a=document.querySelector('.detail-actions').getBoundingClientRect(),s=document.querySelector('.tree-stepper').getBoundingClientRect(),bs=[...document.querySelectorAll('.tree-stepper button')].map(b=>b.getBoundingClientRect());return {contained:t.left>=h.left-1&&t.right<=h.right+1&&t.top>=h.top-1&&t.bottom<=h.bottom+1,right:Math.abs(s.right-a.right)<1,third:Math.abs(s.width-(a.width-parseFloat(getComputedStyle(document.querySelector('.detail-actions')).columnGap))/3)<1||s.width<=bs[0].height*2+8,touch:bs.every(r=>r.width>=44&&r.height>=44),overlap:bs[0].right>bs[1].left+1}})()`);
        assert.ok(hero.contained&&hero.right&&hero.third&&hero.touch&&!hero.overlap,JSON.stringify(hero));
        console.log(`${width}x${height}@${ratio}: full canvas, one-line walk actions/captions, credits location and reading card passed.`);
    }
    await c.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:2,mobile:true});
    await c.evaluate('closeUtility();pauseWalking();showHome();document.getElementById("map").style.inlineSize="calc(100% + 1rem)"');await settle();await coverage('container-only resize');
    await c.evaluate('document.getElementById("map").style.inlineSize="";document.getElementById("map-tools-toggle").click()');await settle();
    for(const mode of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();await coverage(mode);
        await c.waitFor(`document.getElementById('map-attribution-content').textContent.includes('${mode==='aerial'?'NSW Spatial Services':'OpenFreeMap'}')`,20000);
        const credits=await c.evaluate('document.getElementById("map-attribution-content").textContent');
        assert.match(credits,/OpenStreetMap contributors/);
        assert.equal(await c.evaluate('!!map.getLayer("uow-campus-mask-fill")||!!map.getLayer("uow-campus-boundary-line")'),false);
    }
    for(const width of [320,375,430,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate('document.documentElement.style.fontSize="200%";closeUtility();showWalkSummary()');await settle();await coverage(`${width}: enlarged`);
        await c.evaluate('startWalking();openWalkingDetails()');await settle();
        assert.equal(await c.evaluate('document.querySelector(".panel-body").scrollWidth>document.querySelector(".panel-body").clientWidth'),false,`${width}: enlarged card`);
        assert.ok(await c.evaluate('[...document.querySelectorAll(".detail-title,.detail-sci")].every(el=>el.scrollWidth<=el.clientWidth+1)'),`${width}: enlarged tree names`);
        await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();
        assert.equal(await c.evaluate('document.getElementById("map-tools").scrollWidth>document.getElementById("map-tools").clientWidth'),false,`${width}: enlarged tools`);
        assert.deepEqual(await c.evaluate(`(()=>{const p=document.getElementById('map-tools').getBoundingClientRect();return [...document.querySelectorAll('.map-controls button')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&Math.min(p.right,r.right)-Math.max(p.left,r.left)>1&&Math.min(p.bottom,r.bottom)-Math.max(p.top,r.top)>1}).map(b=>b.id)})()`),[],`${width}: enlarged floating controls overlap inspector`);
        await c.evaluate('closeUtility()');
        await c.evaluate('document.documentElement.style.fontSize="";pauseWalking()');
    }
    await c.evaluate('showWalkSummary();window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===WALK_KEY)throw Error("Storage unavailable");return originalSetItem.call(this,key,value)};saveWalk()');
    assert.equal(await c.evaluate('document.querySelector(".summary-save").getAttribute("aria-label")'),'Unable to save on this device');
    assert.equal(await c.evaluate('getComputedStyle(document.querySelector(".summary-save")).color'),'rgb(186, 199, 216)');
    await c.evaluate('Storage.prototype.setItem=originalSetItem;saveWalk()');
    assert.equal(await c.evaluate('document.querySelector(".summary-save").getAttribute("aria-label")'),'Saved on this device');
    await c.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:2,mobile:true});
    await c.evaluate('selectWalkMode("full");startWalking();showWalkSummary()');await settle();await capture('summary');
    await c.evaluate('document.getElementById("map-tools-toggle").click()');await settle();await capture('tools');
    await c.evaluate('document.getElementById("map-tools").scrollTop=document.getElementById("map-tools").scrollHeight');await settle();await capture('credits');
    await c.evaluate('closeUtility();startWalking();openWalkingDetails()');await settle();await capture('tree');
    await c.evaluate('document.querySelector(".panel-body").scrollTop=document.querySelector(".panel-body").scrollHeight');await settle();await capture('tree-actions');
    assert.deepEqual(c.errors,[]);
    console.log('All live themes, provider links, container-only resizing, high-density screens and enlarged-text cards passed.');
}finally{c.close();}
