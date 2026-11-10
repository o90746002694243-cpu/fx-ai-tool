"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {STRATEGY_VERSION}=require("../netlify/functions/strategy");
const path=require.resolve("../netlify/functions/trade-tracker");
const endpoint=require.resolve("../netlify/functions/market-status");
test("status identifies persisted snapshots from a previous deployed strategy",async()=>{
  const prevTracker=require.cache[path], prevEndpoint=require.cache[endpoint];
  require.cache[path]={exports:{loadTracker:async()=>({store:{get:async key=>key==="market-USD-JPY"?{pair:"USD/JPY",strategyVersion:"old-strategy",skipReasons:["スコア不足:66点"],checkedAt:new Date().toISOString()}:key==="market-EUR-JPY"?{pair:"EUR/JPY",strategyVersion:STRATEGY_VERSION,checkedAt:new Date().toISOString()}:null},tracker:{openSignals:[]}}),formatActualWinRate:()=>"未検証"}};
  delete require.cache[endpoint];
  try {
    const response=await require(endpoint).handler({});
    assert.equal(response.statusCode,200);
    const data=JSON.parse(response.body);
    assert.equal(data.activeStrategyVersion,STRATEGY_VERSION);
    assert.equal(data.results.find(x=>x.pair==="USD/JPY").snapshotVersionMatches,false);
    assert.equal(data.results.find(x=>x.pair==="EUR/JPY").snapshotVersionMatches,true);
  } finally {
    if(prevTracker)require.cache[path]=prevTracker;else delete require.cache[path];
    if(prevEndpoint)require.cache[endpoint]=prevEndpoint;else delete require.cache[endpoint];
  }
});
