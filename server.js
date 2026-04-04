import express from "express";
import axios from "axios";
import cors from "cors";
import Stripe from "stripe";
import crypto from "crypto";

if (process.env.NODE_ENV !== "production") {
  try {
    const dotenv = await import("dotenv");
    dotenv.default.config();
    console.log("✅ dotenv loaded");
  } catch (err) {
    console.log("⚠️ dotenv not loaded:", err.message);
  }
}

import {
  analyzeCustomer,
  generateReply,
  shouldOfferPayment,
  generatePlatformReply
} from "./ai.js";

import {
  supabase,
  saveCustomer,
  getCustomer,
  savePaymentLink,
  getPaymentLink,
  getCustomersByOwner,
  createOrder,
  getOrders,
  markOrderPaid,
  saveAISettings,
  getAISettings,
  getAllOwnersAdmin,
  getFollowUpCustomers3Min,
  getFollowUpCustomers1Day,
  updateFollowUp
} from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.STRIPE_SECRET_KEY) {
  console.log("⚠️ Missing STRIPE_SECRET_KEY");
}
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.log("⚠️ Missing TELEGRAM_BOT_TOKEN");
}
if (!process.env.SUPABASE_URL) {
  console.log("⚠️ Missing SUPABASE_URL");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("⚠️ Missing SUPABASE_SERVICE_ROLE_KEY");
}
if (!process.env.OPENAI_API_KEY) {
  console.log("⚠️ Missing OPENAI_API_KEY");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy");
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";
const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || "";
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "";

app.use(cors());

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ""}`;

/* =============================
   工具
============================= */

async function sendTelegramMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text
  });
}

function isAIDisabled(settings) {
  if (!settings) return false;
  if (settings.autoMode === false) return true;
  if (settings.auto_mode === false) return true;
  if (settings.auto_reply === false) return true;
  return false;
}

function getFollowUpMessage3Min(customer, settings = {}) {
  const followMode = settings.follow_up_mode || "standard";
  const productName = settings.product_name || "方案";

  if (followMode === "gentle") {
    return "我剛剛有幫你看了一下，其實你這個方向是可以處理的，你如果要的話我可以再幫你說明清楚一點。";
  }

  if (followMode === "strong") {
    return `我直接跟你說，這個狀況其實越早處理越有利，如果你要，我可以直接幫你抓最適合你的 ${productName}。`;
  }

  return `我剛剛幫你看過，其實這個是可以處理的，你要不要我幫你看適合你的 ${productName}？`;
}

function getFollowUpMessage1Day(customer, settings = {}) {
  const followMode = settings.follow_up_mode || "standard";
  const productName = settings.product_name || "方案";

  if (followMode === "gentle") {
    return `我這邊再提醒你一下，如果你還在考慮，我可以再幫你整理一次適合你的 ${productName} 方向。`;
  }

  if (followMode === "strong") {
    return "我再提醒你一次，這種狀況通常不建議拖，拖久會更難處理。如果你要，我可以直接幫你安排下一步。";
  }

  return `再提醒你一次，這個真的建議不要拖，拖久會更難處理。如果你要，我可以直接幫你安排適合你的 ${productName}。`;
}

async function safeSendTelegramMessage(chatId, text) {
  try {
    await sendTelegramMessage(chatId, text);
  } catch (err) {
    console.log("send telegram error:", err?.response?.data || err.message);
  }
}

function getStripePlanByAmount(amount) {
  if (amount === 1280) return "month";
  if (amount === 3000) return "quarter";
  if (amount === 10000) return "year";
  return "unknown";
}

function hashPassword(password = "") {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function normalizePlan(plan = "", amount = 0) {
  const p = String(plan || "").toLowerCase();

  if (p.includes("starter") || p.includes("month") || p.includes("月")) {
    return "starter";
  }

  if (p.includes("growth") || p.includes("quarter") || p.includes("季")) {
    return "growth";
  }

  if (p.includes("elite") || p.includes("year") || p.includes("年")) {
    return "elite";
  }

  if (Number(amount) === 1280) return "starter";
  if (Number(amount) === 3000) return "growth";
  if (Number(amount) === 10000) return "elite";

  return "growth";
}

function getMetaOAuthScopes() {
  return [
    "pages_show_list",
    "pages_manage_metadata",
    "pages_messaging",
    "instagram_basic",
    "instagram_manage_messages",
    "business_management"
  ].join(",");
}

function buildMetaState(payload = {}) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function parseMetaState(state = "") {
  try {
    return JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", String(email))
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createDefaultAISettings(ownerId) {
  const { error } = await supabase
    .from("ai_settings")
    .upsert(
      {
        owner_id: String(ownerId),
        auto_reply: true,
        auto_payment_push: true,
        customer_analysis: true,
        follow_up_mode: "standard",
        default_plan: "growth",
        tone_style: "closing",
        auto_mode: true,
        industry: "fortune",
        primary_language: "zh-TW",
        business_name: "",
        product_name: "",
        product_price: 0,
        brand_style: "",
        custom_prompt: "",
        updated_at: new Date().toISOString()
      },
      { onConflict: "owner_id" }
    );

  if (error) throw error;
}

async function createUserFromPaidSession({ email, password, plan }) {
  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    return {
      ownerId: existingUser.owner_id,
      plan: existingUser.plan || plan,
      isExisting: true
    };
  }

  let ownerId = `boss_${crypto.randomBytes(4).toString("hex")}`;

  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase
      .from("users")
      .select("owner_id")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) break;

    ownerId = `boss_${crypto.randomBytes(4).toString("hex")}`;
  }

  const passwordHash = hashPassword(password);

  const { error: userError } = await supabase.from("users").insert({
    owner_id: ownerId,
    email,
    password_hash: passwordHash,
    plan,
    status: "active"
  });

  if (userError) throw userError;

  const { error: subError } = await supabase.from("subscriptions").insert({
    owner_id: ownerId,
    plan,
    status: "active",
    started_at: new Date().toISOString()
  });

  if (subError) throw subError;

  const { error: paymentError } = await supabase
    .from("payment_settings")
    .upsert(
      {
        owner_id: ownerId,
        payment_link: "",
        updated_at: new Date().toISOString()
      },
      { onConflict: "owner_id" }
    );

  if (paymentError) throw paymentError;

  await createDefaultAISettings(ownerId);

  return {
    ownerId,
    plan,
    isExisting: false
  };
}

async function handleUniversalAI({
  ownerId,
  chatId,
  message,
  platform,
  sendReply
}) {
  const settings = await getAISettings(ownerId);

  if (isAIDisabled(settings)) return;

  const analysis = await analyzeCustomer(message);
  const memory = await getCustomer(ownerId, chatId);

  const reply = await generateReply(
    message,
    analysis,
    memory,
    settings || {}
  );

  await sendReply(reply);

  if (shouldOfferPayment(message, analysis, settings || {})) {
    const link = await getPaymentLink(ownerId);

    if (link) {
      await sendReply(`這是你可以直接開始的方式👇\n${link}`);

      await createOrder({
        ownerId,
        chatId,
        name: "客戶",
        plan: settings?.product_name || "方案",
        amount: Number(settings?.product_price || 0),
        paymentLink: link,
        source: platform,
        status: "pending"
      });
    }
  }

  await saveCustomer(ownerId, chatId, analysis, message);
}

/* =============================
   Stripe Webhook（真實收入）
============================= */

app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      const signature = req.headers["stripe-signature"];

      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("stripe webhook verify error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const customerEmail = session.customer_email || "";
        const amount = Number(session.amount_total || 0) / 100;

        const metadataPlan = session.metadata?.plan || "";
        const plan = metadataPlan || getStripePlanByAmount(amount);

        await createOrder({
          ownerId: "system",
          chatId: customerEmail || `stripe_${session.id}`,
          name: customerEmail || "Stripe Customer",
          plan,
          amount,
          paymentLink: "",
          source: "stripe",
          status: "paid"
        });

        console.log("💰 Stripe 收款成功:", {
          email: customerEmail,
          amount,
          plan
        });
      }

      return res.json({ received: true });
    } catch (err) {
      console.log("stripe webhook process error:", err.message);
      return res.status(500).json({
        ok: false,
        message: "Stripe webhook 處理失敗"
      });
    }
  }
);

/* =============================
   其他 API 用 JSON
============================= */

app.use(express.json());

/* =============================
   健康檢查 / Debug
============================= */

app.get("/", (req, res) => {
  res.send("🔥 AI Sales Pro MAX Running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ai-sales-system",
    time: new Date().toISOString()
  });
});

app.get("/api/debug/routes", (req, res) => {
  res.json({
    ok: true,
    routes: [
      "GET /",
      "GET /health",
      "GET /api/debug/routes",
      "GET /api/channel-connections/:ownerId",
      "POST /api/channel-connections/disconnect",
      "POST /api/industry-profile",
      "GET /api/connect/meta/start",
      "GET /api/connect/meta/callback",
      "POST /api/platform-ai-chat",
      "GET /api/stripe/session-info",
      "POST /api/register-from-payment",
      "POST /api/login",
      "GET /api/ai-settings/:ownerId",
      "POST /api/ai-settings",
      "POST /api/admin/toggle-ai",
      "GET /api/admin/owners",
      "POST /api/admin/send-message",
      "POST /api/admin/push-payment",
      "GET /api/customers/:ownerId",
      "GET /api/orders/:ownerId",
      "POST /api/mark-paid",
      "POST /api/payment-link",
      "GET /api/payment-link/:ownerId",
      "POST /webhook/telegram",
      "GET /webhook/meta",
      "POST /webhook/meta",
      "POST /webhook/stripe"
    ]
  });
});

/* =============================
   Channels / Industry / Meta Connect
============================= */

app.get("/api/channel-connections/:ownerId", async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || "");

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 必填"
      });
    }

    const { data, error } = await supabase
      .from("channel_connections")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({
      ok: true,
      connections: data || []
    });
  } catch (err) {
    console.log("get channel connections error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "讀取渠道綁定失敗",
      error: err.message
    });
  }
});

app.post("/api/channel-connections/disconnect", async (req, res) => {
  try {
    const { ownerId, platform } = req.body || {};

    if (!ownerId || !platform) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 和 platform 必填"
      });
    }

    const { error } = await supabase
      .from("channel_connections")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString()
      })
      .eq("owner_id", String(ownerId))
      .eq("platform", String(platform));

    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.log("disconnect channel error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "解除綁定失敗"
    });
  }
});

app.post("/api/industry-profile", async (req, res) => {
  try {
    const {
      ownerId,
      industry,
      offerName,
      offerPrice,
      closingStyle = "balanced",
      urgencyStyle = "medium",
      trustStyle = "consultant",
      multilingual = true,
      primaryLanguage = "auto",
      customSalesPrompt = ""
    } = req.body || {};

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 必填"
      });
    }

    const { error } = await supabase
      .from("industry_profiles")
      .upsert(
        {
          owner_id: String(ownerId),
          industry: industry || "fortune",
          offer_name: offerName || "",
          offer_price: Number(offerPrice || 0),
          closing_style: closingStyle,
          urgency_style: urgencyStyle,
          trust_style: trustStyle,
          multilingual: Boolean(multilingual),
          primary_language: primaryLanguage || "auto",
          custom_sales_prompt: customSalesPrompt || "",
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "owner_id"
        }
      );

    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.log("save industry profile error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "儲存行業設定失敗"
    });
  }
});

app.get("/api/connect/meta/start", async (req, res) => {
  try {
    const ownerId = String(req.query.ownerId || "");
    const platform = String(req.query.platform || "facebook");

    if (!ownerId) {
      return res.status(400).send("ownerId required");
    }

    const state = buildMetaState({
      ownerId,
      platform,
      ts: Date.now()
    });

    const authUrl =
      `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth` +
      `?client_id=${encodeURIComponent(META_APP_ID)}` +
      `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(getMetaOAuthScopes())}`;

    return res.redirect(authUrl);
  } catch (err) {
    console.log("meta start error:", err.message);
    return res.status(500).send("meta connect start error");
  }
});

app.get("/api/connect/meta/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    if (!code || !state) {
      return res.status(400).send("missing code/state");
    }

    const parsedState = parseMetaState(state);

    if (!parsedState?.ownerId) {
      return res.status(400).send("invalid state");
    }

    const ownerId = String(parsedState.ownerId);

    const tokenRes = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: META_REDIRECT_URI,
          code
        }
      }
    );

    const userAccessToken = tokenRes.data?.access_token || "";

    if (!userAccessToken) {
      return res.status(400).send("no user access token");
    }

    const pagesRes = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`,
      {
        params: {
          access_token: userAccessToken,
          fields: "id,name,access_token,instagram_business_account{id,username}"
        }
      }
    );

    const pages = pagesRes.data?.data || [];

    if (!pages.length) {
      return res.status(400).send("no facebook page found");
    }

    const page = pages[0];

    const { error: fbError } = await supabase
      .from("channel_connections")
      .upsert(
        {
          owner_id: ownerId,
          platform: "facebook",
          channel_name: page.name || "Facebook Page",
          external_id: String(page.id || ""),
          access_token: page.access_token || "",
          refresh_token: "",
          meta_user_id: "",
          meta_business_id: "",
          status: "connected",
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "owner_id,platform"
        }
      );

    if (fbError) throw fbError;

    const igBiz = page.instagram_business_account;

    if (igBiz?.id) {
      const { error: igError } = await supabase
        .from("channel_connections")
        .upsert(
          {
            owner_id: ownerId,
            platform: "instagram",
            channel_name: igBiz.username || "Instagram Business",
            external_id: String(igBiz.id || ""),
            access_token: page.access_token || "",
            refresh_token: "",
            meta_user_id: "",
            meta_business_id: "",
            status: "connected",
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "owner_id,platform"
          }
        );

      if (igError) throw igError;
    }

    return res.redirect("/?page=Channels");
  } catch (err) {
    console.log("meta callback error:", err?.response?.data || err.message);
    return res.status(500).send("meta callback error");
  }
});

