const { evaluate, normalizeCandles, backtest, STRATEGY_VERSION } = require("./strategy");
const {
  loadTracker,
  settlePairSignals,
  hasOpenSignal,
  addSignal,
  formatActualWinRate,
  saveTracker
} = require("./trade-tracker");

async function loadImportantEvents() {
  try {
    const response = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    );

    console.log("Economic calendar status:", response.status);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    const countryCodes = {
      USD: "US",
      JPY: "JP",
      EUR: "EU",
      AUD: "AU",
      NZD: "NZ",
      CAD: "CA"
    };

    return data
      .filter(
        event =>
          event.impact === "Medium" ||
          event.impact === "High"
      )
      .map(event => ({
        time: new Date(event.date)
          .toISOString()
          .replace("T", " ")
          .replace("Z", ""),
        country: countryCodes[event.country] || event.country,
        title: event.title,
        impact: event.impact
      }));
  } catch (error) {
    console.error("Economic calendar error:", error);
    return [];
  }
}

function findImportantEvent(events, pair) {
  const countryCodes = {
    USD: "US",
    JPY: "JP",
    EUR: "EU",
    AUD: "AU",
    NZD: "NZ",
    CAD: "CA"
  };

  const relatedCountries = pair
    .split("/")
    .map(currency => countryCodes[currency])
    .filter(Boolean);

  const now = Date.now();

  return events.find(event => {
    const text = String(event.time || "").replace(" ", "T");
    const eventTime = Date.parse(`${text}Z`);
    const difference = eventTime - now;

    return (
      relatedCountries.includes(String(event.country).toUpperCase()) &&
      difference >= -30 * 60 * 1000 &&
      difference <= 60 * 60 * 1000
    );
  });
}

