# Telegram Agent

AI-powered Telegram agent. Built as a complete tutorial example for OpenKBS.

## Features

- **Memory Management**: Store and retrieve persistent data
- **Scheduled Tasks**: Set one-time reminders with flexible delay formats
- **Telegram Integration**: Receive notifications via Telegram bot
- **Web Search**: Search Google and extract webpage content
- **Image Generation**: Create AI-generated images
- **Automatic Cleanup**: Cronjob cleans expired memory items hourly

## Quick Start

```bash
# Clone or copy this agent
cd telegram-agent

# Install dependencies
npm install

# Login to OpenKBS
openkbs login

# Deploy
openkbs push
```

## Telegram Setup

1. **Create a Telegram Bot**:
   - Open [@BotFather](https://t.me/BotFather) in Telegram
   - Send `/newbot` and follow the prompts
   - Copy the bot token (looks like `123456789:ABCdefGhIJKlmNOPQRstUVwxYZ`)

2. **Add Secret**:
   - Open your agent in OpenKBS Console
   - Go to FileManager → Secrets (key icon)
   - Add: `telegramBotToken` = your bot token

3. **Create a Channel**:
   - Create a private Telegram channel
   - Add your bot as administrator

4. **Setup Webhook**:
   - After deploying, visit:
   ```
   https://chat.openkbs.com/publicAPIRequest?kbId=YOUR_KB_ID&setupTelegramWebhook=true
   ```
   - You should see "Webhook configured successfully"

5. **Activate Channel**: Send a message to your channel - the channel ID will be auto-saved

6. **Test**: Send another message - a new chat should appear in your agent!

## Available Commands

### Memory
```
<setMemory>{"itemId": "memory_user_name", "value": "John"}</setMemory>
<deleteItem>{"itemId": "memory_old_data"}</deleteItem>
<cleanupMemory/>
```

### Scheduled Tasks
```
<scheduleTask>{"message": "Call mom", "delay": "2h"}</scheduleTask>
<scheduleTask>{"message": "Meeting", "time": "2024-12-25 10:00"}</scheduleTask>
<getScheduledTasks/>
<deleteScheduledTask>{"timestamp": 1704067200000}</deleteScheduledTask>
```

### Telegram
```
<sendTelegram>{"message": "Hello!", "silent": false}</sendTelegram>
<sendTelegramPhoto>{"photoUrl": "https://...", "caption": "Check this!"}</sendTelegramPhoto>
```

### Search & Content
```
<googleSearch>{"query": "weather today"}</googleSearch>
<webpageToText>{"url": "https://example.com"}</webpageToText>
```

### Images
```
<createAIImage>{"prompt": "sunset over mountains", "aspect_ratio": "16:9"}</createAIImage>
```

## Project Structure

```
telegram-agent/
├── app/
│   ├── settings.json      # Agent config, itemTypes
│   ├── instructions.txt   # System prompt
│   └── icon.png
├── src/
│   ├── Events/
│   │   ├── actions.js           # Command implementations
│   │   ├── handler.js           # Common handler logic
│   │   ├── onRequest.js         # User message handler
│   │   ├── onResponse.js        # LLM response handler
│   │   ├── onCronjob.js         # Hourly cleanup
│   │   ├── onPublicAPIRequest.js # Telegram webhook
│   │   └── *.json               # NPM dependencies
│   └── Frontend/
│       ├── contentRender.js     # UI customization
│       └── contentRender.json   # Frontend dependencies
├── package.json
└── README.md
```

## Local Development

```bash
npm install
npm start
```

Opens `http://localhost:38593` with hot-reload for frontend changes.

**Note**: Backend changes require `openkbs push` to take effect.

## License

MIT
