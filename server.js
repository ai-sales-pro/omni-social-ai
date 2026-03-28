function buildReply(message = "", platform = "Telegram") {
  const text = String(message || "").toLowerCase().trim();

  if (!text) {
    return `Hi! 👋

Thanks for reaching out.
I'm here to help you choose the best AI auto-reply setup for your business.

What kind of business are you running?`;
  }

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("cost") ||
    text.includes("多少") ||
    text.includes("價錢")
  ) {
    return `Great question 💰

Our setup depends on your business needs:

• Starter — basic auto-reply setup
• Growth — smarter sales flow + better conversion
• Premium — full AI closing system

Tell me your business type and main goal, and I’ll recommend the best option for you.`;
  }

  if (
    text.includes("interested") ||
    text.includes("details") ||
    text.includes("info") ||
    text.includes("tell me more") ||
    text.includes("了解") ||
    text.includes("想知道")
  ) {
    return `Awesome — happy to help 🔥

This system can:
• reply instantly
• answer customer questions
• guide leads toward purchase
• save you time and increase conversions

Reply with:
1. Your business type
2. Your target customers
3. Your main goal

and I’ll suggest the best setup for you.`;
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("start") ||
    text.includes("ready") ||
    text.includes("要") ||
    text.includes("開始")
  ) {
    return `Perfect — you're ready to move forward ✅

Please send:
1. Your business type
2. Your preferred platform (${platform})
3. Your target customers

Once I have that, I’ll recommend the right setup and next step for you immediately.`;
  }

  if (
    text.includes("restaurant") ||
    text.includes("agency") ||
    text.includes("coach") ||
    text.includes("clinic") ||
    text.includes("shop") ||
    text.includes("ecommerce") ||
    text.includes("美容") ||
    text.includes("餐廳") ||
    text.includes("電商")
  ) {
    return `That sounds like a great fit for this system 🚀

For your business, I’d recommend a flow that:
• replies fast
• builds trust
• qualifies the customer
• moves them toward booking or payment

If you want, I can recommend the best package for your business right now.`;
  }

  if (
    text.includes("book") ||
    text.includes("appointment") ||
    text.includes("schedule") ||
    text.includes("call") ||
    text.includes("預約")
  ) {
    return `Great — the fastest next step is to book a quick call with us.

Send me your preferred time, and I’ll help you move forward quickly.`;
  }

  if (
    text.includes("pay") ||
    text.includes("payment") ||
    text.includes("checkout") ||
    text.includes("付款")
  ) {
    return `Perfect ✅

You're ready for the next step.
Please send your name and preferred package, and I’ll guide you through the payment process.`;
  }

  return `Thanks for your message 👋

This AI auto-reply sales system helps businesses reply faster and close more customers automatically.

Tell me your business type and goal, and I’ll guide you to the best option 🚀`;
}
