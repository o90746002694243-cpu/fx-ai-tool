const test=require('node:test');
const assert=require('node:assert/strict');
const {qualifies}=require('../netlify/functions/probability');
const base={direction:'買い',score:90,isRsiExtreme:false,isSharpMove:false,isRangeTooSmall:false,isCandleOpposed:false,candleSignal:'陽線',netRewardPips:18,riskReward:1.41};
test('RR 1.41 must never qualify for push',()=>assert.equal(qualifies(base),false));
test('RR 1.5 qualifies with otherwise valid candidate',()=>assert.equal(qualifies({...base,riskReward:1.5}),true));
test('a low score alone is not an extra veto',()=>assert.equal(qualifies({...base,score:50,riskReward:2}),true));
test('extreme RSI and insufficient net reward remain safeguards',()=>{assert.equal(qualifies({...base,riskReward:1.5,isRsiExtreme:true}),false);assert.equal(qualifies({...base,riskReward:1.5,netRewardPips:0}),false)});
