const express = require("express");
const OpenAI = require("openai").default;
const axios = require("axios");
const cron = require("node-cron");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalize(text = "") {
  return String(text).toLowerCase().trim();
}

function getLinks() {
  return {
    starter: process.env.STARTER_LINK,
    growth: process.env.GROWTH_LINK,
    premium: process.env.PREMIUM_LINK,
    elite: process.env.ELITE_LINK
  };
}

async function sendTelegram(token, chatId, text) {
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text
  });
}

async function getLead(userId) {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) return data;

  const { data: newLead } = await supabase
    .from("leads")
    .insert({ user_id: userId, stage: "lead" })
    .select()
    .single();

  return newLead;
}

async function updateLead(userId, patch) {
  await supabase
    .from("leads")
    .update(patch)
    .eq("user_id", userId);
}

async function askAI(message, lead) {
  const { starter, growth, premium, elite } = getLinks();

  const prompt = `
你是一個頂級 AI 業務，目標是幫我成交客戶。

方案：
Starter $99 ${starter}
Growth $299 ${growth}
Premium $699 ${premium}
Elite 30000 ${elite}

規則：
- 每個訊息都要回
- 像真人業務
- 要推成交
- 高價客戶推30000
- 中文回中文

客戶訊息：
${message}
`;

  try {
    const res = await openai.responses.create({
      model: "gpt-4o",
      input: prompt
    });

    return res.output_text;
  } catch (e) {
    return null;
  }
}

async function salesLogic(message, lead) {
  const text = normalize(message);
  const { starter, growth, premium, elite } = getLinks();

  if (text.includes("已付款")) {
    await updateLead(lead.user_id, { stage: "paid" });
    return "太好了🎉 請給我你的名字，我幫你開始設定";
  }

  if (text.includes("price")) {
    return `🔥方案：

Starter $99
${starter}

Growth $299
${growth}

Premium $699
${premium}

Elite 30000
${elite}`;
  }

  if (text.includes("最強") || text.includes("頂級")) {
    return `💎 建議你直接做 30000 美金頂級版  
這是商業級 AI 成交系統，可自動回覆、成交、追單  
👉 ${elite}`;
  }

  return null;
}

async function handleMessage(message, userId) {
  const lead = await getLead(userId);

  const salesReply = await salesLogic(message, lead);
  if (salesReply) return salesReply;

  const aiReply = await askAI(message, lead);

  if (aiReply && aiReply.trim()) {
    return aiReply;
  }

  return "Hi 👋 我是 AI 自動成交系統，你可以打 price 看方案";
}

app.post("/webhook/telegram", async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text || "";

    const reply = await handleMessage(text, chatId);

    await sendTelegram(process.env.TELEGRAM_BOT_TOKEN, chatId, reply);

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(200);
  }
});

app.get("/", (req, res) => {
  res.send("AI Sales Bot Running 🚀");
});

app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
