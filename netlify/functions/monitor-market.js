const { evaluate, normalizeCandles, backtest, STRATEGY_VERSION } = require("./strategy");
const {
  loadTracker,
  settlePairSignals,
  hasOpenSignal,
  addSignal,
  formatActualWinRate,
  saveTracker
} = require("./trade-tracker");

const { qualifies, estimateProbability, settleCandidates, trackCandidate } = require("./probability");
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
    // Avoid API calls and push notifications while the FX market is closed.
    if (!require("./fx-market-hours").isFxMarketOpen()) {
      return {statusCode:200, headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ok:true,skipped:true,reason:"fx-market-closed"})};
    }

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

    const pairErrors = [];
    for (const pair of pairsToCheck) {
      try {

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
    const history = backtest(candles, pair);
    const analysis = evaluate(candles, null, pair);
    const { currentPrice, direction, score, entryPrice, takeProfit, stopLoss, riskReward,
      sma5, sma20, rsi, support, resistance, isRsiExtreme, isSharpMove, higherTimeframes } = analysis;
    settlePairSignals(tracker, pair, candles);
    settleCandidates(tracker, pair, candles);
    const probability = estimateProbability(tracker, pair, analysis);
    const candidateEligible = qualifies(analysis);
    trackCandidate(tracker, pair, analysis);
    // Transition safely: only use the 60% empirical threshold with enough
    // completed comparable hypothetical trades; otherwise retain old rules.
    const probabilityReady = probability.isValidated;
    const probabilityPassed = probabilityReady && probability.empiricalWinRate >= 60;
    const signalEligible = probabilityReady ? candidateEligible && probabilityPassed : analysis.eligible;
    // Persist settlements before attempting a new push. A later API failure
    // must not discard completed trade results from an earlier pair.
    if (!await saveTracker(tradeStore, tracker)) {
      throw new Error("実戦結果を保存できないため通知を停止しました。");
    }
    const alreadyTracking = hasOpenSignal(tracker, pair);
    const importantEvent = findImportantEvent(importantEvents, pair);
    const stale = Date.now() - latest.endTime > 30 * 60 * 1000;
    const shouldNotify = signalEligible && !stale && !alreadyTracking && !importantEvent && Boolean(tradeStore);
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
      
    let notificationSent = false;
    let notificationErrorText = null;
    const skipReasons = [];
    if (!signalEligible) skipReasons.push(probabilityReady
      ? "類似条件の実績勝率が60%未満、または安全条件未達"
      : "過去実績30件未満のため従来の90点ルールで検証中");
    if (stale) skipReasons.push("ローソク足データが古い");
    if (alreadyTracking) skipReasons.push("同一通貨の未決済シグナルあり");
    if (importantEvent) skipReasons.push("重要経済指標の前後");
    if (!tradeStore) skipReasons.push("記録ストア利用不可");
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
              idempotency_key: require("node:crypto").createHash("sha256")
                .update([STRATEGY_VERSION, pair, direction, latest.datetime].join("|"))
                .digest("hex"),
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
    "従来の分析スコア：" + score + "点\n" +
    "類似条件の実績勝率：" + (probability.empiricalWinRate ?? "検証中") + "%（" + probability.sampleSize + "件）\n" +
    "新ルール実績: " + actualWinRateText + "\n" +
    "過去参考: " + history.text + "\n" +
    "1時間足：" + higherTimeframes.h1 + "／4時間足：" + higherTimeframes.h4 + "\n" +
    "エントリー：" + entryPrice.toFixed(3) + "\n" +
    "利確：" + takeProfit.toFixed(3) + "\n" +
    "損切り：" + stopLoss.toFixed(3) + "\n" +
    "コスト控除後RR：1:" + riskReward.toFixed(2) + "（概算）\n" +
    "ATR：" + (analysis.atrPips?.toFixed(1) ?? "不足") + "pips／ADX：" + (analysis.adx?.toFixed(1) ?? "不足") + "\n" +
    "想定スプレッド：" + analysis.spreadPips + "pips"
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
        
        // HTTP 200 alone does not mean OneSignal accepted any recipients.
        const recipientCount = Number(notificationResult?.recipients);
        if (!notificationResponse.ok || notificationResult?.errors ||
            !notificationResult?.id || !(recipientCount > 0)) {
          throw new Error("OneSignal did not accept push: HTTP " +
            notificationResponse.status + " " + JSON.stringify(notificationResult));
        }
        notificationSent = true;
        console.log("OneSignal notification accepted:", {
          pair, id: notificationResult.id, recipients: recipientCount
        });
        // Track only accepted push requests, not failed attempts.
        const added = addSignal(tracker, {
          pair, direction, entryPrice, takeProfit, stopLoss, score,
          candleTime: latest.datetime, entryAt: Date.now(),
          strategyVersion: STRATEGY_VERSION,
          chartPattern: analysis.chartPattern
        });
        if (!added) console.error("Push accepted but trade signal was not recorded:", pair);
        else {
          const immediatelySaved = await saveTracker(tradeStore, tracker);
          if (!immediatelySaved) console.error("CRITICAL: Push accepted but trade record save failed:", pair);
        }
        
      } catch (notificationError) {
        notificationErrorText = String(notificationError.message || notificationError).slice(0, 250);
        console.error("OneSignal notification error:", notificationError);
      }
    }
    console.log("FX monitor result:", {
      pair,
      interval,
      currentPrice,
      direction,
      score,
      probability,
      shouldNotify,
      notificationSent,
      skipReasons,
      notificationErrorText,
      eligible: analysis.eligible,
      higherAligned: analysis.higherAligned,
      higherTimeframes,
      stale,
      alreadyTracking,
      importantEvent,
      storeAvailable: Boolean(tradeStore),
      stopWidthPips: Math.abs(entryPrice - stopLoss) / 0.01,
      rsi,
      isRsiExtreme,
      isSharpMove,
      isDuplicate,
      entryPrice,
      takeProfit,
      stopLoss,
      riskReward,
      adx: analysis.adx, atrPips:analysis.atrPips, spreadPips:analysis.spreadPips
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
        probability,
        notificationMode: probabilityReady ? "類似条件の実績60%基準（試験運用）" : "従来ルール（実績収集中）",
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
        note: probabilityReady ? "類似条件の観測勝率60%以上を採用。将来の勝率を保証しません。" : "実績が30件未満のため従来の90点ルールで通知判定。検証を継続します。",

        shouldNotify,
        notificationSent,
        notificationStatus: notificationSent ? "送信受理" : notificationErrorText ? "通知送信失敗" : shouldNotify ? "送信未完了" : "条件未達",
        notificationReason: notificationErrorText || skipReasons.join("／") || (notificationSent ? "送信先が受理" : "通知送信を確認できません"),

        entryPrice:
          Number(entryPrice.toFixed(3)),

        takeProfit:
          Number(takeProfit.toFixed(3)),

        stopLoss:
          Number(stopLoss.toFixed(3)),

        riskReward:
          Number(riskReward.toFixed(2)),
        costEstimate: {
          spreadPips: analysis.spreadPips,
          atrPips: analysis.atrPips === null ? null : Number(analysis.atrPips.toFixed(1)),
          adx: analysis.adx === null ? null : Number(analysis.adx.toFixed(1)),
          netRewardPips: Number(analysis.netRewardPips.toFixed(1)),
          netRiskPips: Number(analysis.netRiskPips.toFixed(1)),
          breakevenWinRate: Number(analysis.breakevenWinRate.toFixed(1)),
          hypotheticalExpectancyPipsAt60Pct: Number(analysis.hypotheticalExpectancyPips.toFixed(2)),
          candleSignal: analysis.candleSignal,
          warning: "スプレッドは固定仮定。勝率60%は試算条件であり実績・予測ではありません。"
        },  

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
      } catch (pairError) {
        console.error("FX pair monitor failed:", pair, pairError);
        const safeError = String(pairError.message || pairError).replace(/apikey=[^&\s]+/gi, "apikey=[REDACTED]").slice(0, 250);
        pairErrors.push({pair, error: safeError});
        if (tradeStore) {
          try { await tradeStore.setJSON("market-error-" + pair.replace("/", "-"), {
            pair, error: safeError, checkedAt: new Date().toISOString()
          }); } catch (storeError) { console.error("Could not save pair diagnostic", pair, storeError); }
        }
      }
}

if (tradeStore) {
  for (const result of results) {
    const value = JSON.parse(result.body);
    await tradeStore.setJSON("market-" + value.pair.replace("/", "-"), {
      ...value, checkedAt: new Date().toISOString()
    });
    await tradeStore.delete("market-error-" + value.pair.replace("/", "-"));
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
    results,
    pairErrors
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
