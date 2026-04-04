import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PLATFORM_MODEL = process.env.OPENAI_MODEL_PLATFORM || "gpt-4o-mini";
const SALES_MODEL = process.env.OPENAI_MODEL_SALES || "gpt-4o-mini";

/* =============================
   Stripe 方案（你的訂閱）
============================= */

const STRIPE_LINKS = {
  starter:
    process.env.PLATFORM_STARTER_LINK ||
    "https://buy.stripe.com/dRm4gs7E73W7fJ8eQz0kE0f",
  growth:
    process.env.PLATFORM_GROWTH_LINK ||
    "https://buy.stripe.com/3cI14ge2v8cn54uaAj0kE0g",
  elite:
    process.env.PLATFORM_ELITE_LINK ||
    "https://buy.stripe.com/4gM9AMf6zdwHbsSbEn0kE0h"
};

const PLAN_META = {
  starter: {
    name: "Starter",
    label: "月訂閱",
    price: "$1280",
    cycle: "/ month",
    summary: "適合個人品牌、小型商家、剛開始導入 AI 自動成交的人",
    highlights: ["AI 自動回覆", "自動推付款", "基礎追單", "快速開始"]
  },
  growth: {
    name: "Growth",
    label: "季訂閱",
    price: "$3000",
    cycle: "/ 3 months",
    summary: "主推方案，適合想穩定成交、穩定放大、真正把系統跑起來的商家",
    highlights: ["高成交追單", "多語言銷售", "更穩定放大", "最多人選"]
  },
  elite: {
    name: "Elite",
    label: "年訂閱",
    price: "$10000",
    cycle: "/ year",
    summary: "適合高價值品牌、團隊、多渠道經營與長期擴張",
    highlights: ["完整 AI 成交流程", "品牌級運營", "高價值客戶策略", "企業級使用"]
  }
};

/* =============================
   工具
============================= */

function includesAny(text = "", list = []) {
  const raw = String(text || "").toLowerCase();
  return list.some((item) => raw.includes(String(item).toLowerCase()));
}

function detectLanguage(text = "") {
  const t = String(text || "");

  if (/[\u0E00-\u0E7F]/.test(t)) return "th";
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[a-zA-Z]/.test(t)) return "en";
  return "zh";
}

function getPlanLink(plan = "growth") {
  return STRIPE_LINKS[plan] || STRIPE_LINKS.growth;
}

function getPlanMeta(plan = "growth") {
  return PLAN_META[plan] || PLAN_META.growth;
}

function buildPlanPitch(plan = "growth") {
  const meta = getPlanMeta(plan);
  return `${meta.name}（${meta.label} ${meta.price}${meta.cycle}）`;
}

function buildCheckoutLine(plan = "growth") {
  return `${buildPlanPitch(plan)}\n${getPlanLink(plan)}`;
}

/* =============================
   平台版分析
============================= */

export function analyzePlatformUser(message = "") {
  const text = String(message || "").toLowerCase();

  let intent = "normal";
  let level = "low";
  let recommendedPlan = "growth";

  const pricingWords = [
    "多少", "價格", "價錢", "費用", "方案", "price", "pricing", "cost", "how much", "多少錢"
  ];

  const infoWords = [
    "怎麼用", "如何", "怎麼開始", "功能", "做什麼", "適合我嗎", "差別", "what does it do", "how it works"
  ];

  const buyWords = [
    "我要", "可以開始", "想訂閱", "訂閱", "付款", "下單", "buy", "subscribe", "checkout", "start now", "成交", "自動"
  ];

  const enterpriseWords = [
    "團隊", "公司", "企業", "多人", "大量", "品牌", "team", "company", "enterprise", "agency"
  ];

  const beginnerWords = [
    "先試", "測試", "剛開始", "個人", "小店", "small", "beginner", "start small"
  ];

  if (includesAny(text, pricingWords)) {
    intent = "pricing";
    level = "medium";
  }

  if (includesAny(text, infoWords)) {
    intent = "info";
  }

  if (includesAny(text, buyWords)) {
    intent = "buy";
    level = "high";
  }

  if (includesAny(text, enterpriseWords)) {
    recommendedPlan = "elite";
    if (level !== "high") level = "high";
  } else if (includesAny(text, beginnerWords)) {
    recommendedPlan = "starter";
    if (level === "low") level = "medium";
  } else if (intent === "buy" || intent === "pricing") {
    recommendedPlan = "growth";
  }

  return {
    intent,
    level,
    language: detectLanguage(message),
    recommendedPlan
  };
}

