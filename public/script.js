const sessionId =
  "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

const chatContainer = document.getElementById("chatContainer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const statusDiv = document.getElementById("status");

messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

messageInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

clearBtn.addEventListener("click", clearChat);

function addMessage(text, isUser = false) {
  const welcomeMessage = chatContainer.querySelector(".welcome-message");
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "bot"}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (isUser) {
    contentDiv.textContent = text;
  } else {
    contentDiv.innerHTML = formatBotMessage(text);
  }

  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatBotMessage(text) {
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/__(.+?)__/g, "<strong>$1</strong>");

  formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");
  formatted = formatted.replace(/_(.+?)_/g, "<em>$1</em>");

  formatted = formatted.replace(/`(.+?)`/g, "<code>$1</code>");

  formatted = formatted.replace(/\n/g, "<br>");

  formatted = formatted.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");

  formatted = formatted.replace(/(<li>.*<\/li>\s*)+/g, "<ul>$&</ul>");

  return formatted;
}

function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "message bot";
  typingDiv.id = "typing-indicator";

  const indicatorDiv = document.createElement("div");
  indicatorDiv.className = "typing-indicator";
  indicatorDiv.innerHTML = "<span></span><span></span><span></span>";

  typingDiv.appendChild(indicatorDiv);
  chatContainer.appendChild(typingDiv);

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

function updateStatus(message, isError = false) {
  statusDiv.textContent = message;
  statusDiv.className = "status" + (isError ? " error" : "");

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
      }),
    });

    const data = await response.json();

    removeTypingIndicator();

    if (response.ok) {
      addMessage(data.response, false);
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
      "Connection error. Please check your internet connection.",
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
                    <h2>Welcome! 👋</h2>
                    <p>I'm your AI assistant. How can I help you today?</p>
                </div>
            `;
      updateStatus("Chat history cleared");
    }
  } catch (error) {
    console.error("Error clearing chat:", error);
    updateStatus("Failed to clear chat history", true);
  }
}

window.addEventListener("load", async () => {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.status === "OK") {
      updateStatus("Connected");
    }
  } catch (error) {
    updateStatus("Warning: Could not connect to server", true);
  }
});
