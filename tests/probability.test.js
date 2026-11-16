const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('../probability');
test('no invented probability on zero samples',()=>{
 const r=p.estimateProbability({},'USD/JPY',{direction:'買い',higherAligned:true,score:95});
 assert.equal(r.empiricalWinRate,null);assert.equal(r.isValidated,false);
});
test('a completed trade contributes to empirical estimate',()=>{
 const tracker={candidateStats:{'USD/JPY':{'買い|aligned|high':{wins:20,losses:10,ambiguous:0,expired:0}}}};
 const r=p.estimateProbability(tracker,'USD/JPY',{direction:'買い',higherAligned:true,score:95});
 assert.equal(r.sampleSize,30);assert.equal(r.isValidated,true);assert.equal(r.empiricalWinRate,66.7);
});
test('candidate opening does not repeat while pending',()=>{
 const tracker={};
 const a={direction:'買い',score:90,higherAligned:true,isRsiExtreme:false,isSharpMove:false,isRangeTooSmall:false,isWeakTrend:false,isCandleOpposed:false,candleSignal:'なし',netRewardPips:8,riskReward:1.3,entryAt:1000,entryPrice:100,takeProfit:100.1,stopLoss:99.9,candleTime:'a'};
 assert.equal(p.trackCandidate(tracker,'USD/JPY',a),true);
 assert.equal(p.trackCandidate(tracker,'USD/JPY',a),false);
 assert.equal(tracker.openCandidates.length,1);
});

test('provisional gate starts without 30 trades and does not invent empirical wins',()=>{
 const e=p.estimateProbability({},'USD/JPY',{direction:'買い',score:70});
 const g=p.provisional60Gate({score:70},e);
 assert.equal(g.estimatedScore,60);assert.equal(g.passes,true);
 assert.equal(e.empiricalWinRate,null);
 assert.equal(p.provisional60Gate({score:60},e).passes,false);
});
