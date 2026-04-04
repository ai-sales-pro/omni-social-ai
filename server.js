import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("server ok");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on " + PORT);
});
