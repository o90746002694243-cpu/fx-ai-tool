// Read-only status: opening the page never sends a new push or fetches market history.
const { loadTracker, formatActualWinRate } = require("./trade-tracker");
exports.handler = async event => {
  const headers = {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"};
  const {store, tracker} = await loadTracker(event);
  if (!store) return {statusCode:503,headers,body:JSON.stringify({ok:false,error:"監視状況を読み込めません。"})};
  try {
    const pairs = ["USD/JPY","AUD/JPY","NZD/JPY","CAD/JPY","EUR/JPY"];
    const results = await Promise.all(pairs.map(pair=>store.get("market-"+pair.replace("/","-"),{type:"json"})));
    const errors = await Promise.all(pairs.map(pair => store.get("market-error-" + pair.replace("/", "-"), {type:"json"})));
    const current = results.filter(Boolean).map(result => ({
      ...result,
      // Read the authoritative tracker, rather than a cached market snapshot.
      actualWinRate: formatActualWinRate(tracker, result.pair),
      pendingCount: tracker.openSignals.filter(s => s.pair === result.pair).length,
      pendingSince: tracker.openSignals.find(s => s.pair === result.pair)?.createdAt || null,
      strategyStats: tracker.strategyStats?.[result.strategyVersion]?.[result.pair] || null,
      // Current paper-trade position or latest settled one; never mislabel a candidate as recorded.
      paperTrade: (tracker.shadowOpen || []).filter(s => s.pair === result.pair).slice(-1)[0] ||
        (tracker.shadowHistory || []).filter(s => s.pair === result.pair).slice(-1)[0] || null
    }));
    const latestErrors = errors.filter(Boolean).filter(error => {
      const previous = results.find(r => r && r.pair === error.pair);
      return !previous || Date.parse(error.checkedAt) >= Date.parse(previous.checkedAt);
    });
    const byPair = new Map(current.map(r => [r.pair, r]));
    const errorsByPair = new Map(latestErrors.map(e => [e.pair, e]));
    const monitoringHealth = pairs.map(pair => {
      const item = byPair.get(pair);
      const error = errorsByPair.get(pair);
      if (error) return {pair, status:"error", message:error.error, checkedAt:error.checkedAt};
      if (!item) return {pair, status:"missing", message:"監視結果が保存されていません", checkedAt:null};
      const timestamp = Date.parse(item.checkedAt);
      const stale = !Number.isFinite(timestamp) || Date.now()-timestamp>90*60*1000;
      return {pair, status:stale?"outdated":"ok", message:stale?"監視結果が90分以上更新されていません":"分析済み", checkedAt:item.checkedAt};
    });
    return {statusCode:200,headers,body:JSON.stringify({ok:true,results:current,errors:latestErrors,monitoringHealth})};
  } catch(error) {
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:"監視状況の取得に失敗しました。"})};
  }
};
