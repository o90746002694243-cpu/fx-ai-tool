// Both live monitoring and historical replay use this rule implementation.
const STRATEGY_VERSION = "mtf-v3-minrange";
const BAR_MS = 15 * 60 * 1000;
const EXPIRY_MS = 6 * 60 * 60 * 1000;
function parseTime(value) {
  return Date.parse(String(value).replace(" ", "T").replace(/Z$/, "") + "Z");
}
function normalizeCandles(values, now = Date.now()) {
  const unique = new Map();
  for (const v of values) {
    const time = parseTime(v.datetime);
    const c = { datetime: v.datetime, time, endTime: time + BAR_MS,
      open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close) };
    if (Number.isFinite(time) && time % BAR_MS === 0 && c.endTime <= now &&
        [c.open,c.high,c.low,c.close].every(n => Number.isFinite(n) && n > 0) &&
        c.high >= Math.max(c.open,c.close) && c.low <= Math.min(c.open,c.close)) unique.set(time,c);
  }
  return [...unique.values()].sort((a,b) => a.time-b.time);
}
function aggregate(candles, hours) {
  const duration = hours * 60 * 60 * 1000;
  const groups = new Map();
  for (const c of candles) {
    const key = Math.floor(c.time / duration) * duration;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups].filter(([time, list]) => list.length === duration / BAR_MS &&
    list.every((c,i) => c.time === time + i * BAR_MS)).map(([time,list]) => ({
      time, endTime: time + duration, open: list[0].open,
      close: list.at(-1).close, high: Math.max(...list.map(c=>c.high)), low: Math.min(...list.map(c=>c.low))
    }));
}
function trend(bars, asOf) {
  const closed = bars.filter(c=>c.endTime <= asOf).slice(-20);
  if (closed.length < 20 || asOf - closed.at(-1).endTime >= 4 * 60 * 60 * 1000) return "不足";
  const mean = xs=>xs.reduce((a,c)=>a+c.close,0)/xs.length;
  const short = mean(closed.slice(-5)), long = mean(closed);
  return short > long ? "買い" : short < long ? "売り" : "横ばい";
}

// 確定足でネックラインを抜けたパターンだけ検出
function detectChartPattern(candles) {
  const bars = candles.slice(-50);
  const none = {
    name: "なし",
    direction: null,
    neckline: null
  };

  if (bars.length < 12) return none;

  const last = bars.length - 1;
  const recent = bars.slice(-14);
  const averageRange = recent.reduce(
    (sum, c) => sum + c.high - c.low,
    0
  ) / recent.length;

  if (!(averageRange > 0)) return none;

  const tolerance = averageRange * 0.5;

  for (const type of ["top", "bottom"]) {
    const isTop = type === "top";
    const field = isTop ? "high" : "low";
    const pivots = [];

    // 左右2本で山・谷を確認。最新足の前に確定済みのもの
    for (let i = 2; i <= last - 3; i++) {
      const value = bars[i][field];
      const neighbours = [
        bars[i - 2][field],
        bars[i - 1][field],
        bars[i + 1][field],
        bars[i + 2][field]
      ];

      if (neighbours.every(n =>
        isTop ? value > n : value < n
      )) {
        pivots.push(i);
      }
    }

    if (pivots.length < 2) continue;

    const a = pivots.at(-2);
    const b = pivots.at(-1);

    if (b - a < 4 || b - a > 24) continue;

    if (
      Math.abs(bars[a][field] - bars[b][field]) >
      tolerance
    ) continue;

    const middle = bars.slice(a + 1, b);
    const neckline = isTop
      ? Math.min(...middle.map(c => c.low))
      : Math.max(...middle.map(c => c.high));

    const depth = isTop
      ? Math.min(bars[a].high, bars[b].high) - neckline
      : neckline - Math.max(bars[a].low, bars[b].low);

    if (depth < averageRange) continue;

    const before = bars[last - 1].close;
    const current = bars[last].close;

    const crossed = isTop
      ? before >= neckline && current < neckline
      : before <= neckline && current > neckline;

    if (!crossed) continue;

    return {
      name: isTop ? "ダブルトップ" : "ダブルボトム",
      direction: isTop ? "売り" : "買い",
      neckline
    };
  }

  return none;
}

