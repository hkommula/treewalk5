/* Walking session UI; routing stays independent of native MapLibre rendering. */
'use strict';
const WALK_KEY='uowTreeWalkSessionV1', WALK_PREFS_KEY='uowTreeWalkWalkingPreferences';
const walk={mode:'quick',status:'preview',skipped:new Set(),target:null,startId:null,positionId:null,useGPSStart:true,follow:false,resumeGPS:false,elapsed:0,distance:0,estimatedDistance:0,tick:null,lastTrack:null,lastFollow:null,lastRender:0,lastReroute:0,offRouteSince:0,arrivalReadings:[],arrivalId:null};
let listFilter='all',listSort='name',searchText='',walkingReady=false,statusTimer=null,previewTimer=null,rerouteTimer=null,layoutTimer=null,walkSaveAvailable=true;
let walkView='home',detailReturnView='home',walkingDetailsOpen=false,openUtility=null;
let walkingPreferences={outdoor:false,arrivalThreshold:30,autoCentreSelection:true};
const $=id=>document.getElementById(id);
function actionHTML(icon,label=''){
    const classes=icon==='footprints'?'lucide-icon lucide-footprints':`bi bi-${icon}`;
    return `<i class="${classes}" aria-hidden="true"></i>${label?`<span>${escapeHTML(label)}</span>`:''}`;
}
function setAction(id,icon,label,description=label){
    const button=$(id),html=actionHTML(icon,label);
    if(button.innerHTML!==html)button.innerHTML=html;
    button.classList.add('symbol-action');button.setAttribute('aria-label',description);button.title=description;
}
function symbolMetric(icon,value,description){
    const label=description.includes(String(value))?description:`${value} · ${description}`;
    return `<span class="symbol-metric" role="img" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${actionHTML(icon)}<span aria-hidden="true">${escapeHTML(String(value))}</span></span>`;
}
// One inspector, with the original settings controls and event handlers intact.
$('tools-settings-slot').append($('custom-panel'));
$('tools-perspective-slot').append($('perspective-setting'));
const motionOK=()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let mediaManifest={};
let treeDetailTab='overview',detailGalleryIndex=0;
const mediaReady=fetch('photos/optimized/manifest.json').then(r=>{if(!r.ok)throw Error('manifest');return r.json();}).then(data=>{mediaManifest=data;}).catch(()=>{});

