const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
    let starts=0,clears=0;const listeners=new Set(),rendered=[],errors=[];
    const sandbox={module:{exports:{}},navigator:{geolocation:{watchPosition(){return ++starts;},clearWatch(){clears++;}}},
        window:{addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)},screen:{orientation:{angle:0}},Date,Math,Number};
    vm.runInNewContext(fs.readFileSync('src/location-tracker.js','utf8'),sandbox);
    const tracker=new sandbox.module.exports({onRender:location=>rendered.push(location),onLocationError:error=>errors.push(error)});
    return {tracker,rendered,errors,listeners,counts:()=>({starts,clears})};
}
test('repeated start requests share one GPS watch; stop clears sensors and ignores queued fixes',()=>{
    const env=setup();env.tracker.start().start();
    assert.equal(env.counts().starts,1);assert.equal(env.listeners.size,1);
    env.tracker.stop();assert.equal(env.counts().clears,1);assert.equal(env.listeners.size,0);
    env.tracker._onLocationFound({coords:{latitude:-34.4,longitude:150.8,accuracy:5},timestamp:Date.now()});
    assert.equal(env.tracker.getLocation(),null);assert.equal(env.rendered.at(-1),null);
});
test('temporary GPS failures can recover on the same watch; denial clears it',()=>{
    const env=setup();env.tracker.start();
    env.tracker._onLocationError({code:2});assert.equal(env.tracker.isTracking(),true);assert.equal(env.counts().starts,1);
    env.tracker._onLocationFound({coords:{latitude:-34.4,longitude:150.8,accuracy:8},timestamp:Date.now()});
    assert.equal(env.tracker.getLocation().accuracy,8);
    env.tracker._onLocationError({code:1});assert.equal(env.tracker.isTracking(),false);assert.equal(env.counts().clears,1);
});
test('relative orientation and poor compass readings never become navigation bearings',()=>{
    const env=setup();env.tracker.start();
    env.tracker._onOrientation({alpha:90,absolute:false});assert.equal(env.tracker.getHeading(),null);
    env.tracker._onOrientation({webkitCompassHeading:90,webkitCompassAccuracy:80});assert.equal(env.tracker.getHeading(),null);
    env.tracker._onOrientation({alpha:90,absolute:true});assert.equal(env.tracker.getHeading(),270);
    env.tracker.stop();assert.equal(env.tracker.getHeading(),null);
});
