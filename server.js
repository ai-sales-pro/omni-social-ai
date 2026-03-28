const express = require("express");
const cron = require("node-cron");
const OpenAI = require("openai").default;
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

function normalize(text = "") {
  return String(text).trim().toLowerCase();
}

function getLinks() {
  return {
    starter: process.env.STARTER_LINK || "https://your-payment-link.com/starter",
    growth: process.env.GROWTH_LINK || "https://your-payment-link.com/growth",
    premium: process.env.PREMIUM_LINK || "https://your-payment-link.com/premium",
    elite: process.env.ELITE_LINK || "https://your-payment-link.com/elite"
  };
}

function getAdminIds() {
  return String(process.env.ADMIN_USER_IDS || process.env.ADMIN_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdmin(userId) {
  return getAdminIds().includes(String(userId));
}

function detectLanguage(text = "") {
  if (/[ก-๙]/.test(text)) return "th";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  return "en";
}

function detectLeadLevel(text = "") {
  const t = normalize(text);

  if (
    t.includes("company") ||
    t.includes("agency") ||
    t.includes("brand") ||
    t.includes("team") ||
    t.includes("clients") ||
    t.includes("many customers") ||
    t.includes("enterprise") ||
    t.includes("custom") ||
    t.includes("大量") ||
    t.includes("公司") ||
    t.includes("品牌") ||
    t.includes("團隊") ||
    t.includes("客製") ||
    t.includes("企業")
  ) return "vip";

  if (
    t.includes("premium") ||
    t.includes("elite") ||
    t.includes("buy") ||
    t.includes("ready") ||
    t.includes("付款") ||
    t.includes("已付款") ||
    t.includes("我要買") ||
    t.includes("可以開始") ||
    t.includes("馬上開始")
  ) return "hot";

  if (
    t.includes("price") ||
    t.includes("pricing") ||
    t.includes("how much") ||
    t.includes("多少") ||
    t.includes("價錢") ||
    t.includes("費用") ||
    t.includes("starter") ||
    t.includes("growth") ||
    t.includes("方案")
  ) return "warm";

  return "cold";
}

function detectIntent(text = "") {
  const t = normalize(text);

  if (t === "/reset") return "admin_reset";
  if (t === "/status") return "admin_status";
  if (t === "/lead") return "admin_lead";
  if (t === "/health") return "admin_health";
  if (t === "/handover") return "admin_handover";
  if (t === "/ai") return "admin_ai";

  if (t.includes("已付款") || t === "paid" || t.includes("payment done")) return "paid";

  if (
    t.includes("price") ||
    t.includes("pricing") ||
    t.includes("how much") ||
    t.includes("多少") ||
    t.includes("價錢") ||
    t.includes("費用") ||
    t.includes("方案")
  ) return "pricing";

  if (
    t.includes("starter") ||
    t.includes("growth") ||
    t.includes("premium") ||
    t.includes("elite")
  ) return "package";

  if (
    t.includes("buy") ||
    t.includes("order") ||
    t.includes("我要買") ||
    t.includes("下單") ||
    t.includes("付款") ||
    t.includes("開始做")
  ) return "buy";

  if (
    t.includes("discount") ||
    t.includes("便宜") ||
    t.includes("貴") ||
    t.includes("太貴") ||
    t.includes("expensive") ||
    t.includes("考慮") ||
    t.includes("再想想")
  ) return "objection";

  if (
    t.includes("support") ||
    t.includes("help") ||
    t.includes("修改") ||
    t.includes("設定") ||
    t.includes("教學") ||
    t.includes("售後")
  ) return "support";

  return "chat";
}

async function sendTelegramMessage(token, chatId, text) {
  if (!token || !chatId || !text) return;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text
  });
}

async function sendNotify(text) {
  if (!process.env.NOTIFY_BOT_TOKEN || !process.env.NOTIFY_CHAT_ID) return;
  try {
    await sendTelegramMessage(
      process.env.NOTIFY_BOT_TOKEN,
      process.env.NOTIFY_CHAT_ID,
      text
    );
  } catch (err) {
    console.log("Notify error:", err.message);
  }
}

