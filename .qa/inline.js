
// ── 0. MOBILE BOTTOM SHEET DRAG LOGIC ────────────────────────
let resolveWalkingExperience;
const walkingExperienceReady = new Promise(resolve=>{resolveWalkingExperience=resolve;});
const uiPanel = document.getElementById('ui-panel');
const dragHandleContainer = document.getElementById('drag-handle-container');
const panelHeader = document.querySelector('.panel-header');
let startY, startHeight, isDragging = false, sheetDragMoved = false, sheetDragPointerId = null, sheetDragTarget = null;
let sheetRecenterFrame = null;
let sheetState = 'half';
function isSheetLayout() {
    // Reserve enough room for a readable panel and a useful map, based on the user's text size.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return document.documentElement.clientWidth < rem * 54;
}
function sheetHeights() {
    const h=window.visualViewport?.height||window.innerHeight;
    const rem=parseFloat(getComputedStyle(document.documentElement).fontSize);
    const safe=parseFloat(getComputedStyle(uiPanel).paddingBottom)||0;
    const peek=Math.min(h*.85,dragHandleContainer.offsetHeight+panelHeader.offsetHeight+safe);
    const attribution=document.querySelector('.maplibregl-ctrl-attrib');
    const mapMinimum=rem*4.75+(attribution?.offsetHeight||rem*1.5);
    const expanded=Math.max(peek,Math.min(h*.85,h-mapMinimum));
    const home=document.getElementById('walk-home');
    const bodyStyle=getComputedStyle(document.querySelector('.panel-body'));
    const homeSize=typeof walkView!=='undefined'&&walkView==='home'?peek+home.scrollHeight+parseFloat(bodyStyle.paddingTop)+parseFloat(bodyStyle.paddingBottom):0;
    return {peek,half:Math.min(expanded,Math.max(peek,h*.45,homeSize)),expanded};
}
function getSheetPeekHeight() { return sheetHeights().peek; }
function setSheetState(state, recenter = true) {
    sheetState = state;
    uiPanel.dataset.sheetState = state;
    uiPanel.classList.toggle('sheet-hidden',state === 'peek' && isSheetLayout());
    dragHandleContainer.setAttribute('aria-expanded',String(state !== 'peek'));
    dragHandleContainer.setAttribute('aria-label',`Tree panel: ${state}. Activate to resize; use arrow keys for size.`);
    if(typeof syncCardHeader==='function')syncCardHeader();
    if(isSheetLayout()) uiPanel.style.setProperty('--sheet-height',`${sheetHeights()[state]}px`);
    else { uiPanel.style.height=''; uiPanel.style.removeProperty('--sheet-height'); }
    uiPanel.style.height='';
    if(typeof walkView !== 'undefined' && walkView==='walking')updateNavigationAction();
    if(state==='peek'&&document.querySelector('.panel-body').contains(document.activeElement))dragHandleContainer.focus({preventScroll:true});
    if(recenter) requestSheetMapRefresh();
}
function hideMobileSheet() { if(isSheetLayout()) setSheetState('peek'); }
function showMobileSheet(height = null) { if(isSheetLayout()) setSheetState(height && height > sheetHeights().half ? 'expanded' : 'half'); }
function requestSheetMapRefresh() {
    clearTimeout(sheetRecenterFrame);
    sheetRecenterFrame=setTimeout(()=>{
        sheetRecenterFrame=null;
        if(walk.follow&&userLoc){walk.lastFollow=null;followLocation();}
        else if(activeTree)flyToVisible([activeTree.lat,activeTree.lng],mapView.getZoom(),{animate:false});
        else if(walkView==='home')fitHomeView({animate:false,maxZoom:18});
    },260);
}
function beginPanelDrag(e) {
    if(!isSheetLayout() || (e.pointerType==='mouse' && e.button!==0))return;
    startY=e.clientY;startHeight=uiPanel.getBoundingClientRect().height;isDragging=true;sheetDragMoved=false;
    sheetDragPointerId=e.pointerId;sheetDragTarget=e.currentTarget;sheetDragTarget.setPointerCapture?.(e.pointerId);
    uiPanel.style.transition='none';
}
dragHandleContainer.addEventListener('pointerdown',beginPanelDrag);
document.addEventListener('pointermove',e=>{
    if(!isDragging)return;
    if(e.cancelable)e.preventDefault();
    const dy=startY-e.clientY;if(Math.abs(dy)>4)sheetDragMoved=true;
    const heights=sheetHeights();
    uiPanel.style.setProperty('--sheet-height',`${Math.max(heights.peek,Math.min(heights.expanded,startHeight+dy))}px`);
});
function endPanelDrag(){
    if(!isDragging)return;isDragging=false;
    if(sheetDragTarget?.hasPointerCapture?.(sheetDragPointerId))sheetDragTarget.releasePointerCapture(sheetDragPointerId);
    sheetDragPointerId=null;sheetDragTarget=null;uiPanel.style.transition='';
    const height=uiPanel.getBoundingClientRect().height;
    const nearest=Object.entries(sheetHeights()).sort((a,b)=>Math.abs(a[1]-height)-Math.abs(b[1]-height))[0][0];
    setSheetState(nearest);
}
document.addEventListener('pointerup',endPanelDrag);document.addEventListener('pointercancel',endPanelDrag);
dragHandleContainer.addEventListener('click',()=>{if(sheetDragMoved){sheetDragMoved=false;return;}setSheetState({peek:'half',half:'expanded',expanded:'peek'}[sheetState]);});
dragHandleContainer.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();setSheetState(e.key==='ArrowUp'?'expanded':e.key==='ArrowDown'?'peek':{peek:'half',half:'expanded',expanded:'peek'}[sheetState]);}});
document.body.classList.toggle('sheet-layout',isSheetLayout());

