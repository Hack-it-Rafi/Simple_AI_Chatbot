const readline = require("readline");
const axios = require("axios");

let SERVER_URL = process.argv[2] || "http://localhost:3001";
const DEFAULT_MODEL = "llama2";

if (!SERVER_URL.startsWith("http://") && !SERVER_URL.startsWith("https://")) {
  SERVER_URL = "http://" + SERVER_URL;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const sessionId = `terminal_${Date.now()}`;

console.log("🤖 Ollama Terminal Chat Client");
console.log("===============================");
console.log(`Server: ${SERVER_URL}`);
console.log(`Session ID: ${sessionId}`);
console.log("Commands:");
console.log("  /help     - Show this help message");
console.log("  /models   - List available models");
console.log("  /model <name> - Switch to a different model");
console.log("  /clear    - Clear conversation history");
console.log("  /health   - Check server health");
console.log("  /server <url> - Change server URL");
console.log("  /exit     - Exit the chat");
console.log("===============================");
console.log("💡 Usage: node terminal_chat.js [server_url]");
console.log("   Example: node terminal_chat.js 192.168.1.100:3001");
console.log("===============================\n");

let currentModel = DEFAULT_MODEL;

function changeServer(newUrl) {
  if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
    newUrl = "http://" + newUrl;
  }
  SERVER_URL = newUrl;
  console.log(`🔄 Switched to server: ${SERVER_URL}`);
}

async function checkHealth() {
  try {
    const response = await axios.get(`${SERVER_URL}/api/health`);
    console.log(`✅ Server Status: ${response.data.message}`);
    return true;
  } catch (error) {
    console.log(`❌ Server Error: ${error.message}`);
    console.log("Make sure the server is running and accessible");
    console.log(`Current server URL: ${SERVER_URL}`);
    return false;
  }
}

// Function to list available models
async function listModels() {
  try {
    console.log("🔍 Fetching available models...");
    const response = await axios.get(`${SERVER_URL}/api/models`);
    const models = response.data.models;

    if (models.length === 0) {
      console.log(
        "No models available. You may need to pull some models first."
      );
      console.log("Example: ollama pull llama2");
    } else {
      console.log("\n📚 Available Models:");
      models.forEach((model, index) => {
        const current = model.name === currentModel ? " (current)" : "";
        console.log(`  ${index + 1}. ${model.name}${current}`);
      });
    }
    console.log();
  } catch (error) {
    console.log(`❌ Error fetching models: ${error.message}`);
  }
}

function changeModel(modelName) {
  currentModel = modelName;
  console.log(`🔄 Switched to model: ${modelName}`);
}

async function clearConversation() {
  try {
    await axios.post(`${SERVER_URL}/api/clear`, { sessionId });
    console.log("🗑️  Conversation history cleared.");
  } catch (error) {
    console.log(`❌ Error clearing conversation: ${error.message}`);
  }
}

async function sendMessage(message) {
  try {
    console.log("🤔 Thinking...");

    const response = await axios.post(`${SERVER_URL}/api/chat`, {
      message: message,
      sessionId: sessionId,
      model: currentModel,
    });

    console.log(`\n🤖 ${currentModel}:`);
    console.log(response.data.response);
    console.log();
  } catch (error) {
    console.log(`❌ Error: ${error.response?.data?.error || error.message}`);
    if (error.response?.data?.details) {
      console.log(`Details: ${error.response.data.details}`);
    }
    console.log();
  }
}

async function sendStreamMessage(message) {
  try {
    console.log("🤔 Thinking...");
    console.log(`\n🤖 ${currentModel}:`);

    const response = await axios.post(
      `${SERVER_URL}/api/chat/stream`,
      {
        message: message,
        sessionId: sessionId,
        model: currentModel,
      },
      {
        responseType: "stream",
      }
    );

    return new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        const lines = chunk.toString().split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.token) {
                process.stdout.write(data.token);
              }

              if (data.done) {
                console.log("\n");
                resolve();
                return;
              }

              if (data.error) {
                console.log(`\n❌ Error: ${data.error}`);
                reject(new Error(data.error));
                return;
              }
            } catch (e) {
            }
          }
        }
      });

      response.data.on("end", () => {
        console.log("\n");
        resolve();
      });

      response.data.on("error", (error) => {
        console.log(`\n❌ Stream Error: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    console.log(`❌ Error: ${error.response?.data?.error || error.message}`);
    console.log();
  }
}

function showHelp() {
  console.log("\n📖 Available Commands:");
  console.log("  /help          - Show this help message");
  console.log("  /models        - List available models");
  console.log("  /model <name>  - Switch to a different model");
  console.log("  /clear         - Clear conversation history");
  console.log("  /health        - Check server health");
  console.log(
    "  /server <url>  - Change server URL (e.g., /server 192.168.1.100:3001)"
  );
  console.log("  /stream on/off - Toggle streaming mode");
  console.log("  /exit          - Exit the chat");
  console.log("\nOr just type your message and press Enter to chat!\n");
}

async function startChat() {
  const serverRunning = await checkHealth();
  if (!serverRunning) {
    console.log("\n🔧 Troubleshooting tips:");
    console.log("1. Make sure the server is running: npm run local");
    console.log("2. Check if the server URL is correct");
    console.log("3. Ensure firewall allows the connection");
    console.log("4. Try changing server with: /server <ip:port>");
    console.log("");
  }

  console.log(`💬 You can start chatting! Using model: ${currentModel}`);
  console.log("Type /help for commands or /exit to quit.\n");

  let streamingMode = false;

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const trimmedInput = input.trim();

      if (trimmedInput === "") {
        askQuestion();
        return;
      }

      if (trimmedInput.startsWith("/")) {
        const [command, ...args] = trimmedInput.slice(1).split(" ");

        switch (command.toLowerCase()) {
          case "help":
            showHelp();
            break;
          case "models":
            await listModels();
            break;
          case "model":
            if (args.length > 0) {
              changeModel(args[0]);
            } else {
              console.log("Usage: /model <model_name>");
            }
            break;
          case "clear":
            await clearConversation();
            break;
          case "health":
            await checkHealth();
            break;
          case "server":
            if (args.length > 0) {
              changeServer(args[0]);
            } else {
              console.log(`Current server: ${SERVER_URL}`);
              console.log(
                "Usage: /server <url> (e.g., /server 192.168.1.100:3001)"
              );
            }
            break;
          case "stream":
            if (args[0] === "on") {
              streamingMode = true;
              console.log("🌊 Streaming mode enabled");
            } else if (args[0] === "off") {
              streamingMode = false;
              console.log("📝 Streaming mode disabled");
            } else {
              console.log(
                `Streaming mode is currently: ${streamingMode ? "ON" : "OFF"}`
              );
              console.log("Usage: /stream on|off");
            }
            break;
          case "exit":
          case "quit":
            console.log("👋 Goodbye!");
            rl.close();
            return;
          default:
            console.log(`Unknown command: ${command}`);
            console.log("Type /help for available commands.");
        }
      } else {
        if (streamingMode) {
          await sendStreamMessage(trimmedInput);
        } else {
          await sendMessage(trimmedInput);
        }
      }

      askQuestion();
    });
  };

  askQuestion();
}

// Handle Ctrl+C
rl.on("SIGINT", () => {
  console.log("\n👋 Goodbye!");
  process.exit(0);
});

startChat();
