const test = require('node:test');
const assert = require('node:assert/strict');
test('market status displays tracker stats and pending signals, not stale snapshots',async()=>{
 const trackerPath=require.resolve('../netlify/functions/trade-tracker');
 const previous=require.cache[trackerPath];
 require.cache[trackerPath]={exports:{loadTracker:async()=>({store:{get:async(key)=>key==='market-USD-JPY'?{pair:'USD/JPY',strategyVersion:'mtf-v4',actualWinRate:'古い表示'}:null},tracker:{openSignals:[{pair:'USD/JPY',createdAt:1234}],strategyStats:{'mtf-v4':{'USD/JPY':{wins:1,losses:0}}}}}),formatActualWinRate:()=> '50%（最新）'}};
 const endpoint=require.resolve('../netlify/functions/market-status');
 const oldEndpoint=require.cache[endpoint]; delete require.cache[endpoint];
 try {
  const res=await require(endpoint).handler({});
  assert.equal(res.statusCode,200);
  const item=JSON.parse(res.body).results[0];
  assert.equal(item.actualWinRate,'50%（最新）');
  assert.equal(item.pendingCount,1);
  assert.equal(item.pendingSince,1234);
 } finally { if(previous)require.cache[trackerPath]=previous;else delete require.cache[trackerPath]; if(oldEndpoint)require.cache[endpoint]=oldEndpoint;else delete require.cache[endpoint]; }
});