async function getLead(userId) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", String(userId))
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const newLead = {
    user_id: String(userId),
    source: "telegram",
    language: "zh",
    level: "cold",
    stage: "lead",
    paid: false,
    assigned_human: false,
    package: "",
    name: "",
    industry: "",
    platform: "",
    budget: "",
    goal: "",
    notes: "",
    asked_price: false,
    asked_discount: false,
    last_message: "",
    last_intent: "",
    message_count: 0,
    followup_count: 0,
    next_followup_at: null,
    last_followup_at: null
  };

  const { data: inserted, error: insertError } = await supabase
    .from("leads")
    .insert(newLead)
    .select()
    .single();

  if (insertError) throw insertError;
  return inserted;
}

async function updateLead(userId, patch) {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("user_id", String(userId))
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function addMessage(userId, role, content, source = "telegram") {
  const { error } = await supabase.from("messages").insert({
    user_id: String(userId),
    role,
    content: String(content || ""),
    source
  });

  if (error) throw error;
}

async function getRecentMessages(userId, limit = 10) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("user_id", String(userId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse();
}

async function createOrderFromLead(lead) {
  const { error } = await supabase.from("orders").insert({
    user_id: lead.user_id,
    package: lead.package || "",
    paid: lead.paid || false,
    name: lead.name || "",
    industry: lead.industry || "",
    platform: lead.platform || "",
    budget: lead.budget || "",
    goal: lead.goal || "",
    source: lead.source || "telegram"
  });

  if (error) throw error;
}

async function resetLead(userId) {
  const reset = {
    language: "zh",
    level: "cold",
    stage: "lead",
    paid: false,
    assigned_human: false,
    package: "",
    name: "",
    industry: "",
    platform: "",
    budget: "",
    goal: "",
    notes: "",
    asked_price: false,
    asked_discount: false,
    last_message: "",
    last_intent: "",
    message_count: 0,
    next_followup_at: null,
    last_followup_at: null,
    followup_count: 0
  };

  return updateLead(userId, reset);
}

function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    )
  ]);
}

