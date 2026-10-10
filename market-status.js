// Read-only status: opening the page never sends a new push or fetches market history.
const { loadTracker } = require("./trade-tracker");
exports.handler = async event => {
  const headers = {"Content-Type":"application/json", "Cache-Control":"no-store"};
  const {store} = await loadTracker(event);
  if (!store) return {statusCode:503,headers,body:JSON.stringify({ok:false,error:"監視状況を読み込めません。"})};
  try {
    const pairs = ["USD/JPY","AUD/JPY","NZD/JPY","CAD/JPY","EUR/JPY"];
    const results = await Promise.all(pairs.map(pair=>store.get("market-"+pair.replace("/","-"),{type:"json"})));
    return {statusCode:200,headers,body:JSON.stringify({ok:true,results:results.filter(Boolean)})};
  } catch(error) {
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:"監視状況の取得に失敗しました。"})};
  }
};
