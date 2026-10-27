const { evaluate, normalizeCandles, aggregate, backtest, STRATEGY_VERSION } = require("./strategy");
const {
  loadTracker,
  settlePairSignals,
  hasOpenSignal,
  addSignal,
  formatActualWinRate,
  saveTracker
} = require("./trade-tracker");

const { qualifies, estimateProbability, provisional60Gate, settleCandidates, trackCandidate } = require("./probability");
const {explainShadow, settleShadows, shadowSummary} = require("./shadow-tracker");
const { notificationId } = require("./notification-id");
const { canStartSixHourTrade } = require("./weekend-guard");
const { reopenCooldown, allowedToPush, recordPush } = require("./push-guard");
const { isJstQuietHours } = require("./quiet-hours");
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
      return {statusCode:200, headers:{"Content-Type":"application/json; charset=utf-8"},
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
    const targetScore = 70; // provisional 60-index starts at 70 score, not the old 90 threshold
    const results = [];

    const pairErrors = [];
    for (const [pairIndex, pair] of pairsToCheck.entries()) {
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
    // Five-minute candles are reference-only. Failure never prevents 15-minute analysis.
    let fiveMinuteBars = [];
    let m5Status = "未取得";
    let m5Error = null;
    try {
      // One optional M5 request per run: five M15 + one M5 <= 8 credits/min.
      // Cycle through pairs each 15-minute slot; all M15 pairs remain checked.
      const slot = Math.floor(Date.now() / (15 * 60 * 1000));
      if (pairIndex !== slot % pairs.length) {
        m5Status = "API節約のため計画的に省略";
      } else {
      const fiveMinUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=5min&outputsize=35&timezone=UTC&apikey=${apiKey}`;
      const fiveResponse = await fetch(fiveMinUrl, {signal: AbortSignal.timeout(8000)});
      const fiveData = await fiveResponse.json();
      if (fiveResponse.ok && fiveData.status !== "error" && Array.isArray(fiveData.values)) {
        const bucket = new Map();
        for (const bar of fiveData.values) {
          const ms = Date.parse(String(bar.datetime).replace(" ", "T") + "Z");
          const endTime = ms + 5 * 60 * 1000;
          const close = Number(bar.close);
          if (Number.isFinite(ms) && endTime <= Date.now() && Number.isFinite(close) && close > 0) {
            bucket.set(ms, {time: ms, endTime, close});
          }
        }
        fiveMinuteBars = [...bucket.values()].sort((a,b)=>a.time-b.time);
        m5Status = fiveMinuteBars.length ? "取得成功" : "有効な確定M5足なし";
      } else {
        m5Status = "取得失敗";
        m5Error = String(fiveData.message || `HTTP ${fiveResponse.status}`).slice(0, 180);
      }
      }
    } catch (err) {
      m5Status = "取得失敗";
      m5Error = String(err.message || err).slice(0, 180);
      console.warn("Optional M5 reference fetch failure:", m5Error);
    }
    const analysis = evaluate(candles, {m5: fiveMinuteBars, h1: aggregate(candles, 1), h4: aggregate(candles, 4)}, pair);
    const { currentPrice, direction, score, entryPrice, takeProfit, stopLoss, riskReward,
      sma5, sma20, rsi, support, resistance, isRsiExtreme, isSharpMove, higherTimeframes } = analysis;
    settlePairSignals(tracker, pair, candles);
    settleCandidates(tracker, pair, candles);
    const previousShadowHistoryLength = Array.isArray(tracker.shadowHistory) ? tracker.shadowHistory.length : 0;
    settleShadows(tracker, pair, candles);
    for (const settled of (tracker.shadowHistory || []).slice(previousShadowHistoryLength)) {
      console.log("FX shadow settlement:", JSON.stringify({pair:settled.pair, direction:settled.direction, entryAt:settled.entryAt, createdAt:settled.createdAt, entryPrice:settled.entryPrice, takeProfit:settled.takeProfit, stopLoss:settled.stopLoss, result:settled.result, settledAt:settled.settledAt, expiryAt:settled.expiryAt, outcomeCandleEndTime:settled.outcomeCandleEndTime, exitReferencePrice:settled.exitReferencePrice, grossPips:settled.grossPips}));
    }
    const probability = estimateProbability(tracker, pair, analysis);
    const candidateEligible = qualifies(analysis);
    const provisional = provisional60Gate(analysis, probability);
    // Never create hypothetical trades from stale feeds: they would pollute measured rates.
    const candleAgeSeconds = Math.round((Date.now() - latest.endTime) / 1000);
    const stale = candleAgeSeconds > 30 * 60;
    console.log("FX feed diagnostic:", JSON.stringify({pair, interval, candleTime: latest.datetime, candleEndTimeUtc: new Date(latest.endTime).toISOString(), checkedAtUtc: new Date().toISOString(), candleAgeSeconds, stale, m5Status, m5Error, m5Bars: fiveMinuteBars.length}));
    if (!stale && latest.endTime <= Date.now() + 60 * 1000) {
      if (canStartSixHourTrade()) trackCandidate(tracker, pair, analysis);
    }
    // Use the provisional 60-index even with <30 samples. There is no
    // statistically calibrated probability before sufficient validation.
    const probabilityReady = probability.isValidated;
    const probabilityPassed = provisional.passes;
    const signalEligible = candidateEligible && probabilityPassed; // Single notification eligibility gate; chart AI is independent, not an override.
    const shadowDiagnostic = canStartSixHourTrade()
      ? explainShadow(tracker, pair, analysis, provisional, signalEligible, latest)
      : {recorded:false, reason:"marketSessionGuard"};
    const shadowRecorded = shadowDiagnostic.recorded;
    console.log("FX shadow diagnostic:", JSON.stringify({pair, ...shadowDiagnostic, open: (tracker.shadowOpen || []).filter(s => s.pair === pair).length}));
    const shadow = shadowSummary(tracker, pair);
    // Persist settlements before attempting a new push. A later API failure
    // must not discard completed trade results from an earlier pair.
    if (!await saveTracker(tradeStore, tracker)) {
      throw new Error("実戦結果を保存できないため通知を停止しました。");
    }
    const alreadyTracking = hasOpenSignal(tracker, pair);
    const importantEvent = findImportantEvent(importantEvents, pair);
    // Persisted alert history survives deployments and prevents sequential re-alerts
    // even when a previous signal settled quickly. Concurrent invocations still
    // rely on the deterministic OneSignal idempotency key for identical candles.
    const pushLog = tradeStore ? await tradeStore.get("push-alert-history-v1", {type:"json"}) : null;
    const pushGate = allowedToPush(pushLog, pair);
    const reopeningBlocked = reopenCooldown();
    const quietHoursBlocked = isJstQuietHours();
    const shouldNotify = !quietHoursBlocked && canStartSixHourTrade() && !reopeningBlocked && pushGate.allowed && signalEligible && !stale && !alreadyTracking && !importantEvent && Boolean(tradeStore);


        const oneSignalKey = (process.env.ONESIGNAL_API_KEY || "").trim();



     const notificationKey =
  pair.replace("/", "-") + "-" + direction;

const isDuplicate = hasOpenSignal(tracker, pair);

const actualWinRateText =
  formatActualWinRate(tracker, pair);
      
    const decisionAt = new Date().toISOString();
    let notificationSent = false;
    let notificationErrorText = null;
    const skipReasons = [];
    if (!signalEligible) {
      if (!probabilityPassed) skipReasons.push("暫定60%指数未満（" + provisional.estimatedScore + "）");
      if (score < 70) skipReasons.push("スコア不足：" + score + "点");
      if (direction === "見送り") skipReasons.push("売買方向が不明");
      if (analysis.isRsiExtreme) skipReasons.push("RSI極端値");
      if (analysis.isSharpMove) skipReasons.push("急変動");
      if (analysis.isRangeTooSmall) skipReasons.push("値幅不足");
      // ADX is a reference factor; not an automatic veto.
      if (analysis.isCandleOpposed || analysis.candleSignal === "十字線") skipReasons.push("ローソク足条件未達");
      if (!(analysis.netRewardPips > 0 && riskReward >= 1.5)) skipReasons.push("コスト控除後の利益・RR不足");

      if (!skipReasons.length) skipReasons.push("その他の通知条件未達");
    }
    if (stale) skipReasons.push("ローソク足データが古い（仮想実績も新規登録しない）");
    if (alreadyTracking) skipReasons.push("同一通貨の未決済シグナルあり");
    if (reopeningBlocked) skipReasons.push("週明け市場再開後90分の新規通知停止");
    if (quietHoursBlocked) skipReasons.push("日本時間02:00〜08:00は新規通知を停止（仮想検証・決済判定は継続）");
    if (!pushGate.allowed) skipReasons.push(pushGate.reason);
    if (importantEvent) skipReasons.push("重要経済指標の前後");
    if (!tradeStore) skipReasons.push("記録ストア利用不可");
    if (shouldNotify && !oneSignalKey) skipReasons.push("OneSignal APIキー未設定");
    if (shouldNotify && !isDuplicate && oneSignalKey) {
      try {

        const notificationResponse = await fetch(
          "https://api.onesignal.com/notifications",
          {
            method: "POST",
           headers: {
             "Content-Type": "application/json; charset=utf-8",
             "Authorization": "Key " + oneSignalKey,
           },
           body: JSON.stringify({
              app_id: "1e68f659-0220-4409-a00d-fd9905b529db",
              idempotency_key: notificationId(STRATEGY_VERSION, pair, direction, latest.datetime),
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
    "自動監視スコア（通知時）：" + score + "点\n" +
    "判定足：" + latest.datetime + "／判定時刻UTC：" + decisionAt + "\n" +
    "暫定60%指数：" + provisional.estimatedScore + "（校正済み勝率ではありません）\n" +
    "類似条件の観測勝率：" + (probability.empiricalWinRate ?? "集計前") + "%（" + probability.sampleSize + "件）\n" +
    "新ルール実績: " + actualWinRateText + "\n" +
    "過去参考: " + history.text + "\n" +
    "5分足（参考）：" + higherTimeframes.m5 + "／1時間足：" + higherTimeframes.h1 + "／4時間足：" + higherTimeframes.h4 + "\n" +
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
    m5: higherTimeframes.m5,
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
        // Save the accepted notification independently from the trade tracker.
        // If persisting this fails, the existing OneSignal idempotency key still
        // protects retries of the exact same candle; log the error for diagnosis.
        try {
          await tradeStore.setJSON("push-alert-history-v1", recordPush(pushLog, pair));
        } catch (pushLogError) {
          console.error("CRITICAL: notification accepted but push history save failed",pushLogError);
        }
        console.log("OneSignal notification accepted:", {
          pair, id: notificationResult.id, recipients: recipientCount
        });
        // Track only accepted push requests, not failed attempts.
        const added = addSignal(tracker, {
          pair, direction, entryPrice, takeProfit, stopLoss, score,
          candleTime: latest.datetime, entryAt: Date.now(),
          decisionAt, riskReward, provisionalIndex: provisional.estimatedScore,
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
      probability, provisional, shadowRecorded, shadowDiagnostic, shadow,
      shouldNotify,
      notificationSent,
      skipReasons,
      notificationErrorText,
      eligible: analysis.eligible,
      higherAligned: analysis.higherAligned,
      higherTimeframes,
      stale, candleAgeSeconds, m5Status, m5Error,
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
        "Content-Type": "application/json; charset=utf-8"
      },

      body: JSON.stringify({
        ok: true,

        pair,
        interval,

        currentPrice:
          Number(currentPrice.toFixed(3)),

        direction,

        score,
        decisionAt, candleTime:latest.datetime,
        probability,
        provisional,
        shadowRecorded, shadow,
        notificationMode: "暫定60%指数ルール（各通貨30件まで検証）",
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
        stale, candleAgeSeconds, m5Status, m5Error,
        note: "自動監視の通知判定と画像AI分析は異なる時点・異なる手法です。暫定指数は校正済み勝率ではありません。通知の最低RRは1.5（スプレッド控除後）。",

        shouldNotify,
        notificationSent,
        notificationStatus: notificationSent ? "送信受理" : notificationErrorText ? "通知送信失敗" : shouldNotify ? "送信未完了" : "条件未達",
        notificationReason: notificationErrorText || skipReasons.join("／") || (notificationSent ? "送信先が受理" : "通知送信を確認できません"),
        skipReasons,
        diagnostic: {
          candidateEligible, probabilityPassed, eligible: signalEligible,
          dataFresh: !stale, reopeningBlocked, quietHoursBlocked, pushGate, noOpenSignal: !alreadyTracking,
          noImportantEvent: !importantEvent, storageAvailable: !!tradeStore,
          pushAttempted: shouldNotify && !isDuplicate, pushAccepted: notificationSent,
          candleTime: latest.datetime, candleAgeSeconds, m5Status, m5Error, recordedAt: decisionAt
        },

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
    "Content-Type": "application/json; charset=utf-8"
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