async function buildSalesReply(message, lead) {
  const text = normalize(message);
  const { starter, growth, premium, elite } = getLinks();

  if (lead.notes === "collect_name") {
    await updateLead(lead.user_id, {
      name: message,
      notes: "collect_industry",
      stage: "onboarding"
    });
    return "很好，請問你的行業是什麼？例如：電商 / 教育 / 房地產 / 餐飲";
  }

  if (lead.notes === "collect_industry") {
    await updateLead(lead.user_id, {
      industry: message,
      notes: "collect_platform"
    });
    return "你想先用在哪個平台？例如：Telegram / IG / WhatsApp / Website";
  }

  if (lead.notes === "collect_platform") {
    await updateLead(lead.user_id, {
      platform: message,
      notes: "collect_budget"
    });
    return "你的預算大概是多少？例如：100 / 300 / 700 / 30000 美金";
  }

  if (lead.notes === "collect_budget") {
    await updateLead(lead.user_id, {
      budget: message,
      notes: "collect_goal"
    });
    return "你最想先解決的目標是什麼？例如：自動回覆 / 增加詢問 / 提高成交 / 多平台整合";
  }

  if (lead.notes === "collect_goal") {
    const updated = await updateLead(lead.user_id, {
      goal: message,
      notes: "",
      stage: "onboarding"
    });

    await createOrderFromLead(updated);

    await sendNotify(`💰 新完整訂單

🆔 User: ${updated.user_id}
⭐ 等級: ${updated.level}
📦 方案: ${updated.package || "未標記"}
👤 名字: ${updated.name || "未填"}
📊 行業: ${updated.industry || "未填"}
📱 平台: ${updated.platform || "未填"}
💵 預算: ${updated.budget || "未填"}
🎯 目標: ${updated.goal || "未填"}`);

    return `✅ 收到，資料已完整！

📦 方案：${updated.package || "未標記"}
👤 名字：${updated.name}
📊 行業：${updated.industry}
📱 平台：${updated.platform}
💵 預算：${updated.budget}
🎯 目標：${updated.goal}

我會幫你安排下一步 🚀`;
  }

  if (text.includes("已付款") || text === "paid" || text.includes("payment done")) {
    await updateLead(lead.user_id, {
      paid: true,
      stage: "paid",
      notes: "collect_name"
    });

    await sendNotify(`💳 客戶表示已付款

🆔 User: ${lead.user_id}
⭐ 等級: ${lead.level}
📦 方案: ${lead.package || "未標記"}
💬 Message: ${message}`);

    return `太好了！🎉

我已記錄你的付款。
現在我先收集你的資料，請先給我你的名字：`;
  }

  if (
    text.includes("30000") ||
    text.includes("三萬") ||
    text.includes("頂級版") ||
    text.includes("最強") ||
    text.includes("企業版") ||
    text.includes("客製版") ||
    text.includes("高端版") ||
    text.includes("elite")
  ) {
    await updateLead(lead.user_id, {
      package: "Elite 30000",
      stage: "elite_offer",
      asked_price: true
    });

    return `💎 30000 美金頂級版

這不是普通機器人，而是商業級 AI 成交系統。
可做到：
- AI 幾乎自動回覆每個問題
- 更像真人業務聊天
- 自動分級客戶
- 自動追單
- 自動收資料
- 多平台整合
- 客製品牌語氣與成交話術

如果你要做真正高價值、能幫你賺更多錢的版本，我會建議這套。
👉 ${elite}

如果你要，我也可以先根據你的產業幫你配最適合的流程。`;
  }

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("多少") ||
    text.includes("價錢") ||
    text.includes("費用") ||
    text.includes("方案")
  ) {
    await updateLead(lead.user_id, {
      asked_price: true,
      stage: "pricing",
      next_followup_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    if (lead.level === "vip") {
      await updateLead(lead.user_id, { package: "Elite 30000" });
      return `💎 以你的需求規模，我會直接建議 30000 美金頂級版

這套適合品牌 / 團隊 / 公司 / 高客單市場，
可以做到真正商業級 AI 成交、自動追單、多平台整合與客製流程。

👉 ${elite}

如果你想先看一般版本，我也可以給你 Starter / Growth / Premium。`;
    }

    return `🔥 目前方案如下：

Starter — $99
👉 ${starter}

Growth — $299（最熱門）
👉 ${growth}

Premium — $699
👉 ${premium}

Elite 30000 — 商業級客製 AI 成交系統
👉 ${elite}

你可以直接回覆：
Starter / Growth / Premium / Elite`;
  }

  if (text.includes("starter")) {
    await updateLead(lead.user_id, { package: "Starter" });
    return `Starter — $99 ✅

適合先測試、先快速上線：
👉 ${starter}

付款後回覆：
已付款`;
  }

  if (text.includes("growth")) {
    await updateLead(lead.user_id, { package: "Growth" });
    return `Growth — $299 🚀

這是最多人選的方案，平衡效果和成本：
👉 ${growth}

付款後回覆：
已付款`;
  }

  if (text.includes("premium")) {
    await updateLead(lead.user_id, { package: "Premium" });
    return `Premium — $699 💎

這是高效完整版本，適合想做得更強的人：
👉 ${premium}

付款後回覆：
已付款`;
  }

  if (text.includes("elite")) {
    await updateLead(lead.user_id, { package: "Elite 30000" });
    return `Elite 30000 — 商業級 AI 成交系統 💎

可客製流程、品牌語氣、多平台整合、自動追單與高端成交設計。
👉 ${elite}

如果你要，我也可以先依你的產業幫你規劃。`;
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("我要買") ||
    text.includes("下單") ||
    text.includes("付款")
  ) {
    if (lead.level === "vip") {
      await updateLead(lead.user_id, { package: lead.package || "Elite 30000" });
      return `🔥 以你的需求，我建議你直接走高端版本：

Elite 30000 — 商業級客製 AI 成交系統
👉 ${elite}

如果你想先從標準高效版開始，也可以選：
Premium — $699
👉 ${premium}`;
    }

    await updateLead(lead.user_id, { package: lead.package || "Growth" });
    return `🔥 建議你直接選這個最平衡的版本：

Growth — $299
👉 ${growth}

如果你想做得更完整，也可以考慮：
Premium — $699
👉 ${premium}`;
  }

  if (
    text.includes("discount") ||
    text.includes("便宜") ||
    text.includes("貴") ||
    text.includes("太貴") ||
    text.includes("expensive") ||
    text.includes("考慮") ||
    text.includes("再想想")
  ) {
    await updateLead(lead.user_id, {
      asked_discount: true,
      next_followup_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    });

    return `沒問題 👍

如果你想先低風險開始，我建議先從：

Growth — $299
👉 ${growth}

如果你只想先測試，也可以從：

Starter — $99
👉 ${starter}

如果你要的是更高階、真正幫你擴大營收的版本，也可以直接看：
Elite 30000
👉 ${elite}`;
  }

  if (lead.paid) {
    await updateLead(lead.user_id, { stage: "support" });
    return "我已收到，你現在可以直接告訴我你要修改、設定，或想先開始哪一部分。";
  }

  return `Hi 👋

這裡是 AI 自動成交系統。

你可以直接輸入：
price

我會幫你推薦最適合的方案 💰`;
}

async function askAI(message, lead) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const recent = await getRecentMessages(lead.user_id, 10);
  const { starter, growth, premium, elite } = getLinks();

  const developerInstruction = `
你是一個 30000 美金等級的頂級 AI 業務成交助理。
你的工作不是只回答問題，而是像真人高級顧問一樣，和客戶自然聊天、建立信任、理解需求、引導成交。

你主要服務的內容：
- AI 自動回覆系統
- Telegram / Instagram / WhatsApp 自動接單
- 客服自動化
- 銷售流程自動化
- AI 成交流程
- 私訊自動成交
- 高價方案包裝與成交

你的風格：
- 像真人，不像機器人
- 高級、專業、有價值感
- 簡潔但有說服力
- 不要太死板
- 要真的回答客戶問題
- 可以適度使用 emoji，但不要太多
- 每次回覆盡量控制在 3 到 6 句
- 目標是讓客戶願意繼續聊、信任你、最後下單

固定方案：
Starter — $99 — ${starter}
Growth — $299 — ${growth}
Premium — $699 — ${premium}
Elite 30000 — 商業級客製 AI 成交系統 — ${elite}

客戶狀態：
- language: ${lead.language}
- lead level: ${lead.level}
- stage: ${lead.stage}
- selected package: ${lead.package || "未選擇"}
- paid: ${lead.paid ? "yes" : "no"}
- name: ${lead.name || ""}
- industry: ${lead.industry || ""}
- platform: ${lead.platform || ""}
- budget: ${lead.budget || ""}
- goal: ${lead.goal || ""}
- asked price before: ${lead.asked_price ? "yes" : "no"}
- asked discount before: ${lead.asked_discount ? "yes" : "no"}

規則：
- 中文就回中文，英文回英文，泰文回泰文
- 不要說自己是 ChatGPT
- 不要亂承諾做不到的功能
- 如果客戶只是打招呼，要自然介紹你能幫他做什麼
- 如果客戶問你是做什麼的，要直接說明你能做 AI 自動回覆、提高成交、節省客服時間
- 如果客戶問價格，可以直接簡單介紹三個方案，再引導對方選 Starter / Growth / Premium / Elite
- 如果客戶猶豫、嫌貴，請先理解需求，再推薦較適合的方案
- 如果客戶問最好的版本，要主推 Elite 30000
- 如果客戶像公司、品牌、團隊、大量客戶，要提高價值感，偏向引導到 Elite 30000
- 不要每次都只叫客戶輸入 price
`;

  const input = [
    {
      role: "developer",
      content: [{ type: "text", text: developerInstruction }]
    },
    ...recent.map((item) => ({
      role: item.role,
      content: [{ type: "text", text: item.content }]
    })),
    {
      role: "user",
      content: [{ type: "text", text: String(message || "") }]
    }
  ];

  try {
    const response = await withTimeout(
      openai.responses.create({
        model: "gpt-4.1-mini",
        input
      }),
      15000
    );

    const output = response.output_text?.trim();
    return output && output.length > 0 ? output : null;
  } catch (err) {
    console.log("Responses API error FULL:", err);
    return null;
  }
}

