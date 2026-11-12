/* Native 3D pixel regression, without public tile traffic. Requires the local
 * server/CDP browser used by the other suites; Pillow reads screenshot pixels. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser();
const screenshot=async name=>{
    await c.evaluate('new Promise(r=>{map.once("idle",()=>r(true));map.triggerRepaint()})');
    const file=`.qa/occlusion-${name}.png`;
    await writeFile(file,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    return file;
};
const pixel=(file,point)=>JSON.parse(execFileSync('py',['-c','from PIL import Image; import sys,json; print(json.dumps(Image.open(sys.argv[1]).convert("RGB").getpixel((round(float(sys.argv[2])),round(float(sys.argv[3]))))))',file,String(point.x),String(point.y)],{encoding:'utf8'}));
const red=rgb=>rgb[0]>180&&rgb[1]<100&&rgb[2]<100;
try{
    await c.call('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready&&map.getLayer("uow-tree-points")',30000);
    await c.evaluate('mapView.setBasemap("dark")');
    await c.waitFor('mapView.ready&&map.getStyle()?.sources?.openmaptiles',30000);
    await c.evaluate('locationTracker.stop();pauseWalking();mapView.set3D(false,false);map.setStyle({version:8,glyphs:MidnightTheme.GLYPHS,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#001641"}}]});void 0;');
    await c.waitFor('mapView.ready&&map.getLayer("uow-route-network-line")');
    await c.evaluate(`new Promise(r=>setTimeout(r,500))`);
    await c.evaluate(`(()=>{
        uiPanel.style.visibility='hidden';document.querySelector('.map-controls').style.visibility='hidden';
        for(const layer of map.getStyle().layers)if(layer.id!=='background')map.setLayoutProperty(layer.id,'visibility','none');
        const [lat,lng]=UOW_CENTER;window.occlusionCentre=[lng,lat];
        mapView.settings.threeD=true;
        map.jumpTo({center:[lng,lat],zoom:19,pitch:60,bearing:0,padding:{top:0,left:0,right:0,bottom:0}});
        mapView.setData('uow-route-network',{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[lng-.0008,lat],[lng+.0008,lat]]}}]});
        map.setLayoutProperty('uow-route-network-line','visibility','visible');
        map.setPaintProperty('uow-route-network-line','line-width',14);
        map.setPaintProperty('uow-route-network-line','line-dasharray',[1,0]);
        return true;
    })()`);
    const sample=await c.evaluate('({inside:map.project(occlusionCentre),outside:map.project([occlusionCentre[0]-.00055,occlusionCentre[1]])})');
    const ground=await screenshot('ground');
    assert.ok(red(pixel(ground,sample.inside)),'fixture route visible before the building');
    await c.evaluate(`(()=>{
        const [lng,lat]=occlusionCentre;
        map.addSource('qa-building',{type:'geojson',data:{type:'Feature',properties:{render_height:30,render_min_height:0},geometry:{type:'Polygon',coordinates:[[[lng-.0002,lat-.00015],[lng+.0002,lat-.00015],[lng+.0002,lat+.00015],[lng-.0002,lat+.00015],[lng-.0002,lat-.00015]]]}}});
        const layer=MidnightTheme.buildingLayers('qa-building')[1];delete layer['source-layer'];
        map.addLayer(layer,'uow-route-network-line');
        mapView.orderBuildings();return true;
    })()`);
    const scene=await screenshot('3d'),hidden=pixel(scene,sample.inside),visible=pixel(scene,sample.outside);
    assert.ok(!red(hidden)&&hidden[2]>hidden[0],'building hides route passing behind/under its face');
    assert.ok(red(visible),'nearby unobstructed route stays visible');
    await c.evaluate('map.setLayoutProperty("uow-buildings-3d","visibility","none");void 0;');
    const plain=await screenshot('uncovered');
    assert.ok(red(pixel(plain,sample.inside)),'hiding the building reveals the unchanged route');
    assert.deepEqual(c.errors,[]);
    console.log(`3D occlusion passed: covered ${hidden}, clear route ${visible}; route revealed again without changing geometry.`);
}finally{c.close();}
