/* One GPS watch and one compass listener, independent of the map renderer.
 * Device permissions are requested only from start(), called by a user action.
 */
(function(root){
    'use strict';
    class LocationTracker {
        constructor(options={}){
            this.options={highAccuracy:true,timeout:15000,maximumAge:5000,minAngleChange:3,...options};
            this.tracking=false;this.watchId=null;this.userLocation=null;this.heading=null;this._headingAt=0;this._boundOrientation=null;
            this._button=typeof options.button==='string'?document.querySelector(options.button):options.button;
            this._button?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.toggle();});
        }
        start(){this._startTracking();return this;}
        stop(){this._stopTracking();return this;}
        toggle(){return this.tracking?this.stop():this.start();}
        isTracking(){return this.tracking;}
        getLocation(){return this.userLocation;}
        getHeading(){return this.tracking&&Date.now()-this._headingAt<10000?this.heading:null;}
        _startTracking(){
            if(this.tracking)return;
            if(!navigator.geolocation){this.options.onLocationError?.({message:'Geolocation not supported.'});return;}
            this.tracking=true;this._updateButtonState('locating');this._startOrientationWatch();
            this.watchId=navigator.geolocation.watchPosition(position=>this._onLocationFound(position),error=>this._onLocationError(error),{
                enableHighAccuracy:this.options.highAccuracy,timeout:this.options.timeout,maximumAge:this.options.maximumAge
            });
        }
        _stopTracking(notify=true){
            const wasTracking=this.tracking||this.watchId!==null;
            this.tracking=false;
            if(this.watchId!==null){navigator.geolocation.clearWatch(this.watchId);this.watchId=null;}
            this._stopOrientationWatch();this.userLocation=null;this.heading=null;this._headingAt=0;
            this._updateButtonState('off');this.options.onRender?.(null,null);
            if(wasTracking&&notify)this.options.onLocationError?.({type:'stopped'});
        }
        _onLocationFound(position){
            if(!this.tracking)return;
            const coords=position.coords;
            if(!Number.isFinite(coords.latitude)||!Number.isFinite(coords.longitude))return;
            const location={lat:coords.latitude,lng:coords.longitude,accuracy:coords.accuracy,heading:this.getHeading(),timestamp:position.timestamp};
            const center=this.options.geofenceCenter;
            if(center&&this.options.geofenceRadius){
                const distance=this._getDistance(location.lat,location.lng,center[0],center[1]);
                if(distance>this.options.geofenceRadius){this.options.onGeofenceViolation?.({distance,limit:this.options.geofenceRadius,location});this.stop();return;}
            }
            this.userLocation=location;this._updateButtonState('active');this.options.onRender?.(location,this.getHeading());this.options.onLocationFound?.(location);
        }
        _onLocationError(error){
            if(!this.tracking)return;
            if(error.code===1)this._stopTracking(false);
            else{this.userLocation=null;this._updateButtonState('locating');this.options.onRender?.(null,null);}
            this.options.onLocationError?.(error);
        }
        _startOrientationWatch(){
            if(this._boundOrientation)return;
            this._boundOrientation=event=>this._onOrientation(event);
            const listener=this._boundOrientation;
            const OrientationEvent=window.DeviceOrientationEvent;
            if(OrientationEvent&&typeof OrientationEvent.requestPermission==='function'){
                OrientationEvent.requestPermission().then(state=>{
                    if(this._boundOrientation!==listener)return;
                    if(state==='granted'&&this.tracking&&this._boundOrientation)window.addEventListener('deviceorientation',this._boundOrientation,true);
                    else this._boundOrientation=null;
                }).catch(()=>{if(this._boundOrientation===listener)this._boundOrientation=null;});
            }else window.addEventListener('ondeviceorientationabsolute' in window?'deviceorientationabsolute':'deviceorientation',this._boundOrientation,true);
        }
        _stopOrientationWatch(){
            if(!this._boundOrientation)return;
            window.removeEventListener('deviceorientationabsolute',this._boundOrientation,true);window.removeEventListener('deviceorientation',this._boundOrientation,true);this._boundOrientation=null;
        }
        _onOrientation(event){
            if(!this.tracking)return;
            let heading=null;
            if(Number.isFinite(event.webkitCompassHeading)&&(!Number.isFinite(event.webkitCompassAccuracy)||(event.webkitCompassAccuracy>=0&&event.webkitCompassAccuracy<=30)))heading=event.webkitCompassHeading;
            else if((event.absolute===true||event.type==='deviceorientationabsolute')&&Number.isFinite(event.alpha))heading=360-event.alpha;
            heading=this._normalizeHeading(heading);if(heading===null)return;
            if(Number.isFinite(screen.orientation?.angle))heading=this._normalizeHeading(heading+screen.orientation.angle);
            this._headingAt=Date.now();
            if(this.heading!==null&&Math.abs(((heading-this.heading+540)%360)-180)<this.options.minAngleChange)return;
            this.heading=heading;
            if(this.userLocation){this.userLocation.heading=heading;this.options.onRender?.(this.userLocation,heading);}
            this.options.onHeadingChanged?.(heading);
        }
        _normalizeHeading(value){if(value===null||value===undefined||!Number.isFinite(Number(value)))return null;return ((Number(value)%360)+360)%360;}
        _updateButtonState(state){
            if(!this._button)return;
            this._button.classList.remove('locating','gps-active');
            if(state==='locating')this._button.classList.add('locating');
            if(state==='active')this._button.classList.add('gps-active');
            this._button.setAttribute('aria-pressed',String(this.tracking));
            this._button.setAttribute('aria-label',this.tracking?'Stop location tracking':'Track my location');
        }
        _getDistance(lat1,lng1,lat2,lng2){
            const r=Math.PI/180,p1=lat1*r,p2=lat2*r,dp=(lat2-lat1)*r,dl=(lng2-lng1)*r;
            const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
            return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
        }
    }
    if(typeof module==='object'&&module.exports)module.exports=LocationTracker;else root.LocationTracker=LocationTracker;
})(typeof globalThis!=='undefined'?globalThis:this);
