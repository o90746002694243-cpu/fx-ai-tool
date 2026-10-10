const { STRATEGY_VERSION, outcome, formatSummary } = require("./strategy");
const STORE_NAME = "fx-trade-results";
const TRACKER_KEY = "tracker";
const MIN_SAMPLE_SIZE = 30;
const EXPIRY_MS = 6 * 60 * 60 * 1000;
async function getTradeStore(event) {
  const { connectLambda, getStore } = await import("@netlify/blobs");
connectLambda(event);
  return getStore(STORE_NAME);
}

function createEmptyTracker() {
  return {
    version: 1,
    openSignals: [],
    stats: {}
  };
}

function normalizeTracker(saved) {
  const tracker =
    saved && typeof saved === "object"
      ? saved
      : createEmptyTracker();

  if (!Array.isArray(tracker.openSignals)) {
    tracker.openSignals = [];
  }

  if (!tracker.stats || typeof tracker.stats !== "object") {
    tracker.stats = {};
  }

  if (!tracker.strategyStats) tracker.strategyStats = {};
  return tracker;
}

async function loadTracker(event) {
  try {
    const store = await getTradeStore(event);

    const saved = await store.get(
      TRACKER_KEY,
      {
        type: "json"
      }
    );

    return {
      store,
      tracker: normalizeTracker(saved)
    };
  } catch (error) {
    console.error(
      "Trade tracker load error:",
      error
    );

    return {
      store: null,
      tracker: createEmptyTracker()
    };
  }
}

function getPairStats(tracker, pair) {
  if (!tracker.stats[pair]) {
    tracker.stats[pair] = {
      wins: 0,
      losses: 0,
      ambiguous: 0,
      expired: 0
    };
  }

  return tracker.stats[pair];
}

function getNewerCandles(candles, signal) {
  if (!Array.isArray(candles)) {
    return [];
  }

  const signalIndex = signal.candleTime
    ? candles.findIndex(
        candle =>
          String(candle.datetime || "") ===
          String(signal.candleTime)
      )
    : -1;

  const newerCandles =
  signalIndex >= 0
    ? candles.slice(signalIndex + 1)
    : signal.candleTime
      ? candles.filter(
          candle =>
            String(candle.datetime || "") >
            String(signal.candleTime)
        )
      : [];
  return newerCandles;
}
   
