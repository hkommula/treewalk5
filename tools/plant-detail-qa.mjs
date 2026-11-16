/* Focus-label placement, real two-view gallery, tabs and pinned reading controls. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,700))');
const capture=async name=>writeFile(`.qa/plant-${name}.png`,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const controls=()=>c.evaluate(`(()=>{const body=document.querySelector('.panel-body'),nav=document.querySelector('.detail-nav').getBoundingClientRect(),footer=document.querySelector('.detail-footer').getBoundingClientRect(),b=body.getBoundingClientRect();return {nav:nav.top,footer:footer.bottom,gap:footer.top-nav.bottom,inside:nav.top>=b.top-1&&footer.bottom<=b.bottom+1,overflow:body.scrollWidth>body.clientWidth,buttons:[...document.querySelectorAll('.detail-footer button')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}})}})()`);
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?plant-detail'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    assert.equal(await c.evaluate('document.querySelector("link[rel=icon]").getAttribute("href")'),'data:,');
    for(const [width,height,font]of [[320,640,100],[375,812,100],[390,844,100],[430,932,100],[500,900,100],[600,960,100],[640,360,100],[844,390,100],[768,1024,100],[1440,960,100],[320,640,200],[390,844,200],[640,360,200],[1440,960,200]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        await c.evaluate(`document.documentElement.style.fontSize='${font}%';closeUtility();showBrowser();activateTree(treeData[0].id);selectPlantTab('overview');document.querySelector('.panel-body').scrollTop=0`);await settle();
        const before=await controls();assert.ok(before.inside&&!before.overflow&&before.gap>=40,`${width}@${font}: ${JSON.stringify(before)}`);
        for(const b of before.buttons)assert.ok(b.w>=44&&b.h>=44,'minimum touch size');
        for(let i=0;i<before.buttons.length;i++)for(let j=i+1;j<before.buttons.length;j++){
            const a=before.buttons[i],b=before.buttons[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.x,b.x)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)<=1,'footer buttons do not overlap');
        }
        assert.equal(await c.evaluate('document.querySelectorAll(".detail-title").length'),1);
        assert.ok(await c.evaluate('document.querySelector(".panel-header").getClientRects().length===0'), 'reading omits the repeated walk heading and statistics');
        assert.equal(await c.evaluate('getComputedStyle(uiPanel).backgroundColor'),'rgba(25, 39, 52, 0.78)');
        assert.equal(await c.evaluate('getComputedStyle(uiPanel).backdropFilter'),'blur(12px)');
        assert.ok(await c.evaluate('[...document.querySelectorAll(".tree-family,.feature-info")].every(e=>getComputedStyle(e).backdropFilter==="none")'),'only the outer panel blurs');
        assert.equal(await c.evaluate('getComputedStyle(document.getElementById("plant-tab-overview"),"::after").backgroundColor'),'rgb(183, 209, 190)');
        const pagination=await c.evaluate(`(()=>{const e=document.querySelector('.gallery-pagination'),dots=[...e.querySelectorAll('.gallery-dot')],rs=dots.map(d=>d.getBoundingClientRect()),hero=document.querySelector('.tree-hero').getBoundingClientRect(),names=[...document.querySelectorAll('.detail-title,.detail-sci,.detail-badge')].map(n=>n.getBoundingClientRect());return {touch:e.offsetWidth>=44&&e.offsetHeight>=44,centred:Math.abs((rs[0].left+rs.at(-1).right)/2-(hero.left+hero.right)/2)<1,sizes:dots.every((d,i)=>Math.abs(rs[i].width-(d.classList.contains('active')?14:5))<.1&&rs[i].height===5),gaps:rs.slice(1).every((r,i)=>Math.abs(r.left-rs[i].right-6)<.1),clear:rs.every(r=>r.bottom<=hero.bottom&&names.every(n=>Math.min(r.right,n.right)-Math.max(r.left,n.left)<=0||Math.min(r.bottom,n.bottom)-Math.max(r.top,n.top)<=0))}})()`);
        assert.ok(Object.values(pagination).every(Boolean),`${width}@${font}: ${JSON.stringify(pagination)}`);
        assert.ok(await c.evaluate(`(()=>{const a=document.querySelector('.detail-head>div').getBoundingClientRect(),b=document.querySelector('.gallery-controls').getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1})()`),'hero controls do not overlap names');
        assert.ok(await c.evaluate('document.querySelector(".tree-family").textContent.includes(activeTree.family)&&document.querySelector(".identifying-features").textContent===activeTree.features'));
        await c.evaluate('document.querySelector(".panel-body").scrollTop=document.querySelector(".panel-body").scrollHeight');await settle();
        const after=await controls();assert.ok(Math.abs(after.nav-before.nav)<1&&Math.abs(after.footer-before.footer)<1,`${width}@${font}: pinned controls moved`);
        await c.evaluate('selectPlantTab("resources",true)');await settle();
        assert.ok(await c.evaluate('document.getElementById("plant-overview").hidden&&!document.getElementById("plant-resources").hidden'));
        assert.equal(await c.evaluate('document.querySelectorAll(".plant-resource").length'),await c.evaluate('activeTree.moreInfo.length+1'));
        assert.ok(await c.evaluate('[...document.querySelectorAll(".plant-resource")].every(a=>a.target==="_blank"&&a.rel.includes("noopener")&&a.querySelector("strong"))'));
        const tabs=await c.evaluate('[...document.querySelectorAll(".plant-tabs button")].map(b=>b.getBoundingClientRect().width)');assert.ok(Math.abs(tabs[0]-tabs[1])<1);
        await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
        assert.equal(await c.evaluate('treeDetailTab'),'overview');
        if(width===390&&font===100){await c.evaluate('document.querySelector(".panel-body").scrollTop=0');await settle();await capture('overview');await c.evaluate('selectPlantTab("resources")');await settle();await capture('resources');}
        console.log(`${width}x${height}@${font}%: tabs/resources, pinned controls, touch targets and half-height sheet passed.`);
    }
    await c.evaluate('document.documentElement.style.fontSize=""');
    await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await c.evaluate('activateTree(treeData[0].id);detailGalleryIndex=0;stepTreeGallery(0)');await settle();
    assert.equal(await c.evaluate('document.querySelector(".popup-img-wrap").dataset.galleryKind'),'photo');
    const dot=await c.evaluate(`(()=>{const r=document.querySelectorAll('.gallery-dot')[1].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await c.call('Input.dispatchMouseEvent',{type:'mousePressed',...dot,button:'left',clickCount:1});await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',...dot,button:'left',clickCount:1});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),1,'tiny dot selects its image directly');
    await c.evaluate('document.querySelector(".gallery-pagination").focus()');
    await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),0);
    assert.equal(await c.evaluate('document.activeElement===document.querySelector(".gallery-pagination")'),true);
    await c.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    const touch=await c.evaluate(`(()=>{const r=document.querySelector('.gallery-pagination').getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-10}})()`);
    await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-80,y:touch.y}]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
    assert.equal(await c.evaluate('detailGalleryIndex'),1,'pagination touch area preserves swiping');
    assert.equal(await c.evaluate('document.querySelector(".gallery-pagination").getAttribute("aria-valuenow")'),'2');
    await c.call('Emulation.setTouchEmulationEnabled',{enabled:false});
    await c.evaluate('window.originalGalleryVariants=mediaManifest[activeTree.img];mediaManifest[activeTree.img]={...originalGalleryVariants,photo320:null};activateTree(activeTree.id)');
    assert.equal(await c.evaluate('document.querySelector(".gallery-pagination")'),null,'single-image gallery hides dots');
    assert.match(await c.evaluate('document.querySelector(".gallery-count").textContent'),/1\s*\/\s*1/);
    await c.evaluate('mediaManifest[activeTree.img]=originalGalleryVariants;activateTree(activeTree.id);detailGalleryIndex=0;stepTreeGallery(0)');await settle();
    await c.evaluate('stepTreeGallery(1)');await c.waitFor('document.querySelector(".popup-img-hi").complete&&document.querySelector(".popup-img-hi").naturalWidth');
    assert.equal(await c.evaluate('document.querySelector(".popup-img-wrap").dataset.galleryKind'),'poster');
    assert.ok(await c.evaluate('(()=>{const e=document.querySelector(".popup-img-hi");return getComputedStyle(e).objectFit==="contain"&&Math.abs(e.clientWidth/e.clientHeight-e.naturalWidth/e.naturalHeight)<.03})()'),'poster remains complete');
    await c.evaluate('stepTreeGallery(1);enlargeTreeGallery()');await c.waitFor('document.getElementById("lightbox").style.display==="flex"&&document.getElementById("lightbox-img").complete');
    await c.evaluate('closeLightbox();findTreeOnMap(activeTree.id,false)');await settle();
    const state=await c.evaluate('({route:currentRoute.map(t=>t.key),visited:[...visitedStops],target:walk.target})');
    for(const [x,y]of [[16,16],[374,240],[16,395],[374,395],[195,210]]){
        await c.evaluate(`(()=>{const p=map.project([activeTree.lng,activeTree.lat]);map.panBy([p.x-${x},p.y-${y}],{duration:0})})()`);await settle();
        const pill=await c.evaluate(`(()=>{const e=mapView.focusLabel,r=e.getBoundingClientRect();return {hidden:e.hidden,left:r.left,right:r.right,top:r.top,bottom:r.bottom,text:e.textContent}})()`);
        assert.ok(!pill.hidden&&pill.left>=0&&pill.right<=390&&pill.top>=0&&pill.bottom<=422,JSON.stringify(pill));
    }
    await c.evaluate('findTreeOnMap(activeTree.id,false)');await settle();
    await c.evaluate('mapView.focusLabel.click()');assert.deepEqual(await c.evaluate('({route:currentRoute.map(t=>t.key),visited:[...visitedStops],target:walk.target})'),state,'label click preserves walk');
    for(const mode of ['light','aerial','dark']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        assert.equal(await c.evaluate('document.querySelectorAll(".tree-focus-label").length'),1);
        assert.equal(await c.evaluate('mapView.focusLabel.querySelector(".focus-label-name").textContent'),await c.evaluate('activeTree.name'));
    }
    await settle();
    const idle=await c.evaluate(`new Promise(resolve=>{let calls=0;const original=mapView.updateFocusLabel;mapView.updateFocusLabel=function(){calls++;return original.call(this)};setTimeout(()=>{mapView.updateFocusLabel=original;resolve(calls)},1200)})`);
    assert.ok(idle<=1,`focused label keeps updating while idle: ${idle}`);
    await c.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await c.evaluate('getComputedStyle(document.querySelector(".gallery-dot")).transitionDuration'),'0s');
    await c.call('Emulation.setEmulatedMedia',{features:[]});
    await c.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    assert.equal(await c.evaluate('getComputedStyle(uiPanel).backgroundColor'),'rgb(25, 39, 52)');
    assert.equal(await c.evaluate('getComputedStyle(uiPanel).backdropFilter'),'none');
    await c.call('Emulation.setEmulatedMedia',{features:[]});
    await c.evaluate('showHome()');assert.ok(await c.evaluate('!!document.querySelector("#route-estimate .lucide-footprints")'));
    assert.equal(await c.evaluate('getComputedStyle(uiPanel).backgroundColor'),'rgba(255, 255, 255, 0.08)','home styling is unchanged');
    await c.evaluate('showBrowser()');assert.ok(await c.evaluate('[...document.querySelectorAll(".tree-card")].every(e=>e.querySelector(".card-meta .lucide-footprints"))'));
    await c.evaluate('startWalking()');assert.ok(await c.evaluate('!!document.querySelector("#nav-distance .lucide-footprints")'));
    await c.evaluate('openWalkingDetails();userLoc={lat:UOW_CENTER[0],lng:UOW_CENTER[1],accuracy:5,timestamp:Date.now()};updateDetailMiniCoords(activeTree)');
    assert.ok(await c.evaluate('!!document.querySelector("#detail-mini-coords .lucide-footprints")'));
    assert.ok(await c.evaluate('document.querySelector("#stat-dist").parentElement.querySelector(".lucide-footprints")!==null'));
    await c.evaluate('userLoc=null;showWalkSummary()');assert.ok(await c.evaluate('!!document.querySelector("#walk-summary .lucide-footprints")'));
    await c.evaluate('document.getElementById("map-tools-toggle").click()');
    assert.ok(await c.evaluate('!!document.querySelector(".tools-progress-estimate .lucide-footprints")&&!!document.querySelector(".arrival-setting .lucide-footprints")'));
    assert.ok(await c.evaluate('getComputedStyle(document.querySelector(".tools-progress-estimate .lucide-footprints")).maskImage.includes("icons/footprints.svg")'));
    assert.ok(await c.evaluate('fetch("src/icons/footprints.svg").then(r=>r.ok)'));
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false);
    assert.deepEqual(c.errors,[]);console.log('Dots/counter, native click/swipe/keyboard, single-image hiding, reduced motion, all distance icons and retained gallery/walk passed.');
}finally{c.close();}
