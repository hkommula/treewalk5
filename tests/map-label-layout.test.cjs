const {test}=require('node:test');
const assert=require('node:assert/strict');
const Layout=require('../src/map-label-layout.js');
test('marker scale responds smoothly to available map width and zoom with bounded radii',()=>{
    assert.ok(Layout.markerRadius(19,900)>Layout.markerRadius(19,320));
    assert.ok(Layout.markerRadius(19,320)>Layout.markerRadius(15,320));
    assert.equal(Layout.markerRadius(30,900),14);
    assert.ok(Layout.markerRadius(15,1)>6);
});
test('decluttering retains higher-priority stops and does not move any tree coordinate',()=>{
    const trees=[{id:1,x:50,y:50,rank:10},{id:2,x:54,y:52,rank:-2},{id:3,x:140,y:100,rank:3}],before=structuredClone(trees);
    assert.deepEqual(Layout.declutterMarkers(trees,12,{left:0,top:0,right:200,bottom:200}).map(p=>p.id),[2,3]);
    assert.deepEqual(trees,before);
});
test('close stops receive separate numbered callouts without moving their anchors',()=>{
    const markers=[{id:31,x:140,y:140,rank:1},{id:94,x:145,y:144,rank:2}],before=structuredClone(markers),viewport={left:0,top:0,right:400,bottom:400};
    const visible=Layout.declutterMarkers(markers,14,viewport),callouts=Layout.placeStopCallouts(markers,visible,14,viewport);
    assert.deepEqual(visible.map(p=>p.id),[31]);assert.deepEqual(callouts.map(p=>p.id),[94]);
    assert.deepEqual(callouts[0].anchor,{x:145,y:144});
    assert.ok(Math.hypot(callouts[0].x-visible[0].x,callouts[0].y-visible[0].y)>=33);
    assert.deepEqual(markers,before);
});
test('crowded-stop callouts respect path/UI obstacles, priority and a density limit',()=>{
    const markers=[{id:10,x:150,y:150,rank:0},{id:11,x:153,y:151,rank:3},{id:12,x:155,y:152,rank:1}],viewport={left:0,top:0,right:400,bottom:400};
    const visible=Layout.declutterMarkers(markers,12,viewport),obstacles=[{left:175,top:0,right:400,bottom:190}],segments=[[{x:0,y:160},{x:400,y:160}]];
    const callouts=Layout.placeStopCallouts(markers,visible,12,viewport,obstacles,segments,1);
    assert.equal(callouts.length,1);assert.equal(callouts[0].id,12);
    assert.equal(obstacles.some(b=>Layout.intersects(callouts[0].bounds,b)),false);
    assert.equal(Layout.segmentHitsRect(callouts[0].bounds,...segments[0]),false);
});
test('line clipping checks actual route segments rather than large diagonal bounding boxes',()=>{
    const box={left:40,top:40,right:60,bottom:60};
    assert.equal(Layout.segmentHitsRect(box,{x:0,y:0},{x:100,y:100},0),true);
    assert.equal(Layout.segmentHitsRect(box,{x:0,y:0},{x:100,y:20},0),false);
    assert.equal(Layout.segmentHitsRect(box,{x:50,y:0},{x:50,y:100},0),true);
    assert.equal(Layout.segmentHitsRect(box,{x:0,y:37},{x:100,y:37},3),true);
});
test('labels choose a clear side of a real path, reserving marker space',()=>{
    const anchor={x:150,y:150},viewport={left:0,top:0,right:400,bottom:400},segments=[[{x:0,y:150},{x:400,y:150}]];
    const rect=Layout.placeLabel(anchor,{width:100,height:24},viewport,[Layout.markerBox(anchor,12)],18,segments);
    assert.ok(rect);assert.equal(Layout.segmentHitsRect(rect,...segments[0]),false);
    assert.equal(Layout.intersects(rect,Layout.markerBox(anchor,12)),false);
    assert.equal(Layout.connector(anchor,rect,12,18),null,'normal adjacent names need no connector');
});
test('a constrained displaced label receives a short connector only when needed',()=>{
    const anchor={x:160,y:200},viewport={left:0,top:0,right:320,bottom:400};
    const obstacles=[{left:42,right:142,top:185,bottom:215},{left:178,right:278,top:185,bottom:215},{left:110,right:210,top:158,bottom:182},{left:110,right:210,top:218,bottom:242}];
    const rect=Layout.placeLabel(anchor,{width:100,height:24},viewport,obstacles,18);
    assert.ok(rect&&rect.distance>26);assert.equal(obstacles.some(b=>Layout.intersects(rect,b)),false);
    const connector=Layout.connector(anchor,rect,10,18);assert.ok(connector);assert.ok(Math.hypot(connector[0].x-anchor.x,connector[0].y-anchor.y)>10);
});
test('edge labels can use clear diagonal space around a toolbar and approaching path',()=>{
    const anchor={x:374,y:240},viewport={left:8,top:8,right:382,bottom:414};
    const controls=[{left:327,top:125,right:379,bottom:221}];
    const route=[[{x:259,y:330},anchor]];
    const rect=Layout.placeLabel(anchor,{width:138,height:44},viewport,controls,18,route);
    assert.ok(rect&&rect.distance<120);
    assert.equal(controls.some(box=>Layout.intersects(rect,box)),false);
    assert.equal(Layout.segmentHitsRect(rect,...route[0]),false);
    assert.ok(Layout.connector(anchor,rect,12,18));
});
test('two-line focus labels can search beyond native-name spacing without moving the anchor',()=>{
    const anchor={x:134,y:176},before={...anchor},viewport={left:8,top:8,right:312,bottom:340},size={width:227,height:49};
    const obstacles=[{left:8,top:8,right:312,bottom:248}];
    assert.equal(Layout.placeLabel(anchor,size,viewport,obstacles,18),null);
    const label=Layout.placeLabel(anchor,size,viewport,obstacles,18,[],size.height*3);
    assert.ok(label&&label.top>=248&&label.bottom<=340);
    assert.equal(obstacles.some(b=>Layout.intersects(label,b)),false);
    assert.deepEqual(anchor,before);
});