// ── 1. MAP INIT, DYNAMIC MARKERS & AUTO-HIDE ─────────────────────────
const UOW_CENTER = [-34.405179721817376, 150.87717061799876];
function calcBounds() {
    const isMob = isSheetLayout();
    const baseLat = 0.005, baseLng = 0.009; // Tighter bounds for 80% coverage
    return [
        [UOW_CENTER[0] - baseLat * (isMob ? 1.5 : 1.1), UOW_CENTER[1] - baseLng * (isMob ? 1.3 : 1.1)],
        [UOW_CENTER[0] + baseLat * (isMob ? 1.8 : 1.1), UOW_CENTER[1] + baseLng * (isMob ? 1.3 : 1.1)]
    ];
}

let legacyOutdoor=false;
try{legacyOutdoor=JSON.parse(localStorage.getItem('uowTreeWalkWalkingPreferences')||'{}').outdoor===true;}catch{}
const mapView=new CampusMap({container:'map',center:UOW_CENTER,outdoor:legacyOutdoor,
    onNotice:message=>{if(typeof showStatus==='function')showStatus(message);else document.getElementById('app-status').textContent=message;},
    onTreeClick:id=>{activateTree(id);flyToVisible([treeById.get(id).lat,treeById.get(id).lng],19);},
    onMapClick:handleFeaturelessMapClick
});
const map=mapView.map;
function getCampusBounds(){const b=calcBounds();return [[b[0][1],b[0][0]],[b[1][1],b[1][0]]];}
map?.setMaxBounds(getCampusBounds());
window.addEventListener('resize',()=>map?.setMaxBounds(getCampusBounds()),{passive:true});
function getMapPadding(){
    const panel=uiPanel.getBoundingClientRect(),rem=parseFloat(getComputedStyle(document.documentElement).fontSize);
    const h=window.visualViewport?.height||innerHeight;
    return isSheetLayout()?{top:rem,right:rem,bottom:Math.min(panel.height+rem,h-rem*2),left:rem}:{top:rem,right:rem,bottom:rem,left:panel.right+rem};
}
function flyToVisible(latlng,zoom,options={}){mapView.focus(latlng,zoom??mapView.getZoom(),getMapPadding(),options);}
function fitHomeView(options={}){mapView.fitBounds(getWalkBounds(),getMapPadding(),options);}
function recenterVisibleMap(options={}){if(activeTree)flyToVisible([activeTree.lat,activeTree.lng],mapView.getZoom(),options);else fitHomeView(options);}
function getWalkBounds(){
    const navigating=typeof walk!=='undefined'&&['active','paused','saved'].includes(walk.status);
    const route=navigating?pendingTrees():(currentRoute.length?currentRoute:treeData);
    const points=route.map(t=>[t.lng,t.lat]);
    if(navigating&&points.length){const origin=walkOrigin();points.push([origin.lng,origin.lat]);}
    if(!points.length)return getCampusBounds();
    const west=Math.min(...points.map(p=>p[0])),east=Math.max(...points.map(p=>p[0])),south=Math.min(...points.map(p=>p[1])),north=Math.max(...points.map(p=>p[1]));
    const dx=Math.max(.0001,(east-west)*.12),dy=Math.max(.0001,(north-south)*.12);
    return [[west-dx,south-dy],[east+dx,north+dy]];
}

let treeData = [], currentRoute = [];
const treeById = new Map();
const treeSnapCache = new Map();
const NEARBY_LABEL_DISTANCE = 25;
const NEARBY_LABEL_LIMIT = 5;
const treeLinksCache = new Map();
let treeLinksPromise = null;
let buildingsData = null;
let endpointInitialLabelsShown = false;
let endpointLabelHideTimer = null;
let endpointTwoFingerHoldTimer = null;
const visitedStops = new Set();
let userLoc = null;
const hapticAlertedTreeIds = new Set();
let lastHapticAt = 0;
const networkGraph = {}, nodeCoords = {};
const networkSegments = [];
let activeTreeId = null;
let activeTree = null;
let lastUserRouteRenderLoc = null;
let gpsUpdateQueued = false;
const customSettings = {
    haptics: true,
    repeatPaths: true,
    nearbyLabels: true,
    campusPaths: true
};
const CUSTOM_SETTINGS_KEY = 'uowTreeWalkCustomSettings';
const WELCOME_SEEN_KEY = 'uowTreeWalkWelcomeSeen';
let welcomeHTML = '';
let dialogReturnFocus = null;

function loadCustomSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(CUSTOM_SETTINGS_KEY) || '{}');
        Object.assign(customSettings, {
            haptics: saved.haptics !== false,
            repeatPaths: saved.repeatPaths !== false,
            nearbyLabels: saved.nearbyLabels !== false,
            campusPaths: saved.campusPaths !== false
        });
    } catch (e) {
        customSettings.haptics = true;
        customSettings.repeatPaths = true;
        customSettings.nearbyLabels = true;
        customSettings.campusPaths = true;
    }
}

function saveCustomSettings() {
    try { localStorage.setItem(CUSTOM_SETTINGS_KEY, JSON.stringify(customSettings)); } catch (e) {}
}

function syncCustomSettingsUI() {
    const panel = document.getElementById('custom-panel');
    const toggle = document.getElementById('custom-toggle');
    const haptics = document.getElementById('custom-haptics');
    const repeatPaths = document.getElementById('custom-repeat-paths');
    const nearbyLabels = document.getElementById('custom-nearby-labels');
    const campusPaths = document.getElementById('custom-campus-paths');
    if (haptics) haptics.checked = customSettings.haptics;
    if (repeatPaths) repeatPaths.checked = customSettings.repeatPaths;
    if (nearbyLabels) nearbyLabels.checked = customSettings.nearbyLabels;
    if (campusPaths) campusPaths.checked = customSettings.campusPaths;
    if (toggle && panel) {toggle.classList.toggle('active', panel.classList.contains('show'));toggle.setAttribute('aria-expanded',String(panel.classList.contains('show')));}
}

function syncCampusPathsLayer(){mapView.setPathsVisible(customSettings.campusPaths);}
function syncBuildingOverlays(){if(buildingsData)mapView.setBuildings(buildingsData);}

function loadBuildings() {
    fetch('buildings.geojson')
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            buildingsData = data;
            syncBuildingOverlays();
        })
        .catch(() => {
            buildingsData = null;
            syncBuildingOverlays();
        });
}

function bindCustomSettings() {
    loadCustomSettings();
    syncCustomSettingsUI();
    syncCampusPathsLayer();
    syncBuildingOverlays();

    const panel = document.getElementById('custom-panel');
    const toggle = document.getElementById('custom-toggle');
    toggle?.addEventListener('click', () => {
        panel?.classList.toggle('show');
        syncCustomSettingsUI();
    });
    document.addEventListener('pointerdown', event => {
        if (!panel?.classList.contains('show')) return;
        const target = event.target;
        if (panel.contains(target) || toggle?.contains(target)) return;
        panel.classList.remove('show');
        syncCustomSettingsUI();
    });

    [
        ['custom-haptics', 'haptics'],
        ['custom-repeat-paths', 'repeatPaths'],
        ['custom-nearby-labels', 'nearbyLabels'],
        ['custom-campus-paths', 'campusPaths']
    ].forEach(([id, key]) => {
        document.getElementById(id)?.addEventListener('change', event => {
            customSettings[key] = event.target.checked;
            saveCustomSettings();
            if (key === 'nearbyLabels') updateDynamicGPSContexts();
            if (key === 'repeatPaths') mapView.setRepeatVisible(customSettings.repeatPaths);
            if (key === 'campusPaths') syncCampusPathsLayer();
            syncCustomSettingsUI();
        });
    });

    document.getElementById('custom-welcome')?.addEventListener('click', () => {
        panel?.classList.remove('show');
        syncCustomSettingsUI();
        openAboutModal();
    });
}