/* =============================
   平台訂閱 AI
============================= */

app.post("/api/platform-ai-chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        ok: false,
        message: "message 必填"
      });
    }

    const result = await generatePlatformReply(message);

    res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    console.log("platform ai chat error:", err.message);
    res.status(500).json({
      ok: false,
      message: "平台 AI 回覆失敗"
    });
  }
});

/* =============================
   Stripe Session / Register / Login
============================= */

app.get("/api/stripe/session-info", async (req, res) => {
  try {
    const sessionId = req.query.session_id || req.query.sessionId || "";

    if (!sessionId) {
      return res.json({
        ok: false,
        message: "missing session_id"
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.json({
        ok: false,
        message: "找不到付款 session"
      });
    }

    if (session.payment_status !== "paid") {
      return res.json({
        ok: false,
        message: "付款尚未完成"
      });
    }

    const email = session.customer_email || "";
    const amount = Number(session.amount_total || 0) / 100;
    const plan = normalizePlan(session.metadata?.plan || "", amount);

    return res.json({
      ok: true,
      email,
      amount,
      plan
    });
  } catch (err) {
    console.log("stripe session info error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "stripe session error"
    });
  }
});

app.post("/api/register-from-payment", async (req, res) => {
  try {
    const { sessionId, email, password } = req.body || {};

    if (!sessionId || !email || !password) {
      return res.json({
        ok: false,
        message: "missing fields"
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.json({
        ok: false,
        message: "找不到付款 session"
      });
    }

    if (session.payment_status !== "paid") {
      return res.json({
        ok: false,
        message: "payment not verified"
      });
    }

    const paidEmail = session.customer_email || "";
    const amount = Number(session.amount_total || 0) / 100;
    const plan = normalizePlan(session.metadata?.plan || "", amount);

    if (
      paidEmail &&
      String(paidEmail).toLowerCase() !== String(email).toLowerCase()
    ) {
      return res.json({
        ok: false,
        message: "付款 Email 與註冊 Email 不一致"
      });
    }

    const created = await createUserFromPaidSession({
      email,
      password,
      plan
    });

    return res.json({
      ok: true,
      ownerId: created.ownerId,
      plan: created.plan,
      isExisting: created.isExisting
    });
  } catch (err) {
    console.log("register from payment error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "register failed"
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.json({
        ok: false,
        message: "missing fields"
      });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return res.json({
        ok: false,
        message: "帳號不存在"
      });
    }

    const passwordHash = hashPassword(password);

    if (user.password_hash !== passwordHash) {
      return res.json({
        ok: false,
        message: "密碼錯誤"
      });
    }

    return res.json({
      ok: true,
      ownerId: user.owner_id,
      plan: user.plan || "",
      email: user.email || ""
    });
  } catch (err) {
    console.log("login error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "login failed"
    });
  }
});

/* =============================
   AI 開關 / AI 設定
============================= */

app.get("/api/ai-settings/:ownerId", async (req, res) => {
  try {
    const settings = await getAISettings(req.params.ownerId);
    res.json({ ok: true, settings: settings || null });
  } catch (err) {
    console.log("get ai settings error:", err.message);
    res.status(500).json({
      ok: false,
      message: "讀取 AI 設定失敗"
    });
  }
});

app.post("/api/ai-settings", async (req, res) => {
  try {
    const { ownerId, ...settings } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 必填"
      });
    }

    await saveAISettings(ownerId, settings);

    res.json({
      ok: true,
      message: "AI 設定已儲存"
    });
  } catch (err) {
    console.log("save ai settings error:", err.message);
    res.status(500).json({
      ok: false,
      message: "儲存 AI 設定失敗"
    });
  }
});

