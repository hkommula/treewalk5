/* Native MapLibre rendering. Routing and device permissions stay in the app.
 * All app geometry enters as GeoJSON (longitude, latitude); focus() accepts the
 * existing [latitude, longitude] convention at the camera boundary only.
 */
(function(root,factory){
    const api=factory(typeof module==='object'&&module.exports?require('./map-theme.js'):root.MidnightTheme);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.CampusMap=api.CampusMap;
})(typeof globalThis!=='undefined'?globalThis:this,function(Theme){
    'use strict';
    const MAP_SETTINGS_KEY='uowTreeWalkMapSettingsV1';
    const BASEMAPS={
        dark:{label:'UOW Midnight Explorer',url:'https://tiles.openfreemap.org/styles/dark'},
        light:{label:'UOW Daylight Explorer',url:'https://tiles.openfreemap.org/styles/positron'},
        aerial:{label:'Aerial',tiles:['https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}']}
    };
    const GLYPHS=Theme.GLYPHS;
    const empty=()=>({type:'FeatureCollection',features:[]});
    const collection=features=>({type:'FeatureCollection',features});
    const point=(coordinates,properties={},id)=>({type:'Feature',...(id===undefined?{}:{id}),geometry:{type:'Point',coordinates},properties});
    const line=(coordinates,properties={})=>({type:'Feature',geometry:{type:'LineString',coordinates},properties});
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
        return {version:8,glyphs:GLYPHS,sources:{'nsw-imagery':{type:'raster',tiles:BASEMAPS.aerial.tiles,tileSize:256,maxzoom:19,
            attribution:'Imagery © <a href="https://data.nsw.gov.au/data/dataset/nsw-imagery" target="_blank" rel="noopener">NSW Spatial Services</a> / Department of Customer Service 2020; AAM, Jacobs Ausimage, LANDSAT'}},
        layers:[{id:'background',type:'background',paint:{'background-color':'#13202a'}},{id:'nsw-imagery',type:'raster',source:'nsw-imagery',paint:{'raster-fade-duration':0}}]};
    }
    class CampusMap {
        constructor(options={}){
            this.options=options;this.map=null;this.ready=false;this.contextLost=false;
            this.data=new Map();this.signatures=new Map();this.treeStates=new Map();this.settings={basemap:'dark',threeD:false};
            this.lastBasemap='dark';this.epoch=0;this.styleAbort=null;this.styleCache=new Map();this.endpointLabels=false;
            this.trees=[];this.stopOrder=new Map();this.browsing=false;
            this.pathsVisible=true;this.repeatVisible=true;this.lastErrorAt=0;
            try{
                const saved=JSON.parse(localStorage.getItem(MAP_SETTINGS_KEY)||'null');
                if(saved&&BASEMAPS[saved.basemap])this.settings.basemap=saved.basemap;
                else if(options.outdoor)this.settings.basemap='light';
                this.settings.threeD=saved?.threeD===true;
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
                this.map.addControl(new maplibregl.AttributionControl({compact:true,
                    customAttribution:'Paths © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}),'bottom-right');
                const credits=this.map.getContainer().querySelector('.maplibregl-ctrl-attrib-inner');
                const attributionObserver=new MutationObserver(()=>{
                    this.configureAttribution();
                    if(credits.parentElement.dataset.initialised)attributionObserver.disconnect();
                });
                attributionObserver.observe(credits,{childList:true,subtree:true});
                this.map.on('style.load',()=>{
                    this.ready=true;this.installLayers();
                    this.configureAttribution();
                    if(this.recovering){this.recovering=false;this.hideFallback();}
                });
                this.map.once('load',()=>{this.set3D(this.settings.threeD,false);this.setBasemap(this.basemap);});
                this.map.on('sourcedata',e=>{
                    if(['uow-trees','uow-explore'].includes(e.sourceId)&&e.isSourceLoaded)this.applyTreeStates();
                    if(e.sourceDataType==='metadata')this.configureAttribution();
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
            }catch(error){
                this.showFallback('The map needs WebGL graphics support. You can still browse trees, start a walk and save your progress.');
            }
        }
        configureAttribution(){
            // Keep MapLibre's native, keyboard-accessible disclosure and provider
            // links. Only initialise its compact state once, after credits arrive.
            const details=this.map.getContainer().querySelector('.maplibregl-ctrl-attrib');
            if(!details)return;
            const summary=details.querySelector('summary');
            if(!summary.querySelector('svg'))summary.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>';
            summary.title='View map attribution';
            summary.setAttribute('aria-label','View map attribution');
            if(!details.dataset.autoCollapse){
                details.dataset.autoCollapse='true';
                const schedule=()=>{
                    clearTimeout(this.attributionTimer);
                    if(details.open&&details.classList.contains('maplibregl-compact-show')){
                        this.attributionTimer=setTimeout(()=>{
                            if(details.contains(document.activeElement)&&document.activeElement!==summary)summary.focus({preventScroll:true});
                            details.classList.remove('maplibregl-compact-show');details.open=false;
                        },5000);
                    }
                };
                details.addEventListener('toggle',schedule);
                // Reading links with keyboard/touch gets a fresh five seconds.
                details.addEventListener('pointerdown',schedule);
                details.addEventListener('keydown',schedule);
            }
            if(!details.dataset.initialised&&!details.classList.contains('maplibregl-attrib-empty')){
                details.classList.remove('maplibregl-compact-show');details.open=false;
                details.dataset.initialised='true';
            }
        }
        notice(message){
            const status=typeof document!=='undefined'&&document.getElementById('app-status');
            if(this.options.onNotice)this.options.onNotice(message);else if(status)status.textContent=message;
        }
        showFallback(message){
            this.unavailable=true;
            const fallback=document.getElementById('map-fallback');
            if(fallback){fallback.hidden=false;fallback.querySelector('p').textContent=message;}
            document.body.classList.add('map-unavailable');
            window.dispatchEvent(new CustomEvent('treewalk:mapavailability',{detail:{available:false}}));
        }
        hideFallback(){this.unavailable=false;const fallback=document.getElementById('map-fallback');if(fallback)fallback.hidden=true;document.body.classList.remove('map-unavailable');window.dispatchEvent(new CustomEvent('treewalk:mapavailability',{detail:{available:true}}));}
        saveSettings(){try{localStorage.setItem(MAP_SETTINGS_KEY,JSON.stringify(this.settings));}catch{}}
        emitSettings(){window.dispatchEvent(new CustomEvent('treewalk:mapsettings',{detail:{...this.settings}}));}
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
                this.map.easeTo({pitch:this.settings.threeD?48:0,bearing:this.settings.threeD?this.map.getBearing():0,duration:animate&&!reduce?450:0});
                this.installBuildings();
            }
            this.saveSettings();this.emitSettings();
        }
        resize(){if(this.map&&!this.contextLost)this.map.resize();}
        getZoom(){return this.map?.getZoom()??18;}
        focus(latlng,zoom,padding,options={}){
            if(!this.map||this.contextLost)return;
            const duration=options.animate===false||window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:(options.duration??.4)*1000;
            this.map.easeTo({center:[latlng[1],latlng[0]],zoom:zoom??this.getZoom(),padding,retainPadding:false,duration});
        }
        fitBounds(bounds,padding,options={}){
            if(!this.map||this.contextLost)return;
            this.map.fitBounds(bounds,{padding,retainPadding:false,maxZoom:options.maxZoom??19,bearing:this.map.getBearing(),pitch:this.map.getPitch(),duration:options.animate===false?0:400});
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
        setStopOrder(route){this.stopOrder=new Map(route.map((tree,index)=>[tree.id,index+1]));this.refreshTreeData();}
        refreshTreeData(){
            const features=this.trees.map(t=>point([t.lng,t.lat],{id:t.id,name:t.name,stopNumber:this.stopOrder.get(t.id)||0,onRoute:this.stopOrder.has(t.id)?1:0,selected:t.id===this.selectedId,priority:t.id===this.selectedId||t.id===this.currentId,labelRank:t.id===this.selectedId?0:t.id===this.currentId?1:10+(this.stopOrder.get(t.id)||100)},t.id));
            // Route numbers are never replaced by cluster counts. Exploration
            // alone clusters trees outside this route; stable IDs remain shared.
            this.setData('uow-trees',collection(features));
            this.setData('uow-explore',collection(features.filter(f=>!f.properties.onRoute&&!f.properties.selected)),{cluster:true,clusterMaxZoom:17,clusterRadius:35});
        }
        setBrowsing(value){
            this.browsing=value;
            for(const id of ['uow-clusters','uow-cluster-counts','uow-explore-points'])this.setVisibility(id,value);
        }
        installBuildings(){
            if(!this.ready||this.contextLost)return;
            let source=this.map.getSource('openmaptiles')?'openmaptiles':null;
            if(!source&&this.settings.threeD){
                source='uow-scene-buildings';
                if(!this.map.getSource(source))this.map.addSource(source,{...Theme.VECTOR_SOURCE});
            }
            if(!source){
                for(const id of ['uow-buildings-3d','uow-buildings-fill'])if(this.map.getLayer(id))this.map.removeLayer(id);
                if(this.map.getSource('uow-scene-buildings'))this.map.removeSource('uow-scene-buildings');
                return;
            }
            const before=this.map.getLayer('uow-paths-line')?'uow-paths-line':this.map.getStyle().layers.find(l=>l.type==='symbol')?.id;
            for(const layer of Theme.buildingLayers(source,this.basemap)){
                if(layer.id==='uow-buildings-3d'&&!this.settings.threeD&&!this.map.getLayer(layer.id))continue;
                if(!this.map.getLayer(layer.id))this.map.addLayer(layer,before);
            }
            this.setVisibility('uow-buildings-3d',this.settings.threeD);
            this.setVisibility('uow-buildings-fill',!this.settings.threeD&&this.basemap!=='aerial');
            this.orderBuildings();
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
            if(this.ready&&!this.contextLost)for(const source of ['uow-trees','uow-explore'])if(this.map.getSource(source))this.map.setFeatureState({source,id},state);
        }
        applyTreeStates(){
            if(!this.ready||this.contextLost)return;
            for(const source of ['uow-trees','uow-explore'])if(this.map.getSource(source))for(const [id,state]of this.treeStates)this.map.setFeatureState({source,id},state);
        }
        setRoute(route){
            for(const [id,data]of Object.entries(route))this.setData(`uow-${id}`,data);
        }
        setNearbyLabels(features){this.setData('uow-nearby',collection(features));}
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
        setPathsVisible(value){this.pathsVisible=value;this.setVisibility('uow-paths-line',value);}
        setRepeatVisible(value){this.repeatVisible=value;for(const id of ['uow-repeats-line','uow-repeat-labels'])this.setVisibility(id,value);}
        showEndpointLabels(value){this.endpointLabels=value;this.setVisibility('uow-endpoint-labels',value);}
        installLayers(){
            if(!this.map||this.contextLost)return;
            this.ready=true;
            const sourceIds=['paths','trees','explore','route-network','route-direct','repeats','repeat-labels','endpoints','nearby','gps'];
            for(const suffix of sourceIds){
                const id=`uow-${suffix}`,cached=this.data.get(id);
                if(!this.map.getSource(id))this.map.addSource(id,{type:'geojson',data:cached?.data||empty(),...(cached?.sourceOptions||{}),...(suffix==='explore'?{cluster:true,clusterMaxZoom:17,clusterRadius:35}:{})});
                else if(cached)this.map.getSource(id).setData(cached.data);
            }
            const light=this.basemap==='light',p=Theme.PALETTES[light?'light':'dark'],text=p.text,halo=p.halo;
            const add=layer=>{if(!this.map.getLayer(layer.id))this.map.addLayer(layer);};
            this.installBuildings();
            add({id:'uow-paths-line',type:'line',source:'uow-paths',paint:{'line-color':p.path,'line-width':['interpolate',['linear'],['zoom'],15,.5,19,1.1],'line-opacity':.28}});
            add({id:'uow-route-halo',type:'line',source:'uow-route-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':Theme.BRAND.red,'line-width':['interpolate',['linear'],['zoom'],15,4.5,19,7],'line-blur':1.5,'line-opacity':.18}});
            add({id:'uow-route-network-line',type:'line',source:'uow-route-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':Theme.BRAND.red,'line-width':['interpolate',['linear'],['zoom'],15,2,19,2.8],'line-dasharray':[.02,2.7],'line-opacity':1}});
            add({id:'uow-route-light',type:'line',source:'uow-route-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],15,.65,19,.9],'line-dasharray':[.02,8.4],'line-opacity':light?.35:.65}});
            add({id:'uow-route-direct-line',type:'line',source:'uow-route-direct',paint:{'line-color':light?'#657d98':'#91a9c7','line-width':2,'line-dasharray':[2,3],'line-opacity':.85}});
            add({id:'uow-repeats-line',type:'line',source:'uow-repeats',paint:{'line-color':'#0033FF','line-width':5,'line-opacity':.15}});
            add({id:'uow-repeat-labels',type:'symbol',source:'uow-repeat-labels',layout:{'text-field':['get','label'],'text-font':['Montserrat Medium'],'text-size':11,'text-padding':12},paint:{'text-color':text,'text-halo-color':'#001641','text-halo-width':3}});
            add({id:'uow-endpoints-circle',type:'circle',source:'uow-endpoints',paint:{'circle-radius':10,'circle-color':['get','color'],'circle-opacity':.45,'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-pitch-alignment':'viewport'}});
            add({id:'uow-endpoint-labels',type:'symbol',source:'uow-endpoints',layout:{'text-field':['get','label'],'text-font':['Montserrat Medium'],'text-size':12,'text-offset':[0,-1.5]},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':2}});
            add({id:'uow-clusters',type:'circle',source:'uow-explore',filter:['has','point_count'],paint:{'circle-color':'#16365f','circle-radius':['step',['get','point_count'],15,10,19,30,23],'circle-opacity':.95,'circle-stroke-color':'#93aac7','circle-stroke-width':1.5,'circle-pitch-alignment':'viewport'}});
            const focused=['any',['boolean',['feature-state','active'],false],['boolean',['feature-state','current'],false]];
            const routeOrSelected=['any',['>', ['get','onRoute'],0],['==',['get','selected'],true]];
            const stateColor=['case',focused,Theme.BRAND.red,['boolean',['feature-state','visited'],false],'#287754',['boolean',['feature-state','skipped'],false],light?'#9baaba':'#526781',light?'#fff':'#18345e'];
            add({id:'uow-tree-halo',type:'circle',source:'uow-trees',filter:routeOrSelected,paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,14,19,20],'circle-color':Theme.BRAND.red,'circle-opacity':['case',focused,.17,0],'circle-pitch-alignment':'viewport'}});
            add({id:'uow-tree-points',type:'circle',source:'uow-trees',filter:routeOrSelected,layout:{'circle-sort-key':['case',['get','priority'],1,0]},paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,8,19,12.5],'circle-color':stateColor,'circle-stroke-color':['case',focused,'#fff',light?'#526982':'#93aac7'],'circle-stroke-width':['case',focused,2.5,1.2],'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            add({id:'uow-explore-points',type:'circle',source:'uow-explore',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,6,19,8],'circle-color':stateColor,'circle-stroke-color':light?'#526982':'#93aac7','circle-stroke-width':1.2,'circle-pitch-alignment':'viewport'}});
            add({id:'uow-stop-numbers',type:'symbol',source:'uow-trees',filter:['all',['!',['has','point_count']],['>', ['get','stopNumber'],0]],layout:{'text-field':['to-string',['get','stopNumber']],'text-font':['Montserrat Medium'],'text-size':['interpolate',['linear'],['zoom'],15,10,19,12],'symbol-sort-key':['get','labelRank'],'text-padding':3,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':['case',focused,'#fff',['boolean',['feature-state','visited'],false],'#fff',light?'#001641':'#fff']}});
            add({id:'uow-tree-names',type:'symbol',source:'uow-trees',minzoom:18,filter:['all',['!',['has','point_count']],['>', ['get','onRoute'],0],['==',['get','priority'],false]],layout:{'text-field':['get','name'],'text-font':['Montserrat Medium'],'text-size':12,'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':1.7,'text-padding':12,'text-max-width':12,'symbol-sort-key':['get','labelRank']},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':1.6}});
            add({id:'uow-cluster-counts',type:'symbol',source:'uow-explore',filter:['has','point_count'],layout:{'text-field':['concat','+',['to-string',['get','point_count_abbreviated']]],'text-font':['Montserrat Medium'],'text-size':12,'text-allow-overlap':true},paint:{'text-color':'#fff'}});
            add({id:'uow-nearby-labels',type:'symbol',source:'uow-nearby',layout:{'text-field':['get','label'],'text-font':['Montserrat Medium'],'text-size':13,'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':1.1,'text-padding':8},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':2}});
            add({id:'uow-priority-tree-name',type:'symbol',source:'uow-trees',filter:['==',['get','priority'],true],layout:{'text-field':['get','name'],'text-font':['Montserrat Medium'],'text-size':14,'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':1.7,'text-padding':10,'text-max-width':12,'text-allow-overlap':true,'symbol-sort-key':['get','labelRank']},paint:{'text-color':text,'text-halo-color':halo,'text-halo-width':2}});
            add({id:'uow-gps-accuracy',type:'fill',source:'uow-gps',filter:['==','kind','accuracy'],paint:{'fill-color':'#238bff','fill-opacity':.1}});
            add({id:'uow-gps-accuracy-line',type:'line',source:'uow-gps',filter:['==','kind','accuracy'],paint:{'line-color':'#238bff','line-width':1,'line-opacity':.45}});
            add({id:'uow-gps-heading',type:'fill',source:'uow-gps',filter:['==','kind','heading'],paint:{'fill-color':'#48a2ff','fill-opacity':.35}});
            add({id:'uow-gps-point',type:'circle',source:'uow-gps',filter:['==','kind','position'],paint:{'circle-radius':7,'circle-color':'#0033FF','circle-stroke-width':3,'circle-stroke-color':'#fff','circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
            this.applyTreeStates();this.setPathsVisible(this.pathsVisible);this.setRepeatVisible(this.repeatVisible);this.showEndpointLabels(this.endpointLabels);
            this.setBrowsing(this.browsing);
            this.orderBuildings();
        }
        hitFeatures(pointValue){
            const layers=['uow-tree-points','uow-explore-points','uow-clusters','uow-endpoints-circle'].filter(id=>this.map.getLayer(id));
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
                    this.map.easeTo({center:first.geometry.coordinates,zoom:Math.min(19,zoom),duration:300});
                }catch{}
            }else this.options.onTreeClick?.(Number(first.properties.id));
        }
    }
    return {CampusMap,gpsFeatures,BASEMAPS,aerialStyle,point,line,collection};
});
