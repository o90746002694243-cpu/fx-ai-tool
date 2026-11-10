const assert=require('node:assert/strict');
const {snapshot,audit}=require('../netlify/functions/feature-audit');
assert.deepEqual(snapshot({isRsiExtreme:true,candleSignal:'十字線'}).rsiExtreme,true);
const h=[{pair:'USD/JPY',result:'wins',features:{rsiExtreme:true}}, {pair:'USD/JPY',result:'losses',features:{rsiExtreme:false}}, {pair:'EUR/JPY',result:'wins',features:{rsiExtreme:false}}];
const r=audit(h,'USD/JPY').find(x=>x.feature==='rsiExtreme');
assert.equal(r.whenTriggered.count,1); assert.equal(r.whenNotTriggered.count,1);
assert.equal(r.enoughData,false);
console.log('feature-audit tests passed');