app.post("/api/admin/toggle-ai", async (req, res) => {
  try {
    const { ownerId, enabled } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 必填"
      });
    }

    await saveAISettings(ownerId, {
      autoMode: enabled,
      autoReply: enabled
    });

    res.json({ ok: true });
  } catch (err) {
    console.log("toggle ai error:", err.message);
    res.status(500).json({
      ok: false,
      message: "切換 AI 失敗"
    });
  }
});

/* =============================
   Admin
============================= */

app.get("/api/admin/owners", async (req, res) => {
  try {
    const owners = await getAllOwnersAdmin();
    res.json({ ok: true, owners });
  } catch (err) {
    console.log("get admin owners error:", err.message);
    res.status(500).json({
      ok: false,
      message: "讀取老闆資料失敗"
    });
  }
});

app.post("/api/admin/send-message", async (req, res) => {
  try {
    const { chatId, text } = req.body;

    if (!chatId || !text) {
      return res.status(400).json({
        ok: false,
        message: "chatId 和 text 必填"
      });
    }

    await sendTelegramMessage(chatId, text);
    res.json({ ok: true });
  } catch (err) {
    console.log("admin send message error:", err.message);
    res.status(500).json({
      ok: false,
      message: "發送訊息失敗"
    });
  }
});

app.post("/api/admin/push-payment", async (req, res) => {
  try {
    const { ownerId, chatId } = req.body;

    if (!ownerId || !chatId) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 和 chatId 必填"
      });
    }

    const [link, settings] = await Promise.all([
      getPaymentLink(ownerId),
      getAISettings(ownerId)
    ]);

    if (!link) {
      return res.status(400).json({
        ok: false,
        message: "尚未設定付款連結"
      });
    }

    const productName = settings?.product_name || "主要方案";
    const productPrice = Number(settings?.product_price || 0);

    await sendTelegramMessage(
      chatId,
      "我這邊幫你確認過了，現在開始會是比較好的時機。"
    );

    await sendTelegramMessage(
      chatId,
      `這是你可以直接開始的方式👇\n${link}`
    );

    await createOrder({
      ownerId,
      chatId,
      name: "客戶",
      plan: productName,
      amount: productPrice,
      paymentLink: link,
      source: "admin",
      status: "pending"
    });

    res.json({ ok: true });
  } catch (err) {
    console.log("admin push payment error:", err.message);
    res.status(500).json({
      ok: false,
      message: "推付款失敗"
    });
  }
});