function settlePairSignals(
  tracker,
  pair,
  candles,
  now = Date.now()
) {
  const stats = getPairStats(tracker, pair);
  const remainingSignals = [];

  for (const signal of tracker.openSignals) {
    if (signal.pair !== pair) {
      remainingSignals.push(signal);
      continue;
    }

    if (signal.strategyVersion) {
  const currentStats = getStrategyStats(
    tracker,
    pair,
    signal.strategyVersion
  );
      let result = null;
      for (const candle of candles) {
        result = outcome(signal, candle);
        if (result) break;
      }
      if (!result && now - signal.entryAt >= EXPIRY_MS) result = "expired";
            if (result) {
        currentStats[result] += 1;

        const pattern = signal.chartPattern;

        if (
          pattern &&
          ["なし", "ダブルトップ", "ダブルボトム"]
            .includes(pattern.name)
        ) {
          const group = pattern.name === "なし"
            ? "なし"
            : pattern.name + (
                pattern.direction === signal.direction
                  ? "・一致"
                  : "・逆方向"
              );

          if (!tracker.patternStats) {
            tracker.patternStats = {};
          }

          if (!tracker.patternStats[signal.strategyVersion]) {
  tracker.patternStats[signal.strategyVersion] = {};
}

const versionStats =
  tracker.patternStats[signal.strategyVersion];

          if (!versionStats[pair]) {
            versionStats[pair] = {};
          }

          if (!versionStats[pair][group]) {
            versionStats[pair][group] = {
              wins: 0,
              losses: 0,
              ambiguous: 0,
              expired: 0,
              winDistanceSum: 0,
              lossDistanceSum: 0
            };
          }

          const bucket = versionStats[pair][group];
          bucket[result] += 1;

          if (result === "wins") {
            bucket.winDistanceSum += Math.abs(
              signal.takeProfit - signal.entryPrice
            );
          }

          if (result === "losses") {
            bucket.lossDistanceSum += Math.abs(
              signal.stopLoss - signal.entryPrice
            );
          }
        }
      } else {
        remainingSignals.push(signal);
      }
      continue;
    }
    const newerCandles =
      getNewerCandles(candles, signal);

    let resolved = false;

    for (const candle of newerCandles) {
      const high = Number(candle.high);
      const low = Number(candle.low);
      const takeProfit = Number(signal.takeProfit);
      const stopLoss = Number(signal.stopLoss);

      if (
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(takeProfit) ||
        !Number.isFinite(stopLoss)
      ) {
        continue;
      }

      const hitTakeProfit =
        signal.direction === "買い"
          ? high >= takeProfit
          : low <= takeProfit;

      const hitStopLoss =
        signal.direction === "買い"
          ? low <= stopLoss
          : high >= stopLoss;

      if (hitTakeProfit && hitStopLoss) {
        stats.ambiguous += 1;
        resolved = true;
        break;
      }

      if (hitTakeProfit) {
        stats.wins += 1;
        resolved = true;
        break;
      }

      if (hitStopLoss) {
        stats.losses += 1;
        resolved = true;
        break;
      }
    }

    if (resolved) {
      continue;
    }

    const age =
      now - Number(signal.createdAt || now);

   if (age >= EXPIRY_MS) {
  const lastCandle = candles[candles.length - 1];
  const finalPrice = Number(lastCandle && lastCandle.close);
  const entryPrice = Number(signal.entryPrice);

  if (
    Number.isFinite(finalPrice) &&
    Number.isFinite(entryPrice) &&
    finalPrice !== entryPrice
  ) {
    const isWin =
      signal.direction === "買い"
        ? finalPrice > entryPrice
        : finalPrice < entryPrice;

    if (isWin) {
      stats.wins += 1;
    } else {
      stats.losses += 1;
    }
  } else {
    stats.expired += 1;
  }

  continue;
}

    remainingSignals.push(signal);
  }

  tracker.openSignals = remainingSignals;
  stats.updatedAt = new Date(now).toISOString();

  return stats;
}

function hasOpenSignal(tracker, pair) {
  return tracker.openSignals.some(
    signal => signal.pair === pair
  );
}

function addSignal(tracker, signal) {
  if (hasOpenSignal(tracker, signal.pair)) {
    return false;
  }

  const entryPrice = Number(signal.entryPrice);
  const takeProfit = Number(signal.takeProfit);
  const stopLoss = Number(signal.stopLoss);

  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(takeProfit) ||
    !Number.isFinite(stopLoss)
  ) {
    return false;
  }

  tracker.openSignals.push({
    id:
      signal.pair.replace("/", "") +
      "-" +
      Date.now(),
    pair: signal.pair,
    direction: signal.direction,
    entryPrice,
    takeProfit,
    stopLoss,
    score: Number(signal.score),
    chartPattern: signal.chartPattern || null,
    candleTime: String(signal.candleTime || ""),
    strategyVersion: signal.strategyVersion,
    entryAt: Number(signal.entryAt) || Date.now(),
    createdAt: Date.now()
  });

  return true;
}
function getStrategyStats(
  tracker,
  pair,
  strategyVersion = STRATEGY_VERSION
) {
  if (!tracker.strategyStats) {
    tracker.strategyStats = {};
  }

  if (!tracker.strategyStats[strategyVersion]) {
    tracker.strategyStats[strategyVersion] = {};
  }

  const bucket =
    tracker.strategyStats[strategyVersion];

  if (!bucket[pair]) {
    bucket[pair] = {
      wins: 0,
      losses: 0,
      ambiguous: 0,
      expired: 0
    };
  }

  return bucket[pair];
}
function formatActualWinRate(tracker, pair) {
  return formatSummary(getStrategyStats(tracker,pair));
}

async function saveTracker(store, tracker) {
  if (!store) {
    return false;
  }

  try {
    await store.setJSON(
      TRACKER_KEY,
      tracker
    );

    return true;
  } catch (error) {
    console.error(
      "Trade tracker save error:",
      error
    );

    return false;
  }
}

module.exports = {
  loadTracker,
  settlePairSignals,
  hasOpenSignal,
  addSignal,
  formatActualWinRate,
  saveTracker
};


