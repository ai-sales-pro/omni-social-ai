async function generateReply() {
  const platform = document.getElementById("platform").value;
  const message = document.getElementById("message").value;

  const res = await fetch("/api/generate-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, platform })
  });

  const data = await res.json();
  document.getElementById("output").value = data.reply || "No reply generated.";
}
