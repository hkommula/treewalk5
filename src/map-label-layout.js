/* Small, renderer-independent screen-space helpers. Tree/path coordinates never move. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MapLabelLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
    function markerRadius(zoom,availableWidth){return (8+clamp(zoom-15,0,4)*1.5)*clamp(availableWidth/720,.82,1);}
    function markerBox(point,radius){return {left:point.x-radius,right:point.x+radius,top:point.y-radius,bottom:point.y+radius};}
    function intersects(a,b){return a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;}
    function segmentHitsRect(rect,a,b,padding=3){
        const box={left:rect.left-padding,right:rect.right+padding,top:rect.top-padding,bottom:rect.bottom+padding};
        if(Math.max(a.x,b.x)<box.left||Math.min(a.x,b.x)>box.right||Math.max(a.y,b.y)<box.top||Math.min(a.y,b.y)>box.bottom)return false;
        let low=0,high=1;
        for(const [start,delta,min,max]of [[a.x,b.x-a.x,box.left,box.right],[a.y,b.y-a.y,box.top,box.bottom]]){
            if(Math.abs(delta)<1e-8){if(start<min||start>max)return false;continue;}
            const t1=(min-start)/delta,t2=(max-start)/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
        }
        return true;
    }
    function declutterMarkers(markers,radius,viewport,occupied=[]){
        const visible=[];
        for(const point of [...markers].sort((a,b)=>a.rank-b.rank)){
            if(!intersects(markerBox(point,radius),viewport))continue;
            if([...occupied,...visible].some(other=>Math.hypot(point.x-other.x,point.y-other.y)<(point.radius||radius)+(other.radius||radius)+5))continue;
            visible.push(point);
        }
        return visible;
    }
    function placeLabel(anchor,size,viewport,obstacles=[],gap=16,segments=[],reach=48){
        if(anchor.x<viewport.left||anchor.x>viewport.right||anchor.y<viewport.top||anchor.y>viewport.bottom||size.width>viewport.right-viewport.left||size.height>viewport.bottom-viewport.top)return null;
        for(let offset=gap;offset<=gap+reach;offset+=12){
            const candidates=[{left:anchor.x+offset,top:anchor.y-size.height/2},{left:anchor.x-offset-size.width,top:anchor.y-size.height/2},{left:anchor.x-size.width/2,top:anchor.y+offset},{left:anchor.x-size.width/2,top:anchor.y-offset-size.height},
                {left:anchor.x+offset,top:anchor.y+offset},{left:anchor.x-offset-size.width,top:anchor.y+offset},{left:anchor.x+offset,top:anchor.y-offset-size.height},{left:anchor.x-offset-size.width,top:anchor.y-offset-size.height}];
            for(const candidate of candidates){
                const left=clamp(candidate.left,viewport.left,viewport.right-size.width),top=clamp(candidate.top,viewport.top,viewport.bottom-size.height);
                const rect={left,top,right:left+size.width,bottom:top+size.height};
                const distance=Math.hypot(anchor.x-clamp(anchor.x,rect.left,rect.right),anchor.y-clamp(anchor.y,rect.top,rect.bottom));
                if(distance<gap*.75||obstacles.some(b=>intersects(rect,b))||segments.some(([a,b])=>segmentHitsRect(rect,a,b)))continue;
                return {...rect,distance};
            }
        }
        return null;
    }
    function connector(anchor,rect,radius,gap){
        const end={x:clamp(anchor.x,rect.left,rect.right),y:clamp(anchor.y,rect.top,rect.bottom)},length=Math.hypot(end.x-anchor.x,end.y-anchor.y);
        if(length<=gap+8)return null;
        const dx=(end.x-anchor.x)/length,dy=(end.y-anchor.y)/length;
        return [{x:anchor.x+dx*(radius+2),y:anchor.y+dy*(radius+2)},{x:end.x-dx*3,y:end.y-dy*3}];
    }
    function placeStopCallouts(markers,visible,radius,viewport,obstacles=[],segments=[],limit=12){
        const retained=new Set(visible.map(p=>p.id)),reserved=[...obstacles,...visible.map(p=>markerBox(p,radius+5))],callouts=[];
        for(const anchor of [...markers].sort((a,b)=>a.rank-b.rank)){
            if(callouts.length>=limit)break;
            if(retained.has(anchor.id))continue;
            const bounds=placeLabel(anchor,{width:radius*2,height:radius*2},viewport,reserved,radius+6,segments);
            if(!bounds)continue;
            const label={...anchor,x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2,anchor:{x:anchor.x,y:anchor.y},bounds};
            callouts.push(label);reserved.push(markerBox(label,radius+5));
        }
        return callouts;
    }
    return {markerRadius,markerBox,intersects,segmentHitsRect,declutterMarkers,placeLabel,connector,placeStopCallouts};
});
