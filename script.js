async function generateReply() {
  const message = document.getElementById("message").value;

  const res = await fetch("/api/generate-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, platform: "Telegram" })
  });

  const data = await res.json();
  document.getElementById("output").value = data.reply || "No reply generated.";
}\n