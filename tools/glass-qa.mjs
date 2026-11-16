/* Glass presentation, live inline estimates and bright-backdrop contrast.
 * Uses the existing preview/CDP setup; Pillow samples native screenshot pixels. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connectBrowser} from './cdp-client.mjs';
const c=await connectBrowser(),settle=()=>c.evaluate('new Promise(r=>setTimeout(r,650))');
const capture=async name=>{const file=`.qa/glass-${name}.png`;await writeFile(file,Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'));return file;};
const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
try{
    const init=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await c.call('Page.navigate',{url:'http://127.0.0.1:8765/?glass-qa'});
    await c.waitFor('typeof walkingReady!=="undefined"&&walkingReady&&mapView.ready',30000);
    await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
    for(const [width,height]of [[320,640],[375,812],[390,844],[430,932],[640,360],[768,1024],[1024,768],[1440,960],[1600,1000]]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});
        await c.evaluate('showHome()');await settle();
        for(const mode of ['quick','casual','full','nearby']){
            await c.evaluate(`selectWalkMode('${mode}',false)`);
            const row=await c.evaluate(`(()=>{const metrics=[...document.querySelectorAll('#home-walk-type,#route-estimate>.symbol-metric')],rs=metrics.map(e=>e.getBoundingClientRect()),r=uiPanel.getBoundingClientRect();return {count:metrics.length,inline:rs.every(b=>Math.abs(b.top+b.height/2-rs[0].top-rs[0].height/2)<1),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.querySelector('.panel-body').scrollWidth>document.querySelector('.panel-body').clientWidth,small:parseFloat(getComputedStyle(metrics[0]).fontSize)<parseFloat(getComputedStyle(metrics[1]).fontSize),modeFill:getComputedStyle(metrics[0]).backgroundColor,bounds:r.left>=0&&r.right<=visualViewport.width+1,stops:metrics[1].textContent.trim(),live:pendingTrees().length}})()`);
            assert.equal(row.count,4);assert.ok(!row.overflow&&row.small&&row.bounds,JSON.stringify({width,mode,...row}));
            if(width>=1024)assert.ok(row.inline,`${width}: ${mode} estimates stay inline`);
            assert.equal(row.modeFill,'rgba(0, 0, 0, 0)');assert.equal(row.stops,`${row.live} trees`);
        }
        await c.evaluate('selectWalkMode("quick",false)');await settle();
        if([390,1440].includes(width))await capture(`home-${width}`);
        const glass=await c.evaluate(`(()=>{const style=getComputedStyle(uiPanel),row=getComputedStyle(document.querySelector('.preview-stop'));return {fill:style.backgroundColor,filter:style.backdropFilter,radius:parseFloat(style.borderTopLeftRadius),nested:row.backdropFilter}})()`);
        assert.equal(glass.fill,'rgba(255, 255, 255, 0.08)');assert.match(glass.filter,/blur\(12px\).*saturate\(1.2\)/);assert.ok(glass.radius>=14&&glass.radius<=18);assert.equal(glass.nested,'none');
        console.log(`${width}x${height}: live estimates, wrapping, glass surfaces and bounds passed.`);
    }
    for(const width of [320,800,1440]){
        await c.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1024});
        await c.evaluate('document.documentElement.style.fontSize="200%";scheduleLayout()');await settle();
        assert.equal(await c.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth||document.querySelector(".panel-body").scrollWidth>document.querySelector(".panel-body").clientWidth'),false);
        await c.evaluate('document.documentElement.style.fontSize=""');
    }
    await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await settle();
    const route=await c.evaluate('JSON.stringify(currentRoute.map(t=>t.key))');
    for(const mode of ['light','aerial']){
        await c.evaluate(`mapView.setBasemap('${mode}')`);await c.waitFor(`mapView.ready&&mapView.basemap==='${mode}'`);await settle();
        await capture(`home-${mode}`);
        // A uniform white fixture is a stricter backdrop than the actual tiles.
        await c.evaluate(`(()=>{const bg=document.createElement('div');bg.id='qa-white';bg.style.cssText='position:fixed;inset:0;background:white;z-index:1;pointer-events:none';document.body.append(bg);})()`);await settle();
        const point=await c.evaluate(`(()=>{const r=uiPanel.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+8,color:getComputedStyle(document.querySelector('.home-description')).color}})()`),file=await capture(`contrast-${mode}`);
        const pixel=JSON.parse(execFileSync('py',['-c','from PIL import Image; import json,sys; print(json.dumps(Image.open(sys.argv[1]).convert("RGB").getpixel((round(float(sys.argv[2])),round(float(sys.argv[3]))))))',file,String(point.x),String(point.y)],{encoding:'utf8'}));
        const fg=point.color.match(/[\d.]+/g).slice(0,3).map(Number),a=luminance(fg),b=luminance(pixel),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        assert.ok(contrast>=4.5,`${mode}: secondary text contrast ${contrast.toFixed(2)}:1 over white`);
        console.log(`${mode}: worst-case bright-backdrop secondary contrast ${contrast.toFixed(2)}:1.`);
        await c.evaluate('document.getElementById("qa-white").remove()');
        assert.equal(await c.evaluate('JSON.stringify(currentRoute.map(t=>t.key))'),route);
    }
    await c.evaluate('mapView.setBasemap("dark")');await c.waitFor('mapView.ready&&mapView.basemap==="dark"');await settle();
    await c.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    assert.equal(await c.evaluate('getComputedStyle(uiPanel).backdropFilter'),'none');
    await c.call('Emulation.setEmulatedMedia',{features:[]});
    assert.equal(await c.evaluate('locationTracker.isTracking()'),false);
    assert.deepEqual(c.errors,[]);console.log('Enlarged text, reduced transparency, route preservation and no automatic GPS passed.');
}finally{c.close();}

