import express from "express";
import axios from "axios";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { getAIReply } from "./ai.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    t.includes("enterprise") ||
    t.includes("custom") ||
    t.includes("high-end") ||
    t.includes("best version") ||
    t.includes("strongest")
  ) return "vip";

  if (
    t.includes("premium") ||
    t.includes("elite") ||
    t.includes("buy") ||
    t.includes("ready") ||
    t.includes("paid") ||
    t.includes("payment done") ||
    t.includes("i want it") ||
    t.includes("let's do it") ||
    t.includes("start now")
  ) return "hot";

  if (
    t.includes("price") ||
    t.includes("pricing") ||
    t.includes("how much") ||
    t.includes("cost") ||
    t.includes("plans")
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

  if (t.includes("paid") || t.includes("payment done") || t.includes("i paid")) return "paid";

  if (
    t.includes("price") ||
    t.includes("pricing") ||
    t.includes("how much") ||
    t.includes("cost") ||
    t.includes("plans")
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
    t.includes("i want it") ||
    t.includes("let's do it") ||
    t.includes("start") ||
    t.includes("payment")
  ) return "buy";

  if (
    t.includes("discount") ||
    t.includes("cheap") ||
    t.includes("expensive") ||
    t.includes("too expensive") ||
    t.includes("thinking") ||
    t.includes("not sure") ||
    t.includes("maybe later")
  ) return "objection";

  if (
    t.includes("support") ||
    t.includes("help") ||
    t.includes("edit") ||
    t.includes("setup") ||
    t.includes("tutorial") ||
    t.includes("after sales")
  ) return "support";

  return "chat";
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY");
  }

  return createClient(url, key);
}

async function sendTelegramMessage(token, chatId, text) {
  if (!token || !chatId || !text) return;

  const result = await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      chat_id: chatId,
      text: String(text)
    }
  );

  return result.data;
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
  const supabase = getSupabase();

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
    language: "en",
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
  const supabase = getSupabase();

  const payload = {
    ...patch,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("leads")
    .update(payload)
    .eq("user_id", String(userId));

  if (error) throw error;
}

async function addMessage(userId, role, content, source = "telegram") {
  const supabase = getSupabase();

  const { error } = await supabase.from("messages").insert({
    user_id: String(userId),
    role,
    content: String(content || ""),
    source
  });

  if (error) throw error;
}