/* =============================
   客戶 / 訂單
============================= */

app.get("/api/customers/:ownerId", async (req, res) => {
  try {
    const customers = await getCustomersByOwner(req.params.ownerId);
    res.json({ ok: true, customers });
  } catch (err) {
    console.log("get customers error:", err.message);
    res.status(500).json({
      ok: false,
      message: "讀取客戶失敗"
    });
  }
});

app.get("/api/orders/:ownerId", async (req, res) => {
  try {
    const orders = await getOrders(req.params.ownerId);
    res.json({ ok: true, orders });
  } catch (err) {
    console.log("get orders error:", err.message);
    res.status(500).json({
      ok: false,
      message: "讀取訂單失敗"
    });
  }
});

app.post("/api/mark-paid", async (req, res) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({
        ok: false,
        message: "chatId 必填"
      });
    }

    await markOrderPaid(chatId);
    res.json({ ok: true });
  } catch (err) {
    console.log("mark paid error:", err.message);
    res.status(500).json({
      ok: false,
      message: "標記付款失敗"
    });
  }
});

/* =============================
   付款連結
============================= */

app.post("/api/payment-link", async (req, res) => {
  try {
    const { ownerId, paymentLink } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        message: "ownerId 必填"
      });
    }

    await savePaymentLink(ownerId, paymentLink || "");
    res.json({ ok: true });
  } catch (err) {
    console.log("save payment link error:", err.message);
    res.status(500).json({
      ok: false,
      message: "儲存付款連結失敗"
    });
  }
});