export function recommendPlan(analysisOrLevel) {
  if (typeof analysisOrLevel === "string") {
    if (analysisOrLevel === "high") return "growth";
    if (analysisOrLevel === "medium") return "starter";
    return "growth";
  }

  if (analysisOrLevel?.recommendedPlan) {
    return analysisOrLevel.recommendedPlan;
  }

  if (analysisOrLevel?.level === "high") return "growth";
  if (analysisOrLevel?.level === "medium") return "starter";
  return "growth";
}

function getFallbackReply(message = "", analysis = {}) {
  const plan = recommendPlan(analysis);

  if (analysis.intent === "pricing") {
    return `可以，我先直接跟你說最適合你的方向。通常會先從 ${buildPlanPitch(plan)} 開始，這樣最容易把 AI 自動成交真的跑起來。\n\n${buildCheckoutLine(plan)}`;
  }

  if (analysis.intent === "buy") {
    return `你這種情況我會比較建議直接用 ${buildPlanPitch(plan)}，因為它比較適合真正要開始導入 AI 自動成交的人。\n\n${buildCheckoutLine(plan)}`;
  }

  return `這套系統主要是幫你自動回覆、分析客戶、推付款、追單，重點不是看起來很炫，而是它真的能幫你把對話變成收入。你如果要，我可以直接幫你推薦最適合你的方案。`;
}

