const {test}=require('node:test');
const assert=require('node:assert/strict');
const {gpsFeatures,BASEMAPS,aerialStyle}=require('../src/map-view.js');
const Theme=require('../src/map-theme.js');

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
test('one internal building layer uses global vector height fields and excludes duplicate outlines',()=>{
    const layers=Theme.buildingLayers('global-vector');
    assert.ok(layers.every(l=>l.source==='global-vector'&&l['source-layer']==='building'));
    const scene=layers.find(l=>l.type==='fill-extrusion');
    const expressions=JSON.stringify(scene);
    assert.match(expressions,/render_height/);assert.match(expressions,/render_min_height/);
    assert.match(expressions,/hide_3d/);assert.doesNotMatch(expressions,/buildings\.geojson|\bele\b/);
    assert.equal(layers.filter(l=>l.type==='fill-extrusion').length,1);
    assert.equal(scene.paint['fill-extrusion-opacity'],1,'buildings must hide routes behind their faces');
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
