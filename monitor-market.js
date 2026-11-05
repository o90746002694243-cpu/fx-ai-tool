'use strict';
const {normalizeCandles}=require('./strategy');
const rule=require('./simple-rule');
const {loadTracker,saveTracker}=require('./trade-tracker');
const {allowedToPush,reopenCooldown,recordPush}=require('./push-guard');
const {notificationId}=require('./notification-id');
const {canStartSixHourTrade}=require('./weekend-guard');
const PAIRS=['USD/JPY','AUD/JPY','NZD/JPY','CAD/JPY','EUR/JPY'];
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
async function importantEvents(){
 try{const r=await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json',{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('calendar http '+r.status); const events=await r.json();
 if(!Array.isArray(events))throw Error('calendar format');return {events,ok:true};
 }catch(e){console.warn('FX calendar unavailable; suppress push:',String(e));return {events:[],ok:false};}
}
function eventNearby(events,pair,now=Date.now()){
 const countries={USD:'USD',JPY:'JPY',AUD:'AUD',NZD:'NZD',CAD:'CAD',EUR:'EUR'};
 const related=pair.split('/').map(x=>countries[x]);
 return events.some(e=>{
   const c=String(e.country||'').toUpperCase();
   const code={US:'USD',JP:'JPY',EU:'EUR',AU:'AUD',NZ:'NZD',CA:'CAD'}[c]||c;
   const ts=Date.parse(e.date);
   return related.includes(code)&&['Medium','High'].includes(e.impact)&&Number.isFinite(ts)&&ts-now>=-30*60000&&ts-now<=60*60000;
 });
}
exports.handler=async function(event){
 if(!require('./fx-market-hours').isFxMarketOpen())return {statusCode:200,headers,body:JSON.stringify({ok:true,skipped:true,reason:'fx-market-closed'})};
 const {store,tracker}=await loadTracker(event);
 if(!store)return {statusCode:503,headers,body:JSON.stringify({ok:false,error:'保存先を利用できないため検証と通知を停止'})};
 const apiKey=process.env.TWELVE_DATA_API_KEY;
 if(!apiKey)return {statusCode:503,headers,body:JSON.stringify({ok:false,error:'TWELVE_DATA_API_KEY 未設定'})};
 const calendar=await importantEvents();const results=[],errors=[];
 for(const pair of PAIRS){
  try{
   const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=15min&outputsize=120&timezone=UTC&apikey=${apiKey}`;
   const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
   const payload=await response.json();
   if(!response.ok||!Array.isArray(payload.values))throw Error(String(payload.message||'相場データ取得失敗'));
   const candles=normalizeCandles(payload.values);
   if(candles.length<22)throw Error('確定足が不足');
   const latest=candles.at(-1),now=Date.now(),stale=now-latest.endTime>30*60000;
   // Evaluate historical open positions first. No fresh data -> never settle or record.
   if(!stale)rule.settle(tracker,pair,candles,now);
   const analysis=rule.decide(candles,pair);
   const duplicate=rule.init(tracker).open.some(s=>s.pair===pair);
   const recordable=!stale&&latest.endTime<=now&&canStartSixHourTrade();
   const recorded=recordable?rule.record(tracker,pair,analysis):false;
   if(!await saveTracker(store,tracker))throw Error('検証履歴の保存失敗');
   const summary=rule.summary(tracker,pair);
   const log=await store.get('push-alert-history-v1',{type:'json'});
   const cooldown=allowedToPush(log,pair);
   const blockedEvent=eventNearby(calendar.events,pair,now);
   const reasons=[];
   if(analysis.direction==='見送り')reasons.push(analysis.reason);
   if(stale)reasons.push('価格データが古い');
   if(!recordable)reasons.push('取引時間帯外');
   if(duplicate)reasons.push('同一通貨の仮想取引が判定待ち');
   if(analysis.direction!=='見送り'&&!recorded)reasons.push('新しい検証候補を記録できない');
   if(!cooldown.allowed)reasons.push(cooldown.reason);
   if(reopenCooldown())reasons.push('週明け90分');
   if(!calendar.ok)reasons.push('経済指標情報を取得できない');
   if(blockedEvent)reasons.push('重要経済指標の前後');
   if(!process.env.ONESIGNAL_API_KEY)reasons.push('OneSignalキー未設定');
   const shouldNotify=analysis.direction!=='見送り'&&!reasons.length;
   let notificationSent=false,notificationErrorText=null;
   if(shouldNotify){
    try{
     const body={app_id:process.env.ONESIGNAL_APP_ID||'1e68f659-0220-4409-a00d-fd9905b529db',
       idempotency_key:notificationId(rule.VERSION,pair,analysis.direction,latest.datetime),
       target_channel:'push',include_subscription_ids:['f7a8344c-34f9-44f8-8bb5-03f97a2fd645','92a734ef-c592-4c77-b214-942cf28ce03a'],
       headings:{en:'FX AI Tool'},contents:{en:[`${pair} ${analysis.direction}（シンプル15分足）`,
         `エントリー：${analysis.entryPrice.toFixed(3)}`,`利確：${analysis.takeProfit.toFixed(3)}`,
         `損切り：${analysis.stopLoss.toFixed(3)}`,'スプレッド控除後 RR 1:1.5',
         `新方式の実測勝率：${summary.winRate===null?'未検証':summary.winRate+'%'}（${summary.completed}件）`].join('\n')},
       web_url:'https://lively-salmiakki-ff3953.netlify.app/'};
     const r=await fetch('https://api.onesignal.com/notifications',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Key '+process.env.ONESIGNAL_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
     const responseBody=await r.json();
     if(!r.ok||!responseBody?.id||!(Number(responseBody.recipients)>0)||responseBody.errors)throw Error('OneSignal送信未受理: '+JSON.stringify(responseBody));
     notificationSent=true;
     try { await store.setJSON('push-alert-history-v1',recordPush(log,pair)); }
     catch(saveError){console.error('CRITICAL: push accepted but cooldown history not saved',pair,saveError);}
    }catch(e){notificationErrorText=String(e.message||e).slice(0,200);console.error('FX push failed',pair,notificationErrorText);}
   }
   const result={ok:true,pair,interval:'15min',strategyVersion:rule.VERSION,
    direction:analysis.direction,score:null,entryPrice:analysis.entryPrice,takeProfit:analysis.takeProfit,
    stopLoss:analysis.stopLoss,riskReward:analysis.riskReward,spreadPips:analysis.spreadPips,
    rsi:analysis.rsi,sma5:analysis.sma5,sma20:analysis.sma20,atrPips:analysis.atrPips,
    candleTime:latest.datetime,decisionAt:new Date(now).toISOString(),stale,
    notificationMode:'シンプル15分足（MA5/20 + RSI + ATR）',
    shouldNotify,notificationSent,notificationStatus:notificationSent?'送信受理':notificationErrorText?'送信失敗':'条件未達',
    notificationReason:notificationErrorText||reasons.join('／')||(notificationSent?'送信先受理':'見送り'),skipReasons:reasons,
    simpleStats:summary,recorded,actualWinRate:summary.completed?`${summary.winRate}%（${summary.completed}件）`:'未検証（0件）',
    pendingCount:summary.pending,paperTrade:summary.paperTrade,
    shadowRecordCounts:{settledTotal:summary.completed,pending:summary.pending,retainedHistory:summary.history},
    diagnostic:{pushAttempted:shouldNotify,pushAccepted:notificationSent,candleTime:latest.datetime},
    checkedAt:new Date().toISOString()};
   await store.setJSON('market-'+pair.replace('/','-'),result);
   await store.delete('market-error-'+pair.replace('/','-'));
   results.push(result);
  }catch(e){const error=String(e.message||e).replace(/apikey=[^&\s]+/gi,'apikey=[REDACTED]').slice(0,250);
   console.error('FX pair error:',pair,error);errors.push({pair,error});
   try{await store.setJSON('market-error-'+pair.replace('/','-'),{pair,error,checkedAt:new Date().toISOString()});}catch(_){}
  }
 }
 return {statusCode:errors.length===PAIRS.length?503:200,headers,body:JSON.stringify({ok:errors.length===0,results,errors,strategyVersion:rule.VERSION})};
};
