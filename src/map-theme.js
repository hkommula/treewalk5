/* UOW Midnight Explorer: pure style builders, no renderer or routing dependency.
 * Buildings use the OpenMapTiles "building" vector layer already served by
 * OpenFreeMap. No local building dataset, model loader or second scene is used.
 */
(function(root,factory){const theme=factory();if(typeof module==='object'&&module.exports)module.exports=theme;else root.MidnightTheme=theme;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const BRAND={navy:'#001641',red:'#ED0A00',blue:'#0033FF',white:'#FFFFFF'};
    const GLYPHS=typeof document==='undefined'?'src/fonts/{fontstack}/{range}.pbf':new URL('./fonts/',document.currentScript?.src||location.href).href+'{fontstack}/{range}.pbf';
    const VECTOR_SOURCE={type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'};
    const PALETTES={
        dark:{background:BRAND.navy,land:'#09254b',park:'#123b43',water:'#0a2b42',road:'#2d4a73',path:'#365577',building:'#233e65',building3d:'#294b75',label:'#99afc9',text:'#f4f7fc',halo:'#001641'},
        light:{background:'#f3f5f8',land:'#e8eef2',park:'#d7e7df',water:'#c4dce8',road:'#c9d5df',path:'#acbdc9',building:'#d4dee8',building3d:'#a7bdd0',label:'#526982',text:BRAND.navy,halo:'#f3f5f8'}
    };
    function restyle(base,mode='dark'){
        const style=structuredClone(base),p=PALETTES[mode==='light'?'light':'dark'];
        style.name=mode==='light'?'UOW Daylight Explorer':'UOW Midnight Explorer';
        style.glyphs=GLYPHS;
        style.layers=style.layers.filter(layer=>{
            const source=layer['source-layer']||'',id=layer.id;
            if(source==='building'||layer.type==='fill-extrusion')return false;
            if(layer.type==='raster'||['poi','housenumber','mountain_peak','aerodrome_label'].includes(source))return false;
            if(/casing|oneway|dashline|shield|minor.*label|water.*label/i.test(id))return false;
            if(layer.type==='symbol')return source==='transportation_name'&&/major|primary|secondary|tertiary/.test(id);
            return !['boundary','aeroway'].includes(source);
        }).map(layer=>{
            const source=layer['source-layer']||'';
            layer.paint={...layer.paint};
            delete layer.paint['fill-pattern'];delete layer.paint['line-pattern'];
            if(layer.type==='background')layer.paint={'background-color':p.background};
            else if(layer.type==='fill'){
                const vegetation=['park','landcover'].includes(source)||/park|wood|grass/.test(layer.id);
                layer.paint={'fill-color':source==='water'?p.water:vegetation?p.park:p.land,'fill-opacity':source==='water'?1:.8,'fill-antialias':true};
            }else if(layer.type==='line'){
                const path=/path|footway|steps|pedestrian/.test(layer.id);
                layer.paint={'line-color':source==='waterway'?p.water:path?p.path:p.road,'line-opacity':path?.5:.65,
                    'line-width':['interpolate',['linear'],['zoom'],14,path?.4:.7,19,path?1.3:3.2]};
                if(path)layer.paint['line-dasharray']=[1,3];
            }else if(layer.type==='symbol'){
                layer.minzoom=Math.max(16,layer.minzoom||0);
                layer.layout={...layer.layout,'text-font':['Montserrat Medium'],'text-size':11,'text-padding':16};
                delete layer.layout['icon-image'];
                layer.paint={'text-color':p.label,'text-halo-color':p.halo,'text-halo-width':1};
            }
            return layer;
        });
        if(!style.layers.some(l=>l.type==='background'))style.layers.unshift({id:'uow-background',type:'background',paint:{'background-color':p.background}});
        return style;
    }
    function buildingLayers(source='openmaptiles',mode='dark'){
        const p=PALETTES[mode==='light'?'light':'dark'];
        return [
            {id:'uow-buildings-fill',type:'fill',source,'source-layer':'building',minzoom:13,paint:{'fill-color':p.building,'fill-opacity':.85}},
            {id:'uow-buildings-3d',type:'fill-extrusion',source,'source-layer':'building',minzoom:14,
                filter:['all',['!=',['get','hide_3d'],true],['!=',['get','hide_3d'],1]],
                paint:{'fill-extrusion-color':p.building3d,'fill-extrusion-height':['min',100,['max',3,['to-number',['get','render_height'],6]]],
                    'fill-extrusion-base':['max',0,['to-number',['get','render_min_height'],0]],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}}
        ];
    }
    return {BRAND,PALETTES,VECTOR_SOURCE,GLYPHS,restyle,buildingLayers};
});
