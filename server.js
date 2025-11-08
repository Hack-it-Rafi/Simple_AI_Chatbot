const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const conversationHistories = new Map();

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ error: "API key not configured" });
    }

    const session = sessionId || "default";
    if (!conversationHistories.has(session)) {
      conversationHistories.set(session, []);
    }
    const history = conversationHistories.get(session);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    history.push(
      { role: "user", parts: [{ text: message }] },
      { role: "model", parts: [{ text: text }] }
    );

    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.json({
      response: text,
      sessionId: session,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({
      error: "Failed to get response from AI",
      details: error.message,
    });
  }
});

app.post("/api/clear", (req, res) => {
  const { sessionId } = req.body;
  const session = sessionId || "default";

  if (conversationHistories.has(session)) {
    conversationHistories.delete(session);
    res.json({ message: "Conversation history cleared", sessionId: session });
  } else {
    res.json({ message: "No conversation history found", sessionId: session });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(
    `API Key configured: ${process.env.GOOGLE_API_KEY ? "Yes" : "No"}`
  );
});
