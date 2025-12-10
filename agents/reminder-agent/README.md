# Reminder Agent

Personal reminder agent with Telegram integration. Built as a complete tutorial example for OpenKBS.

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
cd reminder-agent

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
   - Go to your agent settings in OpenKBS Console
   - Add secret: `telegramBotToken` = your bot token

3. **Create a Channel** (optional):
   - Create a Telegram channel
   - Add your bot as administrator
   - Add secret: `telegramChannelID` = your channel ID (or let it auto-detect)

4. **Setup Webhook**:
   - After deploying, visit:
   ```
   https://chat.openkbs.com/publicAPIRequest?kbId=YOUR_KB_ID&setupTelegramWebhook=true
   ```
   - You should see "Webhook configured successfully"

5. **Test**: Send a message to your channel - the agent will receive it!

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
<sendToTelegram>{"message": "Hello!", "silent": false}</sendToTelegram>
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
reminder-agent/
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
