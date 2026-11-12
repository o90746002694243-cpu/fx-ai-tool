"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
for(const name of ["monitor-market","strategy","probability","push-config","push-guard","quiet-hours","shadow-tracker","trade-tracker","parallel-strategies"]){
 test(`deployed ${name} matches reviewed root module`,()=>{
  assert.equal(fs.readFileSync(path.join(root,"netlify/functions",name+".js"),"utf8"),fs.readFileSync(path.join(root,name+".js"),"utf8"));
 });
}
test("live score gate accepts 65 and RR 1.5 without legacy vetoes",()=>{
 const {qualifies}=require("../netlify/functions/probability");
 const base={direction:"買い",score:65,riskReward:1.5,netRewardPips:5,isRangeTooSmall:false,isRsiExtreme:true,isSharpMove:true,isCandleOpposed:true,candleSignal:"十字線"};
 assert.equal(qualifies(base),true);
 assert.equal(qualifies({...base,score:64}),false);
 assert.equal(qualifies({...base,riskReward:1.49}),false);
});
