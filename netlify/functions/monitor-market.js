exports.handler = async function () {
  try {
    const pairs = [
  "USD/JPY",
  "AUD/JPY",
  "NZD/JPY",
  "CAD/JPY",
  "EUR/JPY",
];
    const interval = "15min";
    const targetScore = 80;
    const results = [];

    for (const pair of pairs) {  

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

    const score =
      Math.max(buyScore, sellScore);

    const shouldNotify =
      score >= targetScore &&
      direction !== "見送り";

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
      
    if (shouldNotify) {
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
              include_aliases: {
                onesignal_id: [
                  "705c604d-7940-4bda-a387-ee3610791d3c",
                  "f0b4df77-ade3-4e59-8c2d-d5c6cdb1702e"
                ]
              },
              headings: {
                en: "FX AI Tool 🚨"
              },
              contents: {
  en:
    pair + " " + direction + "候補\n" +
    "スコア：" + score + "%\n" +
    "エントリー：" + entryPrice.toFixed(3) + "\n" +
    "利確：" + takeProfit.toFixed(3) + "\n" +
    "損切り：" + stopLoss.toFixed(3) + "\n" +
    "RR：1:" + riskReward.toFixed(2)
},
              web_url: "https://lively-salmiakki-ff3953.netlify.app/"
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
    
    console.log("FX monitor result:", {
      pair,
      interval,
      currentPrice,
      direction,
      score,
      shouldNotify,
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