export async function generatePlatformReply(message) {
  const analysis = analyzePlatformUser(message);
  const plan = recommendPlan(analysis);
  const meta = getPlanMeta(plan);

  const systemPrompt = `
你是一個頂級 AI SaaS 成交專家。

你的任務：
幫用戶理解「AI 自動成交系統」並自然引導他訂閱。

產品定位：
這是一套會幫商家自動回覆、自動分析、自動推付款、自動追單的 AI 銷售平台。
重點不是技術炫耀，而是幫客戶更快成交、更穩定賺錢。

方案資訊：
1. Starter（月訂閱）$1280
2. Growth（季訂閱）$3000，主推方案
3. Elite（年訂閱）$10000，企業級方案

回覆規則：
1. 語氣像真人、高級顧問，不要像客服
2. 每次 2 到 5 句
3. 不要太硬推，但要有成交力
4. 不要過度講技術
5. 要讓人感覺「這東西能幫我賺錢」
6. 如果對方問價格 / 方案 / 怎麼開始，代表接近成交
7. 如果適合，直接推薦方案並說明原因
8. 如果已接近成交，可自然引導到付款連結
9. 回覆語言跟用戶一致
`;

  const userPrompt = `
用戶訊息：
${message}

分析結果：
- intent: ${analysis.intent}
- level: ${analysis.level}
- language: ${analysis.language}
- recommendedPlan: ${plan}

請直接寫出要回給客戶的內容。
`;

  try {
    const completion = await openai.chat.completions.create({
      model: PLATFORM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    let reply = String(completion.choices?.[0]?.message?.content || "").trim();

    if (!reply) {
      reply = getFallbackReply(message, analysis);
    }

    if (
      analysis.level === "high" ||
      analysis.intent === "pricing" ||
      analysis.intent === "buy"
    ) {
      reply += `\n\n我會比較建議你先從 ${buildPlanPitch(plan)} 開始，因為這個方案最適合你現在的階段。`;
      reply += `\n${buildCheckoutLine(plan)}`;
    }

    return {
      reply,
      plan,
      analysis,
      checkoutLink: getPlanLink(plan),
      planMeta: meta
    };
  } catch {
    return {
      reply: getFallbackReply(message, analysis),
      plan,
      analysis,
      checkoutLink: getPlanLink(plan),
      planMeta: meta
    };
  }
}

export function shouldOfferPlatformCheckout(message = "") {
  const analysis = analyzePlatformUser(message);
  return (
    analysis.intent === "pricing" ||
    analysis.intent === "buy" ||
    analysis.level === "high"
  );
}

/* =============================
   老闆商品成交 AI 強化版
============================= */

export async function analyzeCustomer(message = "") {
  const fallback = {
    level: "興趣",
    emotion: "好奇",
    intent: "其他",
    money: "中",
    urgency: "中",
    trust: "低",
    language: detectLanguage(message)
  };

  try {
    const completion = await openai.chat.completions.create({
      model: SALES_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
你是頂級銷售分析 AI。

你要分析客戶目前的狀態。
只回傳 JSON，格式固定：

{
  "level": "冷客/興趣/猶豫/成交",
  "emotion": "焦慮/難過/好奇/急迫/冷靜",
  "intent": "感情/財運/詢價/售後/其他",
  "money": "低/中/高",
  "urgency": "低/中/高",
  "trust": "低/中/高",
  "language": "zh/en/th"
}
`
        },
        {
          role: "user",
          content: `客戶訊息：${message}`
        }
      ]
    });

    const raw = String(completion.choices?.[0]?.message?.content || "").trim();
    const parsed = JSON.parse(raw);

    return {
      level: parsed.level || fallback.level,
      emotion: parsed.emotion || fallback.emotion,
      intent: parsed.intent || fallback.intent,
      money: parsed.money || fallback.money,
      urgency: parsed.urgency || fallback.urgency,
      trust: parsed.trust || fallback.trust,
      language: parsed.language || fallback.language
    };
  } catch {
    return fallback;
  }
}

function buildOwnerPrompt(analysis = {}, memory = {}, ownerSettings = {}) {
  const productName = ownerSettings?.product_name || "你的方案";
  const productPrice = ownerSettings?.product_price
    ? `$${ownerSettings.product_price}`
    : "未設定";
  const businessName = ownerSettings?.business_name || "你的品牌";
  const toneStyle = ownerSettings?.tone_style || "closing";
  const brandStyle = ownerSettings?.brand_style || "專業、可信、自然";
  const customPrompt = ownerSettings?.custom_prompt || "";

  return `
你現在是 ${businessName} 的高成交銷售顧問。

商品：
- 名稱：${productName}
- 價格：${productPrice}
- 品牌風格：${brandStyle}
- 話術風格：${toneStyle}

客戶狀態：
- level: ${analysis.level || "興趣"}
- emotion: ${analysis.emotion || "好奇"}
- intent: ${analysis.intent || "其他"}
- money: ${analysis.money || "中"}
- urgency: ${analysis.urgency || "中"}
- trust: ${analysis.trust || "低"}
- language: ${analysis.language || "zh"}

客戶記憶：
${memory?.last_message ? `上次訊息：${memory.last_message}` : "第一次對話"}

規則：
1. 像真人，不像客服
2. 每次 1 到 3 句
3. 先理解，再引導，再成交
4. 不要過度硬推
5. 如果客戶已經在問價格、流程、怎麼做，可自然收斂到成交
6. 用客戶語言回答
7. 不要條列
8. 不要說自己是 AI

額外規則：
${customPrompt || "無"}
`;
}

export async function generateReply(
  message,
  analysis = {},
  memory = {},
  ownerSettings = {}
) {
  const fallbackProductName = ownerSettings?.product_name || "你的方案";
  const fallbackProductPrice = ownerSettings?.product_price
    ? `（$${ownerSettings.product_price}）`
    : "";

  try {
    const completion = await openai.chat.completions.create({
      model: SALES_MODEL,
      messages: [
        {
          role: "system",
          content: buildOwnerPrompt(analysis, memory, ownerSettings)
        },
        {
          role: "user",
          content: `客戶最新訊息：${message}`
        }
      ]
    });

    const reply = String(completion.choices?.[0]?.message?.content || "").trim();

    if (reply) return reply;

    return `我大概知道你的需求了，這個方向其實可以直接往下做。你如果要，我可以幫你看最適合你的 ${fallbackProductName}${fallbackProductPrice}。`;
  } catch {
    return `我大概知道你的需求了，這個方向其實可以直接往下做。你如果要，我可以幫你看最適合你的 ${fallbackProductName}${fallbackProductPrice}。`;
  }
}

export function shouldOfferPayment(message = "", analysis = {}, ownerSettings = {}) {
  const text = String(message || "").toLowerCase();

  if (ownerSettings?.auto_payment_push === false) return false;

  if (
    analysis?.level === "成交" ||
    analysis?.intent === "詢價" ||
    analysis?.urgency === "高"
  ) {
    return true;
  }

  return includesAny(text, [
    "多少錢",
    "價格",
    "價錢",
    "方案",
    "付款",
    "下單",
    "怎麼開始",
    "price",
    "buy",
    "payment",
    "checkout",
    "how much",
    "start"
  ]);
}