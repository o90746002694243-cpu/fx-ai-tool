exports.handler = async function () {
  try {
    const pair = "AUD/JPY";
    const interval = "15min";

    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      throw new Error("TWELVE_DATA_API_KEY が設定されていません。");
    }

    const url =
      https://api.twelvedata.com/time_series +
      ?symbol=${pair} +
      &interval=${interval} +
      &outputsize=50 +
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

    if (values.length === 0) {
      throw new Error("相場データがありません。");
    }

    const latest = values[0];

    const currentPrice =
      Number(latest.close);

    console.log("FX market data:", {
      pair,
      interval,
      currentPrice
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
        currentPrice,
        candles: values.length
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
