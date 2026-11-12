/* Development-only: generate self-hosted Montserrat SDF glyphs with TinySDF.
 * Needs the static server (8765), Chromium CDP (9222) and built WOFF assets.
 * TinySDF is fetched only by this tool; the deployed app has no font service.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {connectBrowser} from './cdp-client.mjs';
await mkdir('.qa',{recursive:true});
await writeFile('.qa/font-build.html','<!doctype html><style>@font-face{font-family:Montserrat;src:url(../src/fonts/Montserrat.woff);font-weight:100 900}</style><body>Montserrat font builder</body>');
const client=await connectBrowser();
try{
    await client.call('Page.navigate',{url:'http://127.0.0.1:8765/.qa/font-build.html'});
    await client.waitFor('document.readyState==="complete"');
    await client.evaluate('document.fonts.load("500 24px Montserrat").then(()=>true)');
    const source=await fetch('https://unpkg.com/@mapbox/tiny-sdf@2.0.7/index.js').then(r=>r.text());
    await client.evaluate(`(()=>{${source.replace('export default class TinySDF','window.TinySDF=class TinySDF')};return true;})()`);
    const varint=value=>{const bytes=[];do{let byte=value%128;value=Math.floor(value/128);if(value)byte|=128;bytes.push(byte);}while(value);return Buffer.from(bytes);};
    const uint=(tag,value)=>Buffer.concat([varint(tag*8),varint(value)]);
    const signed=(tag,value)=>uint(tag,value<0?-value*2-1:value*2);
    const bytes=(tag,value)=>Buffer.concat([varint(tag*8+2),varint(value.length),value]);
    const out='src/fonts/Montserrat Medium';await mkdir(out,{recursive:true});
    for(const start of [0,256,8192]){
        // MapLibre server glyph metrics use an origin above the em box; TinySDF
        // measures from the alphabetic baseline. Match MapLibre's adjustment.
        const glyphs=await client.evaluate(`(()=>{const sdf=new TinySDF({fontFamily:'Montserrat',fontWeight:'500',fontSize:24,buffer:3,radius:8,cutoff:.25});return Array.from({length:256},(_,i)=>{const id=${start}+i,g=sdf.draw(String.fromCodePoint(id));return {id,width:g.glyphWidth,height:g.glyphHeight,left:g.glyphLeft,top:g.glyphTop-27,advance:Math.round(g.glyphAdvance),bitmap:Array.from(g.data)};});})()`);
        const records=glyphs.map(g=>bytes(3,Buffer.concat([uint(1,g.id),bytes(2,Buffer.from(g.bitmap)),uint(3,g.width),uint(4,g.height),signed(5,g.left),signed(6,g.top),uint(7,g.advance)])));
        const stack=Buffer.concat([bytes(1,Buffer.from('Montserrat Medium')),bytes(2,Buffer.from(`${start}-${start+255}`)),...records]);
        const file=bytes(1,stack);await writeFile(`${out}/${start}-${start+255}.pbf`,file);console.log(`Glyph range ${start}-${start+255}: ${file.length} bytes`);
    }
}finally{client.close();}
