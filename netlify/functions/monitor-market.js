exports.handler = async function () {
  try {
    const now = new Date().toISOString();

    console.log("FX market monitor started:", now);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: true,
        message: "FX market monitor is ready",
        checkedAt: now,
        targetWinRate: 80
      })
    };

  } catch (error) {
    console.error("monitor-market error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
