const express = require("express");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== ENV ======
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // 如果你用 SUPABASE_SERVICE_ROLE_KEY，就改成那個
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";

// ====== BASIC CHECK ======
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}
if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_KEY");
  process.exit(1);
}

// ====== CLIENTS ======
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== HELPERS ======
function normalizeText(text = "") {
  return String(text).trim().toLowerCase();
}

function detectIntent(message = "") {
  const text = normalizeText(message);

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("多少") ||
    text.includes("價錢") ||
    text.includes("費用")
  ) {
    return "pricing";
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("付款") ||
    text.includes("已付款") ||
    text.includes("我要買") ||
    text.includes("下單")
  ) {
    return "buy";
  }

  if (
    text.includes("company") ||
    text.includes("agency") ||
    text.includes("品牌") ||
    text.includes("公司")
  ) {
    return "business";
  }

  return "general";
}

function detectLeadLevel(message = "") {
  const text = normalizeText(message);

  if (
    text.includes("company") ||
    text.includes("agency") ||
    text.includes("clients") ||
    text.includes("品牌") ||
    text.includes("公司")
  ) {
    return "vip";
  }

  if (
    text.includes("buy") ||
    text.includes("付款") ||
    text.includes("已付款") ||
    text.includes("ready")
  ) {
    return "hot";
  }

  if (
    text.includes("price") ||
    text.includes("多少") ||
    text.includes("價錢")
  ) {
    return "warm";
  }

  return "cold";
}

function buildSalesReply(message = "") {
  const text = normalizeText(message);

  const starter = process.env.STARTER_LINK || "https://your-payment-link.com/starter";
  const growth = process.env.GROWTH_LINK || "https://your-payment-link.com/growth";
  const premium = process.env.PREMIUM_LINK || "https://your-payment-link.com/premium";

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("多少") ||
    text.includes("價錢") ||
    text.includes("費用")
  ) {
    return `🔥 目前方案如下：

Starter — $99
${starter}

Growth — $299（最熱門）
${growth}

Premium — $699
${premium}

你可以直接回覆：
Starter / Growth / Premium`;
  }

  if (text.includes("starter")) {
    return `Starter — $99 ✅

適合先快速測試：
${starter}

付款後回覆：
已付款`;
  }

  if (text.includes("growth")) {
    return `Growth — $299 🚀

這是最多人選的方案：
${growth}

付款後回覆：
已付款`;
  }

  if (text.includes("premium")) {
    return `Premium — $699 💎

這是最高效版本：
${premium}

付款後回覆：
已付款`;
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("付款") ||
    text.includes("我要買") ||
    text.includes("下單")
  ) {
    return `很好，先告訴我你想選哪個方案：

Starter / Growth / Premium

如果你要我直接推薦，輸入：
price`;
  }

  if (text.includes("已付款") || text.includes("paid")) {
    return `太好了！🎉

我已記錄你的付款意願。
請直接告訴我你的需求，例如：

1. 你要用在哪個平台
2. 你要自動回覆什麼客戶
3. 你想達到什麼效果`;
  }

  return `Hi 👋

我是 AI 自動回覆助理。
你可以直接輸入：

price

我會幫你推薦最適合的方案 💰`;
}

async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
  }

  return data;
}

async function notifyAdmin(text) {
  if (!ADMIN_CHAT_ID) return;

  try {
    await sendTelegramMessage(ADMIN_CHAT_ID, text);
  } catch (error) {
    console.error("notifyAdmin error:", error.message);
  }
}

async function upsertLead(userId, lastMessage) {
  const leadLevel = detectLeadLevel(lastMessage);

  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", String(userId))
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        level: leadLevel,
        last_message: lastMessage
      })
      .eq("user_id", String(userId));

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const { error: insertError } = await supabase
    .from("leads")
    .insert({
      user_id: String(userId),
      level: leadLevel,
      package: "",
      name: "",
      industry: "",
      platform: "",
      paid: false,
      last_message: lastMessage
    });

  if (insertError) {
    throw insertError;
  }
}

async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from("messages")
    .insert({
      user_id: String(userId),
      role,
      content
    });

  if (error) {
    throw error;
  }
}

async function getRecentMessages(userId, limit = 8) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("user_id", String(userId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).reverse();
}

async function askAI(userId, message) {
  const history = await getRecentMessages(userId, 8);

  const messages = [
    {
      role: "system",
      content:
        "你是高轉換率的 AI 銷售助理。你要自然、簡潔、專業地回覆客戶。若客戶在問價格、方案、付款，優先引導對方輸入 price 或直接推薦 Starter / Growth / Premium。不要亂編技術功能，不要過度冗長。"
    },
    ...history.map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content
    })),
    {
      role: "user",
      content: message
    }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7
  });

  return response.choices?.[0]?.message?.content?.trim() || buildSalesReply(message);
}

async function getReply(userId, message) {
  const intent = detectIntent(message);

  if (intent === "pricing" || intent === "buy") {
    return buildSalesReply(message);
  }

  if (normalizeText(message).includes("已付款") || normalizeText(message).includes("paid")) {
    return buildSalesReply(message);
  }

  return askAI(userId, message);
}

// ====== ROUTES ======
app.get("/", (req, res) => {
  res.send("AI Sales Bot is running 🚀");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ai-sales-bot",
    hasOpenAI: !!OPENAI_API_KEY,
    hasTelegram: !!TELEGRAM_BOT_TOKEN,
    hasSupabaseUrl: !!SUPABASE_URL,
    hasSupabaseKey: !!SUPABASE_KEY
  });
});

app.post("/webhook/telegram", async (req, res) => {
  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = message?.text || "";

    if (!chatId || !text) {
      return res.json({ ok: true });
    }

    const userId = String(chatId);

    await upsertLead(userId, text);
    await saveMessage(userId, "user", text);

    const reply = await getReply(userId, text);

    await saveMessage(userId, "assistant", reply);
    await sendTelegramMessage(chatId, reply);

    await notifyAdmin(`📩 新客戶訊息
User: ${userId}
Level: ${detectLeadLevel(text)}
Message: ${text}`);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);

    return res.status(200).json({
      ok: true,
      error: error.message
    });
  }
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`AI Sales Bot running on port ${PORT}`);
});
