// Read-only status: opening the page never sends a new push or fetches market history.
const { loadTracker, formatActualWinRate } = require("./trade-tracker");
exports.handler = async event => {
  const headers = {"Content-Type":"application/json", "Cache-Control":"no-store"};
  const {store, tracker} = await loadTracker(event);
  if (!store) return {statusCode:503,headers,body:JSON.stringify({ok:false,error:"監視状況を読み込めません。"})};
  try {
    const pairs = ["USD/JPY","AUD/JPY","NZD/JPY","CAD/JPY","EUR/JPY"];
    const results = await Promise.all(pairs.map(pair=>store.get("market-"+pair.replace("/","-"),{type:"json"})));
    const current = results.filter(Boolean).map(result => ({
      ...result,
      // Read the authoritative tracker, rather than a cached market snapshot.
      actualWinRate: formatActualWinRate(tracker, result.pair),
      pendingCount: tracker.openSignals.filter(s => s.pair === result.pair).length,
      pendingSince: tracker.openSignals.find(s => s.pair === result.pair)?.createdAt || null,
      strategyStats: tracker.strategyStats?.[result.strategyVersion]?.[result.pair] || null
    }));
    return {statusCode:200,headers,body:JSON.stringify({ok:true,results:current})};
  } catch(error) {
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:"監視状況の取得に失敗しました。"})};
  }
};
