# AI Chatbot with Google AI Studio

A modern, full-stack AI chatbot application powered by Google AI Studio (Gemini) with Express.js backend and responsive frontend.

![AI Chatbot](https://img.shields.io/badge/AI-Chatbot-purple)
![Node.js](https://img.shields.io/badge/Node.js-Express-green)
![Google AI](https://img.shields.io/badge/Google-AI%20Studio-blue)

## 🌟 Features

- **💬 Real-time Chat Interface** - Clean, modern UI with smooth animations
- **🧠 Context-Aware Conversations** - Maintains conversation history for natural dialogue
- **🎨 Beautiful Design** - Gradient theme with responsive layout
- **⚡ Fast Responses** - Powered by Google's Gemini AI model
- **📱 Mobile Responsive** - Works seamlessly on all devices
- **🔄 Session Management** - Unique session IDs for multiple users
- **✨ Rich Text Formatting** - Supports bold, italic, code blocks, and lists
- **🗑️ Clear History** - Easy conversation reset functionality

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- npm (comes with Node.js)
- A Google AI Studio API key

## 🚀 Getting Started

### 1. Clone or Download the Project

```bash
cd API_Chatbot
```

### 2. Install Dependencies

```bash
npm install
```

This will install:

- `express` - Web framework
- `dotenv` - Environment variable management
- `@google/generative-ai` - Google AI SDK
- `cors` - Cross-origin resource sharing

### 3. Get Your Google AI Studio API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click on "Get API Key" or "Create API Key"
4. Copy your API key

### 4. Configure Environment Variables

Open the `.env` file in the root directory and replace the placeholder with your actual API key:

```env
GOOGLE_API_KEY=your_actual_api_key_here
PORT=3000
```

### 5. Start the Server

```bash
npm start
```

You should see:

```
Server is running on http://localhost:3000
API Key configured: Yes
```

### 6. Open Your Browser

Navigate to:

```
http://localhost:3000
```

Start chatting with your AI assistant! 🤖

## 📁 Project Structure

```
API_Chatbot/
├── server.js              # Express backend with Google AI integration
├── package.json           # Project dependencies and scripts
├── .env                   # Environment variables (API key)
├── .gitignore            # Git ignore rules
├── README.md             # This file
└── public/               # Frontend files
    ├── index.html        # Main HTML structure
    ├── style.css         # Styling and animations
    └── script.js         # Frontend JavaScript logic
```

## 🔧 Configuration

### Environment Variables

| Variable         | Description                   | Default  |
| ---------------- | ----------------------------- | -------- |
| `GOOGLE_API_KEY` | Your Google AI Studio API key | Required |
| `PORT`           | Server port number            | 3000     |

### Model Configuration

The chatbot uses `gemini-1.5-flash-latest` by default. You can change this in `server.js`:

```javascript
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
```

## 🎯 API Endpoints

### Health Check

- **GET** `/api/health`
- Returns server status

### Send Message

- **POST** `/api/chat`
- Body: `{ "message": "Your message", "sessionId": "optional-session-id" }`
- Returns: `{ "response": "AI response", "sessionId": "session-id", "timestamp": "ISO date" }`

### Clear History

- **POST** `/api/clear`
- Body: `{ "sessionId": "optional-session-id" }`
- Clears conversation history for the session

## 💡 Usage Examples

### Basic Conversation

```
You: Hello! What can you help me with?
Bot: Hi! I'm your AI assistant. I can help you with...
```

### Context-Aware

```
You: My name is Sarah
Bot: Nice to meet you, Sarah!
You: What's my name?
Bot: Your name is Sarah.
```

### Clear Chat

Click the "Clear Chat" button in the header to reset the conversation.

## 🎨 Customization

### Change Theme Colors

Edit `public/style.css`:

```css
/* Change gradient colors */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Adjust Message Limit

Edit `server.js`:

```javascript
// Change from 20 to your preferred number
if (history.length > 20) {
  history.splice(0, history.length - 20);
}
```

### Modify Max Tokens

Edit `server.js`:

```javascript
generationConfig: {
  maxOutputTokens: 1000, // Adjust this value
}
```