app.get("/api/payment-link/:ownerId", async (req, res) => {
  try {
    const paymentLink = await getPaymentLink(req.params.ownerId);
    res.json({ ok: true, paymentLink });
  } catch (err) {
    console.log("get payment link error:", err.message);
    res.status(500).json({
      ok: false,
      message: "讀取付款連結失敗"
    });
  }
});

/* =============================
   Telegram Webhook（核心 AI 成交）
============================= */

app.post("/webhook/telegram", async (req, res) => {
  try {
    const message = req.body?.message?.text || "";
    const chatId = req.body?.message?.chat?.id || "";
    const ownerId = req.query.ownerId || "";

    if (!message || !chatId || !ownerId) {
      return res.sendStatus(200);
    }

    await handleUniversalAI({
      ownerId,
      chatId,
      message,
      platform: "telegram",
      sendReply: async (text) => {
        await sendTelegramMessage(chatId, text);
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.log("telegram webhook error:", err?.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* =============================
   META Webhook（Facebook / Instagram）
============================= */

app.get("/webhook/meta", (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN || "";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ Meta webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook/meta", async (req, res) => {
  try {
    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const messagingList = entry?.messaging || [];

      for (const event of messagingList) {
        const senderId = event?.sender?.id || "";
        const recipientId = event?.recipient?.id || "";
        const message = event?.message?.text || "";

        if (!senderId || !recipientId || !message) continue;

        const { data: conn, error } = await supabase
          .from("channel_connections")
          .select("*")
          .eq("external_id", String(recipientId))
          .eq("status", "connected")
          .maybeSingle();

        if (error) throw error;
        if (!conn) continue;

        await handleUniversalAI({
          ownerId: conn.owner_id,
          chatId: senderId,
          message,
          platform: conn.platform || "facebook",
          sendReply: async (text) => {
            await axios.post(
              `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
              {
                recipient: { id: senderId },
                messaging_type: "RESPONSE",
                message: { text }
              },
              {
                params: {
                  access_token: conn.access_token
                }
              }
            );
          }
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.log("meta webhook error:", err?.response?.data || err.message);
    return res.sendStatus(500);
  }
});

/* =============================
   自動追單（最強核心）
============================= */

function startAutoFollowUp() {
  console.log("🔥 自動追單系統啟動");

  setInterval(async () => {
    try {
      const list3 = await getFollowUpCustomers3Min();

      for (const customer of list3) {
        try {
          const settings = await getAISettings(customer.owner_id);

          if (settings?.follow_up_mode === "off") continue;
          if (isAIDisabled(settings)) continue;

          const text = getFollowUpMessage3Min(customer, settings || {});
          await safeSendTelegramMessage(customer.chat_id, text);
          await updateFollowUp(customer.chat_id, 1);
        } catch (err) {
          console.log("3min followup error:", err.message);
        }
      }

      const list1 = await getFollowUpCustomers1Day();

      for (const customer of list1) {
        try {
          const settings = await getAISettings(customer.owner_id);

          if (settings?.follow_up_mode === "off") continue;
          if (isAIDisabled(settings)) continue;

          const text = getFollowUpMessage1Day(customer, settings || {});
          await safeSendTelegramMessage(customer.chat_id, text);
          await updateFollowUp(customer.chat_id, 2);
        } catch (err) {
          console.log("1day followup error:", err.message);
        }
      }
    } catch (err) {
      console.log("追單錯誤:", err.message);
    }
  }, 60000);
}

startAutoFollowUp();

/* =============================
   啟動
============================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running: ${PORT}`);
});
