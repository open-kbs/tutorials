# Tutorial 5: Telegram Integration

Connect your agent to Telegram for notifications and receiving messages.

## 5.1 Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name: `My Reminder Bot`
4. Choose a username: `myreminder_bot` (must end with `bot`)
5. Copy the **bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## 5.2 Add Secret to OpenKBS

1. Go to [OpenKBS Console](https://openkbs.com)
2. Open your agent FileManager
3. Go to **Secrets** section (click the Key Icon)
4. Add: `telegramBotToken` = your bot token

## 5.3 Create a Telegram Channel (Optional)

If you want to receive messages from a channel:

1. Create a new channel in Telegram
2. Add your bot as **administrator**
3. Get channel ID:
   - Send a message to the channel
   - The ID will be auto-saved when you set up the webhook

Or add secret manually:
- `telegramChannelID` = your channel ID (e.g., `-1001234567890`)

## 5.4 Add telegram itemType

Update `app/settings.json`:

```json
{
  "model": "gemini-2.5-pro-preview-03-25",
  "itemTypes": {
    "memory": { ... },
    "agent": { ... },
    "telegram": {
      "attributes": [
        { "attrName": "itemId", "attrType": "itemId", "encrypted": false },
        { "attrName": "body", "attrType": "body", "encrypted": true }
      ]
    }
  },
  "options": {
    "priorityItems": [
      { "prefix": "memory", "limit": 100 },
      { "prefix": "agent", "limit": 20 },
      { "prefix": "telegram", "limit": 50 }
    ]
  }
}
```

## 5.5 Create onPublicAPIRequest.js

This handler receives webhooks from Telegram:

```javascript
// src/Events/onPublicAPIRequest.js
import crypto from 'crypto';

const BOT_TOKEN = '{{secrets.telegramBotToken}}';

// Helper functions
async function setAgentSetting(itemId, value) {
    const body = { value, updatedAt: new Date().toISOString() };
    try {
        await openkbs.updateItem({ itemType: 'agent', itemId, body });
    } catch (e) {
        await openkbs.createItem({ itemType: 'agent', itemId, body });
    }
}

async function getAgentSetting(itemId) {
    try {
        const result = await openkbs.getItem(itemId);
        return result?.item?.body?.value;
    } catch (e) {
        return null;
    }
}

async function storeTelegramMessage(messageId, data) {
    const itemId = `telegram_${messageId.toString().padStart(12, '0')}`;
    const body = { ...data, storedAt: new Date().toISOString() };
    try {
        await openkbs.updateItem({ itemType: 'telegram', itemId, body });
    } catch (e) {
        await openkbs.createItem({ itemType: 'telegram', itemId, body });
    }
}

async function getTelegramMessage(messageId) {
    try {
        const itemId = `telegram_${messageId.toString().padStart(12, '0')}`;
        const result = await openkbs.getItem(itemId);
        return result?.item?.body;
    } catch (e) {
        return null;
    }
}

export const handler = async ({ payload, queryStringParameters, headers }) => {
    try {
        let CHANNEL_ID = '{{secrets.telegramChannelID}}';
        if (!CHANNEL_ID || CHANNEL_ID.includes('{{')) {
            CHANNEL_ID = await getAgentSetting('agent_telegramChannelID');
        }

        // =============================================
        // WEBHOOK SETUP
        // =============================================
        if (queryStringParameters?.setupTelegramWebhook === 'true') {
            const existingSetup = await getAgentSetting('agent_telegramWebhookSetup');
            if (existingSetup) {
                return { ok: false, error: 'Already configured', setupDate: existingSetup };
            }

            const SECRET_TOKEN = crypto.createHash('sha256')
                .update(BOT_TOKEN)
                .digest('hex')
                .substring(0, 32);

            const WEBHOOK_URL = `https://chat.openkbs.com/publicAPIRequest?kbId=${openkbs.kbId}&source=telegram`;

            // Remove existing webhook
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);

            // Set new webhook
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: WEBHOOK_URL,
                    allowed_updates: ['message', 'channel_post'],
                    drop_pending_updates: true,
                    secret_token: SECRET_TOKEN
                })
            });

            const result = await response.json();
            if (!result.ok) {
                return { ok: false, error: result.description };
            }

            await setAgentSetting('agent_telegramWebhookSetup', new Date().toISOString());

            // Send test message if channel configured
            if (CHANNEL_ID) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHANNEL_ID,
                        text: '✅ *Telegram Integration Active*',
                        parse_mode: 'Markdown'
                    })
                });
            }

            return {
                ok: true,
                message: 'Webhook configured',
                webhookUrl: WEBHOOK_URL,
                channelId: CHANNEL_ID || 'Will auto-detect on first message'
            };
        }

        // =============================================
        // WEBHOOK REMOVAL
        // =============================================
        if (queryStringParameters?.removeTelegramWebhook === 'true') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drop_pending_updates: true })
            });
            try {
                await openkbs.deleteItem('agent_telegramWebhookSetup');
            } catch (e) {}
            return { ok: true, message: 'Webhook removed' };
        }

        // =============================================
        // INCOMING MESSAGE
        // =============================================

        // Verify secret token
        const expectedToken = crypto.createHash('sha256')
            .update(BOT_TOKEN)
            .digest('hex')
            .substring(0, 32);

        const receivedToken = headers?.[
            Object.keys(headers || {}).find(key =>
                key.toLowerCase() === 'x-telegram-bot-api-secret-token'
            )
        ];

        if (receivedToken && receivedToken !== expectedToken) {
            return { ok: false, error: 'Invalid token' };
        }

        // Handle channel posts
        if (payload?.channel_post) {
            const post = payload.channel_post;
            const text = post.text || post.caption || '';
            const chatId = post.chat.id;
            const messageId = post.message_id;

            // Auto-save channel ID
            if (!CHANNEL_ID) {
                await setAgentSetting('agent_telegramChannelID', chatId.toString());
            }

            // Check duplicate
            if (await getTelegramMessage(messageId)) {
                return { ok: true, duplicate: true };
            }

            const senderName = post.author_signature ||
                post.from?.username ||
                'Channel';

            await storeTelegramMessage(messageId, {
                text, from: senderName, chatId,
                date: post.date, type: 'channel'
            });

            // Create chat for agent
            await openkbs.chats({
                chatTitle: `TG: ${senderName}`,
                message: `[TELEGRAM] From ${senderName}:\n\n${text}`
            });

            return { ok: true, processed: 'channel_post' };
        }

        // Handle direct messages
        if (payload?.message) {
            const msg = payload.message;
            const text = msg.text || '';
            const messageId = msg.message_id;
            const userName = msg.from?.username || msg.from?.first_name || 'User';

            if (await getTelegramMessage(messageId)) {
                return { ok: true, duplicate: true };
            }

            await storeTelegramMessage(messageId, {
                text, from: userName,
                chatId: msg.chat.id,
                userId: msg.from?.id,
                date: msg.date, type: 'direct'
            });

            await openkbs.chats({
                chatTitle: `TG DM: ${userName}`,
                message: `[TELEGRAM_DM] From ${userName}:\n\n${text}`
            });

            return { ok: true, processed: 'message' };
        }

        return { ok: true };
    } catch (error) {
        console.error('Telegram error:', error);
        return { ok: true, error: error.message };
    }
};
```

### Create onPublicAPIRequest.json

```json
{
  "dependencies": {}
}
```

## 5.6 Send to Telegram Command

Add to `src/Events/actions.js`:

```javascript
const TELEGRAM_BOT_TOKEN = '{{secrets.telegramBotToken}}';

