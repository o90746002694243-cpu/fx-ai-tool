const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeCandles,aggregate,trend,evaluate,outcome,backtest,BAR_MS,EXPIRY_MS} = require('../netlify/functions/strategy');
function rows(n=600) {
  const start=Date.UTC(2026,7,3);
  let price=150, seed=23;
  return Array.from({length:n},(_,i)=>{
    seed=(seed*16807)%2147483647;
    const open=price;
    price+=(seed/2147483647-0.47)*0.15;
    return {datetime:new Date(start+i*BAR_MS).toISOString().slice(0,19).replace('T',' '),open,close:price,high:Math.max(open,price)+0.02,low:Math.min(open,price)-0.02};
  });
}
test('only valid unique completed UTC bars are accepted',()=>{
  const r=rows(5), cutoff=Date.parse(r[3].datetime.replace(' ','T')+'Z');
  const c=normalizeCandles([...r,r[0],{...r[1],high:'bad'}],cutoff);
  assert.equal(c.length,3);
  assert.equal(c[0].time,Date.UTC(2026,7,3));
  assert(c.every(x=>x.endTime<=cutoff));
});
test('higher bars require every constituent, never include a partial group',()=>{
  const c=normalizeCandles(rows(33),Infinity);
  assert.equal(aggregate(c,1).length,8);
  assert.equal(aggregate(c,4).length,2);
  assert.equal(aggregate(c.filter((_,i)=>i!==4),4).length,1);
  const h=aggregate(c,4)[0];
  assert.equal(h.close,c[15].close);assert.equal(h.open,c[0].open);
});
test('future higher bars cannot alter a past decision',()=>{
  const c=normalizeCandles(rows(600),Infinity), prefix=c.slice(0,390);
  const result=evaluate(prefix);
  const future=evaluate(prefix,{h1:aggregate(c,1),h4:aggregate(c,4)});
  assert.deepEqual(result,future);
  assert.equal(trend(aggregate(c.slice(0,16),4),c[15].endTime),'不足');
});
test('both-touch, stop, take-profit and deadline use conservative outcomes',()=>{
  const signal={entryAt:Date.UTC(2026,7,3),direction:'買い',takeProfit:151,stopLoss:149};
  const bar={time:signal.entryAt,endTime:signal.entryAt+BAR_MS,high:151.2,low:148.9};
  assert.equal(outcome(signal,bar),'ambiguous');
  assert.equal(outcome(signal,{...bar,high:150.5}),'losses');
  assert.equal(outcome(signal,{...bar,low:150}),'wins');
  assert.equal(outcome(signal,{...bar,time:signal.entryAt-BAR_MS} ),null);
  assert.equal(outcome(signal,{...bar,time:signal.entryAt+EXPIRY_MS,endTime:signal.entryAt+EXPIRY_MS+BAR_MS}),null);
  assert.equal(outcome(signal,{...bar,time:signal.entryAt+EXPIRY_MS-BAR_MS,endTime:signal.entryAt+EXPIRY_MS,high:150.2,low:149.8}),'expired');
});
test('historical replay produces coherent counts and disclosures',()=>{
  const c=normalizeCandles(rows(5000),Infinity), result=backtest(c);
  assert(result.signals > 0);
  assert.equal(result.signals,result.total+result.unresolved);
  assert.equal(result.total,result.wins+result.losses+result.ambiguous+result.expired);
  assert(result.assumptions.includes('スプレッド'));
  assert.equal(backtest(c.slice(0,100)).signals,0);
});
test('new strategy stats stay separate and old records survive',()=>{
  const trackerModule=require('../netlify/functions/trade-tracker');
  const entryAt=Date.UTC(2026,7,3);
  const tracker={stats:{'USD/JPY':{wins:12,losses:8,ambiguous:0,expired:0}},openSignals:[]};
  trackerModule.addSignal(tracker,{pair:'USD/JPY',direction:'買い',entryPrice:150,takeProfit:151,stopLoss:149,score:90,strategyVersion:'mtf-v2',entryAt});
  trackerModule.settlePairSignals(tracker,'USD/JPY',[{time:entryAt,endTime:entryAt+BAR_MS,high:151.1,low:150}],entryAt+BAR_MS);
  assert.equal(tracker.stats['USD/JPY'].wins,12);
  assert.equal(tracker.strategyStats['mtf-v2']['USD/JPY'].wins,1);
  assert.equal(tracker.openSignals.length,0);
  assert(trackerModule.formatActualWinRate(tracker,'USD/JPY').includes('30件未満'));
});
test('monitor builds saved read-only summaries without contacting push on stale data',async()=>{
  const modulePath=require.resolve('../netlify/functions/trade-tracker');
  const previous=require.cache[modulePath];
  const stored=[];
  require.cache[modulePath]={exports:{
    loadTracker:async()=>({store:{setJSON:async(k,v)=>stored.push([k,v])},tracker:{openSignals:[],stats:{}}}),
    settlePairSignals:()=>{},hasOpenSignal:()=>false,addSignal:()=>{},formatActualWinRate:()=> '検証中（0件）',saveTracker:async()=>true
  }};
  const originalFetch=global.fetch, apiKey=process.env.TWELVE_DATA_API_KEY;
  const calls=[];
  global.fetch=async(url)=>{
    calls.push(String(url));
    return {ok:true,json:async()=>String(url).includes('ff_calendar')?[]:{values:rows(5000).reverse()}};
  };
  process.env.TWELVE_DATA_API_KEY='test';
  try {
    delete require.cache[require.resolve('../netlify/functions/monitor-market')];
    const result=await require('../netlify/functions/monitor-market').handler({});
    assert.equal(result.statusCode,200);
    assert.equal(stored.length,2);
    assert.equal(calls.filter(x=>x.includes('time_series')).length,2);
    assert(calls.filter(x=>x.includes('time_series')).every(x=>x.includes('outputsize=5000')&&x.includes('timezone=UTC')));
    assert(stored.every(([,value])=>value.backtest&&value.higherTimeframes&&!value.shouldNotify));
    assert(!calls.some(x=>x.includes('onesignal')));
  } finally {
    global.fetch=originalFetch;
    if (apiKey===undefined) delete process.env.TWELVE_DATA_API_KEY; else process.env.TWELVE_DATA_API_KEY=apiKey;
    require.cache[modulePath]=previous;
  }
});
