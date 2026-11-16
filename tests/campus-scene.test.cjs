const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const S=require('../src/campus-scene.js');
const clip=require('../src/vendor/polygon-clipping.min.js');
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
const feature=(rings,props={},id)=>({type:'Feature',id,properties:props,geometry:{type:'Polygon',coordinates:rings}});
const boundary=S.normaliseBoundary(feature([ring(0,0,4,4),ring(1,1,2,2)]));

test('supplied campus outline normalises without changing the asset or its provenance',()=>{
    const original=JSON.parse(fs.readFileSync('UOW_boundary.geojson','utf8')),snapshot=structuredClone(original);
    const result=S.normaliseBoundary(original);
    assert.deepEqual(original,snapshot);
    assert.equal(result.geometry.type,'MultiPolygon');
    assert.match(result.properties.description,/Approximate|approximate/);
    assert.ok(S.contains([150.87717,-34.40518],result.geometry));
    assert.throws(()=>S.normaliseBoundary(feature([ring(500,500,501,501)])),/longitude/);
});
test('navigation bounds double both campus extents about the same centre',()=>{
    const campus=S.normaliseBoundary(JSON.parse(fs.readFileSync('UOW_boundary.geojson','utf8')));
    const snapshot=structuredClone(campus),b=S.bounds(campus.geometry.coordinates),expanded=S.expandedBounds(campus);
    const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} differs from ${b}`);
    close(expanded[1][0]-expanded[0][0],2*(b[2]-b[0]));
    close(expanded[1][1]-expanded[0][1],2*(b[3]-b[1]));
    close(expanded[0][0]+expanded[1][0],b[0]+b[2]);
    close(expanded[0][1]+expanded[1][1],b[1]+b[3]);
    assert.deepEqual(campus,snapshot);
    assert.deepEqual(S.expandedBounds(boundary,1),[[0,0],[4,4]]);
});
test('tile fragments clip across the campus edge, preserve holes and deduplicate by vector ID',()=>{
    const inputs=[feature([ring(-1,.1,1,.8)],{render_height:18},7),feature([ring(0,.1,1,.8)],{render_height:18},7),feature([ring(1.1,1.1,1.8,1.8)],{},8),feature([ring(5,5,6,6)],{},9),feature([ring(.5,.5,2.5,2.5)],{render_height:6},10)];
    const snapshot=structuredClone(inputs),result=S.clipBuildings(inputs,boundary).buildings;
    assert.deepEqual(inputs,snapshot);
    assert.equal(result.features.length,2,'duplicates, outside buildings and courtyard-only features are excluded');
    for(const f of result.features){
        assert.deepEqual(clip.difference(f.geometry.coordinates,boundary.geometry.coordinates),[],'no building fragment extends outside campus or into a campus hole');
        assert.ok(S.contains(S.surfacePoint(f.geometry.coordinates),f.geometry));
    }
    assert.equal(result.features[0].properties.render_height,18);
});
test('building names use real provider names and education POIs, not arbitrary shops or outside points',()=>{
    const campus=S.normaliseBoundary(feature([ring(0,0,4,4)]));
    const buildings=[feature([ring(.1,.1,.9,.9)],{render_height:12},1),feature([ring(2,2,3,3)],{name:'Library',render_height:18},2)];
    const poi=(name,kind,coordinates)=>({type:'Feature',properties:{name,class:kind},geometry:{type:'Point',coordinates}});
    const result=S.clipBuildings(buildings,campus,[poi('Cafe','food',[.2,.2]),poi('Science Building','college',[.5,.5]),poi('Outside Hall','college',[5,5])]);
    assert.deepEqual(result.labels.features.map(f=>f.properties.name),['Science Building','Library']);
    assert.ok(result.labels.features.every(f=>S.contains(f.geometry.coordinates,campus.geometry)));
});