async function sendToTelegram(message, options = {}) {
    let channelId = '{{secrets.telegramChannelID}}';
    if (!channelId || channelId.includes('{{')) {
        channelId = await getAgentSetting('agent_telegramChannelID');
    }

    if (!channelId) {
        return { success: false, error: 'Channel not configured' };
    }

    const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: channelId,
                text: message,
                parse_mode: 'Markdown',
                disable_notification: options.silent || false
            })
        }
    );

    const data = await response.json();
    return data.ok
        ? { success: true, messageId: data.result.message_id }
        : { success: false, error: data.description };
}

// In getActions array:
[/<sendToTelegram>([\s\S]*?)<\/sendToTelegram>/s, async (match) => {
    try {
        const data = JSON.parse(match[1].trim());
        const result = await sendToTelegram(data.message, { silent: data.silent });

        if (result.success) {
            return {
                type: "TELEGRAM_SENT",
                messageId: result.messageId,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
        return { type: "TELEGRAM_ERROR", error: result.error, ...meta };
    } catch (e) {
        return { type: "ERROR", error: e.message, ...meta };
    }
}],
```

## 5.7 Define in Instructions

```text
## Telegram

<sendToTelegram>
{
  "message": "Don't forget: Meeting at 3pm!",
  "silent": false
}
</sendToTelegram>
Description: Send notification to Telegram. silent: true for no sound.
```

## 5.8 Deploy and Setup

```bash
openkbs push
```

**Setup webhook** - visit this URL once:
```
https://chat.openkbs.com/publicAPIRequest?kbId=YOUR_KB_ID&setupTelegramWebhook=true
```

Replace `YOUR_KB_ID` with your actual KB ID (shown after `openkbs push`).

You should see:
```json
{
  "ok": true,
  "message": "Webhook configured",
  "webhookUrl": "https://chat.openkbs.com/publicAPIRequest?kbId=xxx&source=telegram"
}
```

## 5.9 Test Integration

1. **Send from agent**: Ask "Send a test message to Telegram"
2. **Receive in agent**: Send a message to your Telegram channel - a new chat should appear in your agent

## 5.10 Removing Webhook

If you need to reconfigure:
```
https://chat.openkbs.com/publicAPIRequest?kbId=YOUR_KB_ID&removeTelegramWebhook=true
```

## Summary

- Created Telegram bot via @BotFather
- Added `telegramBotToken` secret
- Added `telegram` itemType to settings.json
- Created `onPublicAPIRequest.js` for webhook handling
- Setup webhook with `?setupTelegramWebhook=true`
- Messages from Telegram create new chats
- Agent can send notifications via `sendToTelegram` command

## Next Steps

Continue to [Tutorial 6: Frontend Rendering](./06-frontend-rendering.md) to learn how to customize the chat UI - display commands as icons, show images with download buttons, and more.

The complete code is in [agents/reminder-agent/](./agents/reminder-agent/).