function showStatus(message,persistent=false,category='general'){
    $('app-status').textContent=message;$('app-status').dataset.category=category;clearTimeout(statusTimer);
    if(!persistent)statusTimer=setTimeout(()=>{$('app-status').textContent='';},9000);
}
function showDataError(){
    stopsList.innerHTML='<p class="empty-state">Tree data could not load. Check your connection and reload this page.</p><button class="walk-btn" onclick="location.reload()">Retry</button>';
    $('route-estimate').textContent='Tree data unavailable.';$('start-walk').disabled=true;
    showStatus(location.protocol==='file:'?'Open this app through a local web server or GitHub Pages so campus data can load.':'Tree data unavailable. Your saved walk is retained.',true);
    setWalkView('browse');
}
function applyWalkView(){
    document.body.dataset.walkView=walkView;
    document.body.dataset.walkStatus=walk.status;
    const header=$('walk-trees-header'),navigation=header.querySelector('.browser-navigation'),headerSlot=walkView==='browse'?$('browser-header-slot'):$('home-header-slot');
    const navigationFocus=navigation.contains(document.activeElement)?document.activeElement:null;
    if(header.parentElement!==headerSlot)headerSlot.append(header);
    for(const [id,selected]of [['close-browser',walkView!=='browse'],['browser-trees-tab',walkView==='browse']]){
        if(selected)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');
    }
    mapView.setBrowsing(walkView==='browse');
    $('walk-home').hidden=walkView!=='home';
    $('browse-controls').hidden=walkView!=='browse';
    $('browser-list-meta').hidden=walkView!=='browse';
    stopsList.hidden=walkView!=='browse';stopsList.style.display=walkView==='browse'?'block':'none';
    detailViewArea.style.display=['walking','detail'].includes(walkView)?'flex':'none';
    $('walk-summary').hidden=walkView!=='summary';
    syncCardHeader();
    if(navigationFocus&&['home','browse'].includes(walkView))navigationFocus.focus({preventScroll:true});
    scheduleLayout();
}
function syncCardHeader(){
    const open=walkView==='detail'||(walkView==='walking'&&walkingDetailsOpen);
    document.body.classList.toggle('tree-card-open',open);
    document.body.classList.toggle('walking-overview',walkView==='walking'&&!open);
    detailViewArea.style.display=open?'flex':'none';
    if(walkView==='walking')$('walk-strip').hidden=open;
    const returnToWalk=walkView==='walking'||(detailReturnView==='walking'&&walk.status==='active');
    setAction('detail-back','arrow-left',returnToWalk?'Back to walk':'Trees',returnToWalk?'Back to walk':'Back to Tour List');
    const menu=$('walk-menu-toggle'),readingHeader=document.querySelector('.detail-nav');
    if(open){if(menu.parentElement!==readingHeader)readingHeader.append(menu);}
    else if(menu.parentElement!==$('walk-strip'))$('walk-strip').insertBefore(menu,$('nav-guidance'));
    menu.hidden=walk.status!=='active';
}
function setWalkView(view,expand=false){
    walkView=view;applyWalkView();updateNavigation();
    document.querySelector('.panel-body').scrollTop=0;
    if(expand&&isSheetLayout())setSheetState('expanded');
}
function showHome(){
    const previous=activeTreeId;activeTreeId=null;activeTree=null;
    if(previous)updateMarkerStyle(previous);
    closeUtility();setWalkView('home');
    if(isSheetLayout())setSheetState('half');
    if($('route-options').open)updateWalkChoices();
}
function showBrowser(){
    closeUtility();renderSidebar();setWalkView('browse',true);
    $('close-browser').focus({preventScroll:true});
}
function selectBrowserTree(id,{fromMap=false}={}){
    const tree=treeById.get(id);if(!tree)return;
    walk.follow=false;
    const previous=activeTreeId;activeTreeId=id;activeTree=tree;
    if(previous!==id){treeDetailTab='overview';detailGalleryIndex=0;}
    if(previous&&previous!==id)updateMarkerStyle(previous);
    updateMarkerStyle(id);syncBrowserSelection();updateNavigation();
    if(walkingPreferences.autoCentreSelection)flyToVisible([tree.lat,tree.lng],19,{animate:motionOK(),duration:.45});
    if(fromMap){
        const card=$(`card-${id}`),scroller=isSheetLayout()?document.querySelector('.panel-body'):stopsList;
        if(card){const r=card.getBoundingClientRect(),s=scroller.getBoundingClientRect();if(r.top<s.top||r.bottom>s.bottom)scroller.scrollBy({top:r.top<s.top?r.top-s.top:r.bottom-s.bottom,behavior:motionOK()?'smooth':'auto'});}
    }
}
function syncBrowserSelection(){
    for(const card of stopsList.querySelectorAll('.tree-card')){
        const selected=Number(card.dataset.treeId)===activeTreeId;
        card.setAttribute('aria-pressed',String(selected));card.closest('.tree-row')?.setAttribute('data-selected',String(selected));
    }
}
function treePreviewImage(tree){
    const variants=mediaManifest[tree.img];
    return variants?{src:variants.photo160||variants['160'],srcset:variants.photo160&&variants.photo320?`${variants.photo160} 160w, ${variants.photo320} 320w`:''}:null;
}
function renderWalkingDetails(){
    const target=targetTree();
    if(!target)return;
    if(activeTreeId!==target.id||!detailContentArea.children.length)activateTree(target.id,{walking:true,passive:true});
    else updateDetailVisitButton(target.id);
}
function openWalkingDetails(){
    walkingDetailsOpen=true;walkView='walking';renderWalkingDetails();applyWalkView();
    if(isSheetLayout())setSheetState('expanded');
    updateNavigation();
}
function returnFromTreeDetails(){
    if(walkView==='walking'||(detailReturnView==='walking'&&walk.status==='active')){
        walkingDetailsOpen=false;walkView='walking';renderWalkingDetails();setWalkView('walking');
        if(isSheetLayout())setSheetState('peek');
        $('nav-tree').focus({preventScroll:true});
    }else showBrowser();
}
function closeUtility(returnFocus=false){
    if(!openUtility)return;
    const {panel,toggle,previousControls}=openUtility;panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(previousControls)toggle.setAttribute('aria-controls',previousControls);openUtility=null;
    document.body.classList.remove('map-inspector-open');uiPanel.inert=false;
    syncCustomSettingsUI();
    scheduleLayout();
    if(returnFocus||panel.contains(document.activeElement))toggle.focus({preventScroll:true});
}
function positionPopover(panel,anchor){
    if(!anchor?.getClientRects().length)return;
    const viewport=window.visualViewport,style=getComputedStyle(panel);
    const space=parseFloat(getComputedStyle(document.querySelector('.panel-body')).paddingInlineStart)||parseFloat(getComputedStyle(document.documentElement).fontSize);
    const safe=side=>parseFloat(style.getPropertyValue(`--safe-${side}`))||0;
    const left=(viewport?.offsetLeft||0)+Math.max(space,safe('left'));
    const top=(viewport?.offsetTop||0)+Math.max(space,safe('top'));
    const right=(viewport?.offsetLeft||0)+(viewport?.width||innerWidth)-Math.max(space,safe('right'));
    const bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-Math.max(space,safe('bottom'));
    const set=(name,value)=>{if(panel.style[name]!==value)panel.style[name]=value;};
    const inspector=panel.id==='map-tools',hybrid=inspector&&isSheetLayout();
    const mobile=hybrid&&(bottom-top)>(right-left)*.9;
    const widthLimit=hybrid&&!mobile?(right-left)*.55:right-left;
    set('inlineSize',`${Math.max(0,Math.min(parseFloat(getComputedStyle(document.documentElement).fontSize)*(inspector?28:21),widthLimit))}px`);
    set('maxBlockSize',`${Math.max(0,bottom-top)}px`);
    set('right','auto');set('bottom','auto');
    if(inspector){
        // A large reading inspector uses the available viewport, rather than
        // squeezing itself into the gap beneath a low sheet trigger.
        panel.dataset.placement=mobile?'bottom':'side';
        const controls=document.querySelector('.map-controls').getBoundingClientRect();
        // A side inspector sits beside a vertical toolbar, or below a wide
        // toolbar. Neither interactive surface should cover the other.
        const belowToolbar=!mobile&&controls.width>(right-left)*.25;
        const panelRight=mobile||belowToolbar?right:Math.min(right,controls.left-space);
        const panelTop=belowToolbar?Math.max(top,controls.bottom+space):top;
        if(!mobile)set('inlineSize',`${Math.max(0,Math.min(parseFloat(panel.style.inlineSize),panelRight-left))}px`);
        let maxHeight=(bottom-panelTop)*(mobile?.5:1);
        if(mobile&&document.body.classList.contains('compact-map')){
            const clearMapTop=Math.min(top+(bottom-top)*.4,controls.bottom+space+parseFloat(getComputedStyle(document.documentElement).fontSize)*2);
            maxHeight=Math.min(maxHeight,bottom-clearMapTop);
        }
        set('maxBlockSize',`${maxHeight}px`);
        const rect=anchor.getBoundingClientRect(),box=panel.getBoundingClientRect();
        set('left',`${mobile?left:panelRight-box.width}px`);
        set('top',`${mobile?bottom-Math.min(box.height,maxHeight):Math.max(panelTop,Math.min(rect.top,bottom-box.height))}px`);
        return;
    }
    const rect=anchor.getBoundingClientRect(),box=panel.getBoundingClientRect();
    const above=Math.max(0,rect.top-space-top),below=Math.max(0,bottom-rect.bottom-space);
    // In portrait reading, keep the menu over the sheet when there is room for
    // scrolling actions below its trigger, preserving the map above it.
    const readingBelow=panel.id==='walk-menu'&&isSheetLayout()&&document.body.classList.contains('tree-card-open')&&(bottom-top)>(right-left)*.9&&below>=88;
    const useAbove=!readingBelow&&(box.height<=above||(box.height>below&&above>below));
    const available=useAbove?above:below;
    set('maxBlockSize',`${Math.max(0,available)}px`);
    const height=Math.min(box.height,available);
    set('left',`${Math.max(left,Math.min(rect.right-box.width,right-box.width))}px`);
    set('top',`${Math.max(top,Math.min(useAbove?rect.top-space-height:rect.bottom+space,bottom-height))}px`);
}
function positionOpenPopovers(){
    if(openUtility)positionPopover(openUtility.panel,openUtility.toggle);
}
function toggleUtility(panelId,toggleId){
    const panel=$(panelId),toggle=$(toggleId),wasOpen=!panel.hidden;
    closeUtility();
    if(wasOpen)return;
    if(panelId==='map-tools')renderWalkSummaries();
    panel.hidden=false;panel.dataset.opener=toggleId;const previousControls=toggle.getAttribute('aria-controls');toggle.setAttribute('aria-controls',panelId);toggle.setAttribute('aria-expanded','true');openUtility={panel,toggle,previousControls};
    const inspector=panelId==='map-tools';document.body.classList.toggle('map-inspector-open',inspector);uiPanel.inert=inspector;
    syncCustomSettingsUI();panel.scrollTop=0;
    positionPopover(panel,toggle);
    scheduleLayout();
    panel.querySelector('button,input')?.focus({preventScroll:true});
}
function formatDistance(m){return m>=1000?`${(m/1000).toFixed(1)} km`:`${Math.max(0,Math.round(m/5)*5)} m`;}
function originUsesGPS(){return !!userLoc&&userLoc.accuracy<=50&&(!['preview','exploring'].includes(walk.status)||walk.useGPSStart);}
function originDescription(){return originUsesGPS()?'you':visitedStops.has(walk.positionId)&&!['preview','exploring'].includes(walk.status)?'last confirmed stop':'starting tree';}
function walkOrigin(){return originUsesGPS()?userLoc:treeById.get(['preview','exploring'].includes(walk.status)?walk.startId:walk.positionId)||treeById.get(walk.startId)||treeData[0]||{lat:UOW_CENTER[0],lng:UOW_CENTER[1]};}
function pendingTrees(){return currentRoute.filter(t=>!visitedStops.has(t.id)&&!walk.skipped.has(t.id));}
function targetTree(){return treeById.get(walk.target)||pendingTrees()[0]||null;}
function chooseTarget(){
    const pending=pendingTrees();
    if(!pending.some(t=>t.id===walk.target))walk.target=pending[0]?.id||null;
    if(walk.arrivalId!==walk.target){walk.arrivalId=null;walk.arrivalReadings=[];$('arrival').hidden=true;}
}
function walkingLeg(from,to){
    if(!from||!to)return {distance:0,network:false,points:[],path:null};
    if(getDistance(from.lat,from.lng,to.lat,to.lng)<1)return {distance:0,network:true,points:[[from.lat,from.lng],[to.lat,to.lng]],path:null};
    const sk=getTreeSnapKey(from),ek=getTreeSnapKey(to);
    const path=sk&&ek?findNetworkPath(sk,ek):null;
    const points=path?[[from.lat,from.lng],...path,[to.lat,to.lng]]:[[from.lat,from.lng],[to.lat,to.lng]];
    return {distance:getPathDistance(points),network:!!path,points,path};
}
let treeMarkerStatsCache=null;
function treeMarkerStats(tree,stop){
    if(!walkingReady)return [];
    const origin=walkOrigin(),visited=visitedStops.has(tree.id),skipped=walk.skipped.has(tree.id),from=originDescription();
    const gps=!userLoc?'off':userLoc.accuracy>50?'weak':'good';
    const key=[tree.id,stop,currentRoute.length,origin.lat,origin.lng,from,gps,visited,skipped,networkSegments.length].join('|');
    if(treeMarkerStatsCache?.key===key)return treeMarkerStatsCache.value;
    const leg=walkingLeg(origin,tree),distance=formatDistance(leg.distance),state=visited?'Visited':skipped?'Skipped':'Not visited';
    const value=[
        {icon:'tree-pine',full:stop?`Tree ${stop}`:'Explore',compact:stop?`#${stop}`:'Explore',description:stop?`Tour stop ${stop} of ${currentRoute.length}`:'Tree outside the selected walk'},
        {icon:'footprints',full:`${distance} ${leg.network?'walk':'direct'}`,compact:distance,description:`${distance}, approximate ${leg.network?'walking path':'direct'} distance from ${from}${gps==='off'?'; GPS is off':gps==='weak'?'; weak GPS':''}`},
        {icon:visited?'circle-check':skipped?'circle-minus':'circle',full:state,compact:visited?'Visited':skipped?'Skipped':'Unvisited',description:state}
    ];
    treeMarkerStatsCache={key,value};return value;
}
function remainingMetrics(){
    let from=walkOrigin(),distance=0,network=true;
    for(const tree of pendingTrees()){const leg=walkingLeg(from,tree);distance+=leg.distance;network=network&&leg.network;from=tree;}
    return {distance,minutes:Math.ceil(distance/TreeWalkCore.WALK_METRES_PER_MINUTE+pendingTrees().length*TreeWalkCore.STOP_MINUTES),network};
}
function imageVariant(tree,size){return mediaManifest[tree.img]?.[size]||tree.img;}
function plantResourceMeta(label){
    if(/PlantNET/i.test(label))return {icon:'flower1',description:'Plant profiles and identification'};
    if(/SE NSW/i.test(label))return {icon:'tree',description:'Regional plant information'};
    if(/Illawarra Natives/i.test(label))return {icon:'tree-fill',description:'Local native plants'};
    if(/IUCN/i.test(label))return {icon:'shield-check',description:'Conservation assessments'};
    if(/PDF/i.test(label))return {icon:'file-earmark-pdf',description:'Aboriginal plant knowledge and uses'};
    if(/ALA/i.test(label))return {icon:'search',description:'Species data and occurrence records'};
    return {icon:'link-45deg',description:''};
}
function treeGalleryItems(tree){
    if(!tree.img)return [];
    const variants=mediaManifest[tree.img],items=[];
    if(variants?.photo320)items.push({kind:'photo',src:variants.photo640||variants.photo320,small:variants.photo320,label:'Photograph'});
    items.push({kind:'poster',src:imageVariant(tree,'640'),small:imageVariant(tree,'320'),large:imageVariant(tree,'1280'),label:'Identification poster'});
    return items;
}
function galleryPaginationHTML(tree,items){
    if(items.length<2)return '';
    // One 44px touch/keyboard slider contains the tiny visual indicators. This
    // avoids overlapping touch targets between dots spaced only 6px apart.
    return `<div class="gallery-pagination" role="slider" tabindex="0" aria-label="${escapeHTML(tree.name)} images" aria-controls="tree-gallery-image" aria-orientation="horizontal" aria-valuemin="1" aria-valuemax="${items.length}" aria-valuenow="${detailGalleryIndex+1}" aria-valuetext="${items[detailGalleryIndex].label}, image ${detailGalleryIndex+1} of ${items.length}" onclick="clickGalleryPagination(event)" onkeydown="galleryPaginationKeydown(event)">${items.map((item,index)=>`<span class="gallery-dot${index===detailGalleryIndex?' active':''}" data-gallery-index="${index}" aria-hidden="true"></span>`).join('')}</div>`;
}
function selectTreeGallery(index){
    if(!activeTree||!Number.isInteger(index)||index<0||index>=treeGalleryItems(activeTree).length||index===detailGalleryIndex)return;
    stepTreeGallery(index-detailGalleryIndex);
}
function clickGalleryPagination(event){
    event.stopPropagation();
    const dots=[...event.currentTarget.querySelectorAll('.gallery-dot')],dot=event.target.closest('.gallery-dot');
    const closest=dot||dots.reduce((best,item)=>{const r=item.getBoundingClientRect(),b=best.getBoundingClientRect();return Math.abs(event.clientX-r.left-r.width/2)<Math.abs(event.clientX-b.left-b.width/2)?item:best;},dots[0]);
    if(closest)selectTreeGallery(Number(closest.dataset.galleryIndex));
}
function galleryPaginationKeydown(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const count=treeGalleryItems(activeTree).length;
    selectTreeGallery(event.key==='Home'?0:event.key==='End'?count-1:(detailGalleryIndex+(event.key==='ArrowLeft'?-1:1)+count)%count);
}
function treeGalleryHTML(tree){
    const items=treeGalleryItems(tree);if(!items.length)return '';
    detailGalleryIndex=Math.min(detailGalleryIndex,items.length-1);
    const item=items[detailGalleryIndex],srcset=`${item.small} 320w, ${item.src} 640w${item.large?`, ${item.large} 1280w`:''}`;
    return `<button id="tree-gallery-image" class="popup-img-wrap" data-gallery-kind="${item.kind}" draggable="false" onclick="enlargeTreeGallery()" onkeydown="galleryKeydown(event)" aria-describedby="tree-gallery-help" aria-label="Enlarge ${escapeHTML(tree.name)} ${item.label.toLowerCase()}"><img class="popup-img-hi loaded" draggable="false" src="${escapeHTML(item.src)}" srcset="${escapeHTML(srcset)}" sizes="(width < 54rem) 94vw, 23rem" loading="lazy" decoding="async" width="640" height="${item.kind==='photo'?640:480}" alt="${escapeHTML(tree.name)} — ${item.label.toLowerCase()}" onerror="handleTreeImageError(this,${tree.id},'detail')"></button><div class="gallery-controls" role="group" aria-label="Tree images"><span class="gallery-count" role="status" aria-live="polite" aria-label="${item.label}, image ${detailGalleryIndex+1} of ${items.length}">${actionHTML('images')} ${detailGalleryIndex+1} / ${items.length}</span></div>${galleryPaginationHTML(tree,items)}<span id="tree-gallery-help" class="sr-only">Swipe or drag left and right, or use Left and Right arrow keys to browse images. Press Enter to enlarge the current image.</span>`;
}
function stepTreeGallery(direction){
    if(!activeTree)return;const items=treeGalleryItems(activeTree);if(items.length<2)return;
    detailGalleryIndex=(detailGalleryIndex+direction+items.length)%items.length;
    const hero=document.querySelector('.tree-hero'),holder=document.createElement('div');holder.innerHTML=treeGalleryHTML(activeTree);
    const previous=hero.querySelector('.popup-img-wrap'),focused=document.activeElement===previous,nextImage=holder.querySelector('.popup-img-wrap');
    previous?.replaceWith(nextImage);
    if(focused)nextImage.focus({preventScroll:true});
    const image=nextImage.querySelector('img'),reveal=()=>image.classList.add('gallery-image-enter');
    if(image.complete&&image.naturalWidth)reveal();else image.addEventListener('load',reveal,{once:true});
    const controls=hero.querySelector('.gallery-controls'),next=holder.querySelector('.gallery-controls');
    // The counter announces real gallery changes; image focus stays in place.
    const count=controls.querySelector('.gallery-count');count.innerHTML=next.querySelector('.gallery-count').innerHTML;count.setAttribute('aria-label',next.querySelector('.gallery-count').getAttribute('aria-label'));
    const pagination=hero.querySelector('.gallery-pagination');
    if(pagination){
        pagination.setAttribute('aria-valuenow',detailGalleryIndex+1);
        pagination.setAttribute('aria-valuetext',`${items[detailGalleryIndex].label}, image ${detailGalleryIndex+1} of ${items.length}`);
        for(const dot of pagination.querySelectorAll('.gallery-dot'))dot.classList.toggle('active',Number(dot.dataset.galleryIndex)===detailGalleryIndex);
    }
    scheduleLayout();
}
function enlargeTreeGallery(){
    if(!activeTree)return;const item=treeGalleryItems(activeTree)[detailGalleryIndex];
    if(item)openLightbox(item.kind==='poster'?activeTree.img:item.src);
}
function galleryKeydown(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home')detailGalleryIndex=treeGalleryItems(activeTree).length-1;
    if(event.key==='End')detailGalleryIndex=0;
    stepTreeGallery(event.key==='ArrowLeft'||event.key==='End'?-1:1);
}
let galleryGesture=null,galleryClickBlockedUntil=0;
detailContentArea.addEventListener('pointerdown',event=>{
    const button=event.target.closest('.popup-img-wrap,.gallery-pagination');
    if(!button||!event.isPrimary||event.button!==0)return;
    galleryGesture={id:event.pointerId,x:event.clientX,y:event.clientY,button,dragging:false};
    button.setPointerCapture(event.pointerId);
});
detailContentArea.addEventListener('pointermove',event=>{
    const gesture=galleryGesture;if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(Math.abs(dx)>Math.max(8,gesture.button.clientWidth*.025)&&Math.abs(dx)>Math.abs(dy)*1.25){gesture.dragging=true;gesture.button.classList.add('is-swiping');}
    if(gesture.dragging&&event.cancelable)event.preventDefault();
});
function finishGalleryGesture(event){
    const gesture=galleryGesture;if(!gesture||gesture.id!==event.pointerId)return;
    galleryGesture=null;gesture.button.classList.remove('is-swiping');
    if(gesture.button.hasPointerCapture(event.pointerId))gesture.button.releasePointerCapture(event.pointerId);
    if(!gesture.dragging){if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)galleryClickBlockedUntil=performance.now()+450;return;}
    galleryClickBlockedUntil=performance.now()+450;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(event.type==='pointerup'&&Math.abs(dx)>=Math.max(24,gesture.button.clientWidth*.12)&&Math.abs(dx)>Math.abs(dy)*1.25)stepTreeGallery(dx<0?1:-1);
}
detailContentArea.addEventListener('pointerup',finishGalleryGesture);
detailContentArea.addEventListener('pointercancel',finishGalleryGesture);
detailContentArea.addEventListener('lostpointercapture',finishGalleryGesture);
detailContentArea.addEventListener('click',event=>{if(event.detail>0&&event.target.closest('.popup-img-wrap,.gallery-pagination')&&performance.now()<galleryClickBlockedUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
detailContentArea.addEventListener('dragstart',event=>{if(event.target.closest('.popup-img-wrap'))event.preventDefault();});
function selectPlantTab(tab,focus=false){
    if(!['overview','resources'].includes(tab))return;
    treeDetailTab=tab;
    for(const name of ['overview','resources']){
        const button=$(`plant-tab-${name}`);if(!button)continue;
        button.setAttribute('aria-selected',String(name===tab));button.tabIndex=name===tab?0:-1;
        $(`plant-${name}`).hidden=name!==tab;
    }
    // Keep the selected tab in view without scrolling the surrounding map/page.
    const body=document.querySelector('.panel-body'),tabs=document.querySelector('.plant-tabs'),nav=document.querySelector('.detail-nav');
    if(tabs&&body&&nav){const top=body.getBoundingClientRect().top+nav.offsetHeight;body.scrollTop+=tabs.getBoundingClientRect().top-top;}
    if(focus)$(`plant-tab-${tab}`).focus({preventScroll:true});
    scheduleLayout();
}
function plantTabKeydown(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();selectPlantTab(event.key==='Home'?'overview':event.key==='End'?'resources':treeDetailTab==='overview'?'resources':'overview',true);
}
function treeImageHTML(tree,kind){
    if(!tree.img)return '<span class="image-fallback">No photo available</span>';
    const variants=mediaManifest[tree.img];
    const src=imageVariant(tree,kind==='thumb'&&variants?.photo160?'photo160':kind==='thumb'?'160':'640');
    const srcset=variants&&kind!=='thumb'?`srcset="${escapeHTML(variants['320'])} 320w, ${escapeHTML(variants['640'])} 640w, ${escapeHTML(variants['1280'])} 1280w" sizes="(width < 54rem) 94vw, 24rem"`:variants?.photo320?`srcset="${escapeHTML(variants.photo160)} 160w, ${escapeHTML(variants.photo320)} 320w" sizes="5rem"`:'';
    return `<img class="${kind==='thumb'?'card-thumb':'popup-img-hi loaded'}" src="${escapeHTML(src)}" ${srcset} loading="lazy" decoding="async" width="${kind==='thumb'?160:640}" height="${kind==='thumb'?160:480}" alt="${escapeHTML(tree.name)}${kind==='thumb'?'':' — tree identification poster'}" onerror="handleTreeImageError(this,${tree.id},'${kind}')">`;
}
function handleTreeImageError(img,id,kind){
    img.removeAttribute('srcset');
    if(!img.dataset.fallback&&treeById.get(id)?.img){img.dataset.fallback='true';img.src=treeById.get(id).img;return;}
    img.onerror=null;const label=document.createElement('span');label.className='image-fallback';label.textContent=kind==='thumb'?'No photo':'Photo unavailable';img.replaceWith(label);
}
function renderTreeCards(){
    if(!walkingReady)return;
    const onRoute=new Set(currentRoute.map(t=>t.id));
    let trees=[...currentRoute,...treeData.filter(t=>!onRoute.has(t.id))];
    if(listFilter==='visited')trees=trees.filter(t=>visitedStops.has(t.id));
    if(listFilter==='unvisited'||listFilter==='nearby')trees=trees.filter(t=>!visitedStops.has(t.id));
    if(searchText)trees=trees.filter(t=>`${t.name} ${t.scientific}`.toLocaleLowerCase().includes(searchText));
    const distances=new Map(trees.map(tree=>[tree.id,walkingLeg(walkOrigin(),tree)])),sort=listFilter==='nearby'?'distance':listSort;
    if(sort==='distance')trees.sort((a,b)=>distances.get(a.id).distance-distances.get(b.id).distance||a.name.localeCompare(b.name));
    else if(sort==='name')trees.sort((a,b)=>a.name.localeCompare(b.name));
    $('tree-count').textContent=`${trees.length} ${trees.length===1?'tree':'trees'}`;
    $('browser-tree-total').textContent=trees.length;$('browser-trees-tab').setAttribute('aria-label',`Trees, ${trees.length} matching`);
    $('tree-count').title=listFilter==='nearby'?`Nearest unvisited trees to ${originDescription()}`:'Trees matching your search and filter';
    $('tree-sort').value=sort;$('tree-sort').disabled=listFilter==='nearby';
    const fragment=document.createDocumentFragment();
    for(const tree of trees){
        const visited=visitedStops.has(tree.id),leg=distances.get(tree.id),row=document.createElement('div');row.className='tree-row';row.dataset.treeId=tree.id;
        const card=document.createElement('button');card.type='button';card.className=`tree-card${visited?' visited':''}`;card.id=`card-${tree.id}`;card.dataset.treeId=tree.id;
        const stop=currentRoute.findIndex(t=>t.id===tree.id)+1;
        card.dataset.state=visited?'visited':walk.skipped.has(tree.id)?'skipped':tree.id===walk.target?'current':'default';
        const state=visited?'Visited':walk.skipped.has(tree.id)?'Skipped':'Unvisited';
        card.innerHTML=`${treeImageHTML(tree,'thumb')}<span class="card-content"><span class="card-name">${escapeHTML(tree.name)}</span><span class="card-sci">${escapeHTML(tree.scientific)}</span><span class="card-meta">${stop?symbolMetric('geo-alt',stop,`Stop ${stop}`):''}${symbolMetric('footprints',formatDistance(leg.distance),`${formatDistance(leg.distance)} ${leg.network?'via paths':'direct estimate'}`)}<span class="symbol-metric" role="img" aria-label="${state}" title="${state}">${actionHTML(visited?'check2-circle':walk.skipped.has(tree.id)?'skip-forward':'circle')}</span></span></span>`;
        const details=document.createElement('button');details.type='button';details.className='card-details';details.dataset.treeDetails=tree.id;
        details.setAttribute('aria-label',`View details for ${tree.name}`);details.title=`View ${tree.name}`;details.innerHTML=actionHTML('chevron-right');
        row.append(card,details);fragment.append(row);
    }
    if(!trees.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=searchText?'No matching trees. Try another name.':'No trees in this view. Try another filter.';fragment.append(empty);}
    stopsList.replaceChildren(fragment);
    syncBrowserSelection();
}
function saveWalk(){
    if(!walkingReady)return;
    const key=id=>treeById.get(id)?.key||null;
    const data={version:1,mode:walk.mode,status:walk.status,route:currentRoute.map(t=>t.key),visited:[...visitedStops].map(key).filter(Boolean),skipped:[...walk.skipped].map(key).filter(Boolean),target:key(walk.target),start:key(walk.startId),position:key(walk.positionId),elapsed:elapsedTime(),distance:walk.distance,estimatedDistance:walk.estimatedDistance};
    try{
        localStorage.setItem(WALK_KEY,JSON.stringify(data));
        if(!walkSaveAvailable&&$('app-status').dataset.category==='storage'){$('app-status').textContent='';clearTimeout(statusTimer);}
        walkSaveAvailable=true;
    }catch{
        if(walkSaveAvailable)showStatus('This browser cannot save your walk. Keep this page open to retain progress.',false,'storage');
        walkSaveAvailable=false;
    }
    syncSavedStatus();
}
function syncSavedStatus(){
    for(const icon of document.querySelectorAll('.summary-save')){
        const label=walkSaveAvailable?'Saved on this device':'Unable to save on this device';
        icon.setAttribute('aria-label',label);icon.title=label;
        icon.dataset.saved=String(walkSaveAvailable);
        icon.querySelector('.save-indicator').className=`save-indicator bi bi-${walkSaveAvailable?'check-circle-fill':'dash-circle-fill'}`;
    }
}
function elapsedTime(){return walk.elapsed+(walk.tick?Math.max(0,Date.now()-walk.tick):0);}
function settleTimer(){walk.elapsed=elapsedTime();walk.tick=null;}
function restoreWalk(){
    let restored=null;
    try{restored=TreeWalkCore.restore(JSON.parse(localStorage.getItem(WALK_KEY)||'null'),treeData);}catch{}
    if(!restored)return false;
    restored.visited.forEach(id=>visitedStops.add(id));walk.skipped=new Set(restored.skipped);
    Object.assign(walk,{mode:restored.mode,status:restored.status,target:restored.target,startId:restored.startId,positionId:restored.positionId,elapsed:restored.elapsed,distance:restored.distance,estimatedDistance:restored.estimatedDistance});
    currentRoute=restored.route.map(id=>treeById.get(id));
    if(!currentRoute.length&&walk.status!=='exploring')return false;
    $('walk-mode').value=walk.status==='exploring'?'':walk.mode;$('walk-start').value=String(walk.startId);
    return true;
}
async function initializeWalkExperience(){
    await mediaReady;
    if(!treeData.length){showDataError();return;}
    walk.startId=treeData[0].id;
    $('walk-start').replaceChildren(...treeData.map(t=>{const option=document.createElement('option');option.value=t.id;option.textContent=t.name;return option;}));
    const gpsOption=document.createElement('option');gpsOption.value='gps';gpsOption.textContent='Current location · enable GPS';gpsOption.disabled=true;$('walk-start').prepend(gpsOption);$('walk-start').value=String(walk.startId);
    walkingReady=true;
    const restored=restoreWalk();
    if(!restored)selectWalkMode('quick',false);
    for(const id of visitedStops)updateMarkerStyle(id);
    chooseTarget();refreshWalk();
    if(walk.status==='complete')showWalkSummary();
    else if(walk.status==='exploring')showBrowser();
    else setWalkView('home');
    fitHomeView({animate:false,maxZoom:18});
}
let plannerChoiceSignature='';
function updateWalkChoices(){
    if(!walkingReady||!$('route-options').open)return;
    const origin=walk.useGPSStart&&userLoc?.accuracy<=50?userLoc:treeById.get(walk.startId)||treeData[0];
    const signature=[origin.lat,origin.lng,treeData.length,networkSegments.length,[...visitedStops].sort((a,b)=>a-b).join(',')].join('|');
    if(signature===plannerChoiceSignature)return;
    plannerChoiceSignature=signature;
    // Reuse each network leg across choices; calculate only when this planner
    // opens or its starting point changes, never on camera/GPS refreshes.
    const legs=new Map(),distance=(a,b)=>{const key=`${a.lat},${a.lng}|${b.id}`;if(!legs.has(key))legs.set(key,walkingLeg(a,b).distance);return legs.get(key);};
    for(const [mode,settings]of Object.entries(TreeWalkCore.MODES)){
        const candidates=mode==='full'?treeData:treeData.filter(t=>!visitedStops.has(t.id));
        const plan=TreeWalkCore.plan(candidates,origin,mode,distance);
        let minutes=plan.minutes;
        if(mode==='full'&&visitedStops.size){let point=origin;minutes=0;for(const tree of plan.route.filter(t=>!visitedStops.has(t.id))){minutes+=distance(point,tree)/TreeWalkCore.WALK_METRES_PER_MINUTE+TreeWalkCore.STOP_MINUTES;point=tree;}}
        const caption=`${settings.label.split('·')[0].trim()} · ~${Math.ceil(minutes)} min`;
        const option=$('walk-mode').querySelector(`[value="${mode}"]`);if(option.textContent!==caption)option.textContent=caption;
    }
}
function exitSelectedWalk(){
    settleTimer();clearTimeout(rerouteTimer);
    Object.assign(walk,{status:'exploring',target:null,positionId:null,elapsed:0,distance:0,estimatedDistance:0,tick:null,follow:false,resumeGPS:false,lastTrack:null,lastFollow:null,offRouteSince:0,arrivalId:null,arrivalReadings:[]});
    walk.skipped.clear();currentRoute=[];activeTreeId=null;activeTree=null;walkingDetailsOpen=false;
    $('arrival').hidden=true;$('route-options').open=false;
    locationTracker?.stop();
    listFilter='all';listSort='name';searchText='';$('tree-search').value='';syncFilterButtons();
    refreshWalk();showBrowser();
    clearTimeout(sheetRecenterFrame);sheetRecenterFrame=null;
    requestAnimationFrame(()=>fitHomeView({animate:motionOK(),maxZoom:18}));
}
function selectWalkMode(mode,notify=true){
    if(!walkingReady)return;
    if(walk.status==='active')settleTimer();
    walk.mode=TreeWalkCore.MODES[mode]?mode:'full';walk.status='preview';walk.skipped.clear();walk.target=null;walk.positionId=walk.startId;walk.elapsed=0;walk.distance=0;walk.estimatedDistance=0;walk.lastTrack=null;walk.follow=false;
    $('walk-mode').value=walk.mode;$('walk-summary').hidden=true;
    const candidates=walk.mode==='full'?treeData:treeData.filter(t=>!visitedStops.has(t.id));
    const planned=TreeWalkCore.plan(candidates,walkOrigin(),walk.mode,(a,b)=>walkingLeg(a,b).distance);
    currentRoute=planned.route;chooseTarget();refreshWalk();
    if(notify)fitHomeView({animate:motionOK(),maxZoom:18});
}
function refreshWalk(){
    chooseTarget();mapView.setAllTreesVisible(walk.status==='exploring');mapView.setStopOrder(currentRoute);treeData.forEach(tree=>updateMarkerStyle(tree.id));renderSidebar();
    if(walkView==='walking')renderWalkingDetails();
    generateSmartRoutes({force:true});updateNavigation();updatePlanner();saveWalk();
}
let homePreviewSignature='';
function renderHomeStops(){
    const upcoming=pendingTrees().slice(0,3),signature=upcoming.map(tree=>`${tree.id}:${currentRoute.indexOf(tree)}`).join('|');
    document.querySelector('.home-stop-preview').hidden=!upcoming.length;
    if(signature===homePreviewSignature)return;
    homePreviewSignature=signature;
    $('home-stop-list').innerHTML=upcoming.map(tree=>`<li><button class="preview-stop" data-tree-id="${tree.id}"><span class="stop-index">${String(currentRoute.indexOf(tree)+1).padStart(2,'0')}</span><span><strong>${escapeHTML(tree.name)}</strong><small>${escapeHTML(tree.scientific)}</small></span><i class="bi bi-arrow-up-right" aria-hidden="true"></i></button></li>`).join('');
}
function updatePlanner(){
    const metrics=remainingMetrics();
    const continuing=['paused','saved','active'].includes(walk.status);
    const exploring=walk.status==='exploring',modeLabel=exploring?'Explore campus':TreeWalkCore.MODES[walk.mode].label.split('·')[0].trim();
    $('route-label').textContent=modeLabel;
    $('home-walk-type').dataset.mode=walk.mode;
    $('home-walk-type').innerHTML=actionHTML(exploring?'tree':{quick:'lightning-charge-fill',casual:'cup-hot-fill',full:'tree-fill',nearby:'compass-fill'}[walk.mode],escapeHTML(modeLabel));
    $('current-walk-badge').textContent=modeLabel;
    $('current-walk-badge').setAttribute('aria-label',`Current walk: ${modeLabel}`);
    $('current-walk-badge').title=`Current walk: ${modeLabel}. Change walks from the planning screen.`;
    $('route-estimate').innerHTML=exploring?symbolMetric('tree',`${treeData.length} trees`,'All campus trees; choose a walk to start'):currentRoute.length?`${symbolMetric('tree',`${pendingTrees().length} trees`,`${pendingTrees().length} stops remaining`)}${symbolMetric('footprints',formatDistance(metrics.distance),'Approximate remaining walking distance')}${symbolMetric('clock',`~${metrics.minutes} min`,'Estimated time including stops')}`:'No trees fit. Try another walk or start.';
    renderHomeStops();
    $('stat-dist').textContent=formatDistance(metrics.distance);$('stat-time').textContent=`${metrics.minutes} min`;
    setAction('start-walk',walk.status==='complete'?'tree':'play-fill',walk.status==='complete'?'Explore':continuing?'Resume walk':'Start walk',walk.status==='complete'?'Explore more trees':continuing?'Continue your walk':{quick:'Start a 15-minute walk',casual:'Start a 30-minute walk',full:'Start the full walk',nearby:'Explore nearby trees'}[walk.mode]);
    $('start-walk').disabled=!pendingTrees().length&&walk.status!=='complete';
    $('saved-walk-note').hidden=!continuing;
    $('saved-walk-note').innerHTML=actionHTML('check2',['paused','saved'].includes(walk.status)?'Paused · saved':'Saved on this device');
    $('route-options').hidden=false;
    if(exploring)$('walk-mode').value='';
    $('walk-review').hidden=!continuing&&walk.status!=='complete';
    renderWalkSummaries();
}
function startWalking(){
    if(walk.status==='complete'){continueExploring();return;}
    if(!pendingTrees().length)return;
    closeUtility();
    if(walk.status!=='active'){walk.status='active';walk.tick=Date.now();walk.lastTrack=null;}
    walkingDetailsOpen=false;
    walk.follow=!!userLoc;chooseTarget();walkView='walking';renderWalkingDetails();applyWalkView();updatePlanner();saveWalk();
    walk.follow=!!userLoc;updateNavigation();
    if(walk.resumeGPS&&!locationTracker.isTracking()){walk.resumeGPS=false;locationTracker.start();}
    if(isSheetLayout())setSheetState('peek');
}
function pauseWalking(saveLater=false){
    if(walk.status==='exploring'){saveWalk();showBrowser();return;}
    settleTimer();walk.status=saveLater?'saved':'paused';walk.follow=false;walk.lastTrack=null;
    walk.resumeGPS=locationTracker?.isTracking()||walk.resumeGPS;
    locationTracker?.stop();closeUtility();setWalkView('home');updatePlanner();saveWalk();
    if(isSheetLayout())setSheetState('half');
}
function toggleVisited(id){
    if(!visitedStops.has(id)&&walk.status==='active'&&id===walk.target){
        const from=treeById.get(walk.positionId)||treeById.get(walk.startId);
        walk.estimatedDistance+=walkingLeg(from,treeById.get(id)).distance;walk.positionId=id;
    }
    if(visitedStops.has(id))visitedStops.delete(id);else visitedStops.add(id);
    updateMarkerStyle(id);walk.arrivalReadings=[];walk.arrivalId=null;$('arrival').hidden=true;
    chooseTarget();
    if(walk.status==='active'&&!pendingTrees().length){settleTimer();walk.status='complete';walk.follow=false;locationTracker?.stop();showWalkSummary();}
    refreshWalk();
}
function skipStop(){
    const target=targetTree();if(!target)return;
    walk.skipped.add(target.id);walk.target=null;walk.arrivalReadings=[];walk.arrivalId=null;$('arrival').hidden=true;
    if(!pendingTrees().length){settleTimer();walk.status='complete';walk.follow=false;locationTracker?.stop();showWalkSummary();}
    else reorderRemaining();
    refreshWalk();
}
function reorderRemaining(){
    const pending=pendingTrees();
    const reordered=TreeWalkCore.plan(pending,walkOrigin(),'full',(a,b)=>walkingLeg(a,b).distance).route;
    const completed=currentRoute.filter(t=>visitedStops.has(t.id)||walk.skipped.has(t.id));
    currentRoute=[...completed,...reordered];walk.target=reordered[0]?.id||null;walk.lastReroute=Date.now();walk.offRouteSince=0;
}
function walkSummaryHTML(compact=false){
    const progress=TreeWalkCore.progress(walk.status==='exploring'?treeData:currentRoute,visitedStops,walk.skipped),minutes=Math.round(elapsedTime()/60000);
    const active=walk.status==='active',preview=walk.status==='preview',pending=pendingTrees().length;
    const primary=active?'Pause':pending?(preview?'Start walk':'Resume'):'Explore',saved=walkSaveAvailable?'Saved on this device':'Unable to save on this device';
    if(compact){
        // Reuse estimates already rendered by the existing walking/planning UI;
        // opening or refreshing tools never calculates a different route.
        const distance=$('stat-dist').textContent.includes('--')?'0 m':$('stat-dist').textContent,time=$('stat-time').textContent.includes('--')?'0 min':$('stat-time').textContent;
        return `<div class="tools-progress"><div class="tools-progress-copy"><div class="tools-progress-heading"><h2>${walk.status==='complete'?'Walk complete':'Walk progress'}</h2><span class="summary-save" data-saved="${walkSaveAvailable}" role="img" aria-label="${saved}" title="${saved}">${actionHTML('phone')}<i class="save-indicator bi bi-${walkSaveAvailable?'check-circle-fill':'dash-circle-fill'}" aria-hidden="true"></i></span></div><p class="tools-progress-count"><strong>${progress.done} / ${progress.total}</strong><span>trees visited</span></p><p class="tools-progress-estimate" title="Approximate remaining walking distance and duration, including stops"><span>${actionHTML('footprints')}${escapeHTML(distance)}</span><span aria-hidden="true">·</span><span>${escapeHTML(time)}</span><span class="estimate-caption">estimated</span><span class="sr-only">remaining, including stops</span></p></div><div class="tools-progress-ring" role="progressbar" aria-label="Trees visited" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}" aria-valuetext="${progress.done} of ${progress.total} trees visited"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="ring-track" cx="22" cy="22" r="18"/><circle class="ring-value" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${progress.percent} 100" transform="rotate(-90 22 22)"/></svg><span aria-hidden="true">${progress.percent}%</span></div></div><div class="summary-actions"><button class="walk-btn primary symbol-action" data-summary-action="primary" aria-label="${primary}" title="${primary}" onclick="${active?'pauseWalking()':pending?'startWalking()':'continueExploring()'}">${actionHTML(active?'pause-fill':pending?'play-fill':'tree',primary)}</button><button class="text-btn symbol-action new-walk-action" aria-label="Start a new walk" title="New walk" onclick="newWalk()">${actionHTML('arrow-repeat','New walk')}</button><button class="text-btn symbol-action" aria-label="Done: return to walk planning" title="Done" onclick="closeUtility();showHome()">${actionHTML('check2','Done')}</button></div>`;
    }
    return `<div class="summary-heading"><h2>${walk.status==='complete'?'Walk complete':'Your walk'}</h2><span class="summary-save" data-saved="${walkSaveAvailable}" role="img" aria-label="${saved}" title="${saved}">${actionHTML('phone')}<i class="save-indicator bi bi-${walkSaveAvailable?'check-circle-fill':'dash-circle-fill'}" aria-hidden="true"></i></span></div><div class="summary-grid"><div><strong>${progress.done} / ${progress.total}</strong><span>${actionHTML('check2-circle','Visited')}</span></div><div><strong>${formatDistance(walk.distance||walk.estimatedDistance)}</strong><span>${actionHTML('footprints',walk.distance?'GPS estimate':'Path estimate')}</span></div><div title="Elapsed time including stops"><strong>${minutes} min</strong><span>${actionHTML('clock','With stops')}</span></div></div><div class="summary-actions"><button class="walk-btn primary symbol-action" data-summary-action="primary" aria-label="${primary}" title="${primary}" onclick="${active?'pauseWalking()':pending?'startWalking()':'continueExploring()'}">${actionHTML(active?'pause-fill':pending?'play-fill':'tree',primary)}</button><button class="text-btn symbol-action new-walk-action" aria-label="Start a new walk" title="New walk" onclick="newWalk()">${actionHTML('arrow-repeat','New walk')}</button><button class="text-btn symbol-action" aria-label="Done: return to walk planning" title="Done" onclick="closeUtility();showHome()">${actionHTML('check2','Done')}</button></div>`;
}
function renderWalkSummaries(){
    for(const id of ['walk-summary','tools-walk-summary']){
        const panel=$(id),compact=id==='tools-walk-summary',html=walkSummaryHTML(compact);
        // Keep focus stable while the ten-second statistics refresh runs.
        if(panel.innerHTML===html)continue;
        if(panel.contains(document.activeElement)){
            const doc=document.createElement('div');doc.innerHTML=html;
            for(const selector of compact?['.tools-progress','[data-summary-action]']:['h2','.summary-grid','.summary-save','[data-summary-action]']){
                const next=doc.querySelector(selector),current=panel.querySelector(selector);
                if(current&&current.outerHTML!==next.outerHTML){if(current.tagName==='BUTTON'){current.innerHTML=next.innerHTML;for(const name of ['onclick','aria-label','title'])current.setAttribute(name,next.getAttribute(name));}else current.replaceWith(next);}
            }
        }else panel.innerHTML=html;
    }
}
function showWalkSummary(){
    if(walk.status==='active')pauseWalking();
    renderWalkSummaries();
    closeUtility();setWalkView('summary',true);$('walk-summary').focus();
    updateNavigation();saveWalk();
}
function resumeLater(){pauseWalking(true);}
function continueExploring(){if(walk.status!=='exploring')selectWalkMode('nearby');listFilter=walk.status==='exploring'?'all':'nearby';syncFilterButtons();showBrowser();}
function newWalk(){
    pauseWalking();for(const id of visitedStops){visitedStops.delete(id);updateMarkerStyle(id);}walk.skipped.clear();selectWalkMode('quick');showHome();
}
function adjacentTree(delta){
    const list=currentRoute.some(t=>t.id===activeTreeId)?currentRoute:treeData;
    const index=list.findIndex(t=>t.id===activeTreeId),tree=list[index+delta];
    if(tree){activateTree(tree.id);document.querySelector('.panel-body').scrollTop=0;if(walkingPreferences.autoCentreSelection)findTreeOnMap(tree.id,false);}
}
function findTreeOnMap(id,collapse=true){
    const tree=treeById.get(id);if(!tree)return;walk.follow=false;if(collapse&&isSheetLayout())setSheetState('peek');
    requestAnimationFrame(()=>flyToVisible([tree.lat,tree.lng],19,{animate:motionOK(),duration:.4}));updateNavigation();
}
function updateNavigation(){
    const walking=walkView==='walking'&&!!targetTree();
    syncCardHeader();
    const visible=walking&&!document.body.classList.contains('tree-card-open');
    $('walk-strip').hidden=!visible;
    document.body.classList.toggle('walking-card',walking);
    $('resume-follow').hidden=!userLoc||walk.follow||walk.status!=='active'||walkView==='home'||walkView==='summary';
    if(!walking){scheduleLayout();return;}
    const tree=targetTree(),leg=walkingLeg(walkOrigin(),tree);
    const stop=currentRoute.findIndex(t=>t.id===tree.id)+1;
    $('nav-stop').innerHTML=symbolMetric(walk.status==='active'?'geo-alt':'pause-fill',`${stop} / ${currentRoute.length}`,`${walk.status==='active'?'Next':'Paused'} · Stop ${stop} of ${currentRoute.length}`);
    $('nav-name').textContent=tree.name;
    const minutes=leg.distance<TreeWalkCore.WALK_METRES_PER_MINUTE?'<1':Math.ceil(leg.distance/TreeWalkCore.WALK_METRES_PER_MINUTE);
    $('nav-distance').innerHTML=`${symbolMetric('footprints',formatDistance(leg.distance),`${formatDistance(leg.distance)} ${leg.network?'via paths':'direct estimate'}`)}${symbolMetric('clock',`${minutes} min`,'Estimated walk to next tree')}${leg.network?'':' · direct'}`;
    updateNavigationAction();
    setAction('pause-walk',walk.status==='active'?'pause-fill':'play-fill',walk.status==='active'?'Pause':'Resume',walk.status==='active'?'Pause walk':'Resume walk');
    $('skip-stop').disabled=walk.status!=='active';
    $('resume-follow').hidden=!userLoc||walk.follow||walk.status!=='active';
    const p=TreeWalkCore.progress(currentRoute,visitedStops,walk.skipped),metrics=remainingMetrics();
    $('walk-menu-progress').innerHTML=`${symbolMetric('check2-circle',`${p.done} / ${p.total}`,'Trees visited on this walk')}${symbolMetric('clock',`~${metrics.minutes} min`,'Estimated time remaining')}`;
    updateDirection();scheduleLayout();
}
function updateNavigationAction(){
    const expanded=walkingDetailsOpen;
    const resume=walk.status!=='active',visit=expanded||walk.arrivalId===walk.target;
    setAction('nav-primary',resume?'play-fill':visit?'check2-circle':'eye',resume?'Resume':visit?'Mark visited':'View tree',resume?'Continue your walk':visit?'Mark this tree visited':'View tree details');
}
function updateDirection(){
    const tree=targetTree();if(!tree)return;
    const heading=locationTracker?.getHeading?.();
    if(!userLoc){$('nav-arrow').textContent='◎';$('nav-arrow').style.transform='';$('nav-guidance').innerHTML=actionHTML('geo-alt',`GPS off · ${originDescription()}`);$('nav-guidance').title='GPS off. Distances use your selected start or last confirmed stop.';$('nav-guidance').setAttribute('aria-label',$('nav-guidance').title);return;}
    if(userLoc.accuracy>50){$('nav-arrow').textContent='◎';$('nav-arrow').style.transform='';$('nav-guidance').innerHTML=actionHTML('exclamation-triangle',`Weak GPS · ±${Math.round(userLoc.accuracy)} m`);$('nav-guidance').title='Weak GPS. Waiting for a clearer fix before arrival detection and rerouting.';$('nav-guidance').setAttribute('aria-label',`GPS accuracy ±${Math.round(userLoc.accuracy)} metres. ${$('nav-guidance').title}`);return;}
    const bearing=getBearingDegrees(userLoc,tree),valid=Number.isFinite(heading);
    $('nav-arrow').textContent='↑';$('nav-arrow').style.transform=`rotate(${valid?bearing-heading:bearing-(map?.getBearing()||0)}deg)`;
    $('nav-guidance').innerHTML=actionHTML('compass',valid?'Direct bearing':`Direct ${Math.round(bearing)}° · no compass`);
    $('nav-guidance').title=valid?'The arrow points directly to the tree relative to you.':'The arrow points directly to the tree relative to the map orientation.';
    $('nav-guidance').setAttribute('aria-label',`${valid?'Direct bearing.':'Compass unavailable.'} ${$('nav-guidance').title} Follow mapped paths.`);
}
function followLocation(first=false){
    if(!userLoc||!walk.follow||userLoc.accuracy>50)return;
    if(walk.lastFollow&&!first&&getDistance(walk.lastFollow.lat,walk.lastFollow.lng,userLoc.lat,userLoc.lng)<Math.max(6,userLoc.accuracy*.4))return;
    walk.lastFollow={...userLoc};
    flyToVisible([userLoc.lat,userLoc.lng],first?19:mapView.getZoom(),{animate:motionOK(),duration:first?.65:.35,flight:first});
}
function handleWalkingLocation(location,first){
    if(!Number.isFinite(location.timestamp)||Date.now()-location.timestamp>15000){showStatus('Waiting for a fresh GPS reading.',false,'gps');return;}
    if($('app-status').dataset.category==='gps')showStatus('');
    document.body.dataset.gpsQuality=location.accuracy>50?'weak':'good';
    const gpsOption=$('walk-start').querySelector('[value="gps"]');
    if(gpsOption){gpsOption.disabled=location.accuracy>50;gpsOption.textContent=location.accuracy>50?'Current location · weak GPS':'Your current location';}
    if(first&&location.accuracy<=50&&walk.useGPSStart){$('walk-start').value='gps';if(walk.status==='preview')selectWalkMode(walk.mode,false);if(walkView==='home'&&$('route-options').open)updateWalkChoices();}
    if(first&&walk.status==='active')walk.follow=true;
    if(first&&walk.status!=='active')flyToVisible([location.lat,location.lng],19,{animate:motionOK(),duration:.65});
    if(walk.status==='active'){
        if(location.accuracy<=35){
            const previous=walk.lastTrack;
            if(previous){
                const delta=getDistance(previous.lat,previous.lng,location.lat,location.lng),seconds=(location.timestamp-previous.timestamp)/1000;
                if(seconds>0&&seconds<30&&delta>Math.max(6,(previous.accuracy+location.accuracy)*.35)&&delta/seconds<3)walk.distance+=delta;
                // Retain an anchor until displacement exceeds the noise floor.
                if(delta>Math.max(6,location.accuracy*.5)||seconds>30)walk.lastTrack=location;
            }else walk.lastTrack=location;
        }else walk.lastTrack=null;
        checkArrival(location);checkReroute(location);
    }
    followLocation(first);updateNavigation();
    if(activeTree)updateDetailMiniCoords(activeTree);
    mapView.scheduleFocusLabel();
}
function checkArrival(location){
    const target=targetTree();if(!target)return;
    const distance=getDistance(location.lat,location.lng,target.lat,target.lng);
    if(walk.arrivalId===target.id){
        if(distance>walkingPreferences.arrivalThreshold*1.5||location.accuracy>35){walk.arrivalId=null;walk.arrivalReadings=[];$('arrival').hidden=true;scheduleLayout();}
        return;
    }
    walk.arrivalReadings=TreeWalkCore.nearArrival(walk.arrivalReadings,{...location,distance},target,walkingPreferences.arrivalThreshold);
    if(walk.arrivalReadings.length>=3&&walk.arrivalReadings[2].timestamp-walk.arrivalReadings[0].timestamp>=4000){
        walk.arrivalId=target.id;$('arrival-text').textContent=`You're near ${target.name}`;$('arrival').hidden=false;scheduleLayout();
        if(customSettings.haptics)navigator.vibrate?.(30);
    }
}
function routeDeviation(location){
    const target=targetTree();if(!target)return 0;
    const anchor=walk.lastRouteOrigin||walkOrigin(),points=walkingLeg(anchor,target).points;
    const cos=Math.cos(location.lat*DEG),px=location.lng*cos,py=location.lat;
    let minimum=Infinity;
    for(let i=1;i<points.length;i++)minimum=Math.min(minimum,distToSegmentSquared(px,py,points[i-1][1]*cos,points[i-1][0],points[i][1]*cos,points[i][0]));
    return Math.sqrt(minimum)*111320;
}
function checkReroute(location){
    if(location.accuracy>35){walk.offRouteSince=0;return;}
    const deviation=routeDeviation(location);
    if(deviation<Math.max(40,location.accuracy*2)){walk.offRouteSince=0;return;}
    if(!walk.offRouteSince)walk.offRouteSince=Date.now();
    if(Date.now()-walk.offRouteSince<10000||Date.now()-walk.lastReroute<20000)return;
    if(rerouteTimer)return;
    rerouteTimer=setTimeout(()=>{rerouteTimer=null;if(walk.status!=='active'||!userLoc||!walk.offRouteSince||userLoc.accuracy>35)return;reorderRemaining();refreshWalk();showStatus('Route updated from your location.');},2000);
}
function maybeRefreshWalkingRoute(force=false){
    const now=Date.now();
    if(force||(userLoc&&now-walk.lastRender>6000&&(!lastUserRouteRenderLoc||getDistance(userLoc.lat,userLoc.lng,lastUserRouteRenderLoc.lat,lastUserRouteRenderLoc.lng)>Math.max(15,userLoc.accuracy))))generateSmartRoutes({force:true});
}
function drawWalkingRoute(options={}){
    if(!walkingReady)return;
    const fc=features=>({type:'FeatureCollection',features});
    const makeLine=coords=>({type:'Feature',geometry:{type:'LineString',coordinates:coords.map(p=>[p[1],p[0]])},properties:{}});
    const network=[],direct=[];let from=walkOrigin();
    const repeats={counts:new Map(),coordsByKey:new Map()};
    for(const tree of pendingTrees()){
        const leg=walkingLeg(from,tree);
        if(leg.path){
            direct.push(makeLine([[from.lat,from.lng],leg.path[0]]));
            if(leg.path.length>=2)network.push(makeLine(leg.path));
            direct.push(makeLine([leg.path.at(-1),[tree.lat,tree.lng]]));
            addPathToRepeatCounts(leg.path,repeats.counts,repeats.coordsByKey);
        }else direct.push(makeLine([[from.lat,from.lng],[tree.lat,tree.lng]]));
        from=tree;
    }
    const highlight=buildRepeatHighlights(repeats);
    mapView.setRoute({'route-network':fc(network),'route-direct':fc(direct),repeats:fc(highlight.features),'repeat-labels':fc(highlight.labels),endpoints:fc(routeEndpoints())});
    mapView.setRepeatVisible(customSettings.repeatPaths);
    if(!endpointInitialLabelsShown){endpointInitialLabelsShown=true;showEndpointLabels(4000);}
    updateProgress();walk.lastRender=Date.now();lastUserRouteRenderLoc=userLoc?{...userLoc}:null;
    if(!walk.offRouteSince)walk.lastRouteOrigin={...walkOrigin()};
    updatePlanner();
}
function applyWalkingPreferences(){
    walkingPreferences.outdoor=mapView.basemap==='light';
    document.body.classList.toggle('outdoor',walkingPreferences.outdoor);
    document.body.dataset.mapTheme=mapView.basemap;
    $('arrival-threshold').value=walkingPreferences.arrivalThreshold;
    $('auto-centre-selection').checked=walkingPreferences.autoCentreSelection;
    const selected={basemap:mapView.basemap,'layer-buildings':mapView.settings.buildings?'on':'off','layer-route':mapView.settings.route?'on':'off'};
    for(const [id,value]of Object.entries(selected))for(const input of $(id).querySelectorAll('input')){
        input.checked=input.value===value;input.disabled=!map||mapView.contextLost||(id==='layer-buildings'&&mapView.settings.threeD);
    }
    $('buildings-setting').hidden=mapView.settings.threeD;
    $('mode-3d').textContent='3D';
    $('mode-2d').setAttribute('aria-pressed',String(!mapView.settings.threeD));
    $('mode-3d').setAttribute('aria-pressed',String(mapView.settings.threeD));
    const label='3D campus view';
    $('mode-3d').setAttribute('aria-label',label);$('mode-3d').title=label;
    $('mode-3d').disabled=!map||mapView.contextLost;
    $('mode-2d').disabled=!map||mapView.contextLost;
    $('map-north').disabled=!map||mapView.contextLost;
}
function saveWalkingPreferences(){try{localStorage.setItem(WALK_PREFS_KEY,JSON.stringify(walkingPreferences));}catch{}applyWalkingPreferences();}
function scheduleLayout(){if(layoutTimer)return;layoutTimer=requestAnimationFrame(()=>{layoutTimer=null;updateAdaptiveLayout();});}
let lastLayoutKey='';
function updateAdaptiveLayout(){
    const viewport=window.visualViewport;
    document.documentElement.style.setProperty('--viewport-height',`${viewport?.height||innerHeight}px`);
    const sheet=isSheetLayout(),wasSheet=document.body.classList.contains('sheet-layout');
    document.body.classList.toggle('sheet-layout',sheet);
    const browserBodyStyle=getComputedStyle(document.querySelector('.panel-body'));
    const browserWidth=uiPanel.clientWidth-parseFloat(browserBodyStyle.paddingInlineStart)-parseFloat(browserBodyStyle.paddingInlineEnd);
    const embedSort=sheet&&browserWidth>=parseFloat(getComputedStyle(document.documentElement).fontSize)*17;
    document.body.classList.toggle('browser-sort-embedded',embedSort);
    const sortSlot=embedSort?$('browser-sort-slot'):$('browser-list-meta'),sortControl=document.querySelector('.tree-sort');
    if(sortControl.parentElement!==sortSlot){const focused=document.activeElement===$('tree-sort');sortSlot.append(sortControl);if(focused)$('tree-sort').focus({preventScroll:true});}
    const routeOption=$('tree-sort').querySelector('[value=route]'),routeCaption=embedSort?'Tour':'Tour order';
    if(routeOption.textContent!==routeCaption)routeOption.textContent=routeCaption;
    document.body.classList.toggle('short-reading',sheet&&document.body.classList.contains('tree-card-open')&&(viewport?.width||innerWidth)>(viewport?.height||innerHeight)&&(viewport?.height||innerHeight)<parseFloat(getComputedStyle(document.documentElement).fontSize)*26);
    if(sheet&&!wasSheet&&walkView==='walking')sheetState=walkingDetailsOpen?'expanded':'peek';
    const tools=document.querySelector('.map-controls');
    const rem=parseFloat(getComputedStyle(document.documentElement).fontSize),h=viewport?.height||innerHeight;
    const visibleTools=[...tools.children].filter(child=>!child.hidden);
    // Measure the vertical layout independently of the current compact layout;
    // otherwise the horizontal zoom pair makes this threshold oscillate.
    const verticalTools=visibleTools.reduce((height,child)=>height+(child.classList.contains('map-zoom-group')?rem*6:Math.max(rem*2.75,child.offsetHeight)),0)+Math.max(0,visibleTools.length-1)*rem*.5;
    const portraitInspector=openUtility?.panel.id==='map-tools'&&sheet&&h>(viewport?.width||innerWidth)*.9;
    const compact=portraitInspector||(sheet&&h-uiPanel.getBoundingClientRect().height<verticalTools+rem*2);
    document.body.classList.toggle('compact-map',compact);
    if(!isDragging)setSheetState(sheetState,false);
    let browserScrollAll=false;
    if(walkView==='browse'){
        const body=document.querySelector('.panel-body'),firstRow=stopsList.querySelector('.tree-row');
        const chrome=stopsList.getBoundingClientRect().top-body.getBoundingClientRect().top+body.scrollTop+parseFloat(browserBodyStyle.paddingBottom);
        browserScrollAll=sheet||chrome+(firstRow?.offsetHeight||rem*5)>body.clientHeight;
    }
    document.body.classList.toggle('browser-scroll-all',browserScrollAll);
    $('app-status').style.setProperty('--status-top',`${rem}px`);
    const mapRect=$('map').getBoundingClientRect();
    const navHeight=`${document.querySelector('.detail-nav').offsetHeight}px`;
    if(uiPanel.style.getPropertyValue('--reading-nav-height')!==navHeight)uiPanel.style.setProperty('--reading-nav-height',navHeight);
    const key=`${mapRect.width}|${mapRect.height}|${window.devicePixelRatio||1}`;
    if(key!==lastLayoutKey){lastLayoutKey=key;mapView.resize();}
    positionOpenPopovers();
    mapView.setViewportPadding(getMapPadding());
}
function pauseFollow(){clearTimeout(sheetRecenterFrame);sheetRecenterFrame=null;if(!walk.follow)return;walk.follow=false;map?.stop();updateNavigation();}
map?.on('dragstart',pauseFollow);
map?.on('rotatestart',event=>{if(event.originalEvent)pauseFollow();});
map?.on('zoomstart',event=>{if(event.originalEvent)pauseFollow();});
map?.on('rotate',()=>{$('map-north').style.setProperty('--map-bearing',`${-map.getBearing()}deg`);if(walkingReady)updateDirection();});
document.getElementById('map').addEventListener('wheel',pauseFollow,{passive:true});
document.getElementById('map').addEventListener('touchstart',e=>{if(e.touches.length>1)pauseFollow();},{passive:true});
document.getElementById('map').addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-','='].includes(e.key))pauseFollow();});
$('map-zoom-in').onclick=()=>{pauseFollow();mapView.zoomBy(1);};$('map-zoom-out').onclick=()=>{pauseFollow();mapView.zoomBy(-1);};
$('map-north').onclick=()=>{pauseFollow();mapView.resetNorth();};
$('start-walk').onclick=startWalking;
$('walk-review').onclick=showWalkSummary;
$('browse-trees').onclick=showBrowser;
$('home-stop-list').onclick=event=>{const button=event.target.closest('[data-tree-id]');if(button)activateTree(Number(button.dataset.treeId));};
$('close-browser').onclick=()=>{if(walk.status==='active'){walkingDetailsOpen=false;walkView='walking';renderWalkingDetails();setWalkView('walking');if(isSheetLayout())setSheetState('peek');}else showHome();};
$('browser-trees-tab').onclick=()=>{if(walkView==='browse')$('tree-search').focus({preventScroll:true});else {showBrowser();$('browser-trees-tab').focus({preventScroll:true});}};
$('tree-sort').onchange=e=>{listSort=e.target.value;renderSidebar();};
$('walk-mode').onchange=e=>{selectWalkMode(e.target.value);if(walkView!=='home')showHome();updateWalkChoices();};
$('walk-start').onchange=e=>{walk.useGPSStart=e.target.value==='gps';if(!walk.useGPSStart)walk.startId=Number(e.target.value);if(walk.status!=='exploring')selectWalkMode(walk.mode);else {updatePlanner();saveWalk();}updateWalkChoices();};
$('walk-exit').onclick=exitSelectedWalk;
$('walk-mode').addEventListener('focus',updateWalkChoices);
$('tree-search').addEventListener('input',e=>{searchText=e.target.value.trim().toLocaleLowerCase();clearTimeout(previewTimer);previewTimer=setTimeout(renderSidebar,120);});
function syncFilterButtons(){for(const button of document.querySelectorAll('[data-filter]'))button.setAttribute('aria-pressed',String(button.dataset.filter===listFilter));}
for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{listFilter=button.dataset.filter;syncFilterButtons();renderSidebar();};
$('pause-walk').onclick=()=>{if(walk.status==='active')pauseWalking();else startWalking();};
$('skip-stop').onclick=skipStop;
$('show-route').onclick=()=>{closeUtility();pauseFollow();if(isSheetLayout())setSheetState('peek');fitHomeView({animate:motionOK()});};
$('resume-follow').onclick=()=>{walk.follow=true;walk.lastFollow=null;followLocation();updateNavigation();};
$('nav-tree').onclick=openWalkingDetails;
$('nav-primary').onclick=()=>{
    if(walk.status!=='active'){startWalking();return;}
    if(!walkingDetailsOpen&&walk.arrivalId!==walk.target){openWalkingDetails();return;}
    const id=walk.target;if(id&&!visitedStops.has(id))toggleVisited(id);
};
$('walk-menu-toggle').onclick=()=>toggleUtility('walk-menu','walk-menu-toggle');
$('map-tools-toggle').onclick=()=>toggleUtility('map-tools','map-tools-toggle');
$('menu-browse').onclick=showBrowser;
$('finish-walk').onclick=showWalkSummary;
for(const button of document.querySelectorAll('[data-close-popover]'))button.onclick=()=>closeUtility(true);
document.addEventListener('pointerdown',event=>{if(openUtility&&!openUtility.panel.contains(event.target)&&!openUtility.toggle.contains(event.target))closeUtility();});
$('basemap').onchange=event=>{if(event.target.checked)mapView.setBasemap(event.target.value);};
$('layer-buildings').onchange=event=>{if(event.target.checked)mapView.setBuildingsVisible(event.target.value==='on');};
$('layer-route').onchange=event=>{if(event.target.checked)mapView.setRouteVisible(event.target.value==='on');};
$('auto-centre-selection').onchange=event=>{walkingPreferences.autoCentreSelection=event.target.checked;saveWalkingPreferences();};
$('mode-3d').onclick=()=>{if(!mapView.settings.threeD){pauseFollow();mapView.set3D(true);}};
$('mode-2d').onclick=()=>{if(mapView.settings.threeD){pauseFollow();mapView.set3D(false);}};
window.addEventListener('treewalk:mapsettings',()=>applyWalkingPreferences());
window.addEventListener('treewalk:mapavailability',()=>applyWalkingPreferences());
$('arrival-threshold').onchange=e=>{walkingPreferences.arrivalThreshold=Math.max(15,Math.min(60,Number(e.target.value)||30));walk.arrivalReadings=[];saveWalkingPreferences();};
try{const saved=JSON.parse(localStorage.getItem(WALK_PREFS_KEY)||'{}');walkingPreferences.outdoor=saved.outdoor===true;walkingPreferences.autoCentreSelection=saved.autoCentreSelection!==false;walkingPreferences.arrivalThreshold=Math.max(15,Math.min(60,Number(saved.arrivalThreshold)||30));}catch{}
applyWalkingPreferences();
const adaptiveObserver=new ResizeObserver(scheduleLayout);adaptiveObserver.observe(uiPanel);adaptiveObserver.observe($('walk-strip'));adaptiveObserver.observe(document.querySelector('.header-top'));
adaptiveObserver.observe($('map'));
for(const id of ['map-tools','walk-menu','custom-panel'])adaptiveObserver.observe($(id));
adaptiveObserver.observe(document.querySelector('.detail-nav'));
adaptiveObserver.observe($('walk-home'));
adaptiveObserver.observe($('walk-trees-header'));
adaptiveObserver.observe($('browse-controls'));adaptiveObserver.observe($('browser-list-meta'));
map?.on('style.load',()=>requestAnimationFrame(scheduleLayout));
$('route-options').addEventListener('toggle',scheduleLayout);
$('route-options').addEventListener('toggle',()=>{
    if(!$('route-options').open)return;
    updateWalkChoices();
    requestAnimationFrame(()=>{
        const body=document.querySelector('.panel-body'),panel=$('route-options').getBoundingClientRect(),viewport=body.getBoundingClientRect();
        if(panel.bottom>viewport.bottom)body.scrollBy({top:Math.max(0,Math.min(panel.top-viewport.top,panel.bottom-viewport.bottom+parseFloat(getComputedStyle(body).paddingBottom))),behavior:motionOK()?'smooth':'auto'});
    });
});
window.addEventListener('resize',scheduleLayout,{passive:true});window.visualViewport?.addEventListener('resize',scheduleLayout,{passive:true});window.visualViewport?.addEventListener('scroll',scheduleLayout,{passive:true});
window.addEventListener('pagehide',saveWalk);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&walk.status==='active'){pauseWalking();}else scheduleLayout();});
setInterval(()=>{if(walk.status==='active'){saveWalk();updateDirection();if(walkView==='summary'||openUtility?.panel.id==='map-tools')renderWalkSummaries();}},10000);
let lastHeadingUpdate=0;
locationTracker.options.onHeadingChanged=()=>{if(Date.now()-lastHeadingUpdate>200){lastHeadingUpdate=Date.now();updateDirection();}};
for(const button of document.querySelectorAll('.map-controls button')){
    if(!button.getAttribute('aria-label')&&button.title)button.setAttribute('aria-label',button.title);
    button.removeAttribute('title');
}
document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeUtility(true);
    const dialog=$('lightbox').style.display==='flex'?$('lightbox'):$('about-modal').classList.contains('show')?$('about-modal'):null;
    if(!dialog)return;
    if(event.key==='Escape'){closeLightbox();closeAboutModal();return;}
    if(event.key==='Tab'){
        const items=[...dialog.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(el=>el.getClientRects().length);
        const first=items[0],last=items.at(-1);
        if(first&&(!dialog.contains(document.activeElement)||(event.shiftKey&&document.activeElement===first))){event.preventDefault();last.focus();}
        else if(last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
});
window.addEventListener('offline',()=>showStatus('You are offline. Loaded trees and paths still work; map tiles and uncached photos may be unavailable.',true));
window.addEventListener('online',()=>showStatus('Connection restored.'));
if(!navigator.onLine)showStatus('You are offline. Reconnect if campus data has not loaded.',true);
scheduleLayout();
resolveWalkingExperience();