function evaluate(candles, higher = null) {
  if (candles.length < 21) return null;
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

// 円通貨ペア用の検証設定：0.10円＝10pips
const minRange = 0.10;
const maxRange = currentPrice * 0.003;
const safeRange = Math.min(averageRange, maxRange);

const isRangeTooSmall =
  recentRanges.length < 14 ||
  safeRange < minRange;
      
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


   const chartPattern = detectChartPattern(candles);
  const asOf = latest.endTime;
  const higherTimeframes = {
    h1: trend(higher ? higher.h1 : aggregate(candles,1), asOf),
    h4: trend(higher ? higher.h4 : aggregate(candles,4), asOf)
  };
  const higherAligned = higherTimeframes.h1 === direction && higherTimeframes.h4 === direction;
  const eligible =
  score >= 90 &&
  direction !== "見送り" &&
  !isRsiExtreme &&
  !isSharpMove &&
  higherAligned &&
  safeRange > 0 &&
  !isRangeTooSmall;
   return { chartPattern, direction, score, currentPrice, entryPrice, takeProfit, stopLoss, riskReward,
    sma5, sma20, rsi, support, resistance, isRsiExtreme, isSharpMove,
    higherTimeframes, higherAligned, eligible, candleTime: latest.datetime, entryAt: asOf };
}
function outcome(signal, candle) {
  const entryAt = Number(signal.entryAt || signal.createdAt);
  if (candle.time < entryAt || candle.endTime > entryAt + EXPIRY_MS) return null;
  const buy = signal.direction === "買い";
  const tp = buy ? candle.high >= signal.takeProfit : candle.low <= signal.takeProfit;
  const sl = buy ? candle.low <= signal.stopLoss : candle.high >= signal.stopLoss;
  if (tp && sl) return "ambiguous";
  if (sl) return "losses";
  if (tp) return "wins";
  if (candle.endTime >= entryAt + EXPIRY_MS) return "expired";
  return null;
}
function summarize(stats) {
  const completed = stats.wins + stats.losses;
  // Conservative denominator: uncertain and timed-out trades cannot inflate the rate.
  const total = completed + stats.ambiguous + stats.expired;
  return {...stats, completed, total, winRate: total ? Math.round(1000*stats.wins/total)/10 : null,
    sufficient: total >= 30};
}
function formatSummary(stats) {
  const s = summarize(stats);
  return (s.winRate === null ? "検証中" : s.winRate + "%") +
    "（" + s.total + "件・" + s.wins + "勝/" + s.losses + "敗・両方到達" + s.ambiguous + "・期限切れ" + s.expired + "）" +
    (s.sufficient ? "" : "／30件未満");
}
function backtest(candles) {
  const higher = {h1: aggregate(candles,1), h4: aggregate(candles,4)};
  const stats = {wins:0,losses:0,ambiguous:0,expired:0};
  let open = null, signals = 0;
  for (let i=0;i<candles.length;i++) {
    const c = candles[i];
    if (open) {
      const result = outcome(open,c);
      if (result) {stats[result]++; open=null;}
      else if (c.endTime >= open.entryAt + EXPIRY_MS) {stats.expired++;open=null;}
    }
    if (open) continue;
    const candidate = evaluate(candles.slice(Math.max(0,i-49),i+1), higher);
    if (candidate && candidate.eligible) {open=candidate;signals++;}
  }
  return {...summarize(stats), signals, unresolved:open ? 1:0,
    strategyVersion:STRATEGY_VERSION, from:candles[0]?.datetime || null, to:candles.at(-1)?.datetime || null,
    text:formatSummary(stats),
    assumptions:"確定足終値で仮想約定。6時間以内のTP/SLを判定。両方到達・期限切れも分母に含む。スプレッド・滑り・過去の経済指標回避は未反映。実運用ではなく参考検証。"};
}
module.exports = {STRATEGY_VERSION,BAR_MS,EXPIRY_MS,normalizeCandles,aggregate,trend,evaluate,outcome,summarize,formatSummary,backtest};