async function getRecentMessages(userId, limit = 12) {
  const supabase = getSupabase();

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
  const supabase = getSupabase();

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
    language: "en",
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

  await updateLead(userId, reset);
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
    return "Awesome — what industry are you in? For example: e-commerce, coaching, real estate, restaurant, or agency.";
  }

  if (lead.notes === "collect_industry") {
    await updateLead(lead.user_id, {
      industry: message,
      notes: "collect_platform"
    });
    return "Which platform do you want to use first? For example: Telegram, Instagram, WhatsApp, or Website.";
  }

  if (lead.notes === "collect_platform") {
    await updateLead(lead.user_id, {
      platform: message,
      notes: "collect_budget"
    });
    return "What’s your approximate budget? For example: $100, $300, $700, or $30,000.";
  }

  if (lead.notes === "collect_budget") {
    await updateLead(lead.user_id, {
      budget: message,
      notes: "collect_goal"
    });
    return "What’s your main goal right now? For example: automate replies, increase inquiries, improve conversion, or multi-platform setup.";
  }

  if (lead.notes === "collect_goal") {
    const finalLead = await getLead(lead.user_id);

    await updateLead(lead.user_id, {
      goal: message,
      notes: "",
      stage: "onboarding_done"
    });

    const updatedLead = {
      ...finalLead,
      goal: message
    };

    await createOrderFromLead(updatedLead);

    await sendNotify(`💰 New complete order

User: ${updatedLead.user_id}
Level: ${updatedLead.level}
Package: ${updatedLead.package || "Not set"}
Name: ${updatedLead.name || "Not set"}
Industry: ${updatedLead.industry || "Not set"}
Platform: ${updatedLead.platform || "Not set"}
Budget: ${updatedLead.budget || "Not set"}
Goal: ${updatedLead.goal || "Not set"}`);

    return `Perfect — I’ve got everything I need.

Package: ${updatedLead.package || "Not selected"}
Name: ${updatedLead.name || "Not set"}
Industry: ${updatedLead.industry || "Not set"}
Platform: ${updatedLead.platform || "Not set"}
Budget: ${updatedLead.budget || "Not set"}
Goal: ${updatedLead.goal || "Not set"}

I’ll help you with the next step from here. 🚀`;
  }

  if (text === "hi" || text === "hello" || text === "hey") {
    return `Hey 👋 I help businesses automate replies, qualify leads, and turn more conversations into sales. Are you looking to improve response speed, conversion rate, or both?`;
  }

  if (
    text.includes("what do you do") ||
    text.includes("what is this") ||
    text.includes("what can you do") ||
    text.includes("how does this work")
  ) {
    return `I build AI sales systems that can reply to leads, guide them through your offers, collect key details, and help move conversations toward conversion. In simple terms, it saves you time and helps you close more leads automatically.`;
  }

  if (
    text.includes("best version") ||
    text.includes("strongest") ||
    text.includes("top version") ||
    text.includes("enterprise") ||
    text.includes("custom") ||
    text.includes("30000")
  ) {
    await updateLead(lead.user_id, {
      package: "Elite 30000",
      stage: "elite_offer",
      asked_price: true
    });

    return `If you want the most advanced option, I’d recommend the Elite 30000 system. This is not just a simple chatbot — it’s a custom AI sales system built to handle natural conversations, lead qualification, follow-up, and high-end conversion flow. 👉 ${elite}`;
  }

  if (text.includes("paid") || text.includes("payment done") || text.includes("i paid")) {
    await updateLead(lead.user_id, {
      paid: true,
      stage: "paid",
      notes: "collect_name"
    });

    await sendNotify(`💳 Customer says they paid

User: ${lead.user_id}
Level: ${lead.level}
Package: ${lead.package || "Not set"}
Message: ${message}`);

    return `Amazing 🎉 I’ve marked your payment. Let’s get started — first, what name should I put on your setup?`;
  }

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("cost") ||
    text.includes("plans")
  ) {
    await updateLead(lead.user_id, {
      asked_price: true,
      stage: "pricing",
      next_followup_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    if (lead.level === "vip") {
      await updateLead(lead.user_id, { package: "Elite 30000" });
      return `Based on your needs, I’d strongly recommend the Elite 30000 version.

It’s designed for brands, teams, agencies, and businesses that want a true custom AI sales system with advanced conversation flow, follow-up logic, and multi-platform support.

👉 ${elite}

If you want, I can also show you the smaller options first.`;
    }

    return `Here are the current options:

Starter — $99
👉 ${starter}

Growth — $299 (most popular)
👉 ${growth}

Premium — $699
👉 ${premium}

Elite 30000 — custom business-grade AI sales system
👉 ${elite}

You can reply with:
Starter / Growth / Premium / Elite`;
  }

  if (text.includes("starter")) {
    await updateLead(lead.user_id, { package: "Starter" });
    return `Starter — $99

Best if you want to test quickly and get started with a smaller budget.
👉 ${starter}

After payment, reply with:
Paid`;
  }

  if (text.includes("growth")) {
    await updateLead(lead.user_id, { package: "Growth" });
    return `Growth — $299

This is the most popular option because it gives you the best balance between results and cost.
👉 ${growth}

After payment, reply with:
Paid`;
  }

  if (text.includes("premium")) {
    await updateLead(lead.user_id, { package: "Premium" });
    return `Premium — $699

This is the stronger, more complete version if you want more automation and better conversion flow.
👉 ${premium}

After payment, reply with:
Paid`;
  }

  if (text.includes("elite")) {
    await updateLead(lead.user_id, { package: "Elite 30000" });
    return `Elite 30000

This is a custom business-grade AI sales system built for serious growth.
It can be tailored to your brand, sales process, lead flow, and platforms.
👉 ${elite}

If you want, I can help you map the right setup first.`;
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("i want it") ||
    text.includes("let's do it") ||
    text.includes("let us start") ||
    text.includes("start")
  ) {
    if (lead.level === "vip") {
      await updateLead(lead.user_id, { package: lead.package || "Elite 30000" });
      return `Based on your needs, I’d recommend going with the higher-end setup:

Elite 30000 — custom AI sales system
👉 ${elite}

If you want a faster standard option first, Premium is also strong:
Premium — $699
👉 ${premium}`;
    }

    await updateLead(lead.user_id, { package: lead.package || "Growth" });
    return `If you want the best balance of value and performance, I’d recommend Growth.

Growth — $299
👉 ${growth}

If you want the stronger version, Premium is here too:
Premium — $699
👉 ${premium}`;
  }

  if (
    text.includes("too expensive") ||
    text.includes("expensive") ||
    text.includes("not sure") ||
    text.includes("thinking") ||
    text.includes("maybe later") ||
    text.includes("discount")
  ) {
    await updateLead(lead.user_id, {
      asked_discount: true,
      next_followup_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    });

    return `Totally fair.

If you want to start smaller, I’d recommend:
Growth — $299
👉 ${growth}

If you just want to test first:
Starter — $99
👉 ${starter}

And if your goal is to build a serious revenue-driving system, Elite 30000 is the right long-term move:
👉 ${elite}`;
  }

  if (lead.paid) {
    await updateLead(lead.user_id, { stage: "support" });
    return "Got it — you can now tell me exactly what you want to change, set up, or launch first.";
  }

  return `Hey 👋 This is an AI sales system built to help you automate replies and close more conversations. If you want, I can show you the pricing or help you figure out which setup fits you best.`;
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

  const freshLead = await getLead(userId);
  let reply = "";

  if (intent === "admin_status" && isAdmin(userId)) {
    reply = `📊 Status

⭐ Level: ${freshLead.level}
🧭 Stage: ${freshLead.stage}
💳 Paid: ${freshLead.paid ? "Yes" : "No"}
📦 Package: ${freshLead.package || "Not selected"}
👤 Name: ${freshLead.name || "Not set"}
📊 Industry: ${freshLead.industry || "Not set"}
📱 Platform: ${freshLead.platform || "Not set"}
💵 Budget: ${freshLead.budget || "Not set"}
🎯 Goal: ${freshLead.goal || "Not set"}`;
  } else if (intent === "admin_reset" && isAdmin(userId)) {
    await resetLead(userId);
    reply = "✅ Your lead status has been reset.";
  } else if (intent === "admin_lead" && isAdmin(userId)) {
    reply = `⭐ Current lead level: ${level}`;
  } else if (intent === "admin_health" && isAdmin(userId)) {
    reply = `✅ System status looks good
Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? "ON" : "OFF"}
Supabase: ${process.env.SUPABASE_URL ? "ON" : "OFF"}`;
  } else if (intent === "admin_handover" && isAdmin(userId)) {
    await updateLead(userId, { assigned_human: true });
    reply = "✅ Switched to human handover mode.";
  } else if (intent === "admin_ai" && isAdmin(userId)) {
    await updateLead(userId, { assigned_human: false });
    reply = "✅ Switched back to AI mode.";
  }

  if (reply) {
    await addMessage(userId, "user", message, source);
    await addMessage(userId, "assistant", reply, source);
    return reply;
  }

  reply = await buildSalesReply(message, freshLead);
  await addMessage(userId, "user", message, source);
  await addMessage(userId, "assistant", reply, source);
  return reply;
}

async function processFollowups() {
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .lte("next_followup_at", now)
      .eq("paid", false)
      .limit(20);

    if (error) {
      console.log("Follow-up query error:", error.message);
      return;
    }

    for (const lead of data || []) {
      if (!process.env.TELEGRAM_BOT_TOKEN) continue;

      let text = "Hey 👋 Just checking in — are you more interested in seeing the features, or do you want me to recommend the best plan for your business?";

      if (lead.asked_price) {
        text = "Hey 👋 You already looked at the plans before. If you want, I can help you choose the best fit between Starter, Growth, Premium, and Elite.";
      }

      if (lead.asked_discount) {
        text = "If budget is the main concern, I can help you pick the most efficient option based on what you actually need right now.";
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
        console.log("Follow-up send error:", err.message);
      }
    }
  } catch (err) {
    console.log("processFollowups error:", err.message);
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
  res.send("AI Sales Bot Running 🚀");
});

app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    service: "ai-sales-bot",
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
    res.status(500).send("The system is busy right now. Please try again shortly.");
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

    console.log("FINAL REPLY BEFORE SEND:", reply);

    await sendTelegramMessage(token, chatId, reply || "System error");

    console.log("Message sent successfully.");

    return res.json({ ok: true });
  } catch (err) {
    console.log("Telegram webhook error:", err.message);
    return res.json({ ok: true });
  }
});

console.log("Starting AI Sales Bot...");
console.log("PORT exists:", !!process.env.PORT);
console.log("TELEGRAM token exists:", !!process.env.TELEGRAM_BOT_TOKEN);
console.log("SUPABASE URL exists:", !!process.env.SUPABASE_URL);
console.log("SUPABASE key exists:", !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY));

app.listen(PORT, "0.0.0.0", () => {
  console.log("AI Sales Bot Running on port " + PORT);
});
