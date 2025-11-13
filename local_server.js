const express = require("express");
const cors = require("cors");
const path = require("path");
const os = require("os");
const { Ollama } = require("ollama");

const app = express();
const PORT = process.env.PORT || 3001;

const ollama = new Ollama({ host: "http://localhost:11434" });

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === "IPv4" && !interface.internal) {
        if (interface.address === "10.100.202.121") {
          return interface.address;
        }
      }
    }
  }

  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === "IPv4" && !interface.internal) {
        return interface.address;
      }
    }
  }

  return "10.100.202.121";
}

const conversationHistories = new Map();

// Function to detect if user is asking for code generation
function isCodeRequest(message) {
  const codeKeywords = [
    "write code",
    "generate code",
    "create a function",
    "write a program",
    "code for",
    "implement",
    "write script",
    "create script",
    "generate script",
    "write a class",
    "create a class",
    "build a",
    "develop a",
    "code example",
    "sample code",
    "write algorithm",
    "create algorithm",
    "coding solution",
  ];

  const programmingLanguages = [
    "javascript",
    "python",
    "java",
    "c++",
    "cpp",
    "c#",
    "csharp",
    "html",
    "css",
    "php",
    "ruby",
    "go",
    "rust",
    "swift",
    "kotlin",
    "typescript",
    "react",
    "vue",
    "angular",
    "node",
    "express",
  ];

  const lowerMessage = message.toLowerCase();

  return (
    codeKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
    programmingLanguages.some((lang) => lowerMessage.includes(lang))
  );
}

// Function to extract code from AI response
function extractCode(text) {
  // Look for code blocks first
  const codeBlockMatch = text.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Look for code patterns
  const codePatterns = [
    /function\s+\w+\s*\([^)]*\)\s*{[\s\S]*?}/g,
    /class\s+\w+\s*{[\s\S]*?}/g,
    /<[^>]+>[\s\S]*?<\/[^>]+>/g, // HTML
    /\w+\s*=\s*function\s*\([^)]*\)\s*{[\s\S]*?}/g,
  ];

  for (const pattern of codePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

// Function to determine file extension
function getFileExtension(code, userMessage) {
  const message = userMessage.toLowerCase();

  if (
    message.includes("javascript") ||
    message.includes("js") ||
    code.includes("function") ||
    code.includes("const ") ||
    code.includes("let ")
  )
    return ".js";
  if (
    message.includes("python") ||
    message.includes("py") ||
    code.includes("def ") ||
    code.includes("import ")
  )
    return ".py";
  if (
    message.includes("html") ||
    code.includes("<html") ||
    code.includes("<!DOCTYPE")
  )
    return ".html";
  if (
    message.includes("css") ||
    (code.includes("{") && code.includes(":") && code.includes(";"))
  )
    return ".css";
  if (
    (message.includes("java") && !message.includes("javascript")) ||
    code.includes("public class")
  )
    return ".java";
  if (
    message.includes("c++") ||
    message.includes("cpp") ||
    code.includes("#include")
  )
    return ".cpp";
  if (message.includes("c#") || message.includes("csharp")) return ".cs";
  if (message.includes("php") || code.includes("<?php")) return ".php";
  if (message.includes("typescript") || message.includes("ts")) return ".ts";
  if (
    message.includes("react") ||
    code.includes("React.") ||
    code.includes("jsx")
  )
    return ".jsx";

  return ".txt"; // Default
}

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Ollama Local Server is running" });
});

// New endpoint to download generated code files
app.get("/api/download/:sessionId/:filename", (req, res) => {
  const { sessionId, filename } = req.params;
  const filePath = path.join(__dirname, "generated_codes", sessionId, filename);

  if (require("fs").existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
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

    // Check if this is a code generation request
    const isCodeGenRequest = isCodeRequest(message);
    let enhancedMessage = message;

    if (isCodeGenRequest) {
      enhancedMessage = `${message}\n\nPlease provide clean, properly indented code with appropriate formatting. Wrap the code in triple backticks. Just generate the code without additional explanations or anything other. Just the code`;
    }

    let context = "";
    if (history.length > 0) {
      context = history.map((h) => `${h.role}: ${h.content}`).join("\n") + "\n";
    }

    const fullPrompt = context + `Human: ${enhancedMessage}\nAssistant:`;

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

    // Handle code generation
    let codeFile = null;
    if (isCodeGenRequest) {
      const extractedCode = extractCode(aiResponse);
      if (extractedCode) {
        const fs = require("fs");
        const extension = getFileExtension(extractedCode, message);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `generated_code_${timestamp}${extension}`;

        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, "generated_codes", session);
        fs.mkdirSync(dirPath, { recursive: true });

        // Write code to file
        const filePath = path.join(dirPath, filename);
        fs.writeFileSync(filePath, extractedCode, "utf8");

        codeFile = {
          filename: filename,
          downloadUrl: `/api/download/${session}/${filename}`,
          language: extension.substring(1),
          size: Buffer.byteLength(extractedCode, "utf8"),
        };
      }
    }

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
      codeFile: codeFile,
      isCodeResponse: isCodeGenRequest && codeFile !== null,
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

app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIPAddress();
  console.log("🚀 Ollama Network Server Started!");
  console.log("=====================================");
  console.log(`🏠 Local access: http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://${localIP}:${PORT}`);
  console.log("=====================================");
  console.log(`📡 Server is accessible from any device on your WiFi network`);
  console.log(
    `📱 Share this URL with other devices: http://${localIP}:${PORT}`
  );
  console.log(`🔧 Make sure Ollama is running on http://localhost:11434`);
  console.log("=====================================");
  console.log(`📋 Available endpoints:`);
  console.log(`  GET  /api/health - Health check`);
  console.log(`  GET  /api/models - List available models`);
  console.log(`  POST /api/chat - Chat with model`);
  console.log(`  POST /api/chat/stream - Stream chat responses`);
  console.log(`  POST /api/clear - Clear conversation history`);
  console.log(`  POST /api/pull-model - Download a new model`);
  console.log("=====================================");
  console.log(
    `💡 Tip: Other users can access the chat at http://${localIP}:${PORT}`
  );
});
