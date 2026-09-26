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
    
    const slot =
  Math.floor(Date.now() / (15 * 60 * 1000)) %
  pairs.length;

const pairsToCheck = [
  pairs[slot],
  pairs[(slot + 1) % pairs.length]
];

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
  `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=${interval}&outputsize=50&apikey=${apiKey}`;
    const response = await fetch(url);
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

    // Twelve Dataは新しい足から返すので古い順に並べ直す
    const candles = values
      .map(v => ({
        datetime: v.datetime,
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close)
      }))
      .reverse();

    const closes = candles.map(c => c.close);

    function sma(list, period) {
      const part = list.slice(-period);
      return (
        part.reduce((sum, n) => sum + n, 0) /
        part.length
      );
    }

    function calcRsi(list, period = 14) {
      const recent = list.slice(-(period + 1));

      let gains = 0;
      let losses = 0;

      for (let i = 1; i < recent.length; i++) {
        const diff = recent[i] - recent[i - 1];

        if (diff > 0) {
          gains += diff;
        } else {
          losses += Math.abs(diff);
        }
      }

      if (losses === 0) {
        return 100;
      }

      const rs =
        (gains / period) /
        (losses / period);

      return 100 - 100 / (1 + rs);
    }

    const currentPrice =
      closes[closes.length - 1];

    const previousPrice =
      closes[closes.length - 2];

    const sma5 = sma(closes, 5);
    const sma20 = sma(closes, 20);
    const rsi = calcRsi(closes);

    const latest =
      candles[candles.length - 1];

    settlePairSignals(
  tracker,
  pair,
  candles
);  

    const previous20 =
      candles.slice(-21, -1);

    const resistance =
      Math.max(...previous20.map(c => c.high));

    const support =
      Math.min(...previous20.map(c => c.low));

    let buyScore = 0;
    let sellScore = 0;

    // 短期・中期トレンド
    if (sma5 > sma20) {
      buyScore += 30;
    }

    if (sma5 < sma20) {
      sellScore += 30;
    }

    // 現在価格と短期平均
    if (currentPrice > sma5) {
      buyScore += 20;
    }

    if (currentPrice < sma5) {
      sellScore += 20;
    }

    // モメンタム
    if (currentPrice > previousPrice) {
      buyScore += 15;
    }

    if (currentPrice < previousPrice) {
      sellScore += 15;
    }

    // RSI
    if (rsi >= 50 && rsi <= 70) {
      buyScore += 20;
    }

    if (rsi >= 30 && rsi < 50) {
      sellScore += 20;
    }

    // ローソク足方向
    if (latest.close > latest.open) {
      buyScore += 15;
    }

    if (latest.close < latest.open) {
      sellScore += 15;
    }

    const direction =
      buyScore > sellScore
        ? "買い"
        : sellScore > buyScore
        ? "売り"
        : "見送り";

    const rawScore = Math.max(buyScore, sellScore);
const oppositeScore = Math.min(buyScore, sellScore);

const score = Math.max(
  0,
  Math.min(
    95,
    Math.round(
      50 + (rawScore - oppositeScore) * 0.4
    )
  )
);

    const isRsiExtreme =
  (direction === "買い" && rsi >= 65) ||
  (direction === "売り" && rsi <= 35);

const previousBodies = candles
  .slice(-6, -1)
  .map(c =>
    Math.abs(
      Number(c.close) - Number(c.open)
    )
  )
  .filter(v => Number.isFinite(v));

const averageBody =
  previousBodies.length > 0
    ? previousBodies.reduce(
        (sum, value) => sum + value,
        0
      ) / previousBodies.length
    : 0;

const latestBody = Math.abs(
  Number(latest.close) - Number(latest.open)
);

const isSharpMove =
  averageBody > 0 &&
  latestBody >= averageBody * 1.8;

const alreadyTracking =
  hasOpenSignal(tracker, pair);

 const importantEvent = findImportantEvent(importantEvents, pair);
      
const shouldNotify =
  score >= targetScore &&
  direction !== "見送り" &&
  !isRsiExtreme &&
  !isSharpMove &&
  !alreadyTracking &&
  !importantEvent;     

// ===== エントリー・利確・損切り自動計算 =====
const entryPrice = currentPrice;

const recentRanges = candles
  .slice(-14)
  .map(c => Number(c.high) - Number(c.low))
  .filter(v => Number.isFinite(v) && v > 0);

const averageRange =
  recentRanges.length > 0
    ? recentRanges.reduce((sum, value) => sum + value, 0) /
      recentRanges.length
    : 0.1;

  const maxRange = currentPrice * 0.003;
const safeRange = Math.min(averageRange, maxRange);
      
let takeProfit = currentPrice;
let stopLoss = currentPrice;

if (direction === "買い") {
  stopLoss = currentPrice - safeRange;

  takeProfit =
    currentPrice +
    safeRange * 1.5;
}

if (direction === "売り") {
  stopLoss = currentPrice + safeRange;

  takeProfit =
    currentPrice -
    safeRange * 1.5;
}

const riskReward =
  direction === "見送り"
    ? 0
    : Math.abs(takeProfit - entryPrice) /

      Math.abs(entryPrice - stopLoss);

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
        candleTime: latest.datetime
      });
      const rateMatch = /(\d+(?:\.\d+)?)%/.exec(actualWinRateText);
if (rateMatch && Number(rateMatch[1]) >= 80) {
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
              include_subscription_ids: ["f7a8344c-34f9-44f8-8bb5-03f97a2fd645"],
             
              headings: {
                en: "FX AI Tool 🚨"
              },
              contents: {
  en:
    pair + " " + direction + "候補\n" +
    "判定スコア：" + score + "点\n" +
    "実績勝率：" + actualWinRateText + "\n" +
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
