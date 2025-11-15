const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const os = require("os");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Enhanced CORS configuration for network access
app.use(
  cors({
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Function to get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();

  // Look for your specific IP first
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === "IPv4" && !interface.internal) {
        // Check if this is your known IP address
        if (interface.address === "10.100.202.121") {
          return interface.address;
        }
      }
    }
  }

  // Fallback to any non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === "IPv4" && !interface.internal) {
        return interface.address;
      }
    }
  }

  // If auto-detection fails, return your known IP
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
  res.json({ status: "OK", message: "Server is running" });
});

// New endpoint to download generated code files
app.get("/api/download/:sessionId/:filename", (req, res) => {
  const { sessionId, filename } = req.params;
  const filePath = path.join(
    __dirname,
    "generated_code_files",
    sessionId,
    filename
  );

  if (require("fs").existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
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

    // Check if this is a code generation request
    const isCodeGenRequest = isCodeRequest(message);
    let enhancedPrompt = message;

    if (isCodeGenRequest) {
      enhancedPrompt = `${message}\n\nPlease provide clean, properly indented code with appropriate formatting, with no comments in the code. Wrap the code in triple backticks. Just generate the code without additional explanations or anything other. Just the code`;
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(enhancedPrompt);
    const response = await result.response;
    const text = response.text();

    // Handle code generation
    let codeFile = null;
    if (isCodeGenRequest) {
      const extractedCode = extractCode(text);
      if (extractedCode) {
        const fs = require("fs");
        const extension = getFileExtension(extractedCode, message);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `generated_code_${timestamp}${extension}`;

        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, "generated_code_files", session);
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
      codeFile: codeFile,
      isCodeResponse: isCodeGenRequest && codeFile !== null,
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

app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIPAddress();
  console.log("🚀 Google AI Chat Server Started!");
  console.log("=====================================");
  console.log(`🏠 Local access: http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://${localIP}:${PORT}`);
  console.log("=====================================");
  console.log(`📡 Server is accessible from any device on your WiFi network`);
  console.log(
    `📱 Share this URL with other devices: http://${localIP}:${PORT}`
  );
  console.log(
    `🔑 API Key configured: ${process.env.GOOGLE_API_KEY ? "Yes" : "No"}`
  );
  console.log("=====================================");
  console.log(`📋 Available endpoints:`);
  console.log(`  GET  /api/health - Health check`);
  console.log(`  POST /api/chat - Chat with Google AI`);
  console.log(`  POST /api/clear - Clear conversation history`);
  console.log("=====================================");
  console.log(
    `💡 Tip: Other users can access the chat at http://${localIP}:${PORT}`
  );
});