exports.handler = async function (event) {
  try {

const {
  store: tradeStore,
  tracker
} = await loadTracker(event); 
    const importantEvents = await loadImportantEvents();
   
    const pairs = [
      
  "USD/JPY",
  "AUD/JPY",
  "NZD/JPY",
  "CAD/JPY",
  "EUR/JPY",
];
    
        const pairsToCheck = pairs;

    const interval = "15min";
    const targetScore = 90;
    const results = [];

    for (const pair of pairsToCheck) {

    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      throw new Error(
        "TWELVE_DATA_API_KEY が設定されていません。"
      );
    }

    const url =
  `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=${interval}&outputsize=5000&timezone=UTC&apikey=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();

    if (!response.ok || data.status === "error") {
      throw new Error(
        data.message ||
        "相場データの取得に失敗しました。"
      );
    }

    const values = Array.isArray(data.values)
      ? data.values
      : [];

    if (values.length < 20) {
      throw new Error(
        "分析に必要な相場データが不足しています。"
      );
    }

    const candles = normalizeCandles(values);
    if (candles.length < 21) throw new Error("確定した相場データが不足しています。");
    const latest = candles[candles.length - 1];
    const history = backtest(candles);
    const analysis = evaluate(candles);
    const { currentPrice, direction, score, entryPrice, takeProfit, stopLoss, riskReward,
      sma5, sma20, rsi, support, resistance, isRsiExtreme, isSharpMove, higherTimeframes } = analysis;
    settlePairSignals(tracker, pair, candles);
    const alreadyTracking = hasOpenSignal(tracker, pair);
    const importantEvent = findImportantEvent(importantEvents, pair);
    const stale = Date.now() - latest.endTime > 30 * 60 * 1000;
    const shouldNotify = analysis.eligible && !stale && !alreadyTracking && !importantEvent && Boolean(tradeStore);
        console.log("ENV TEST:", !!process.env.ONESIGNAL_API_KEY, "length:", process.env.ONESIGNAL_API_KEY?.length); 
        console.log("NETLIFY TEST:", process.env.NETLIFY_ENV_TEST);

        const oneSignalKey = (process.env.ONESIGNAL_API_KEY || "").trim();

console.log("OneSignal key info:", {
  exists: !!oneSignalKey,
  length: oneSignalKey.length,
  startsCorrectly: oneSignalKey.startsWith("os_v2_app_")
});

     const notificationKey =
  pair.replace("/", "-") + "-" + direction;

const isDuplicate = hasOpenSignal(tracker, pair);

const actualWinRateText =
  formatActualWinRate(tracker, pair);
      
    if (shouldNotify && !isDuplicate) {
            addSignal(tracker, {
        pair,
        direction,
        entryPrice,
        takeProfit,
        stopLoss,
        score,
        candleTime: latest.datetime,
        entryAt: Date.now(),
        strategyVersion: STRATEGY_VERSION,
        chartPattern: analysis.chartPattern
      });
      
if (shouldNotify && !isDuplicate) {
      try {
        console.log("OneSignal key check:", !!process.env.ONESIGNAL_API_KEY, "length:", process.env.ONESIGNAL_API_KEY?.length);
        const notificationResponse = await fetch(
          "https://api.onesignal.com/notifications",
          {
            method: "POST",
           headers: {
             "Content-Type": "application/json",
             "Authorization": "Key " + oneSignalKey,
           },
           body: JSON.stringify({
              app_id: "1e68f659-0220-4409-a00d-fd9905b529db",
              target_channel: "push",
              include_subscription_ids: [
  "f7a8344c-34f9-44f8-8bb5-03f97a2fd645",
  "92a734ef-c592-4c77-b214-942cf28ce03a"
],
             
              headings: {
                en: "FX AI Tool 🚨"
              },
              contents: {
  en:
    pair + " " + direction + "候補\n" +
    "判定スコア：" + score + "点\n" +
    "新ルール実績: " + actualWinRateText + "\n" +
    "過去参考: " + history.text + "\n" +
    "1時間足：" + higherTimeframes.h1 + "／4時間足：" + higherTimeframes.h4 + "\n" +
    "エントリー：" + entryPrice.toFixed(3) + "\n" +
    "利確：" + takeProfit.toFixed(3) + "\n" +
    "損切り：" + stopLoss.toFixed(3) + "\n" +
    "RR：1:" + riskReward.toFixed(2)
},
              web_url:
  "https://lively-salmiakki-ff3953.netlify.app/?" +
  new URLSearchParams({
    pair,
    direction,
    score: String(score),
    winRate: actualWinRateText,
    backtest: history.text,
    h1: higherTimeframes.h1,
    h4: higherTimeframes.h4,
    entry: entryPrice.toFixed(3),
    takeProfit: takeProfit.toFixed(3),
    stopLoss: stopLoss.toFixed(3),
    rr: riskReward.toFixed(2)
  }).toString()
            })
          }
        );

        const notificationResult =
          await notificationResponse.json();
        
        console.log(
          "OneSignal notification result:",
          notificationResult
        );
        
      } catch (notificationError) {
        console.error(
          "OneSignal notification error:",
          notificationError
        );
      }
    }
    }
    console.log("FX monitor result:", {
      pair,
      interval,
      currentPrice,
      direction,
      score,
      shouldNotify,
      rsi,
      isRsiExtreme,
      isSharpMove,
      isDuplicate,
      entryPrice,
      takeProfit,
      stopLoss,
      riskReward
    });

    results.push({
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        ok: true,

        pair,
        interval,

        currentPrice:
          Number(currentPrice.toFixed(3)),

        direction,

        score,

        targetScore,
        strategyVersion: STRATEGY_VERSION,
        actualWinRate: actualWinRateText,
        backtest: history,
        chartPattern: analysis.chartPattern,
                patternStats: [
          "なし",
          "ダブルトップ・一致",
          "ダブルトップ・逆方向",
          "ダブルボトム・一致",
          "ダブルボトム・逆方向"
        ].map(pattern => {
          const s =
            tracker.patternStats?.[STRATEGY_VERSION]
              ?.[pair]?.[pattern] || {
                wins: 0,
                losses: 0,
                ambiguous: 0,
                expired: 0,
                winDistanceSum: 0,
                lossDistanceSum: 0
              };

          const total =
            s.wins + s.losses + s.ambiguous + s.expired;

          return {
            pattern,
            ...s,
            total,
            winRate: total
              ? Math.round(1000 * s.wins / total) / 10
              : null,
            averageWinPips: s.wins
              ? Number((s.winDistanceSum / s.wins * 100).toFixed(1))
              : null,
            averageLossPips: s.losses
              ? Number((s.lossDistanceSum / s.losses * 100).toFixed(1))
              : null,
            note: "円ペアの仮想TP/SL値幅。スプレッド・滑り未反映。"
          };
        }),
        higherTimeframes,
        stale,
        note: "通知条件はスコア90以上・上位足一致等。勝率80%の保証ではありません。",

        shouldNotify,

        entryPrice:
          Number(entryPrice.toFixed(3)),

        takeProfit:
          Number(takeProfit.toFixed(3)),

        stopLoss:
          Number(stopLoss.toFixed(3)),

        riskReward:
          Number(riskReward.toFixed(2)),  

        indicators: {
           sma5:
            Number(sma5.toFixed(3)),

          sma20:
            Number(sma20.toFixed(3)),

          rsi:
            Number(rsi.toFixed(1)),

          support:
            Number(support.toFixed(3)),

          resistance:
            Number(resistance.toFixed(3))
        }
      })
    });

}

if (tradeStore) {
  for (const result of results) {
    const value = JSON.parse(result.body);
    await tradeStore.setJSON("market-" + value.pair.replace("/", "-"), {
      ...value, checkedAt: new Date().toISOString()
    });
  }
}
const tradeSaved = await saveTracker(tradeStore, tracker);
console.log("FX trade tracker status:", {
  storeAvailable: Boolean(tradeStore),
  saved: tradeSaved,
  openSignals: tracker.openSignals.length,
  stats: tracker.stats
});
    
return {
  statusCode: 200,
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    ok: true,
    results
  })
};

  } catch (error) {
    console.error(
      "monitor-market error:",
      error
    );

    return {
      statusCode: 500,
      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
