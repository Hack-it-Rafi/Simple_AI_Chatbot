const sessionId =
  "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

const chatContainer = document.getElementById("chatContainer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const statusDiv = document.getElementById("status");
const modelSelect = document.getElementById("modelSelect");

// Auto-resize textarea
messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 200) + "px";
});

// Send message on Enter (without Shift)
messageInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);
clearBtn.addEventListener("click", clearChat);

// Load available models on page load
window.addEventListener("load", loadModels);

async function loadModels() {
  try {
    const response = await fetch("/api/models");
    const data = await response.json();

    if (response.ok && data.models && data.models.length > 0) {
      // Clear existing options
      modelSelect.innerHTML = "";

      // Add models to select
      data.models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.name;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });

      // Set default selection
      if (data.models.some((m) => m.name === "llama3.2:latest")) {
        modelSelect.value = "llama3.2:latest";
      } else if (data.models.length > 0) {
        modelSelect.value = data.models[0].name;
      }
    }
  } catch (error) {
    console.error("Error loading models:", error);
    updateStatus("Could not load models", true);
  }

  // Check server health
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.status === "OK") {
      updateStatus("Connected");
    }
  } catch (error) {
    updateStatus("Warning: Could not connect to server", true);
  }
}

function addMessage(text, isUser = false) {
  const welcomeMessage = chatContainer.querySelector(".welcome-message");
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "bot"}`;

  // Create avatar
  const avatarDiv = document.createElement("div");
  avatarDiv.className = "message-avatar";
  avatarDiv.textContent = isUser ? "👤" : "🤖";

  // Create content
  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (isUser) {
    contentDiv.textContent = text;
  } else {
    contentDiv.innerHTML = formatBotMessage(text);
  }

  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatBotMessage(text) {
  // Escape HTML first
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Format markdown-style text
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/__(.+?)__/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");
  formatted = formatted.replace(/_(.+?)_/g, "<em>$1</em>");
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Handle code blocks
  formatted = formatted.replace(/```([^`]+)```/g, "<pre><code>$1</code></pre>");

  // Convert line breaks to paragraphs
  const paragraphs = formatted.split("\n\n");
  if (paragraphs.length > 1) {
    formatted = paragraphs
      .filter((p) => p.trim())
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
  } else {
    formatted = `<p>${formatted.replace(/\n/g, "<br>")}</p>`;
  }

  // Handle lists (simple implementation)
  formatted = formatted.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");
  formatted = formatted.replace(/(<li>.*<\/li>\s*)+/g, "<ul>$&</ul>");

  return formatted;
}

function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-indicator";
  typingDiv.id = "typing-indicator";

  // Create avatar
  const avatarDiv = document.createElement("div");
  avatarDiv.className = "message-avatar";
  avatarDiv.textContent = "🤖";

  // Create typing dots
  const dotsDiv = document.createElement("div");
  dotsDiv.className = "typing-dots";
  dotsDiv.innerHTML = "<span></span><span></span><span></span>";

  typingDiv.appendChild(avatarDiv);
  typingDiv.appendChild(dotsDiv);
  chatContainer.appendChild(typingDiv);

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

function updateStatus(message, isError = false, isSuccess = false) {
  statusDiv.textContent = message;
  statusDiv.className = "status";

  if (isError) {
    statusDiv.className += " error";
  } else if (isSuccess) {
    statusDiv.className += " success";
  }

  if (message) {
    setTimeout(() => {
      statusDiv.textContent = "";
      statusDiv.className = "status";
    }, 3000);
  }
}

async function sendMessage() {
  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  addMessage(message, true);

  messageInput.value = "";
  messageInput.style.height = "auto";

  sendBtn.disabled = true;
  messageInput.disabled = true;

  showTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        sessionId: sessionId,
        model: modelSelect.value,
      }),
    });

    const data = await response.json();

    removeTypingIndicator();

    if (response.ok) {
      addMessage(data.response, false);
      updateStatus(`Response from ${data.model}`, false, true);
    } else {
      addMessage(
        "Sorry, I encountered an error: " + (data.error || "Unknown error"),
        false
      );
      updateStatus("Error: " + (data.error || "Failed to get response"), true);
    }
  } catch (error) {
    console.error("Error:", error);
    removeTypingIndicator();
    addMessage(
      "Sorry, I could not connect to the server. Please try again.",
      false
    );
    updateStatus(
      "Connection error. Please check if the server is running.",
      true
    );
  } finally {
    sendBtn.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
}

async function clearChat() {
  if (!confirm("Are you sure you want to clear the chat history?")) {
    return;
  }

  try {
    const response = await fetch("/api/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionId,
      }),
    });

    if (response.ok) {
      chatContainer.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-icon">🤖</div>
          <h2>How can I help you today?</h2>
          <p>I'm powered by your local Ollama models. Ask me anything!</p>
        </div>
      `;
      updateStatus("Chat history cleared", false, true);
    }
  } catch (error) {
    console.error("Error clearing chat:", error);
    updateStatus("Failed to clear chat history", true);
  }
}