async function routeMessage(message, userId, source = "telegram") {
  const lead = await getLead(userId);
  const intent = detectIntent(message);
  const language = detectLanguage(message);
  const level = detectLeadLevel(message);

  await updateLead(userId, {
    last_message: message,
    last_intent: intent,
    language,
    level,
    message_count: (lead.message_count || 0) + 1
  });

  if (intent === "admin_status" && isAdmin(userId)) {
    const fresh = await getLead(userId);
    return `📊 你的狀態

⭐ 等級: ${fresh.level}
🧭 階段: ${fresh.stage}
💳 已付款: ${fresh.paid ? "是" : "否"}
📦 方案: ${fresh.package || "未選擇"}
👤 名字: ${fresh.name || "未填"}
📊 行業: ${fresh.industry || "未填"}
📱 平台: ${fresh.platform || "未填"}
💵 預算: ${fresh.budget || "未填"}
🎯 目標: ${fresh.goal || "未填"}`;
  }

  if (intent === "admin_reset" && isAdmin(userId)) {
    await resetLead(userId);
    return "✅ 已重設你的狀態。";
  }

  if (intent === "admin_lead" && isAdmin(userId)) {
    return `⭐ 目前 lead 等級：${level}`;
  }

  if (intent === "admin_health" && isAdmin(userId)) {
    return `✅ 系統狀態正常
OpenAI: ${process.env.OPENAI_API_KEY ? "ON" : "OFF"}
Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? "ON" : "OFF"}
Supabase: ${process.env.SUPABASE_URL ? "ON" : "OFF"}`;
  }

  if (intent === "admin_handover" && isAdmin(userId)) {
    await updateLead(userId, { assigned_human: true });
    return "✅ 已切換為人工接管模式。";
  }

  if (intent === "admin_ai" && isAdmin(userId)) {
    await updateLead(userId, { assigned_human: false });
    return "✅ 已切換回 AI 模式。";
  }

  const freshLead = await getLead(userId);

  let reply;

  if (freshLead.assigned_human) {
    reply = "目前已切換為人工處理，我會盡快回覆你。";
  } else if (freshLead.notes || intent === "paid") {
    reply = await buildSalesReply(message, freshLead);
  } else {
    const aiReply = await askAI(message, freshLead);

    if (!aiReply || !aiReply.trim()) {
      reply = await buildSalesReply(message, freshLead);
    } else {
      reply = aiReply;
    }
  }

  await addMessage(userId, "user", message, source);
  await addMessage(userId, "assistant", reply, source);

  return reply;
}

