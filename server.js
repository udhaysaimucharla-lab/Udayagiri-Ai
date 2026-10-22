import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "40kb" }));

// A small in-memory IP limit to discourage accidental abuse.
// For a public production service, add stronger rate limiting and usage controls.
const requestCounts = new Map();
app.use("/api/chat", (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60_000) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  requestCounts.set(ip, entry);
  if (entry.count > 20) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "put_your_key_here") {
    return res.status(503).json({
      error: "Gemini is not configured yet. Add GEMINI_API_KEY to your private .env file, then restart the server."
    });
  }

  const incoming = req.body?.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: "Please send a message." });
  }

  const messages = incoming.slice(-12).map((item) => ({
    role: item?.role === "assistant" ? "model" : "user",
    parts: [{ text: String(item?.text || "").slice(0, 6000) }]
  })).filter(item => item.parts[0].text.trim());

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "The last message must be a user message." });
  }

  const systemInstruction = `You are Udayagiri AI, a helpful, respectful assistant created for learning and creativity.
Answer clearly, accurately, and in the language the user uses when possible, including Telugu or English.
Do not invent facts. If unsure, say so. For time-sensitive facts, explain that they may need verification.
Use Indian context when relevant without assuming every user shares the same beliefs or background.
Keep answers age-appropriate. Never claim you are ChatGPT or that you have a human voice.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: messages,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1200
          }
        }),
        signal: AbortSignal.timeout(45_000)
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return res.status(429).json({ error: "Gemini's current request limit was reached. Please wait and try again later." });
      }
      console.error("Gemini API error status:", status);
      return res.status(502).json({
        error: "Gemini could not complete the request. Check your API key, model access, and quota in Google AI Studio."
      });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      return res.status(502).json({ error: "Gemini returned no text. Please try asking another way." });
    }

    res.json({ answer });
  } catch (error) {
    console.error("Chat request failed:", error?.name || "Error");
    res.status(504).json({ error: "The AI request timed out or the server could not reach Gemini. Please try again." });
  }
});

// In production, serve the built React website from this same server.
const distPath = path.join(__dirname, "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Udayagiri AI server listening on port ${PORT}`);
});