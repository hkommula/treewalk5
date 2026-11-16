/* Native MapLibre rendering. Routing and device permissions stay in the app.
 * All app geometry enters as GeoJSON (longitude, latitude); focus() accepts the
 * existing [latitude, longitude] convention at the camera boundary only.
 */
(function(root,factory){
    const api=factory(typeof module==='object'&&module.exports?require('./map-theme.js'):root.MidnightTheme,typeof module==='object'&&module.exports?require('./campus-scene.js'):root.CampusScene,typeof module==='object'&&module.exports?require('./map-label-layout.js'):root.MapLabelLayout);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.CampusMap=api.CampusMap;
})(typeof globalThis!=='undefined'?globalThis:this,function(Theme,Scene,Layout){
    'use strict';
    const MAP_SETTINGS_KEY='uowTreeWalkMapSettingsV1';
    const BASEMAPS={
        dark:{label:'UOW Midnight Explorer',url:'https://tiles.openfreemap.org/styles/dark'},
        light:{label:'UOW Daylight Explorer',url:'https://tiles.openfreemap.org/styles/positron'},
        aerial:{label:'Aerial',tiles:['https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}']}
    };
    const GLYPHS=Theme.GLYPHS;
    const WORKER_URL=typeof document==='undefined'?'src/campus-scene-worker.js':new URL('./campus-scene-worker.js',document.currentScript.src).href;
    const cameraEasing=t=>1-Math.pow(1-t,3);
    const empty=()=>({type:'FeatureCollection',features:[]});
    const collection=features=>({type:'FeatureCollection',features});
    const point=(coordinates,properties={},id)=>({type:'Feature',...(id===undefined?{}:{id}),geometry:{type:'Point',coordinates},properties});
    const line=(coordinates,properties={})=>({type:'Feature',geometry:{type:'LineString',coordinates},properties});
    function unobstructedViewport(viewport,obstacles,gap=0){
        let spaces=[viewport];
        for(const box of obstacles){
            const b={left:box.left-gap,right:box.right+gap,top:box.top-gap,bottom:box.bottom+gap};
            const next=spaces.flatMap(r=>{
                if(b.right<=r.left||b.left>=r.right||b.bottom<=r.top||b.top>=r.bottom)return [r];
                return [{...r,right:Math.min(r.right,b.left)},{...r,left:Math.max(r.left,b.right)},
                    {...r,bottom:Math.min(r.bottom,b.top)},{...r,top:Math.max(r.top,b.bottom)}];
            }).filter(r=>r.right>r.left&&r.bottom>r.top);
            const unique=[...new Map(next.map(r=>[JSON.stringify(r),r])).values()];
            spaces=unique.filter((r,i)=>!unique.some((s,j)=>i!==j&&s.left<=r.left&&s.right>=r.right&&s.top<=r.top&&s.bottom>=r.bottom));
        }
        return spaces.sort((a,b)=>(b.right-b.left)*(b.bottom-b.top)-(a.right-a.left)*(a.bottom-a.top))[0]||null;
    }
    const placeFocusLabel=Layout.placeLabel;
    function destination(location,metres,bearing){
        const r=Math.PI/180,d=metres/6371000,lat=location.lat*r,lng=location.lng*r,b=bearing*r;
        const y=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(b));
        const x=lng+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(y));
        return [x/r,y/r];
    }
    function gpsFeatures(location,heading){
        if(!location)return empty();
        const coords=[location.lng,location.lat],features=[point(coords,{kind:'position'})];
        if(Number.isFinite(location.accuracy)&&location.accuracy>0){
            const ring=Array.from({length:33},(_,i)=>destination(location,location.accuracy,i*360/32));
            ring[ring.length-1]=[...ring[0]];
            features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{kind:'accuracy'}});
        }
        if(Number.isFinite(heading)){
            const arc=Array.from({length:9},(_,i)=>destination(location,28,heading-24+i*6));
            features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[coords,...arc,coords]]},properties:{kind:'heading'}});
        }
        return collection(features);
    }
    function aerialStyle(){
        return {version:8,glyphs:GLYPHS,light:Theme.SCENE_LIGHT,sources:{'nsw-imagery':{type:'raster',tiles:BASEMAPS.aerial.tiles,tileSize:256,maxzoom:19,
            attribution:'Imagery © <a href="https://data.nsw.gov.au/data/dataset/nsw-imagery" target="_blank" rel="noopener">NSW Spatial Services</a> / Department of Customer Service 2020; AAM, Jacobs Ausimage, LANDSAT'}},
        layers:[{id:'background',type:'background',paint:{'background-color':'#13202a'}},{id:'nsw-imagery',type:'raster',source:'nsw-imagery',paint:{'raster-fade-duration':0}}]};
    }
    class CampusMap {
        static unobstructedViewport=unobstructedViewport;
        constructor(options={}){
            this.options=options;this.map=null;this.ready=false;this.contextLost=false;
            this.data=new Map();this.signatures=new Map();this.treeStates=new Map();this.settings={basemap:'dark',threeD:false,buildings:true,route:true};
            this.lastBasemap='dark';this.epoch=0;this.styleAbort=null;this.styleCache=new Map();this.endpointLabels=false;
            this.trees=[];this.stopOrder=new Map();this.browsing=false;this.allTreesVisible=false;
            this.sceneGeneration=0;this.clipSequence=0;
            this.pathsVisible=true;this.repeatVisible=true;this.lastErrorAt=0;
            try{
                const saved=JSON.parse(localStorage.getItem(MAP_SETTINGS_KEY)||'null');
                if(saved&&BASEMAPS[saved.basemap])this.settings.basemap=saved.basemap;
                else if(options.outdoor)this.settings.basemap='light';
                this.settings.threeD=saved?.threeD===true;
                this.settings.buildings=saved?.buildings!==false;this.settings.route=saved?.route!==false;
            }catch{}
            this.basemap=this.settings.basemap;
            try{
                if(typeof maplibregl==='undefined')throw Error('The map library could not load.');
                maplibregl.setWorkerCount(Math.min(2,navigator.hardwareConcurrency||2));
                this.map=new maplibregl.Map({container:options.container||'map',center:[options.center[1],options.center[0]],zoom:17,
                    minZoom:15,maxZoom:19,maxPitch:60,renderWorldCopies:false,trackResize:false,
                    attributionControl:false,pixelRatio:Math.min(window.devicePixelRatio||1,navigator.deviceMemory<=4?1.5:2),
                    canvasContextAttributes:{antialias:false},fadeDuration:100,
                    style:{version:8,glyphs:GLYPHS,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#001641'}}]}});
                this.focusLabel=document.createElement('button');this.focusLabel.className='tree-focus-label';this.focusLabel.type='button';this.focusLabel.hidden=true;
                this.focusLabel.innerHTML='<span class="focus-label-media" aria-hidden="true" hidden><i class="bi bi-tree"></i><img alt="" loading="lazy" decoding="async" width="160" height="160" hidden></span><span class="focus-label-content"><span class="focus-label-name"></span><span class="marker-stats" aria-hidden="true"></span></span><i class="focus-label-chevron bi bi-chevron-right" aria-hidden="true" hidden></i>';this.map.getContainer().append(this.focusLabel);
                this.focusLabel.querySelector('img').addEventListener('error',event=>{event.target.hidden=true;});
                this.focusLabel.addEventListener('click',event=>{event.stopPropagation();if(this.labelTree)(this.options.onTreePreview||this.options.onTreeClick)?.(this.labelTree.id);});
                this.focusLabelObserver=new ResizeObserver(()=>this.scheduleFocusLabel());this.focusLabelObserver.observe(this.focusLabel);
                this.focusLink=document.createElementNS('http://www.w3.org/2000/svg','svg');this.focusLink.classList.add('tree-focus-link');this.focusLink.setAttribute('aria-hidden','true');this.focusLink.style.display='none';
                this.focusLink.append(document.createElementNS('http://www.w3.org/2000/svg','line'));this.map.getContainer().append(this.focusLink);
                this.map.on('move',()=>{this.scheduleFocusLabel();this.scheduleAnnotations();});this.map.on('resize',()=>{this.scheduleFocusLabel();this.scheduleAnnotations();});
                this.map.addControl(new maplibregl.AttributionControl({compact:false,
                    customAttribution:'Paths © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}),'bottom-right');
                this.attributionElement=this.map.getContainer().querySelector('.maplibregl-ctrl-attrib');
                this.attributionContent=this.attributionElement.querySelector('.maplibregl-ctrl-attrib-inner');
                this.configureAttribution();
                this.map.on('style.load',()=>{
                    this.ready=true;this.installLayers();
                    this.configureAttribution();
                    if(this.recovering){this.recovering=false;this.hideFallback();}
                });
                this.map.once('load',()=>{this.set3D(this.settings.threeD,false);this.setBasemap(this.basemap);});
                this.map.on('sourcedata',e=>{
                    if(['uow-trees','uow-explore'].includes(e.sourceId)&&e.isSourceLoaded)this.applyTreeStates();
                    if(e.sourceId==='uow-stop-labels'&&e.isSourceLoaded)this.applyTreeStates(['uow-stop-labels']);
                    if(e.sourceId==='uow-explore'&&e.isSourceLoaded&&this.browsing)this.scheduleAnnotations();
                    if(e.sourceDataType==='metadata')this.configureAttribution();
                    if(e.sourceId===this.buildingVectorSource){this.buildingsDirty=true;if(e.isSourceLoaded)this.scheduleBuildings();}
                });
                this.map.on('moveend',()=>{this.buildingsDirty=true;this.scheduleBuildings();this.scheduleAnnotations(true);});
                // Vector tile events need not have sourceDataType='content'.
                // Sample once after parsing/rendering settles, not on every frame.
                this.map.on('idle',()=>{
                    if(this.buildingsDirty){this.buildingsDirty=false;this.scheduleBuildings();}
                    if(this.annotationsPending){this.annotationsPending=false;this.scheduleAnnotations(true);}
                });
                this.map.on('click',e=>this.handleClick(e));
                this.map.on('mousemove',e=>{
                    if(this.hoverFrame)return;
                    this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=null;if(this.ready&&!this.contextLost)this.map.getCanvas().style.cursor=this.hitFeatures(e.point).length?'pointer':'';});
                });
                this.map.on('rotateend',()=>{if(!this.settings.threeD&&this.map.getBearing()!==0)this.map.jumpTo({bearing:0,pitch:0});});
                this.map.on('webglcontextlost',e=>{
                    e.originalEvent?.preventDefault();this.contextLost=true;this.ready=false;
                    this.map.stop();this.showFallback('The map paused because graphics became unavailable. Your trees and saved walk are still available.');
                });
                this.map.on('webglcontextrestored',()=>{
                    // MapLibre rebuilds its Style asynchronously after a lost context.
                    // Native addSource/addLayer must wait for style.load, not merely
                    // the canvas context-restored event.
                    this.contextLost=false;this.ready=false;this.recovering=true;
                    const finish=()=>{
                        if(this.recovering&&!this.contextLost&&this.map.isStyleLoaded()){
                            this.ready=true;this.installLayers();this.recovering=false;this.hideFallback();
                        }
                    };
                    this.map.once('idle',finish);requestAnimationFrame(finish);this.map.triggerRepaint();
                });
                this.map.on('error',e=>{
                    if(Date.now()-this.lastErrorAt>30000){this.lastErrorAt=Date.now();this.notice('Some map data could not load. Campus trees and loaded paths remain available.');}
                    options.onError?.(e.error);
                });
                this.boundaryReady=fetch('UOW_boundary.geojson').then(r=>{if(!r.ok)throw Error('Boundary unavailable');return r.json();}).then(data=>this.setBoundary(data)).catch(()=>this.notice('Campus outline could not load. Trees and walking routes remain available.'));
            }catch(error){
                this.showFallback('The map needs WebGL graphics support. You can still browse trees, start a walk and save your progress.');
            }
        }
        configureAttribution(){
            // Keep the native control's live source/provider updates, with its
            // ordinary (non-popup) content hosted inside the layers inspector.
            const target=document.getElementById('map-attribution-content'),credits=this.attributionContent;
            if(!target||!credits)return;
            if(credits.parentElement!==target)target.replaceChildren(credits);
            // The detached native wrapper retains its metadata subscriptions;
            // its disclosure/summary never becomes another map popup.
            this.attributionElement.remove();
            credits.dataset.initialised='true';
            for(const link of credits.querySelectorAll('a')){link.target='_blank';link.rel='noopener noreferrer';}
        }
        scheduleFocusLabel(){
            if(!this.map||this.labelFrame)return;
            this.labelFrame=requestAnimationFrame(()=>{this.labelFrame=null;this.updateFocusLabel();});
        }
        projectedAnnotations(){
            const c=this.map.getCenter(),canvas=this.map.getContainer(),stamp=[c.lng,c.lat,this.map.getZoom(),this.map.getBearing(),this.map.getPitch(),canvas.clientWidth,canvas.clientHeight,...Object.values(this.map.getPadding()),this.routeRevision||0,this.trees.length,this.settings.route].join('|');
            if(this.projectedScene?.stamp===stamp)return this.projectedScene;
            const markers=this.trees.map(tree=>({...this.map.project([tree.lng,tree.lat]),id:tree.id,tree})),segments=[];
            if(this.settings.route)for(const id of ['uow-route-network','uow-route-direct'])for(const feature of this.data.get(id)?.data.features||[]){
                const paths=feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[feature.geometry.coordinates];
                for(const path of paths){let previous=null;for(const coord of path){const point=this.map.project(coord);if(previous&&Math.max(previous.x,point.x)>=0&&Math.min(previous.x,point.x)<=canvas.clientWidth&&Math.max(previous.y,point.y)>=0&&Math.min(previous.y,point.y)<=canvas.clientHeight)segments.push([previous,point]);previous=point;}}
            }
            return this.projectedScene={stamp,markers,segments};
        }
        scheduleAnnotations(force=false){
            if(!this.map||this.contextLost||!this.ready)return;
            if(force){clearTimeout(this.annotationTimer);this.annotationTimer=null;this.lastAnnotation=0;}
            if(this.annotationFrame||this.annotationTimer)return;
            const delay=Math.max(0,100-(performance.now()-(this.lastAnnotation||0)));
            if(delay){this.annotationTimer=setTimeout(()=>{this.annotationTimer=null;this.scheduleAnnotations();},delay);return;}
            this.annotationFrame=requestAnimationFrame(()=>{this.annotationFrame=null;this.lastAnnotation=performance.now();this.updateAnnotations();});
        }
        updateAnnotations(){
            if(!this.ready||this.contextLost)return;
            // In pinned MapLibre 5.24, reparsing GeoJSON layers during an initial
            // tile/glyph parse can leave GPU geometry paired with stale query
            // indexes. Serialize annotation filter/data changes after loading.
            // This also coalesces updates while a new viewport is loading tiles.
            if(!this.map.loaded()){this.annotationsPending=true;return;}
            this.annotationsPending=false;
            const canvas=this.map.getContainer(),padding=this.viewportPadding||this.map.getPadding(),availableWidth=Math.max(1,canvas.clientWidth-padding.left-padding.right),availableHeight=Math.max(1,canvas.clientHeight-padding.top-padding.bottom),zoom=this.map.getZoom();
            const radius=Layout.markerRadius(zoom,availableWidth),scene=this.projectedAnnotations();
            const ranked=scene.markers.filter(p=>this.allTreesVisible||this.stopOrder.has(p.id)||p.id===this.selectedId).map(p=>({...p,rank:p.id===this.selectedId?-2:p.id===this.currentId?-1:(this.stopOrder.get(p.id)||100)+(this.treeStates.get(p.id)?.visited?100:this.treeStates.get(p.id)?.skipped?200:0)}));
            const visible=this.allTreesVisible?[...ranked].sort((a,b)=>a.rank-b.rank):Layout.declutterMarkers(ranked,radius,{left:0,top:0,right:canvas.clientWidth,bottom:canvas.clientHeight});
            this.displayMarkerIds=new Set(visible.map(p=>p.id));this.markerRadius=radius;
            const signature=JSON.stringify([...this.displayMarkerIds].sort((a,b)=>a-b));
            if(signature!==this.markerFilterSignature){
                this.markerFilterSignature=signature;const ids=['in',['get','id'],['literal',[...this.displayMarkerIds]]];
                for(const id of ['uow-tree-halo','uow-tree-points','uow-stop-numbers','uow-endpoints-circle'])if(this.map.getLayer(id))this.map.setFilter(id,id==='uow-stop-numbers'?['all',['>', ['get','stopNumber'],0],ids]:ids);
            }
            const scale=Math.max(.82,Math.min(1,availableWidth/720)),scaleKey=scale.toFixed(2);
            const exploreRadius=(6+Math.max(0,Math.min(4,zoom-15))*.75)*scale;
            const explore=this.browsing&&!this.allTreesVisible?Layout.declutterMarkers(scene.markers.filter(p=>!this.stopOrder.has(p.id)&&p.id!==this.selectedId).map(p=>({...p,rank:500+p.id,radius:exploreRadius})),exploreRadius,{left:0,top:0,right:canvas.clientWidth,bottom:canvas.clientHeight},visible.map(p=>({...p,radius}))):[];
            this.displayExploreIds=new Set(explore.map(p=>p.id));
            const exploreSignature=JSON.stringify([...this.displayExploreIds].sort((a,b)=>a-b));
            if(exploreSignature!==this.exploreFilterSignature){this.exploreFilterSignature=exploreSignature;for(const id of ['uow-explore-glow','uow-explore-points'])if(this.map.getLayer(id))this.map.setFilter(id,['all',['!',['has','point_count']],['in',['get','id'],['literal',[...this.displayExploreIds]]]]);}
            this.clusterFeatures=this.browsing&&this.map.getLayer('uow-clusters')?this.map.queryRenderedFeatures({layers:['uow-clusters']}).map(f=>({coordinates:f.geometry.coordinates,radius:f.properties.point_count>=30?23:f.properties.point_count>=10?19:15})):[];
            if(scaleKey!==this.markerScaleKey){
                this.markerScaleKey=scaleKey;
                for(const [id,low,high]of [['uow-tree-points',8,14],['uow-tree-halo',13,22],['uow-stop-callouts',8,14],['uow-stop-callout-halo',13,22],['uow-explore-points',6,9],['uow-explore-glow',10,15]])if(this.map.getLayer(id))this.map.setPaintProperty(id,'circle-radius',['interpolate',['linear'],['zoom'],15,low*scale,19,high*scale]);
            }
            this.updateFocusLabel(true);
            const viewport={left:8,top:8,right:canvas.clientWidth-8,bottom:canvas.clientHeight-8},uiObstacles=this.options.getLabelObstacles?.()||[],obstacles=[...uiObstacles,...visible.map(p=>Layout.markerBox(p,radius+4)),...explore.map(p=>Layout.markerBox(p,exploreRadius+4)),...this.clusterFeatures.map(f=>Layout.markerBox(this.map.project(f.coordinates),f.radius+4))];
            if(this.focusLabel&&!this.focusLabel.hidden){const r=this.focusLabel.getBoundingClientRect(),origin=canvas.getBoundingClientRect();obstacles.push({left:r.left-origin.left,right:r.right-origin.left,top:r.top-origin.top,bottom:r.bottom-origin.top});}
            const budget=Math.min(12,Math.max(2,Math.floor(Math.sqrt(availableWidth*availableHeight)/120)+Math.max(0,Math.floor((zoom-17.5)*3)))),features=[],links=[],seen=new Set(this.focusLabel&&!this.focusLabel.hidden&&this.labelTree?[this.labelTree.name]:[]);
            // A collision must not make a close stop permanently unreachable at
            // maxZoom. Only its numbered label moves; uow-trees/route stay exact.
            const eligible=ranked.filter(p=>this.stopOrder.has(p.id)&&!uiObstacles.some(b=>p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom));
            this.stopCallouts=Layout.placeStopCallouts(eligible,visible,radius,viewport,obstacles,scene.segments,budget);
            this.stopCalloutIds=new Set(this.stopCallouts.map(p=>p.id));
            const labelData=this.stopCallouts.map(p=>{
                const position=this.map.unproject([p.x,p.y]),length=Math.hypot(p.x-p.anchor.x,p.y-p.anchor.y),dx=(p.x-p.anchor.x)/length,dy=(p.y-p.anchor.y)/length;
                const end={x:p.x-dx*(radius+2),y:p.y-dy*(radius+2)};
                links.push(line([p.anchor,end].map(q=>{const v=this.map.unproject([q.x,q.y]);return [v.lng,v.lat];}),{kind:'stop',id:p.id}));
                obstacles.push(Layout.markerBox(p,radius+4));
                return point([position.lng,position.lat],{id:p.id,name:p.tree.name,stopNumber:this.stopOrder.get(p.id),priority:false,labelRank:p.rank},p.id);
            });
            this.setData('uow-stop-labels',collection(labelData));
            const anchors=this.stopCallouts.filter(p=>visible.every(v=>Math.hypot(v.x-p.anchor.x,v.y-p.anchor.y)>radius+4)).map(p=>p.id),anchorSignature=JSON.stringify(anchors);
            if(this.anchorSignature!==anchorSignature){this.anchorSignature=anchorSignature;if(this.map.getLayer('uow-stop-anchors'))this.map.setFilter('uow-stop-anchors',['in',['get','id'],['literal',anchors]]);}
            const nearby=(this.data.get('uow-nearby')?.data.features||[]).map(f=>{const p=this.map.project(f.geometry.coordinates);return {...p,name:f.properties.label,id:`near-${f.properties.label}`,kind:'nearby',rank:-1};});
            const endpoints=this.endpointLabels?(this.data.get('uow-endpoints')?.data.features||[]).filter(f=>this.displayMarkerIds.has(f.properties.id)).map(f=>({...this.map.project(f.geometry.coordinates),name:f.properties.label,id:`endpoint-${f.properties.id}`,kind:'endpoint',rank:-2})):[];
            const candidates=[...endpoints,...nearby,...(zoom>=18-Math.min(.5,availableWidth/1600)?visible.filter(p=>p.id!==this.selectedId&&p.id!==this.currentId).map(p=>({...p,name:p.tree.name,kind:'tree',rank:p.rank})):[])];
            this.labelMeasure ||= document.createElement('canvas').getContext('2d');this.labelMeasure.font='500 10.5px Montserrat, sans-serif';
            for(const candidate of candidates.sort((a,b)=>a.rank-b.rank)){
                if(features.length+this.stopCallouts.length>=budget)break;
                const treeName=candidate.name.split(' - ')[0];if(seen.has(treeName))continue;
                const size={width:Math.ceil(this.labelMeasure.measureText(candidate.name).width*1.08)+10,height:22},gap=radius+6;
                const rect=placeFocusLabel(candidate,size,viewport,obstacles,gap,scene.segments);if(!rect)continue;
                const pos=this.map.unproject([(rect.left+rect.right)/2,(rect.top+rect.bottom)/2]);features.push(point([pos.lng,pos.lat],{name:candidate.name,kind:candidate.kind,labelRank:candidate.rank},candidate.id));
                const connector=Layout.connector(candidate,rect,radius,gap);if(connector)links.push(line(connector.map(p=>{const v=this.map.unproject([p.x,p.y]);return [v.lng,v.lat];})));
                obstacles.push(rect);seen.add(treeName);
            }
            this.annotationBoxes={markers:[...visible,...this.stopCallouts],labels:features.length?obstacles.slice(-features.length):[],radius};
            this.setData('uow-name-labels',collection(features));this.setData('uow-name-links',collection(links));
        }
        updateFocusLabel(ignoreCallouts=false){
            const label=this.focusLabel;
            if(!label)return;
            const tree=this.trees.find(t=>t.id===this.selectedId)||this.trees.find(t=>t.id===this.currentId);
            if(this.focusLink)this.focusLink.style.display='none';
            if(!tree||!this.ready||this.contextLost||this.unavailable){label.hidden=true;return;}
            this.labelTree=tree;
            const preview=this.browsing&&this.selectedId===tree.id;
            label.dataset.preview=String(preview);label.querySelector('.focus-label-media').hidden=!preview;label.querySelector('.focus-label-chevron').hidden=!preview;
            const photo=preview?this.options.getTreePreview?.(tree):null,photoSignature=photo?`${photo.src}|${photo.srcset}`:'';
            if(this.focusPhotoSignature!==photoSignature){
                this.focusPhotoSignature=photoSignature;const img=label.querySelector('img');
                img.hidden=!photo?.src;
                if(photo?.src){if(photo.srcset)img.srcset=photo.srcset;else img.removeAttribute('srcset');img.sizes='3.25rem';img.src=photo.src;}
                else {img.removeAttribute('src');img.removeAttribute('srcset');}
            }
            if(label.dataset.treeId!==String(tree.id)){label.querySelector('.focus-label-name').textContent=tree.name;label.title=tree.name;label.dataset.treeId=tree.id;}
            const stats=this.options.getTreeStats?.(tree,this.stopOrder.get(tree.id)||0)||[],signature=JSON.stringify(stats);
            if(this.focusStatsSignature!==signature||this.focusStatsTree!==tree.id){
                this.focusStatsSignature=signature;this.focusStatsTree=tree.id;
                const row=label.querySelector('.marker-stats'),fragment=document.createDocumentFragment();
                for(const stat of stats){
                    const item=document.createElement('span');item.className='marker-stat';item.title=stat.description;
                    const icon=document.createElement('i');icon.className=`lucide-icon lucide-${stat.icon}`;icon.setAttribute('aria-hidden','true');item.append(icon);
                    for(const [kind,value]of [['full',stat.full],['compact',stat.compact]]){const text=document.createElement('span');text.className=`metric-${kind}`;text.textContent=value;item.append(text);}
                    fragment.append(item);
                }
                row.replaceChildren(fragment);row.hidden=!stats.length;
                label.setAttribute('aria-label',`View tree: ${tree.name}${stats.length?'. '+stats.map(s=>s.description).join('. '):''}`);
            }
            const canvas=this.map.getContainer(),rem=parseFloat(getComputedStyle(canvas).fontSize)||16,v=window.visualViewport;
            const padding=this.viewportPadding||this.map.getPadding(),compact=document.body.classList.contains('sheet-layout')||canvas.clientWidth-padding.left-padding.right<rem*(preview?32:26);
            const compactValue=String(compact);if(label.dataset.compact!==compactValue)label.dataset.compact=compactValue;
            const origin=canvas.getBoundingClientRect(),margin=Math.max(8,rem*.5);
            const viewport={left:Math.max(0,(v?.offsetLeft||0)-origin.left)+margin,top:Math.max(0,(v?.offsetTop||0)-origin.top)+margin,right:Math.min(canvas.clientWidth,(v?.offsetLeft||0)+(v?.width||canvas.clientWidth)-origin.left)-margin,bottom:Math.min(canvas.clientHeight,(v?.offsetTop||0)+(v?.height||canvas.clientHeight)-origin.top)-margin};
            const maxWidth=`${Math.max(0,viewport.right-viewport.left)}px`;if(label.style.maxWidth!==maxWidth)label.style.maxWidth=maxWidth;label.hidden=false;
            const size={width:label.offsetWidth,height:label.offsetHeight},anchor=this.map.project([tree.lng,tree.lat]);
            const obstacles=(this.options.getLabelObstacles?.()||[]).map(r=>({left:r.left-4,right:r.right+4,top:r.top-4,bottom:r.bottom+4}));
            const scene=this.projectedAnnotations(),radius=this.markerRadius||Layout.markerRadius(this.map.getZoom(),canvas.clientWidth);
            obstacles.push(...scene.markers.filter(p=>p.id!==tree.id&&(this.displayMarkerIds?.has(p.id)||this.displayExploreIds?.has(p.id))).map(p=>Layout.markerBox(p,radius+3)),...(this.clusterFeatures||[]).map(f=>Layout.markerBox(this.map.project(f.coordinates),f.radius+4)));
            if(!ignoreCallouts)obstacles.push(...(this.data.get('uow-stop-labels')?.data.features||[]).map(f=>Layout.markerBox(this.map.project(f.geometry.coordinates),radius+4)));
            // The two-line focus label needs more clearance than a native name.
            // Bound the search by its measured height and the available viewport.
            const gap=Math.max(18,rem),reach=Math.min(viewport.right-viewport.left,viewport.bottom-viewport.top,size.height*3);
            const position=placeFocusLabel(anchor,size,viewport,obstacles,gap,scene.segments,reach);
            label.hidden=!position;
            if(position){
                label.style.transform=`translate(${position.left}px,${position.top}px)`;
                const connector=Layout.connector(anchor,position,radius,gap);
                if(connector&&this.focusLink){this.focusLink.style.display='';this.focusLink.setAttribute('viewBox',`0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);for(const [name,value]of Object.entries({x1:connector[0].x,y1:connector[0].y,x2:connector[1].x,y2:connector[1].y}))this.focusLink.firstElementChild.setAttribute(name,value);}
            }
        }
        notice(message){
            const status=typeof document!=='undefined'&&document.getElementById('app-status');
            if(this.options.onNotice)this.options.onNotice(message);else if(status)status.textContent=message;
        }
        showFallback(message){
            this.unavailable=true;
            if(this.focusLabel)this.focusLabel.hidden=true;
            if(this.focusLink)this.focusLink.style.display='none';
            const fallback=document.getElementById('map-fallback');
            if(fallback){fallback.hidden=false;fallback.querySelector('p').textContent=message;}
            document.body.classList.add('map-unavailable');
            window.dispatchEvent(new CustomEvent('treewalk:mapavailability',{detail:{available:false}}));
        }
        hideFallback(){this.unavailable=false;const fallback=document.getElementById('map-fallback');if(fallback)fallback.hidden=true;document.body.classList.remove('map-unavailable');window.dispatchEvent(new CustomEvent('treewalk:mapavailability',{detail:{available:true}}));}
        saveSettings(){try{localStorage.setItem(MAP_SETTINGS_KEY,JSON.stringify(this.settings));}catch{}}
        emitSettings(){window.dispatchEvent(new CustomEvent('treewalk:mapsettings',{detail:{...this.settings}}));}
        setBoundary(data){
            this.boundary=Scene.normaliseBoundary(data);this.sceneGeneration++;
            this.lastBuildingInput=null;
            this.setData('uow-buildings',empty());this.setData('uow-building-names',empty());
            const receive=result=>{
                if(result.generation!==this.sceneGeneration)return;
                if(result.type==='error')this.notice('Some campus styling could not load. Trees and walking routes remain available.');
                if(result.type==='buildings'&&result.epoch===this.epoch&&result.sequence===this.clipSequence){
                    this.sceneAppliedEpoch=result.epoch;
                    this.setData('uow-buildings',result.buildings);this.setData('uow-building-names',result.labels);
                }
            };
            if(!this.sceneWorker&&typeof Worker!=='undefined'){
                try{this.sceneWorker=new Worker(WORKER_URL);}catch{this.sceneWorker=null;}
            }
            if(this.sceneWorker){
                this.sceneWorker.onmessage=({data:result})=>receive(result);
                this.sceneWorker.onerror=()=>{this.sceneWorker.terminate();this.sceneWorker=null;this.lastBuildingInput=null;this.scheduleBuildings();this.notice('Campus styling is limited on this device. Walking remains available.');};
            }
            if(this.sceneWorker)this.sceneWorker.postMessage({type:'boundary',boundary:this.boundary,generation:this.sceneGeneration});
            if(this.ready){this.installBuildings();this.scheduleBuildings();}
        }
        scheduleBuildings(){
            clearTimeout(this.buildingTimer);
            if(!this.boundary||!this.ready||this.contextLost||!this.buildingVectorSource)return;
            this.buildingTimer=setTimeout(()=>{
                if(!this.ready||this.contextLost||!this.map.getSource(this.buildingVectorSource))return;
                const plain=f=>({type:'Feature',id:f.id,properties:{...f.properties},geometry:f.geometry});
                const features=this.map.querySourceFeatures(this.buildingVectorSource,{sourceLayer:'building'}).map(plain);
                if(!features.length)return;
                const pois=this.map.querySourceFeatures(this.buildingVectorSource,{sourceLayer:'poi'}).filter(f=>f.properties?.name||f.properties?.['name:en']).map(plain);
                const signature=JSON.stringify([features,pois]);if(signature===this.lastBuildingInput)return;
                this.lastBuildingInput=signature;
                const payload={type:'buildings',generation:this.sceneGeneration,sequence:++this.clipSequence,epoch:this.epoch,features,pois};
                if(this.sceneWorker)this.sceneWorker.postMessage(payload);
                else{const result=Scene.clipBuildings(features,this.boundary,pois);this.sceneAppliedEpoch=this.epoch;this.setData('uow-buildings',result.buildings);this.setData('uow-building-names',result.labels);}
            },160);
        }
        async setBasemap(mode){
            if(!BASEMAPS[mode]||!this.map||this.contextLost)return false;
            const epoch=++this.epoch;this.styleAbort?.abort();this.styleAbort=new AbortController();
            const controller=this.styleAbort;
            const timeout=setTimeout(()=>controller.abort(),12000);
            try{
                let style=this.styleCache.get(mode);
                if(!style){
                    if(mode==='aerial')style=aerialStyle();
                    else{
                        const response=await fetch(BASEMAPS[mode].url,{signal:this.styleAbort.signal});
                        if(!response.ok)throw Error('Style unavailable');
                        style=await response.json();
                        style=Theme.restyle(style,mode);
                    }
                    this.styleCache.set(mode,style);
                }
                if(epoch!==this.epoch)return false;
                this.basemap=mode;this.settings.basemap=mode;this.lastBasemap=mode==='aerial'?this.lastBasemap:mode;
                this.ready=false;
                clearTimeout(this.buildingTimer);this.lastBuildingInput=null;
                this.map.setStyle(structuredClone(style),{diff:false});
                this.saveSettings();this.emitSettings();return true;
            }catch(error){
                if(epoch===this.epoch){this.settings.basemap=this.basemap;this.emitSettings();this.notice('Basemap unavailable. Try again or choose another map; campus data and your walk are retained.');}
                return false;
            }finally{clearTimeout(timeout);}
        }
        set3D(enabled,animate=true){
            this.settings.threeD=!!enabled&&!!this.map&&!this.contextLost;
            if(this.map){
                if(this.settings.threeD){this.map.dragRotate.enable();this.map.touchZoomRotate.enableRotation();this.map.touchPitch.enable();this.map.keyboard.enableRotation();}
                else{this.map.dragRotate.disable();this.map.touchZoomRotate.disableRotation();this.map.touchPitch.disable();this.map.keyboard.disableRotation();}
                const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                this.map.easeTo({pitch:this.settings.threeD?45:0,bearing:this.settings.threeD?this.map.getBearing():0,duration:animate&&!reduce?600:0,easing:cameraEasing});
                this.installBuildings();
            }
            this.saveSettings();this.emitSettings();
        }
        resize(){if(this.map&&!this.contextLost)this.map.resize();}
        setViewportPadding(padding){
            this.viewportPadding={...padding};
            this.scheduleFocusLabel();
            this.scheduleAnnotations();
            if(!this.map||this.contextLost||this.paddingFrame)return;
            this.paddingFrame=requestAnimationFrame(()=>{
                this.paddingFrame=null;
                if(this.contextLost)return;
                if(this.map.isMoving()){
                    if(!this.paddingAfterMove){this.paddingAfterMove=true;this.map.once('moveend',()=>{this.paddingAfterMove=false;this.setViewportPadding(this.viewportPadding);});}
                    return;
                }
                const current=this.map.getPadding();
                if(Object.keys(this.viewportPadding).some(key=>Math.abs(current[key]-this.viewportPadding[key])>.5))this.map.setPadding(this.viewportPadding);
            });
        }
        getZoom(){return this.map?.getZoom()??18;}
        resetNorth(){
            if(!this.map||!this.ready||this.contextLost)return;
            const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.map.easeTo({bearing:0,duration:reduced?0:350,easing:cameraEasing});
        }
        zoomBy(delta){
            if(!this.map||this.contextLost)return;
            const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.map.easeTo({zoom:Math.max(15,Math.min(19,this.getZoom()+delta)),duration:reduce?0:350,easing:cameraEasing});
        }
        focus(latlng,zoom,padding,options={}){
            if(!this.map||this.contextLost)return;
            const reduced=options.animate===false||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const point=this.map.project([latlng[1],latlng[0]]),canvas=this.map.getCanvas();
            const far=Math.abs((zoom??this.getZoom())-this.getZoom())>1.2||Math.hypot(point.x-canvas.clientWidth/2,point.y-canvas.clientHeight/2)>Math.max(canvas.clientWidth,canvas.clientHeight)*.6;
            const flight=!reduced&&options.flight!==false&&far;
            this.viewportPadding={...padding};
            const camera={center:[latlng[1],latlng[0]],zoom:zoom??this.getZoom(),padding,duration:reduced?0:(options.duration??(flight?.7:.45))*1000,easing:cameraEasing};
            if(flight)this.map.flyTo({...camera,curve:1.25,maxDuration:900});else this.map.easeTo(camera);
        }
        fitBounds(bounds,padding,options={}){
            if(!this.map||this.contextLost)return;
            const reduce=options.animate===false||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.viewportPadding={...padding};this.map.setPadding(padding);
            // MapLibre accounts for persistent transform padding itself. Passing
            // it again as fit padding would subtract the panel twice.
            this.map.fitBounds(bounds,{padding:0,maxZoom:options.maxZoom??19,bearing:this.map.getBearing(),pitch:this.map.getPitch(),linear:true,easing:cameraEasing,duration:reduce?0:(options.duration??.55)*1000});
        }
        project(latlng){return this.map?.project([latlng[1],latlng[0]])||{x:0,y:0};}
        setData(id,data,sourceOptions={}){
            const signature=JSON.stringify(data);
            if(this.signatures.get(id)===signature)return;
            this.signatures.set(id,signature);this.data.set(id,{data,sourceOptions});
            if(!this.ready||this.contextLost)return;
            const source=this.map.getSource(id);
            if(source)source.setData(data);
            else this.map.addSource(id,{type:'geojson',data,...sourceOptions});
        }
        setPaths(data){this.setData('uow-paths',data);}
        setTrees(trees){this.trees=trees;this.refreshTreeData();}
        setAllTreesVisible(value){if(this.allTreesVisible===value)return;this.allTreesVisible=!!value;this.refreshTreeData();}
        setStopOrder(route){this.stopOrder=new Map(route.map((tree,index)=>[tree.id,index+1]));this.refreshTreeData();}
        refreshTreeData(){
            const features=this.trees.map(t=>point([t.lng,t.lat],{id:t.id,name:t.name,stopNumber:this.stopOrder.get(t.id)||0,onRoute:this.stopOrder.has(t.id)?1:0,overview:this.allTreesVisible,selected:t.id===this.selectedId,priority:t.id===this.selectedId||t.id===this.currentId,labelRank:t.id===this.selectedId?0:t.id===this.currentId?1:10+(this.stopOrder.get(t.id)||100)},t.id));
            // Route numbers are never replaced by cluster counts. Exploration
            // alone clusters trees outside this route; stable IDs remain shared.
            this.setData('uow-trees',collection(features));
            this.setData('uow-explore',collection(this.allTreesVisible?[]:features.filter(f=>!f.properties.onRoute&&!f.properties.selected)),{cluster:true,clusterMaxZoom:17,clusterRadius:35});
            this.scheduleFocusLabel();
            this.scheduleAnnotations(true);
        }
        setBrowsing(value){
            this.browsing=value;
            for(const id of ['uow-clusters','uow-cluster-counts','uow-explore-glow','uow-explore-points'])this.setVisibility(id,value);
            this.scheduleAnnotations();
        }
        installBuildings(){
            if(!this.ready||this.contextLost)return;
            this.buildingsDirty=true;
            let source=this.map.getSource('openmaptiles')?'openmaptiles':null;
            if(!source&&this.settings.threeD){
                source='uow-scene-buildings';
                if(!this.map.getSource(source))this.map.addSource(source,{...Theme.VECTOR_SOURCE});
            }
            this.buildingVectorSource=source;
            if(!source){
                if(this.map.getLayer('uow-building-feed'))this.map.removeLayer('uow-building-feed');
                for(const id of ['uow-buildings-3d','uow-buildings-fill'])if(this.map.getLayer(id))this.map.removeLayer(id);
                if(this.map.getSource('uow-scene-buildings'))this.map.removeSource('uow-scene-buildings');
                return;
            }
            const before=this.map.getLayer('uow-paths-line')?'uow-paths-line':this.map.getStyle().layers.find(l=>l.type==='symbol')?.id;
            if(!this.map.getLayer('uow-building-feed'))this.map.addLayer({id:'uow-building-feed',type:'fill',source,'source-layer':'building',paint:{'fill-opacity':0}},before);
            for(const layer of Theme.buildingLayers('uow-buildings',this.basemap)){
                if(layer.id==='uow-buildings-3d'&&!this.settings.threeD&&!this.map.getLayer(layer.id))continue;
                if(!this.map.getLayer(layer.id))this.map.addLayer(layer,before);
            }
            this.setVisibility('uow-buildings-3d',this.settings.threeD);
            this.setVisibility('uow-buildings-fill',this.settings.buildings&&!this.settings.threeD&&this.basemap!=='aerial');
            this.setVisibility('uow-building-labels',this.settings.buildings||this.settings.threeD);
            this.orderBuildings();
            this.scheduleBuildings();
        }
        orderBuildings(){
            if(!this.map.getLayer('uow-buildings-3d'))return;
            // Opaque 3D faces cover ground-level routes behind them. Keep stop
            // numbers and GPS controls above the scene so navigation stays usable.
            const before=['uow-repeat-labels','uow-endpoints-circle','uow-tree-points','uow-gps-point'].find(id=>this.map.getLayer(id));
            if(before)this.map.moveLayer('uow-buildings-3d',before);
        }
        setTreeState(id,state){
            this.treeStates.set(id,state);
            const selected=state.active?id:this.selectedId===id?null:this.selectedId;
            const current=state.current?id:this.currentId===id?null:this.currentId;
            if(selected!==this.selectedId||current!==this.currentId){this.selectedId=selected;this.currentId=current;this.refreshTreeData();}
            if(this.ready&&!this.contextLost)for(const source of ['uow-trees','uow-explore','uow-stop-labels'])if(this.map.getSource(source))this.map.setFeatureState({source,id},state);
            this.scheduleFocusLabel();
        }
        applyTreeStates(sources=['uow-trees','uow-explore','uow-stop-labels']){
            if(!this.ready||this.contextLost)return;
            for(const source of sources)if(this.map.getSource(source))for(const [id,state]of this.treeStates)if(source!=='uow-stop-labels'||this.stopCalloutIds?.has(id))this.map.setFeatureState({source,id},state);
        }
        setRoute(route){
            for(const [id,data]of Object.entries(route))this.setData(`uow-${id}`,data);
            this.routeRevision=(this.routeRevision||0)+1;this.scheduleAnnotations();
        }
        setNearbyLabels(features){this.setData('uow-nearby',collection(features));this.scheduleAnnotations();}
        setGPS(location,heading){
            if(!location){clearTimeout(this.gpsTimer);this.pendingGPS=null;this.setData('uow-gps',empty());return;}
            const now=performance.now(),newFix=location.timestamp!==this.lastFixTimestamp;
            this.pendingGPS={location:{...location},heading};
            const flush=()=>{
                clearTimeout(this.gpsTimer);this.gpsTimer=null;
                if(!this.pendingGPS)return;
                const value=this.pendingGPS;this.pendingGPS=null;this.lastGPSRender=performance.now();this.lastFixTimestamp=value.location.timestamp;
                this.setData('uow-gps',gpsFeatures(value.location,value.heading));
            };
            if(newFix||now-(this.lastGPSRender||0)>=150)flush();
            else if(!this.gpsTimer)this.gpsTimer=setTimeout(flush,150-(now-this.lastGPSRender));
        }
        setVisibility(id,visible){if(this.ready&&this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',visible?'visible':'none');}
        setPathsVisible(value){this.pathsVisible=value;for(const id of ['uow-paths-halo','uow-paths-line'])this.setVisibility(id,value);}
        setRepeatVisible(value){this.repeatVisible=value;for(const id of ['uow-repeats-line','uow-repeat-labels'])this.setVisibility(id,value&&this.settings.route);}
        showEndpointLabels(value){this.endpointLabels=value;this.setVisibility('uow-endpoint-labels',value&&this.settings.route);this.scheduleAnnotations();}
        setBuildingsVisible(value){
            this.settings.buildings=!!value;
            this.setVisibility('uow-buildings-3d',this.settings.threeD);
            this.setVisibility('uow-buildings-fill',value&&!this.settings.threeD&&this.basemap!=='aerial');
            this.setVisibility('uow-building-labels',value||this.settings.threeD);
            this.saveSettings();this.emitSettings();
        }
        setRouteVisible(value){
            this.settings.route=!!value;
            for(const id of ['uow-route-halo','uow-route-network-line','uow-route-light','uow-route-direct-line','uow-endpoints-circle'])this.setVisibility(id,value);
            this.setRepeatVisible(this.repeatVisible);this.showEndpointLabels(this.endpointLabels);
            this.saveSettings();this.emitSettings();
            this.scheduleAnnotations();
        }
        installLayers(){
            if(!this.map||this.contextLost)return;
            this.ready=true;
            this.markerFilterSignature=null;this.exploreFilterSignature=null;this.markerScaleKey=null;this.anchorSignature=null;
            const sourceIds=['paths','trees','explore','route-network','route-direct','repeats','repeat-labels','endpoints','nearby','gps','buildings','building-names','name-labels','name-links','stop-labels'];
            for(const suffix of sourceIds){
                const id=`uow-${suffix}`,cached=this.data.get(id);
                if(!this.map.getSource(id))this.map.addSource(id,{type:'geojson',data:cached?.data||empty(),...(cached?.sourceOptions||{}),...(suffix==='explore'?{cluster:true,clusterMaxZoom:17,clusterRadius:35}:{})});
                else if(cached)this.map.getSource(id).setData(cached.data);
            }
            const light=this.basemap==='light',p=Theme.PALETTES[light?'light':'dark'],text=p.text,halo=p.halo;
            const add=layer=>{if(!this.map.getLayer(layer.id))this.map.addLayer(layer);};
            this.installBuildings();
            // Keep the background network quiet beneath the red tour. Tagged
            // sidewalks/crossings receive slightly less weight than campus footways.
            const minorPath=['match',['get','footway'],['sidewalk','crossing'],true,false],aerial=this.basemap==='aerial';
            const pathLayout={'line-cap':'round','line-join':'round'};
            add({id:'uow-paths-halo',type:'line',source:'uow-paths',layout:pathLayout,paint:{
                'line-color':light?'#f3f5f8':'#001641',
                'line-width':['interpolate',['linear'],['zoom'],15,['case',minorPath,2.5,3],19,['case',minorPath,3.3,3.8]],
                'line-blur':1.2,'line-opacity':['case',minorPath,aerial?.3:.14,aerial?.42:.2]}});
            add({id:'uow-paths-line',type:'line',source:'uow-paths',layout:pathLayout,paint:{
                'line-color':light?'#7f9caf':aerial?'#c4d7df':'#6283a2',
                'line-width':['interpolate',['linear'],['zoom'],15,['case',minorPath,.65,.9],19,['case',minorPath,1.3,1.7]],
                'line-opacity':['case',minorPath,light?.38:aerial?.5:.43,light?.48:aerial?.65:.55]}});
            add({id:'uow-route-halo',type:'line',source:'uow-route-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':Theme.BRAND.red,'line-width':['interpolate',['linear'],['zoom'],15,3.5,19,5],'line-blur':1.2,'line-opacity':.15}});
            add({id:'uow-route-network-line',type:'line',source:'uow-route-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':Theme.BRAND.red,'line-width':['interpolate',['linear'],['zoom'],15,1.7,19,2.4],'line-dasharray':[2.5,2.5],'line-opacity':1}});
            add({id:'uow-route-light',type:'line',source:'uow-route-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],15,.5,19,.7],'line-dasharray':[2.5,2.5],'line-opacity':light?.08:.16}});
            add({id:'uow-route-direct-line',type:'line',source:'uow-route-direct',paint:{'line-color':light?'#657d98':'#91a9c7','line-width':2,'line-dasharray':[2,3],'line-opacity':.85}});
            add({id:'uow-repeats-line',type:'line',source:'uow-repeats',paint:{'line-color':'#0033FF','line-width':5,'line-opacity':.15}});
            add({id:'uow-repeat-labels',type:'symbol',source:'uow-repeat-labels',layout:{'text-field':['get','label'],'text-font':['Montserrat Medium'],'text-size':9.625,'text-padding':12},paint:{'text-color':text,'text-halo-color':'#001641','text-halo-width':3}});
            add({id:'uow-endpoints-circle',type:'circle',source:'uow-endpoints',paint:{'circle-radius':10,'circle-color':['get','color'],'circle-opacity':.45,'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-pitch-alignment':'viewport'}});
            add({id:'uow-endpoint-labels',type:'symbol',source:'uow-name-labels',filter:['==',['get','kind'],'endpoint'],layout:{'text-field':['get','name'],'text-font':['Montserrat Medium'],'text-size':10.5,'text-anchor':'center','text-pitch-alignment':'viewport','text-rotation-alignment':'viewport','text-max-width':100,'text-padding':4,'text-allow-overlap':false},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':2}});
            add({id:'uow-clusters',type:'circle',source:'uow-explore',filter:['has','point_count'],paint:{'circle-color':'#16365f','circle-radius':['step',['get','point_count'],15,10,19,30,23],'circle-opacity':.95,'circle-stroke-color':'#8bcee7','circle-stroke-width':1.2,'circle-pitch-alignment':'viewport'}});
            add({id:'uow-tree-name-links',type:'line',source:'uow-name-links',paint:{'line-color':light?'#4d8ba2':'#86cde6','line-width':.8,'line-opacity':.45}});
            const focused=['any',['boolean',['feature-state','active'],false],['boolean',['feature-state','current'],false]];
            const routeOrSelected=['any',['>', ['get','onRoute'],0],['==',['get','selected'],true],['==',['get','overview'],true]];
            const stateColor=['case',focused,Theme.BRAND.red,['boolean',['feature-state','visited'],false],'#287754',['boolean',['feature-state','skipped'],false],light?'#9baaba':'#526781',light?'#fff':'#18345e'];
            add({id:'uow-tree-halo',type:'circle',source:'uow-trees',filter:routeOrSelected,paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,13,19,22],'circle-color':this.basemap==='aerial'?'#dcf8ff':'#83cae6','circle-opacity':['case',focused,.23,this.basemap==='aerial'?.18:.12],'circle-blur':.75,'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            add({id:'uow-tree-points',type:'circle',source:'uow-trees',filter:routeOrSelected,layout:{'circle-sort-key':['case',['get','priority'],1,0]},paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,8,19,14],'circle-color':stateColor,'circle-stroke-color':['case',focused,light?'#237c9e':'#bcefff',light?'#277e9d':'#8bcee7'],'circle-stroke-width':['case',focused,1.5,1.1],'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            add({id:'uow-explore-glow',type:'circle',source:'uow-explore',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,10,19,15],'circle-color':this.basemap==='aerial'?'#dcf8ff':'#83cae6','circle-opacity':this.basemap==='aerial'?.16:.1,'circle-blur':.75,'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            add({id:'uow-explore-points',type:'circle',source:'uow-explore',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,6,19,9],'circle-color':stateColor,'circle-stroke-color':light?'#277e9d':'#8bcee7','circle-stroke-width':1.1,'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            // Circles and numbers share our screen-space display filter. A second
            // native symbol collision pass would leave some clear circles blank.
            add({id:'uow-stop-numbers',type:'symbol',source:'uow-trees',filter:['>', ['get','stopNumber'],0],layout:{'text-field':['to-string',['get','stopNumber']],'text-font':['Montserrat Medium'],'text-size':['interpolate',['linear'],['zoom'],15,8.75,19,10.5],'text-anchor':'center','text-offset':[0,0],'text-justify':'center','text-pitch-alignment':'viewport','text-rotation-alignment':'viewport','symbol-sort-key':['get','labelRank'],'text-padding':2,'text-allow-overlap':true,'text-ignore-placement':false},paint:{'text-color':['case',focused,'#fff',['boolean',['feature-state','visited'],false],'#fff',light?'#001641':'#fff']}});
            add({id:'uow-stop-anchors',type:'circle',source:'uow-trees',filter:['in',['get','id'],['literal',[]]],paint:{'circle-radius':2.5,'circle-color':light?'#277e9d':'#8bcee7','circle-stroke-color':halo,'circle-stroke-width':1,'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            // Reuse the existing numbered-marker appearance for label-only
            // callouts. Stable IDs keep selection/visited/skipped states shared.
            const markerLayers=this.map.getStyle().layers;
            for(const [id,original]of [['uow-stop-callout-halo','uow-tree-halo'],['uow-stop-callouts','uow-tree-points'],['uow-callout-numbers','uow-stop-numbers']]){
                const layer=structuredClone(markerLayers.find(l=>l.id===original));layer.id=id;layer.source='uow-stop-labels';delete layer.filter;add(layer);
            }
            add({id:'uow-tree-names',type:'symbol',source:'uow-name-labels',filter:['==',['get','kind'],'tree'],layout:{'text-field':['get','name'],'text-font':['Montserrat Medium'],'text-size':10.5,'text-anchor':'center','text-pitch-alignment':'viewport','text-rotation-alignment':'viewport','text-padding':4,'text-max-width':100,'symbol-sort-key':['get','labelRank'],'text-allow-overlap':false},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':1.6}});
            add({id:'uow-cluster-counts',type:'symbol',source:'uow-explore',filter:['has','point_count'],layout:{'text-field':['concat','+',['to-string',['get','point_count_abbreviated']]],'text-font':['Montserrat Medium'],'text-size':10.5,'text-allow-overlap':true},paint:{'text-color':'#fff'}});
            add({id:'uow-nearby-labels',type:'symbol',source:'uow-name-labels',filter:['==',['get','kind'],'nearby'],layout:{'text-field':['get','name'],'text-font':['Montserrat Medium'],'text-size':10.5,'text-anchor':'center','text-pitch-alignment':'viewport','text-rotation-alignment':'viewport','text-max-width':100,'text-padding':4,'text-allow-overlap':false},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':2}});
            add({id:'uow-gps-accuracy',type:'fill',source:'uow-gps',filter:['==','kind','accuracy'],paint:{'fill-color':'#238bff','fill-opacity':.1}});
            add({id:'uow-gps-accuracy-line',type:'line',source:'uow-gps',filter:['==','kind','accuracy'],paint:{'line-color':'#238bff','line-width':1,'line-opacity':.45}});
            add({id:'uow-gps-heading',type:'fill',source:'uow-gps',filter:['==','kind','heading'],paint:{'fill-color':'#48a2ff','fill-opacity':.35}});
            add({id:'uow-gps-point',type:'circle',source:'uow-gps',filter:['==','kind','position'],paint:{'circle-radius':7,'circle-color':'#0033FF','circle-stroke-width':3,'circle-stroke-color':'#fff','circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            add({id:'uow-building-labels',type:'symbol',source:'uow-building-names',minzoom:18,layout:{'text-field':['get','name'],'text-font':['Montserrat Medium'],'text-size':10.0625,'text-max-width':12,'text-padding':14,'text-allow-overlap':false},paint:{'text-color':light?'#596978':'#a5b1bf','text-halo-color':halo,'text-halo-width':1,'text-opacity':['interpolate',['linear'],['zoom'],18,0,18.5,.65,19,.85]}});
            this.map.moveLayer('uow-building-labels','uow-stop-numbers');
            this.applyTreeStates();this.setPathsVisible(this.pathsVisible);this.setRepeatVisible(this.repeatVisible);this.showEndpointLabels(this.endpointLabels);
            this.setBrowsing(this.browsing);
            this.setBuildingsVisible(this.settings.buildings);this.setRouteVisible(this.settings.route);
            this.orderBuildings();
            this.scheduleFocusLabel();
            this.scheduleAnnotations(true);
        }
        hitFeatures(pointValue){
            const layers=['uow-tree-points','uow-stop-callouts','uow-stop-anchors','uow-explore-points','uow-clusters','uow-endpoints-circle'].filter(id=>this.map.getLayer(id));
            // A comfortable touch hit area without oversized marker artwork.
            const radius=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches?12:4;
            const box=[[pointValue.x-radius,pointValue.y-radius],[pointValue.x+radius,pointValue.y+radius]];
            return layers.length?this.map.queryRenderedFeatures(box,{layers}):[];
        }
        async handleClick(event){
            if(!this.ready||this.contextLost)return;
            const features=this.hitFeatures(event.point),first=features[0];
            if(!first){this.options.onMapClick?.(event);return;}
            if(first.properties.cluster){
                try{
                    const source=this.map.getSource('uow-explore'),zoom=await source.getClusterExpansionZoom(first.properties.cluster_id);
                    this.focus([first.geometry.coordinates[1],first.geometry.coordinates[0]],Math.min(19,zoom),this.viewportPadding||this.map.getPadding(),{flight:false});
                }catch{}
            }else this.options.onTreeClick?.(Number(first.properties.id));
        }
    }
    return {CampusMap,gpsFeatures,BASEMAPS,aerialStyle,point,line,collection,unobstructedViewport,placeFocusLabel};
});
