const express = require("express");
const cron = require("node-cron");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalize(text = "") {
  return String(text).trim().toLowerCase();
}

function getLinks() {
  return {
    starter: process.env.STARTER_LINK || "https://paypal.me/xxx/99",
    growth: process.env.GROWTH_LINK || "https://paypal.me/xxx/299",
    premium: process.env.PREMIUM_LINK || "https://paypal.me/xxx/699"
  };
}

function getAdminIds() {
  return String(process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map(s => s.trim())
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
    t.includes("公司") ||
    t.includes("品牌") ||
    t.includes("團隊") ||
    t.includes("客戶很多")
  ) return "vip";

  if (
    t.includes("premium") ||
    t.includes("buy") ||
    t.includes("ready") ||
    t.includes("付款") ||
    t.includes("已付款") ||
    t.includes("我要買") ||
    t.includes("可以開始")
  ) return "hot";

  if (
    t.includes("price") ||
    t.includes("pricing") ||
    t.includes("how much") ||
    t.includes("多少") ||
    t.includes("價錢") ||
    t.includes("費用") ||
    t.includes("starter") ||
    t.includes("growth")
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

  if (t.includes("已付款") || t.includes("paid")) return "paid";
  if (
    t.includes("price") ||
    t.includes("pricing") ||
    t.includes("how much") ||
    t.includes("多少") ||
    t.includes("價錢") ||
    t.includes("費用") ||
    t.includes("方案")
  ) return "pricing";

  if (t.includes("starter") || t.includes("growth") || t.includes("premium")) return "package";

  if (
    t.includes("buy") ||
    t.includes("order") ||
    t.includes("我要買") ||
    t.includes("下單") ||
    t.includes("付款")
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
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
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
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", String(userId))
    .maybeSingle();

  if (data) return data;

  const newLead = {
    user_id: String(userId),
    source: "telegram",
    language: "zh",
    level: "cold",
    stage: "lead",
    paid: false
  };

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert(newLead)
    .select()
    .single();

  if (error) throw error;
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

async function getRecentMessages(userId, limit = 8) {
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

function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    )
  ]);
}

async function buildSalesReply(message, lead) {
  const text = normalize(message);
  const { starter, growth, premium } = getLinks();

  if (lead.notes === "collect_name") {
    await updateLead(lead.user_id, { name: message, notes: "collect_industry", stage: "onboarding" });
    return "很好，請問你的行業是什麼？例如：電商 / 教育 / 房地產 / 餐飲";
  }

  if (lead.notes === "collect_industry") {
    await updateLead(lead.user_id, { industry: message, notes: "collect_platform" });
    return "你想先用在哪個平台？例如：Telegram / IG / WhatsApp / Website";
  }

  if (lead.notes === "collect_platform") {
    await updateLead(lead.user_id, { platform: message, notes: "collect_budget" });
    return "你的預算大概是多少？例如：100 / 300 / 700 美金";
  }

  if (lead.notes === "collect_budget") {
    await updateLead(lead.user_id, { budget: message, notes: "collect_goal" });
    return "你最想先解決的目標是什麼？例如：自動回覆 / 增加詢問 / 提高成交";
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

  if (text.includes("已付款") || text.includes("paid")) {
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
      await updateLead(lead.user_id, { package: "Premium" });
      return `💎 以你的需求規模，我會直接建議 Premium

Premium — $699
👉 ${premium}

如果你要最快開始，付款後直接回覆：
已付款`;
    }

    return `🔥 目前方案如下：

Starter — $99
👉 ${starter}

Growth — $299（最熱門）
👉 ${growth}

Premium — $699
👉 ${premium}

你可以直接回覆：
Starter / Growth / Premium`;
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

這是頂級版本，適合想直接做強、做完整的人：
👉 ${premium}

付款後回覆：
已付款`;
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("我要買") ||
    text.includes("下單") ||
    text.includes("付款")
  ) {
    if (lead.level === "vip") {
      await updateLead(lead.user_id, { package: lead.package || "Premium" });
      return `🔥 我建議你直接走最快的高轉換版本：

Premium — $699
👉 ${premium}

付款後回覆：
已付款`;
    }

    await updateLead(lead.user_id, { package: lead.package || "Growth" });
    return `🔥 建議你直接選這個最平衡的版本：

Growth — $299
👉 ${growth}

付款後回覆：
已付款`;
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

你也可以直接告訴我你的預算，我幫你配最適合的方案。`;
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
    return buildSalesReply(message, lead);
  }

  const recent = await getRecentMessages(lead.user_id, 8);
  const { starter, growth, premium } = getLinks();

  const developerInstruction = `
你是一個頂級商用 AI 銷售助理，專門幫客戶了解並購買：
AI 自動回覆、Telegram / IG / WhatsApp 自動接單、客服自動化、成交流程系統。

你的風格：
- 像高級真人業務，不像機器人
- 專業、自然、有價值感
- 簡潔但有說服力
- 回覆控制在 3 到 6 句
- 可適度用 emoji，但不要太多
- 目標是讓客戶繼續聊、建立信任、往成交前進

固定方案：
Starter — $99 — ${starter}
Growth — $299 — ${growth}
Premium — $699 — ${premium}

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
- 客戶問價格、付款、方案時，不要自己亂報價，請叫對方輸入 price
- 中文就回中文，英文回英文，泰文回泰文
- 不要說自己是 ChatGPT
- 不要亂承諾做不到的功能
`;

  const input = [
    {
      role: "developer",
      content: [{ type: "text", text: developerInstruction }]
    },
    ...recent.map(item => ({
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
      12000
    );

    return response.output_text?.trim() || buildSalesReply(message, lead);
  } catch (err) {
    console.log("Responses API error:", err.message);
    return buildSalesReply(message, lead);
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
  if (
    freshLead.notes ||
    intent === "pricing" ||
    intent === "package" ||
    intent === "buy" ||
    intent === "paid" ||
    intent === "objection" ||
    intent === "support"
  ) {
    reply = await buildSalesReply(message, freshLead);
  } else if (freshLead.assigned_human) {
    reply = "目前已切換為人工處理，我會盡快回覆你。";
  } else {
    reply = await askAI(message, freshLead);
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
      text = "嗨 👋 上次你有看過方案，如果你想要，我可以直接幫你推薦最適合你的 Starter / Growth / Premium。";
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
    service: "ai-sales-30k",
    openai: !!process.env.OPENAI_API_KEY,
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    supabase: !!process.env.SUPABASE_URL
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
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = req.body?.message?.chat?.id;
    const text = req.body?.message?.text || "";

    if (!chatId) return res.json({ ok: true });

    const userId = String(chatId);
    const reply = await routeMessage(text, userId, "telegram");

    await sendTelegramMessage(token, chatId, reply);

    return res.json({ ok: true });
  } catch (err) {
    console.log("Telegram webhook error:", err.message);
    return res.json({ ok: true });
  }
});

app.listen(PORT, () => {
  console.log("AI Sales 30K Running on port " + PORT);
});
