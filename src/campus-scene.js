/* Campus geometry derived from the supplied boundary and currently loaded vector
 * tiles. No local building dataset. Polygon operations use the vendored MIT helper. */
(function(root,factory){
    const api=factory(typeof module==='object'&&module.exports?require('./vendor/polygon-clipping.min.js'):root.polygonClipping);
    if(typeof module==='object'&&module.exports)module.exports=api;else root.CampusScene=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(clip){
    'use strict';
    const collection=features=>({type:'FeatureCollection',features});
    const multi=geometry=>geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    const polygon=(coordinates,properties={})=>({type:'Feature',properties,geometry:{type:'MultiPolygon',coordinates}});
    function bounds(coordinates){
        const result=[Infinity,Infinity,-Infinity,-Infinity];
        const visit=value=>{
            if(typeof value[0]==='number'){
                if(!Number.isFinite(value[0])||!Number.isFinite(value[1])||Math.abs(value[0])>180||Math.abs(value[1])>90)throw Error('Boundary must use longitude/latitude.');
                result[0]=Math.min(result[0],value[0]);result[1]=Math.min(result[1],value[1]);
                result[2]=Math.max(result[2],value[0]);result[3]=Math.max(result[3],value[1]);
            }else for(const child of value)visit(child);
        };visit(coordinates);return result;
    }
    function expandedBounds(boundary,factor=2){
        const [west,south,east,north]=bounds(multi(boundary.geometry||boundary));
        const padding=(Math.max(1,Number(factor)||2)-1)/2;
        const x=(east-west)*padding,y=(north-south)*padding;
        return [[west-x,south-y],[east+x,north+y]];
    }
    function normaliseBoundary(data){
        const features=data?.type==='FeatureCollection'?data.features:[data];
        const parts=features.flatMap(f=>multi(f.geometry||f));
        if(!parts.length)throw Error('Campus boundary needs polygon geometry.');
        bounds(parts);
        const merged=clip.union(...parts);
        if(!merged.length)throw Error('Campus boundary is empty.');
        return polygon(merged,{...features[0].properties});
    }
    function ringContains(point,ring){
        let inside=false;
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
            const a=ring[i],b=ring[j];
            if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
        }return inside;
    }
    function contains(point,geometry){return multi(geometry).some(rings=>ringContains(point,rings[0])&&!rings.slice(1).some(r=>ringContains(point,r)));}
    function surfacePoint(coordinates){
        // Horizontal scan through the largest part; supports courtyards/holes.
        const parts=[...coordinates].sort((a,b)=>{
            const x=bounds(a),y=bounds(b);return (y[2]-y[0])*(y[3]-y[1])-(x[2]-x[0])*(x[3]-x[1]);
        });
        const rings=parts[0],box=bounds(rings),y=(box[1]+box[3])/2,xs=[];
        for(const ring of rings)for(let i=1;i<ring.length;i++){
            const a=ring[i-1],b=ring[i];
            if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
        }
        xs.sort((a,b)=>a-b);let longest=-1,point=rings[0][0];
        for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>longest){longest=xs[i+1]-xs[i];point=[(xs[i]+xs[i+1])/2,y];}
        return point;
    }
    function clipBuildings(features,boundary,pois=[]){
        const campus=multi(boundary.geometry),campusBox=bounds(campus),groups=new Map();
        for(const feature of features){
            const shape=multi(feature.geometry);if(!shape.length)continue;
            try{
                const box=bounds(shape);
                if(box[2]<campusBox[0]||box[0]>campusBox[2]||box[3]<campusBox[1]||box[1]>campusBox[3])continue;
                const geometry=clip.intersection(shape,campus);if(!geometry.length)continue;
                const props=feature.properties||{},id=feature.id??props.osm_id;
                const key=id===undefined?JSON.stringify([geometry,props.render_height,props.render_min_height,props.hide_3d]):`${id}|${props.render_height}|${props.render_min_height}|${props.hide_3d}`;
                const previous=groups.get(key);
                if(previous)previous.geometry.coordinates=clip.union(previous.geometry.coordinates,geometry);
                else groups.set(key,polygon(geometry,{...props}));
            }catch{/* Ignore a malformed tile feature; valid campus features still render. */}
        }
        const candidates=pois.filter(p=>{
            const props=p.properties||{},name=props.name||props['name:en'];
            if(p.geometry?.type!=='Point'||!name||!contains(p.geometry.coordinates,boundary.geometry))return false;
            if(/^University of Wollongong$/i.test(name))return false;
            if(['bus','railway','shop','food','cafe','restaurant'].includes(props.class))return false;
            return ['college','university','school','library','hospital','town_hall','theatre','community_centre','sports_centre'].includes(props.class)||/building|library|hall|centre|center|faculty|school|science|engineering|mckinnon|unicentre/i.test(name);
        });
        const buildings=[...groups.values()],labels=[],names=new Set();
        for(const feature of buildings){
            const properties=feature.properties,poi=candidates.find(p=>contains(p.geometry.coordinates,feature.geometry));
            const name=properties.name||properties['name:en']||poi?.properties.name||poi?.properties['name:en'];
            if(typeof name==='string'&&!names.has(name)){
                names.add(name);labels.push({type:'Feature',properties:{name},geometry:{type:'Point',coordinates:poi?.geometry.coordinates||surfacePoint(feature.geometry.coordinates)}});
            }
        }
        return {buildings:collection(buildings),labels:collection(labels)};
    }
    return {normaliseBoundary,clipBuildings,contains,bounds,expandedBounds,surfacePoint};
});
