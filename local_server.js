const express = require("express");
const cors = require("cors");
const path = require("path");
const { Ollama } = require("ollama");

const app = express();
const PORT = process.env.PORT || 3001;
const ollama = new Ollama({ host: "http://localhost:11434" }); 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const conversationHistories = new Map();

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Ollama Local Server is running" });
});

app.get("/api/models", async (req, res) => {
  try {
    const models = await ollama.list();
    res.json({ models: models.models });
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({
      error: "Failed to fetch models",
      details: error.message,
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId, model = "llama3.2:latest" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const session = sessionId || "default";

    if (!conversationHistories.has(session)) {
      conversationHistories.set(session, []);
    }

    const history = conversationHistories.get(session);

    let context = "";
    if (history.length > 0) {
      context = history.map((h) => `${h.role}: ${h.content}`).join("\n") + "\n";
    }

    const fullPrompt = context + `Human: ${message}\nAssistant:`;

    const response = await ollama.generate({
      model: model,
      prompt: fullPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000,
      },
    });

    const aiResponse = response.response;

    history.push(
      { role: "Human", content: message },
      { role: "Assistant", content: aiResponse }
    );

    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.json({
      response: aiResponse,
      sessionId: session,
      model: model,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({
      error: "Failed to get response from Ollama",
      details: error.message,
    });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  try {
    const { message, sessionId, model = "llama3.2:latest" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const session = sessionId || "default";

    if (!conversationHistories.has(session)) {
      conversationHistories.set(session, []);
    }

    const history = conversationHistories.get(session);

    let context = "";
    if (history.length > 0) {
      context = history.map((h) => `${h.role}: ${h.content}`).join("\n") + "\n";
    }

    const fullPrompt = context + `Human: ${message}\nAssistant:`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    let fullResponse = "";

    const stream = await ollama.generate({
      model: model,
      prompt: fullPrompt,
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000,
      },
    });

    for await (const chunk of stream) {
      if (chunk.response) {
        fullResponse += chunk.response;
        res.write(`data: ${JSON.stringify({ token: chunk.response })}\n\n`);
      }

      if (chunk.done) {
        history.push(
          { role: "Human", content: message },
          { role: "Assistant", content: fullResponse }
        );

        if (history.length > 20) {
          history.splice(0, history.length - 20);
        }

        res.write(
          `data: ${JSON.stringify({
            done: true,
            sessionId: session,
            model: model,
          })}\n\n`
        );
        res.end();
        break;
      }
    }
  } catch (error) {
    console.error("Error in stream chat endpoint:", error);
    res.write(
      `data: ${JSON.stringify({
        error: "Failed to get response from Ollama",
        details: error.message,
      })}\n\n`
    );
    res.end();
  }
});

app.post("/api/clear", (req, res) => {
  const { sessionId } = req.body;
  const session = sessionId || "default";

  if (conversationHistories.has(session)) {
    conversationHistories.delete(session);
    res.json({
      message: "Conversation history cleared",
      sessionId: session,
    });
  } else {
    res.json({
      message: "No conversation history found",
      sessionId: session,
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/pull-model", async (req, res) => {
  try {
    const { model } = req.body;

    if (!model) {
      return res.status(400).json({ error: "Model name is required" });
    }

    await ollama.pull({ model });
    res.json({ message: `Model ${model} pulled successfully` });
  } catch (error) {
    console.error("Error pulling model:", error);
    res.status(500).json({
      error: "Failed to pull model",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ollama Local Server is running on http://localhost:${PORT}`);
  console.log(`Make sure Ollama is running on http://localhost:11434`);
  console.log(`Available endpoints:`);
  console.log(`  GET  /api/health - Health check`);
  console.log(`  GET  /api/models - List available models`);
  console.log(`  POST /api/chat - Chat with model`);
  console.log(`  POST /api/chat/stream - Stream chat responses`);
  console.log(`  POST /api/clear - Clear conversation history`);
  console.log(`  POST /api/pull-model - Download a new model`);
});
