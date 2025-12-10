# Tutorial 1: Getting Started

Install the OpenKBS CLI, create your first agent, and deploy it to the cloud.

## 1.1 Install the CLI

```bash
npm install -g openkbs
```

Verify installation:

```bash
openkbs --version
```

## 1.2 Create Your Agent

```bash
openkbs create telegram-agent
cd telegram-agent
```

This creates the following structure:

```
telegram-agent/
├── app/
│   ├── settings.json      # Agent configuration
│   ├── instructions.txt   # System prompt for the LLM
│   └── icon.png           # Agent icon
├── src/
│   ├── Events/            # Backend handlers
│   │   ├── actions.js     # Command implementations
│   │   ├── handler.js     # Common handler logic
│   │   ├── onRequest.js   # Handles user messages
│   │   ├── onResponse.js  # Handles LLM responses
│   │   └── *.json         # NPM dependencies
│   └── Frontend/          # UI customization
│       ├── contentRender.js
│       └── contentRender.json
├── index.js               # Local dev server
└── package.json
```

### Key Files

| File | Purpose |
|------|---------|
| `app/settings.json` | Model, itemTypes, memory settings |
| `app/instructions.txt` | System prompt defining agent behavior |
| `src/Events/actions.js` | Command implementations |
| `src/Events/handler.js` | Processes commands from messages |

## 1.3 Deploy to Cloud

Login to OpenKBS:

```bash
openkbs login
```

This opens a browser for authentication. After logging in, deploy:

```bash
openkbs push
```

The CLI will:
1. Register your application
2. Upload frontend and backend code
3. Deploy everything
4. Return your agent URL: `https://{kbId}.apps.openkbs.com/`

Open the URL and chat with your agent!

## 1.4 Understanding the Flow

```
User sends message
       ↓
┌─────────────────────────┐
│  onRequest handler      │  ← Execute commands from user message
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  LLM Processing         │  ← System prompt + conversation
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  onResponse handler     │  ← Execute commands from LLM output
└───────────┬─────────────┘
            ↓
    Display to user
```

**How it works:**

1. User sends a message
2. `onRequest` can execute commands from the user message (useful for API integrations)
3. LLM processes the message with system prompt from `instructions.txt`
4. LLM may output XML commands like `<googleSearch>{"query": "..."}</googleSearch>`
5. `onResponse` parses these commands and executes them via `actions.js`
6. Results can loop back to LLM or display to user

## 1.5 Local Development

For faster frontend iteration:

```bash
npm install
npm start
```

Opens `http://localhost:38593` with hot-reload.

**Note:** Backend changes require `openkbs push` to take effect.

## 1.6 Your First Customization

Edit `app/instructions.txt`:

```text
You are a helpful reminder assistant. Help users set reminders and manage their tasks.

When a user asks to set a reminder, confirm the time and what to remind them about.
```

Deploy:

```bash
openkbs push
```

## Summary

- Installed OpenKBS CLI
- Created agent with `openkbs create`
- Deployed with `openkbs push`
- Understood the message flow
- Set up local development

## Next

[Tutorial 2: Backend Commands](./02-backend-commands.md) - Create custom commands.
