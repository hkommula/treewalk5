/* Minimal Chromium test transport; no browser automation dependency. */
export async function connectBrowser(){
    const tabs=await fetch('http://127.0.0.1:9222/json').then(r=>r.json());
    const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let sequence=0;const pending=new Map(),errors=[],listeners=new Map();
    ws.addEventListener('message',event=>{
        const message=JSON.parse(event.data);
        if(message.id){const callback=pending.get(message.id);pending.delete(message.id);if(message.error)callback?.reject(Error(JSON.stringify(message.error)));else callback?.resolve(message.result);}
        else{
            if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
            listeners.get(message.method)?.(message.params);
        }
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const call=async(method,params={})=>{
        if(!['Page.navigate','Page.reload'].includes(method))return send(method,params);
        // Page.navigate resolves before the new document commits. Without this
        // boundary, readiness checks can accidentally inspect the previous app.
        const token=`navigation-${Date.now()}-${sequence}`;
        await send('Runtime.evaluate',{expression:`window.__cdpNavigationToken=${JSON.stringify(token)}`});
        const result=await send(method,params);
        if(result.errorText)throw Error(result.errorText);
        const start=Date.now();
        while(Date.now()-start<30000){
            try{
                const state=await send('Runtime.evaluate',{expression:`window.__cdpNavigationToken!==${JSON.stringify(token)}&&document.readyState!=='loading'`,returnByValue:true});
                if(state.result?.value===true)return result;
            }catch(error){if(!/context|navigat/i.test(error.message))throw error;}
            await new Promise(resolve=>setTimeout(resolve,50));
        }
        throw Error(`New document did not become ready after ${method}`);
    };
    const evaluate=async expression=>{
        const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
        if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const waitFor=async(expression,timeout=20000)=>{
        const start=Date.now();
        while(Date.now()-start<timeout){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,150));}
        throw Error(`Timeout: ${expression}; exceptions: ${JSON.stringify(errors)}`);
    };
    await call('Runtime.enable');await call('Page.enable');
    return {call,evaluate,waitFor,errors,on:(method,callback)=>listeners.set(method,callback),close:()=>ws.close()};
}
