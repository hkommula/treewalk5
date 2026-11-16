/* Geometry work stays off the UI thread. One small worker, no render loop. */
importScripts('vendor/polygon-clipping.min.js','campus-scene.js');
let boundary,generation;
self.onmessage=({data})=>{
    try{
        if(data.type==='boundary'){
            boundary=data.boundary;generation=data.generation;
        }else if(data.type==='buildings'&&data.generation===generation){
            self.postMessage({type:'buildings',generation,sequence:data.sequence,epoch:data.epoch,...CampusScene.clipBuildings(data.features,boundary,data.pois)});
        }
    }catch(error){self.postMessage({type:'error',generation,message:error.message});}
};
