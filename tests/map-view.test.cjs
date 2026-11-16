const {test}=require('node:test');
const assert=require('node:assert/strict');
const {gpsFeatures,BASEMAPS,aerialStyle,unobstructedViewport,placeFocusLabel}=require('../src/map-view.js');
const Theme=require('../src/map-theme.js');
test('free viewport avoids multiple controls and finds the largest remaining rectangle',()=>{
    const viewport={left:0,top:0,right:100,bottom:100};
    const obstacles=[{left:40,top:0,right:100,bottom:50},{left:50,top:50,right:100,bottom:100}];
    const snapshot=structuredClone(obstacles);
    assert.deepEqual(unobstructedViewport(viewport,obstacles),{left:0,top:0,right:40,bottom:100});
    assert.deepEqual(unobstructedViewport(viewport,obstacles,5),{left:0,top:0,right:35,bottom:100});
    assert.deepEqual(obstacles,snapshot);
});
test('controls outside the free map area do not shift its centre; full obstruction is explicit',()=>{
    const viewport={left:10,top:10,right:90,bottom:90};
    assert.deepEqual(unobstructedViewport(viewport,[{left:100,top:0,right:140,bottom:60}],5),viewport);
    assert.equal(unobstructedViewport(viewport,[{left:0,top:0,right:100,bottom:100}]),null);
});
test('focused label flips at edges and stays inside the canvas without covering its marker',()=>{
    const viewport={left:8,top:8,right:312,bottom:392},size={width:160,height:44};
    for(const anchor of [{x:12,y:12},{x:308,y:12},{x:12,y:388},{x:308,y:388},{x:160,y:200}]){
        const box=placeFocusLabel(anchor,size,viewport,[],18);assert.ok(box);
        assert.ok(box.left>=8&&box.top>=8&&box.right<=312&&box.bottom<=392);
        assert.equal(anchor.x>=box.left&&anchor.x<=box.right&&anchor.y>=box.top&&anchor.y<=box.bottom,false);
    }
});
test('focused label avoids controls/panels and hides offscreen or obstructed anchors',()=>{
    const viewport={left:0,top:0,right:320,bottom:400},size={width:140,height:44},anchor={x:160,y:100};
    const obstacle={left:170,top:0,right:320,bottom:160},box=placeFocusLabel(anchor,size,viewport,[obstacle],18);
    assert.ok(box&&box.right<=obstacle.left);
    assert.equal(placeFocusLabel({x:-1,y:20},size,viewport),null);
    assert.equal(placeFocusLabel(anchor,size,viewport,[viewport]),null);
});

test('editorial themes remove duplicate buildings and noisy POIs without mutating the provider style',()=>{
    const original={version:8,sources:{openmaptiles:Theme.VECTOR_SOURCE},layers:[
        {id:'background',type:'background',paint:{'background-color':'black'}},
        {id:'building',type:'fill','source-layer':'building'},
        {id:'provider-3d',type:'fill-extrusion'},
        {id:'poi',type:'symbol','source-layer':'poi'},
        {id:'road-major-label',type:'symbol','source-layer':'transportation_name',layout:{'icon-image':'shield'}},
        {id:'park',type:'fill','source-layer':'park'}
    ]};
    const snapshot=structuredClone(original),dark=Theme.restyle(original),light=Theme.restyle(original,'light');
    assert.deepEqual(original,snapshot);
    assert.equal(dark.layers[0].paint['background-color'],'#001641');
    assert.notEqual(light.layers[0].paint['background-color'],dark.layers[0].paint['background-color']);
    assert.deepEqual(dark.layers.map(l=>l.id),['background','road-major-label','park']);
    assert.deepEqual(dark.layers[1].layout['text-font'],['Montserrat Medium']);
    assert.equal(dark.layers[1].layout['icon-image'],undefined);
    assert.match(dark.glyphs,/fonts\/\{fontstack\}\/\{range\}\.pbf$/);
});
test('one clipped building layer retains vector height fields and excludes duplicate outlines',()=>{
    const layers=Theme.buildingLayers('campus-clipped');
    assert.ok(layers.every(l=>l.source==='campus-clipped'&&l['source-layer']===undefined));
    const scene=layers.find(l=>l.type==='fill-extrusion');
    const expressions=JSON.stringify(scene);
    assert.match(expressions,/render_height/);assert.match(expressions,/render_min_height/);
    assert.match(expressions,/hide_3d/);assert.doesNotMatch(expressions,/buildings\.geojson|\bele\b/);
    assert.equal(layers.filter(l=>l.type==='fill-extrusion').length,1);
    assert.equal(scene.paint['fill-extrusion-opacity'],.95,'near-opaque scene retains correct route/building ordering');
});
test('GPS accuracy geometry is closed, and an unknown compass creates no heading wedge',()=>{
    const location={lat:-34.406105,lng:150.878998,accuracy:20};
    const data=gpsFeatures(location,null);
    assert.equal(data.features.length,2);
    const ring=data.features.find(f=>f.properties.kind==='accuracy').geometry.coordinates[0];
    assert.ok(Math.abs(ring[0][0]-ring.at(-1)[0])<1e-12&&Math.abs(ring[0][1]-ring.at(-1)[1])<1e-12);
    assert.equal(gpsFeatures(location,0).features.filter(f=>f.properties.kind==='heading').length,1);
    assert.equal(gpsFeatures(null,null).features.length,0);
});
test('basemaps use public OpenFreeMap and NSW sources without commercial credentials',()=>{
    assert.match(BASEMAPS.dark.url,/openfreemap.*dark$/);
    assert.match(BASEMAPS.light.url,/openfreemap.*positron$/);
    const source=aerialStyle().sources['nsw-imagery'];
    assert.equal(source.tileSize,256);assert.equal(source.maxzoom,19);
    assert.match(source.tiles[0],/NSW_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
    assert.match(source.attribution,/Spatial Services/);
});