const DEG = Math.PI / 180;
function getDistance(lat1, lon1, lat2, lon2) {
    const p1 = lat1*DEG, p2 = lat2*DEG;
    const dp = (lat2-lat1)*DEG, dl = (lon2-lon1)*DEG;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function renderMarkdownInline(value) {
    return escapeHTML(value)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>');
}

function renderWelcomeMarkdown(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const html = [];
    let inList = false;

    lines.forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) {
            if (inList) { html.push('</ul>'); inList = false; }
            return;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            if (inList) { html.push('</ul>'); inList = false; }
            const level = Math.min(6, heading[1].length);
            html.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
            return;
        }

        const listItem = line.match(/^[-*+]\s+(.+)$/);
        if (listItem) {
            if (!inList) { html.push('<ul>'); inList = true; }
            html.push(`<li>${renderMarkdownInline(listItem[1])}</li>`);
            return;
        }

        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<p>${renderMarkdownInline(line)}</p>`);
    });

    if (inList) html.push('</ul>');
    return html.join('');
}

function loadWelcomeContent() {
    fetch('about.md')
        .then(response => response.ok ? response.text() : '')
        .then(markdown => {
            welcomeHTML = renderWelcomeMarkdown(markdown);
            const body = document.getElementById('welcome-content');
            if (body) body.innerHTML = welcomeHTML || '<p>Welcome is not available.</p>';

        })
        .catch(() => {
            welcomeHTML = '';
            const body = document.getElementById('welcome-content');
            if (body) body.innerHTML = '<p>Welcome is not available.</p>';

        });
}

function normalizeTreeLinkKey(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function safeExternalURL(value) {
    try {
        const url = new URL(String(value ?? ''), window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (e) {
        return '';
    }
}

function getTreeLinks(treeName) {
    return treeLinksCache.get(normalizeTreeLinkKey(treeName)) || [];
}

function loadTreeLinks() {
    if (!treeLinksPromise) {
        treeLinksPromise = fetch('src/trees_links.json')
            .then(r => r.ok ? r.json() : [])
            .then(records => {
                treeLinksCache.clear();
                (Array.isArray(records) ? records : []).forEach(record => {
                    const links = Array.isArray(record.more_info)
                        ? record.more_info
                            .map(link => ({ label: String(link.label || '').trim(), url: safeExternalURL(link.url) }))
                            .filter(link => link.label && link.url)
                        : [];
                    if (record.name && links.length) treeLinksCache.set(normalizeTreeLinkKey(record.name), links);
                });
                return treeLinksCache;
            })
            .catch(() => treeLinksCache);
    }
    return treeLinksPromise;
}

async function getOptimizedImageSrc(url) { return url; }

// ── 2. CAMPUS PATHS & ADVANCED SNAP GEOMETRY ──────────────────
let campusPathsData = null;
fetch('campus_paths.geojson').then(r => r.json()).then(data => {
    data.features.forEach(f => {
        if (f.geometry?.type !== 'LineString') return;
        const coords = f.geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
            const [lng1,lat1] = coords[i], [lng2,lat2] = coords[i+1];
            const k1 = `${lat1.toFixed(5)},${lng1.toFixed(5)}`;
            const k2 = `${lat2.toFixed(5)},${lng2.toFixed(5)}`;
            nodeCoords[k1] = [lat1, lng1]; nodeCoords[k2] = [lat2, lng2];
            networkSegments.push({ k1, k2, lat1, lng1, lat2, lng2 });
            const d = getDistance(lat1, lng1, lat2, lng2);
            (networkGraph[k1] ??= []).push({ to: k2, dist: d });
            (networkGraph[k2] ??= []).push({ to: k1, dist: d });
        }
    });
    campusPathsData=data;
    mapView.setPaths(data);
    syncCampusPathsLayer();
    loadTreeCSV();
}).catch(async () => { await walkingExperienceReady; showStatus('Campus paths unavailable. Distances and dashed routes are straight-line estimates.'); loadTreeCSV(); });

function sqDist(x1,y1, x2,y2) { return (x2-x1)**2 + (y2-y1)**2; }
function distToSegmentSquared(px,py, vx,vy, wx,wy) {
    const l2 = sqDist(vx,vy,wx,wy);
    if (l2 === 0) return sqDist(px,py,vx,vy);
    let t = ((px-vx)*(wx-vx) + (py-vy)*(wy-vy)) / l2;
    t = Math.max(0, Math.min(1, t));
    return sqDist(px,py, vx + t*(wx-vx), vy + t*(wy-vy));
}

function snapToNetwork(lat, lng) {
    if (!networkSegments.length) return null;
    let minD = Infinity, bestNodeKey = null;
    const cosLat = Math.cos(lat * DEG);
    const px = lng * cosLat, py = lat;

    for (const segment of networkSegments) {
        const { k1, k2, lat1, lng1, lat2, lng2 } = segment;
        const vx = lng1 * cosLat, vy = lat1;
        const wx = lng2 * cosLat, wy = lat2;
        const dSq = distToSegmentSquared(px, py, vx, vy, wx, wy);
        if (dSq < minD) {
            minD = dSq;
            const d1 = getDistance(lat, lng, lat1, lng1);
            const d2 = getDistance(lat, lng, lat2, lng2);
            bestNodeKey = d1 < d2 ? k1 : k2;
        }
    }
    return bestNodeKey || Object.keys(nodeCoords)[0];
}

function getTreeSnapKey(tree) {
    if (!tree) return null;
    if (!tree.id) return snapToNetwork(tree.lat, tree.lng);
    if (!treeSnapCache.has(tree.id)) treeSnapCache.set(tree.id, snapToNetwork(tree.lat, tree.lng));
    return treeSnapCache.get(tree.id);
}

const _pathCache = new Map();
function findNetworkPath(sKey, eKey) {
    if (!networkGraph[sKey] || !networkGraph[eKey]) return null;
    const cacheKey = sKey < eKey ? `${sKey}|${eKey}` : `${eKey}|${sKey}`;
    if (_pathCache.has(cacheKey)) {
        const cached = _pathCache.get(cacheKey);
        return (sKey < eKey) ? cached : (cached ? [...cached].reverse() : null);
    }
    const distances = {}, previous = {}; const pq = [[0, sKey]];
    for (const k in networkGraph) distances[k] = Infinity;
    distances[sKey] = 0;
    while (pq.length) {
        pq.sort((a,b) => a[0]-b[0]);
        const [dist, u] = pq.shift();
        if (u === eKey) break;
        if (dist > distances[u]) continue;
        for (const { to, dist: w } of (networkGraph[u] || [])) {
            const alt = distances[u] + w;
            if (alt < distances[to]) { distances[to] = alt; previous[to] = u; pq.push([alt, to]); }
        }
    }
    if (distances[eKey] === Infinity) { _pathCache.set(cacheKey, null); return null; }
    if (_pathCache.size >= 2048) _pathCache.delete(_pathCache.keys().next().value);
    const path = []; let curr = eKey;
    while (curr) { path.push(nodeCoords[curr]); curr = previous[curr]; }
    path.reverse(); _pathCache.set(cacheKey, sKey < eKey ? path : [...path].reverse()); return path;
}

function getPathDistance(path) {
    if (!Array.isArray(path) || path.length < 2) return 0;
    let distance = 0;
    for (let i = 0; i < path.length - 1; i++) {
        distance += getDistance(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
    }
    return distance;
}

function getRouteLegDistance(fromTree, toTree) {
    if (!fromTree || !toTree) return Infinity;
    const sk = getTreeSnapKey(fromTree), ek = getTreeSnapKey(toTree);
    if (sk && ek && nodeCoords[sk] && nodeCoords[ek]) {
        const path = findNetworkPath(sk, ek);
        if (path) {
            return getDistance(fromTree.lat, fromTree.lng, nodeCoords[sk][0], nodeCoords[sk][1]) +
                getPathDistance(path) +
                getDistance(nodeCoords[ek][0], nodeCoords[ek][1], toTree.lat, toTree.lng);
        }
    }
    return getDistance(fromTree.lat, fromTree.lng, toTree.lat, toTree.lng);
}

function buildRecommendedRoute() {
    if (treeData.length <= 2) return [...treeData];
    const remaining = treeData.slice(1);
    const route = [treeData[0]];

    while (remaining.length) {
        const current = route[route.length - 1];
        let nextIndex = 0, nextDistance = Infinity;
        remaining.forEach((tree, index) => {
            const distance = getRouteLegDistance(current, tree);
            if (distance < nextDistance || (distance === nextDistance && tree.id < remaining[nextIndex].id)) {
                nextDistance = distance;
                nextIndex = index;
            }
        });
        route.push(remaining.splice(nextIndex, 1)[0]);
    }
    return route;
}

// ── 3. CSV + MARKERS + UI RENDERING ────────────────────
function loadTreeCSV() {
    Papa.parse('src/trees.csv', {
        download: true, header: true, skipEmptyLines: true,
        error() { walkingExperienceReady.then(()=>showDataError()); },
        async complete({ data }) {
            await loadTreeLinks();
            treeData = data
                .filter(r => r['Latitude'] && r['Longitude'])
                .map((r, i) => ({
                    key: TreeWalkCore.stableId(r), id: i + 1, lat: parseFloat(r['Latitude']), lng: parseFloat(r['Longitude']),
                    name: r['Common Name'] || 'Unknown Tree', scientific: r['Scientific Name'] || 'Unknown Species',
                    family: r['Family'] || 'Unknown Family', features: r['Features'] || '',
                    img: r['Photo Filename'] ? `photos/${r['Photo Filename']}` : null,
                    moreInfo: getTreeLinks(r['Common Name'])
                }));
            treeById.clear();
            treeSnapCache.clear();
            treeData.forEach(tree => {
                treeById.set(tree.id, tree);
                treeSnapCache.set(tree.id, snapToNetwork(tree.lat, tree.lng));
            });
            buildMapMarkers();
            await walkingExperienceReady;
            initializeWalkExperience();
            syncBuildingOverlays();
        }
    });
}

function updateMarkerStyle(id){mapView.setTreeState(id,{active:activeTreeId===id,visited:visitedStops.has(id)});}

function getMoreInfoHTML(tree, alaURL) {
    const links = [
        ...(Array.isArray(tree.moreInfo) ? tree.moreInfo : []),
        { label: 'Search ALA', url: alaURL }
    ];
    if (!links.length) return '';
    return `
        <div class="more-info">
            <span class="more-info-title">More Info</span>
            <div class="more-info-links">
                ${links.map(link => `
                    <a class="more-info-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">
                        ${escapeHTML(link.label)} <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                `).join('')}
            </div>
        </div>
    `;
}

// ── HTML Injector for Dedicated Detail View ──
function getDetailsHTML(tree){
    const idx=currentRoute.findIndex(t=>t.id===tree.id);
    const image=tree.img?`<button class="popup-img-wrap" onclick="openLightbox(treeById.get(${tree.id}).img)" aria-label="Enlarge ${escapeHTML(tree.name)} poster">${treeImageHTML(tree,'detail')}</button>`:'';
    return `<article class="detail-card"><div class="detail-head"><div><h2 class="detail-title">${escapeHTML(tree.name)}</h2><div class="detail-sci">${escapeHTML(tree.scientific)}</div></div><span class="detail-badge">${idx>=0?`Stop ${idx+1}`:'Explore'}</span></div>
        ${image}<section class="feature-info"><h3 class="about-title">ABOUT</h3><div class="about-row"><span class="about-key">Family</span><span class="about-value">${escapeHTML(tree.family)}</span></div><div class="about-row"><span class="about-key">Features</span><span class="about-value">${escapeHTML(tree.features)}</span></div></section>
        ${getMoreInfoHTML(tree,`https://bie.ala.org.au/search?q=${encodeURIComponent(tree.scientific)}`)}
        <div class="detail-actions"><button class="text-btn" onclick="findTreeOnMap(${tree.id})">Find on map</button><button class="text-btn" onclick="adjacentTree(-1)" ${idx===0?'disabled':''}>&larr; Previous</button><button class="text-btn" onclick="adjacentTree(1)" ${idx===currentRoute.length-1?'disabled':''}>Next &rarr;</button></div>
        <div class="popup-btns"><button class="pb pb-visit" id="bv-${tree.id}">Mark as Visited</button></div></article>`;
}

function buildMapMarkers(){mapView.setTrees(treeData);treeData.forEach(tree=>updateMarkerStyle(tree.id));}
function setRouteMode(mode){selectWalkMode(mode==='recommended'?'full':mode==='auto'?'nearby':mode);showBrowser();}

function getRoutePointKey(point) {
    return `${Number(point[0]).toFixed(6)},${Number(point[1]).toFixed(6)}`;
}

function getRouteSegmentKey(a, b) {
    const ak = getRoutePointKey(a), bk = getRoutePointKey(b);
    return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function addPathToRepeatCounts(path, counts, coordsByKey) {
    if (!Array.isArray(path) || path.length < 2) return;
    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        if (!Array.isArray(a) || !Array.isArray(b)) continue;
        const key = getRouteSegmentKey(a, b);
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!coordsByKey.has(key)) coordsByKey.set(key, [a, b]);
    }
}

function buildRepeatHighlights(repeatData){
    const features=[],labels=[],placed=[];
    repeatData.counts.forEach((count,key)=>{
        if(count<2)return;
        const coords=repeatData.coordsByKey.get(key);
        features.push({type:'Feature',geometry:{type:'LineString',coordinates:coords.map(p=>[p[1],p[0]])},properties:{count}});
        const mid=[(coords[0][0]+coords[1][0])/2,(coords[0][1]+coords[1][1])/2];
        const screen=mapView.project(mid);
        if(placed.some(p=>Math.hypot(screen.x-p.x,screen.y-p.y)<72))return;
        placed.push(screen);
        labels.push({type:'Feature',geometry:{type:'Point',coordinates:[mid[1],mid[0]]},properties:{label:`x${count}`}});
    });
    return {features,labels};
}

function formatTime(mins) {
    if (mins >= 60) {
        const hrs = Math.floor(mins / 60); const rem = mins % 60;
        return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
    }
    return `${mins} min`;
}

function routeEndpoints(){
    const first=currentRoute[0],last=currentRoute[currentRoute.length-1];
    return [first,last].filter((t,i)=>t&&(i===0||t.id!==first.id)).map((t,i)=>({type:'Feature',geometry:{type:'Point',coordinates:[t.lng,t.lat]},properties:{id:t.id,label:i===0?'Start':'End',color:i===0?'#2ea043':'#e51937'}}));
}
function showEndpointLabels(duration=2800){mapView.showEndpointLabels(true);clearTimeout(endpointLabelHideTimer);endpointLabelHideTimer=setTimeout(hideEndpointLabels,duration);}
function hideEndpointLabels(){mapView.showEndpointLabels(false);}

function handleEndpointTwoFingerStart(event) {
    if (!isSheetLayout() || event.touches?.length !== 2) return;
    clearTimeout(endpointTwoFingerHoldTimer);
    endpointTwoFingerHoldTimer = setTimeout(() => showEndpointLabels(3200), 650);
}

function handleEndpointTwoFingerEnd(event) {
    if (!event.touches || event.touches.length < 2) clearTimeout(endpointTwoFingerHoldTimer);
}

const mapTouchTarget = document.getElementById('map');
mapTouchTarget.addEventListener('touchstart', handleEndpointTwoFingerStart, { passive: true });
mapTouchTarget.addEventListener('touchmove', handleEndpointTwoFingerEnd, { passive: true });
mapTouchTarget.addEventListener('touchend', handleEndpointTwoFingerEnd, { passive: true });
mapTouchTarget.addEventListener('touchcancel', handleEndpointTwoFingerEnd, { passive: true });

function generateSmartRoutes(options = {}) { drawWalkingRoute(options); }

function updateProgress() {
    const p = TreeWalkCore.progress(currentRoute,visitedStops,walk.skipped);
    document.getElementById('progress-fill').style.width=p.percent+'%';
    document.getElementById('progress-text').textContent=`${p.done}/${p.total}`;
}

// ── 5. LIVE PROXIMITY TOOLTIPS & DISTANCES ─────────────────
function getBearingDegrees(from, to) {
    const lat1 = from.lat * DEG, lat2 = to.lat * DEG;
    const deltaLng = (to.lng - from.lng) * DEG;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) / DEG + 360) % 360;
}

function triggerNearbyHaptic(distance) {
    if (!customSettings.haptics || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const now = Date.now();
    if (now - lastHapticAt < 7000) return;
    lastHapticAt = now;
    navigator.vibrate(distance <= 10 ? [35, 45, 35] : 28);
}

function updateHapticProximity(proximityItems) {
    if (!customSettings.haptics) return;
    proximityItems.forEach(({ tree, distance }) => {
        if (distance > 25) hapticAlertedTreeIds.delete(tree.id);
    });

    const nearest = proximityItems
        .filter(item => item.distance <= 20 && !hapticAlertedTreeIds.has(item.tree.id))
        .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) return;
    hapticAlertedTreeIds.add(nearest.tree.id);
    triggerNearbyHaptic(nearest.distance);
}

function updateDynamicGPSContexts(){
    if(!userLoc){clearNearbyLabels();return;}
    const proximity=treeData.map(tree=>({tree,distance:getDistance(userLoc.lat,userLoc.lng,tree.lat,tree.lng)}));
    if(walk.status!=='active'&&userLoc.accuracy<=35)updateHapticProximity(proximity);
    const nearby=customSettings.nearbyLabels&&userLoc.accuracy<=50?proximity.filter(p=>p.distance<=NEARBY_LABEL_DISTANCE).sort((a,b)=>a.distance-b.distance).slice(0,NEARBY_LABEL_LIMIT):[];
    mapView.setNearbyLabels(nearby.map(({tree,distance})=>({type:'Feature',geometry:{type:'Point',coordinates:[tree.lng,tree.lat]},properties:{label:`${tree.name} - ${Math.round(distance)}m`}})));
    if(activeTree)updateDetailMiniCoords(activeTree);
}

const stopsList = document.getElementById('stops-list');
const detailViewArea = document.getElementById('tree-detail-view');
const detailContentArea = document.getElementById('detail-content-area');
const detailMiniCoords = document.getElementById('detail-mini-coords');

function updateDetailMiniCoords(tree) {
    if (!detailMiniCoords || !tree) return;
    const leg = walkingLeg(walkOrigin(),tree);
    detailMiniCoords.textContent = userLoc&&userLoc.accuracy<=50 ? `${formatDistance(leg.distance)} ${leg.network?'via paths':'direct estimate'}` : userLoc ? 'Waiting for accurate GPS' : 'Enable GPS for distance';
}
function fitDetailSheetToContent() { if(isSheetLayout())setSheetState('expanded'); }
function expandDetailSheetForImage() { }

function openAboutModal() {
    const modal = document.getElementById('about-modal');
    const body = document.getElementById('welcome-content');
    if (body && welcomeHTML) body.innerHTML = welcomeHTML;
    dialogReturnFocus = document.activeElement;
    modal?.classList.add('show');
    document.getElementById('about-modal-close')?.focus();
}

function closeAboutModal() {
    try { localStorage.setItem(WELCOME_SEEN_KEY, 'true'); } catch (e) {}
    const wasOpen = document.getElementById('about-modal')?.classList.contains('show');
    document.getElementById('about-modal')?.classList.remove('show');
    if(wasOpen)dialogReturnFocus?.focus();
}

function syncCardVisitedState(id) { renderSidebar(); }

function updateDetailVisitButton(id) {
    const btn = document.getElementById(`bv-${id}`);
    if (!btn) return;
    const isVisited = visitedStops.has(id);
    btn.className = isVisited ? 'pb pb-unvisit' : 'pb pb-visit';
    btn.innerHTML = isVisited
        ? `<i class="bi bi-arrow-counterclockwise" style="margin-right:4px"></i>Mark Unvisited`
        : `<i class="bi bi-check2-circle" style="margin-right:4px"></i>Mark as Visited`;
}

function renderSidebar() { renderTreeCards(); updateProgress(); }

stopsList.addEventListener('click', event => {
    const card = event.target.closest('.tree-card');
    if (!card) return;
    const id = Number(card.dataset.treeId);
    const tree = treeById.get(id);
    if (!tree) return;
    activateTree(id);
    flyToVisible([tree.lat, tree.lng], 19, {animate: motionOK(), duration: 0.4});
});

function activateTree(id, options = {}) {
    if(!options.walking){
        walk.follow=false;
        if(walkView!=='detail')detailReturnView=walkView==='browse'?'browse':walk.status==='active'?'walking':'home';
    }
    walkView=options.walking?'walking':'detail';
    applyWalkView();
    updateNavigation();
    const prevActiveId = activeTreeId;
    activeTreeId = id;
    activeTree = treeById.get(id) || null;
    
    if (prevActiveId) updateMarkerStyle(prevActiveId);
    if (activeTreeId) updateMarkerStyle(activeTreeId);

    // Swap Panel Views

    
    const tree = activeTree;
    if (tree) {
        updateDetailMiniCoords(tree);
        detailContentArea.innerHTML = getDetailsHTML(tree);
        
        // Setup Visit Toggle Button
        const btn = document.getElementById(`bv-${id}`);
        if (btn) {
            btn.onclick = (e) => {
                e.stopPropagation();
                toggleVisited(id);
                updateDetailVisitButton(id);
            };
        }
        
        updateDetailVisitButton(id);
        if(!options.passive){
            const heading=detailContentArea.querySelector('h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
            document.querySelector('.panel-body').scrollTop=0;
            fitDetailSheetToContent();
        }
    }
}

window.backToList = () => {
    const destination=walkView==='detail'?detailReturnView:walk.status==='active'?'walking':'home';
    if(destination==='walking'){
        walkView='walking';renderWalkingDetails();setWalkView('walking');
        if(isSheetLayout())setSheetState('peek');
    }else{
        const previous=activeTreeId;activeTreeId=null;activeTree=null;
        if(previous)updateMarkerStyle(previous);
        if(destination==='browse')showBrowser();else showHome();
    }
};

function handleFeaturelessMapClick(){
    document.getElementById('custom-panel')?.classList.remove('show');syncCustomSettingsUI();
    if(activeTreeId)backToList();
}

// ── 7. LIGHTBOX ──────────────────────────────────────────────
window.openLightbox = async src => {
    expandDetailSheetForImage();
    const lb = document.getElementById('lightbox');
    dialogReturnFocus = document.activeElement;
    document.getElementById('lightbox-img').alt = activeTree ? activeTree.name : 'Tree photograph';
    document.getElementById('lightbox-img').onerror = () => showStatus('Full-size photo unavailable. The smaller detail photo is still available.');
    document.getElementById('lightbox-img').src = await getOptimizedImageSrc(src);
    lb.style.display = 'flex'; lb.querySelector('button').focus(); requestAnimationFrame(() => lb.style.opacity = '1');
};
window.closeLightbox = () => {
    const lb = document.getElementById('lightbox');
    if(lb.style.display==='flex')dialogReturnFocus?.focus();
    lb.style.opacity = '0'; setTimeout(() => lb.style.display = 'none', 250);
};

// ── 8. LEAFLET SIMPLE LOCATE INTEGRATION ──────────────────────
let locationTracker = null;
const gpsButton = document.getElementById('gps-toggle');

// Helper functions
function clearNearbyLabels(){mapView.setNearbyLabels([]);}

function scheduleGPSRefresh(forceRouteRefresh = false) {
    if (forceRouteRefresh) lastUserRouteRenderLoc = null;
    if (gpsUpdateQueued) return;
    gpsUpdateQueued = true;
    requestAnimationFrame(() => {
        gpsUpdateQueued = false;
        updateDynamicGPSContexts();
        maybeRefreshWalkingRoute(forceRouteRefresh);
    });
}

function resetGPSContext() {
    userLoc = null;
    const originSelect=document.getElementById('walk-start');
    const gpsOption=originSelect.querySelector('[value="gps"]');
    if(gpsOption){gpsOption.disabled=true;gpsOption.textContent='Current location - enable GPS';if(originSelect.value==='gps')originSelect.value=String(walk.startId);}
    if(typeof walk !== 'undefined') { walk.follow = false; updateNavigation(); }
    if (activeTree) updateDetailMiniCoords(activeTree);
    lastUserRouteRenderLoc = null;
    clearNearbyLabels();
    generateSmartRoutes({ force: true });
}

locationTracker = new LocationTracker({
    onRender:(location,heading)=>mapView.setGPS(location,heading),
    button: gpsButton,
    geofenceCenter: UOW_CENTER,
    geofenceRadius: 2000,
    highAccuracy: true,
    timeout: 15000,
    maximumAge: 5000,
    onLocationFound: (location) => {
        const isFirstFix = !userLoc;
        userLoc = {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            heading: location.heading,
            timestamp: location.timestamp
        };

        handleWalkingLocation({...userLoc,timestamp:location.timestamp},isFirstFix);
        scheduleGPSRefresh();
    },
    onLocationError: (error) => {
        resetGPSContext();
        if (error?.type === 'stopped') return;
        showStatus(error?.code === 1 ? 'Location permission denied. Choose a starting tree to walk without GPS.' : 'GPS unavailable. Choose a starting tree or try the location button again.',false,'gps');
    },
    onGeofenceViolation: () => {
        showStatus('You are outside campus. Choose a starting tree to preview your walk.',false,'gps');
    }
});

bindCustomSettings();
loadBuildings();
loadWelcomeContent();

document.getElementById('about-modal-close')?.addEventListener('click', closeAboutModal);
document.getElementById('about-modal')?.addEventListener('click', event => {
    if (event.target.id === 'about-modal') closeAboutModal();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAboutModal();
});

document.getElementById('home-view').addEventListener('click', () => {
    fitHomeView({animate: motionOK(), duration: 0.4, maxZoom: 18});
});

