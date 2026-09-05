exports.handler = async function () {
  try {
    const pair = "AUD/JPY";
    const interval = "15min";
    const targetScore = 80;

    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      throw new Error(
        "TWELVE_DATA_API_KEY が設定されていません。"
      );
    }

    const url =
      "https://api.twelvedata.com/time_series" +
      ?symbol=${pair} +
      &interval=${interval} +
      "&outputsize=50" +
      `&apikey=${apiKey}`;

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
  .map(c => c.high - c.low);

const averageRange =
  recentRanges.reduce((sum, value) => sum + value, 0) /
  recentRanges.length;

let takeProfit = currentPrice;
let stopLoss = currentPrice;

if (direction === "買い") {
  stopLoss = Math.min(
    currentPrice - averageRange,
    support - averageRange * 0.2
  );

  takeProfit =
    currentPrice +
    (currentPrice - stopLoss) * 1.5;
}

if (direction === "売り") {
  stopLoss = Math.max(
    currentPrice + averageRange,
    resistance + averageRange * 0.2
  );

  takeProfit =
    currentPrice -
    (stopLoss - currentPrice) * 1.5;
}

const riskReward =
  direction === "見送り"
    ? 0
    : Math.abs(takeProfit - entryPrice) /
      Math.abs(entryPrice - stopLoss);
    
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

    return {
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
