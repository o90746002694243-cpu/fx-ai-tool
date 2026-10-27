"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const p=require("../parallel-strategies");
const now=Date.parse("2026-10-28T03:15:00Z"), barEnd=now-15000;
const a={atr:.08,sma5:151.2,sma20:151.0,rsi:53,adx:25,spreadPips:.3};
const bar={close:151.2,datetime:"2026-10-28 03:00:00",endTime:barEnd};
test("trend research candidate and same-bar deduplication",()=>{
 const t={};assert.equal(p.record(t,"USD/JPY",a,bar,now).length,1);
 assert.equal(p.record(t,"USD/JPY",a,bar,now).length,0);
 assert.equal(t.parallelStrategies.open.length,1);
});
test("range candidate independent of trend",()=>{
 const t={};const r=p.record(t,"AUD/JPY",{...a,adx:12,rsi:30},bar,now);
 assert.equal(r[0].strategy,"range");
});
test("TP settlement and outcome calculation",()=>{
 const t={};const tr=p.record(t,"USD/JPY",a,bar,now)[0];
 p.settle(t,"USD/JPY",[{time:barEnd,endTime:barEnd+900000,high:tr.takeProfit+.01,low:tr.entryPrice-.001,close:tr.takeProfit}],now+920000);
 assert.equal(p.summary(t,"USD/JPY").trend.wins,1);
});
test("expiry counts as non-win",()=>{
 const t={};p.record(t,"USD/JPY",a,bar,now);
 p.settle(t,"USD/JPY",[],now+4*3600000);
 assert.equal(p.summary(t,"USD/JPY").trend.expired,1);
 assert.equal(p.summary(t,"USD/JPY").trend.tpRate,0);
});
test("stale data is ignored",()=>{
 assert.equal(p.record({},"USD/JPY",a,{...bar,endTime:now-3600000},now).length,0);
});