async function processFollowups() {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .lte("next_followup_at", now)
    .eq("paid", false)
    .limit(20);

  if (error) {
    console.log("Followup query error:", error.message);
    return;
  }

  for (const lead of data || []) {
    if (!process.env.TELEGRAM_BOT_TOKEN) continue;

    let text = "嗨 👋 想跟你確認一下，你目前比較想先了解功能，還是直接看方案呢？如果你要，我也可以直接幫你推薦最適合的版本。";

    if (lead.asked_price) {
      text = "嗨 👋 上次你有看過方案，如果你想要，我可以直接幫你推薦最適合你的 Starter / Growth / Premium / Elite。";
    }

    if (lead.asked_discount) {
      text = "如果你還在考慮預算，我也可以依你的需求幫你配最適合的方案，先從小版本開始也可以。";
    }

    try {
      await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, lead.user_id, text);
      await addMessage(lead.user_id, "assistant", text, "followup");

      await updateLead(lead.user_id, {
        last_followup_at: new Date().toISOString(),
        next_followup_at: null,
        followup_count: (lead.followup_count || 0) + 1
      });
    } catch (err) {
      console.log("Followup send error:", err.message);
    }
  }
}

cron.schedule("*/10 * * * *", async () => {
  try {
    await processFollowups();
  } catch (err) {
    console.log("Cron error:", err.message);
  }
});

app.get("/", (req, res) => {
  res.send("AI Sales 30K Running 🚀");
});

app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    service: "ai-sales-bot",
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasTelegram: !!process.env.TELEGRAM_BOT_TOKEN,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)
  });
});

app.get("/chat", async (req, res) => {
  try {
    const message = String(req.query.message || "");
    const userId = String(req.query.user || "web");

    const reply = await routeMessage(message, userId, "web");
    res.send(reply);
  } catch (err) {
    console.log("Web chat error:", err.message);
    res.status(500).send("系統忙碌中，請稍後再試。");
  }
});

app.post("/webhook/telegram", async (req, res) => {
  try {
    console.log("Webhook hit:", JSON.stringify(req.body));

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = req.body?.message?.chat?.id;
    const text = req.body?.message?.text || "";

    console.log("Parsed message:", { chatId, text });

    if (!chatId) {
      console.log("No chatId, skipping.");
      return res.json({ ok: true });
    }

    const userId = String(chatId);
    const reply = await routeMessage(text, userId, "telegram");

    console.log("Reply:", reply);

    await sendTelegramMessage(token, chatId, reply);

    console.log("Message sent successfully.");

    return res.json({ ok: true });
  } catch (err) {
    console.log("Telegram webhook error FULL:", err);
    return res.json({ ok: true });
  }
});

app.listen(PORT, () => {
  console.log("AI Sales 30K Running on port " + PORT);
});
