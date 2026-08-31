exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: "ok"
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method Not Allowed"
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const {
      image,
      pair = "不明",
      price = "不明",
      timeframe = "不明",
      risk = "medium"
    } = body;

    if (!image) {
      return jsonResponse(400, {
        error: "チャート画像がありません。"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return jsonResponse(500, {
        error: "OPENAI_API_KEY が設定されていません。"
      });
    }

    const prompt = `
あなたはFXチャート分析アシスタントです。
添付されたチャート画像を最優先で読み取り、短期トレード向けに分析してください。

重要:
- 通貨ペア、現在価格、時間足は、まず画像内の表示から読み取ってください。
- 入力値 pair / price / timeframe は補助情報です。画像の表示が読めるなら画像を優先してください。
- 画像で確認できない項目だけ "不明" にしてください。
- 現在価格はチャート右端の現在値、価格ラベル、最新ローソク足付近の数値を優先してください。
- 時間足は 1分足、5分足、15分足、1時間足、4時間足、日足 などの表示から判断してください。
- 通貨ペアは AUD/JPY、NZD/JPY、CAD/JPY、USD/JPY、EUR/JPY など画像内の銘柄名から判断してください。
- 読み取れない情報を勝手に作らないでください。

分析ルール:
- ローソク足、移動平均線、直近高値安値、サポート、レジスタンス、勢いを重視してください。
- 方向は "買い" / "売り" / "見送り" のどれかにしてください。
- エントリー、利確、損切り、買い待ち価格、売り待ち価格は、可能なら具体的価格で返してください。
- 買いなら原則「損切り < エントリー < 利確」。
- 売りなら原則「利確 < エントリー < 損切り」。
- 判断根拠が弱い場合は無理に売買を勧めず "見送り" にしてください。
- score は 0〜100 の整数。
- risk は "low" / "medium" / "high" のいずれかにしてください。
- triggerReason は「どの価格を超えたら/割れたら発動するか」を短くわかりやすく書いてください。
- reason は日本語で2〜5文程度にまとめてください。

補助入力:
- pair: ${pair}
- price: ${price}
- timeframe: ${timeframe}
- economic risk: ${risk}
`;

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        pair: {
          type: "string"
        },
        price: {
          type: "string"
        },
        timeframe: {
          type: "string"
        },
        direction: {
          type: "string",
          enum: ["買い", "売り", "見送り"]
        },
        trend: {
          type: "string"
        },
        score: {
          type: "number"
        },
        entry: {
          type: "string"
        },
        takeProfit: {
          type: "string"
        },
        stopLoss: {
          type: "string"
        },
        buyTrigger: {
          type: "string"
        },
        sellTrigger: {
          type: "string"
        },
        triggerReason: {
          type: "string"
        },
        support: {
          type: "string"
        },
        resistance: {
          type: "string"
        },
        reason: {
          type: "string"
        },
        risk: {
          type: "string",
          enum: ["low", "medium", "high"]
        }
      },
      required: [
        "pair",
        "price",
        "timeframe",
        "direction",
        "trend",
        "score",
        "entry",
        "takeProfit",
        "stopLoss",
        "buyTrigger",
        "sellTrigger",
        "triggerReason",
        "support",
        "resistance",
        "reason",
        "risk"
      ]
    };

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "あなたはFXチャート分析アシスタントです。画像からトレンド、現在価格、サポート、レジスタンスを分析し、必ずJSONで返してください。entry、takeProfit、stopLossは必ず数値で返してください。見送り判定の場合でも、条件成立時に使う参考値としてentry、takeProfit、stopLossを必ず数値で設定してください。riskRewardも必ず数値で返してください。"
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt
                },
                {
                  type: "input_image",
                  image_url: image
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "fx_chart_analysis",
              schema: schema,
              strict: true
            }
          }
        })
      }
    );

    const result =
      await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error(result);

      return jsonResponse(500, {
        error:
          result.error?.message ||
          "OpenAI API エラー"
      });
    }

    const text =
      extractOutputText(result);

    if (!text) {
      console.error(result);

      return jsonResponse(500, {
        error:
          "AIの返答を読み取れませんでした。"
      });
    }

    let analysis;

    try {
      const cleanText =
        text
          .replace(/```json|```/g, "")
          .trim();

      analysis =
        JSON.parse(cleanText);

    } catch (parseError) {
      console.error(
        "JSON parse error:",
        parseError,
        text
      );

      return jsonResponse(500, {
        error:
          "AIの返答JSONを解析できませんでした。"
      });
    }

    return jsonResponse(200, {
      success: true,
      analysis
    });

  } catch (error) {
    console.error(error);

    return jsonResponse(500, {
      error:
        error.message ||
        "サーバーエラー"
    });
  }
};

function extractOutputText(result) {
  if (
    typeof result.output_text === "string" &&
    result.output_text.trim()
  ) {
    return result.output_text.trim();
  }

  if (Array.isArray(result.output)) {
    for (const item of result.output) {
      if (!Array.isArray(item.content)) {
        continue;
      }

      for (const part of item.content) {
        if (
          typeof part.text === "string" &&
          part.text.trim()
        ) {
          return part.text.trim();
        }
      }
    }
  }

  return "";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS"
  };
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      "Content-Type":
        "application/json"
    },
    body:
      JSON.stringify(data)
  };
}
