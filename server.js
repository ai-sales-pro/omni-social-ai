import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import Stripe from "stripe";
import crypto from "crypto";

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
  createOrder,
  markOrderPaid
} from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================
   🔥 基本測試
========================= */
app.get("/", (req, res) => {
  res.send("AI Sales System Running 🚀");
});

/* =========================
   🤖 Telegram Webhook
========================= */
app.post("/webhook/telegram", async (req, res) => {
  try {
    const chatId = req.body?.message?.chat?.id;
    const text = req.body?.message?.text;

    if (!chatId || !text) return res.sendStatus(200);

    console.log("📩 Telegram:", text);

    // AI 分析
    const analysis = await analyzeCustomer(text);

    // AI 回覆
    const reply = await generateReply(text, analysis);

    // 發送回 Telegram
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: reply
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram error:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   📸 IG / FB Webhook
========================= */
app.post("/webhook/meta", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging) return res.sendStatus(200);

    const senderId = messaging.sender.id;
    const text = messaging.message?.text;

    if (!text) return res.sendStatus(200);

    console.log("📩 IG:", text);

    // 客戶存入
    await saveCustomer({
      platform_id: senderId,
      message: text
    });

    // AI 分析
    const analysis = await analyzeCustomer(text);

    // AI 回覆
    let reply = await generatePlatformReply(text, analysis);

    // 是否推付款
    if (await shouldOfferPayment(analysis)) {
      const paymentLink = await getPaymentLink("growth");

      reply += `\n\n👉 這裡可以直接開始：\n${paymentLink}`;
    }

    // 回傳訊息
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: senderId },
        message: { text: reply }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ IG error:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   💰 Stripe 建立付款
========================= */
app.post("/create-checkout", async (req, res) => {
  try {
    const { price = 1000, name = "AI Service" } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name
            },
            unit_amount: price * 100
          },
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${process.env.BASE_URL}/success`,
      cancel_url: `${process.env.BASE_URL}/cancel`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   💳 Stripe Webhook
========================= */
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook verify fail:", err.message);
      return res.sendStatus(400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("💰 Payment success:", session.id);

      await markOrderPaid(session.id);
    }

    res.sendStatus(200);
  }
);

/* =========================
   🚀 啟動
========================= */
app.listen(PORT, () => {
  console.log(`🔥 Server running on ${PORT}`);
});
