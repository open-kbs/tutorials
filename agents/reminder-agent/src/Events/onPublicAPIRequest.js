// Public API Request Handler - Telegram Webhook Integration
import crypto from 'crypto';

const BOT_TOKEN = '{{secrets.telegramBotToken}}';

// Helper: upsert agent setting
async function setAgentSetting(itemId, value) {
    const body = { value, updatedAt: new Date().toISOString() };
    try {
        await openkbs.updateItem({ itemType: 'agent', itemId, body });
    } catch (e) {
        await openkbs.createItem({ itemType: 'agent', itemId, body });
    }
}

// Helper: get agent setting
async function getAgentSetting(itemId) {
    try {
        const result = await openkbs.getItem(itemId);
        return result?.item?.body?.value;
    } catch (e) {
        return null;
    }
}

// Helper: store telegram message
async function storeTelegramMessage(messageId, data) {
    const itemId = `telegram_${messageId.toString().padStart(12, '0')}`;
    const body = { ...data, storedAt: new Date().toISOString() };
    try {
        await openkbs.updateItem({ itemType: 'telegram', itemId, body });
    } catch (e) {
        await openkbs.createItem({ itemType: 'telegram', itemId, body });
    }
}

// Helper: check if message already processed
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
        // Get channel ID from secrets or agent settings
        let CHANNEL_ID = '{{secrets.telegramChannelID}}';
        if (!CHANNEL_ID || CHANNEL_ID.includes('{{')) {
            CHANNEL_ID = await getAgentSetting('agent_telegramChannelID');
        }

        // =====================================================================
        // WEBHOOK SETUP - Call once: ?setupTelegramWebhook=true
        // =====================================================================
        if (queryStringParameters?.setupTelegramWebhook === 'true') {
            // Check if already configured
            const existingSetup = await getAgentSetting('agent_telegramWebhookSetup');
            if (existingSetup) {
                return {
                    ok: false,
                    error: 'Webhook already configured',
                    setupDate: existingSetup
                };
            }

            // Generate secret token from bot token
            const SECRET_TOKEN = crypto.createHash('sha256')
                .update(BOT_TOKEN)
                .digest('hex')
                .substring(0, 32);

            // Webhook URL
            const WEBHOOK_URL = `https://chat.openkbs.com/publicAPIRequest?kbId=${openkbs.kbId}&source=telegram`;

            // Remove any existing webhook first
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);

            // Set new webhook
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: WEBHOOK_URL,
                    allowed_updates: ['channel_post'],
                    drop_pending_updates: true,
                    secret_token: SECRET_TOKEN
                })
            });

            const result = await response.json();

            if (!result.ok) {
                return { ok: false, error: result.description };
            }

            // Save setup date
            await setAgentSetting('agent_telegramWebhookSetup', new Date().toISOString());

            // Send test message if channel is configured
            if (CHANNEL_ID) {
                try {
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: CHANNEL_ID,
                            text: '✅ *Telegram Integration Active*\n\nWebhook configured successfully!',
                            parse_mode: 'Markdown'
                        })
                    });
                } catch (e) {
                    // Ignore - channel might not be set up yet
                }
            }

            return {
                ok: true,
                message: 'Webhook configured successfully',
                webhookUrl: WEBHOOK_URL,
                channelId: CHANNEL_ID || 'Will be auto-detected on first message',
                kbId: openkbs.kbId
            };
        }

        // =====================================================================
        // WEBHOOK REMOVAL - Call: ?removeTelegramWebhook=true
        // =====================================================================
        if (queryStringParameters?.removeTelegramWebhook === 'true') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drop_pending_updates: true })
            });

            // Clear setup flag
            try {
                await openkbs.deleteItem('agent_telegramWebhookSetup');
            } catch (e) {}

            return { ok: true, message: 'Webhook removed' };
        }

        // =====================================================================
        // INCOMING TELEGRAM MESSAGE
        // =====================================================================

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
            return { ok: false, error: 'Invalid secret token' };
        }

        // Handle channel posts
        if (payload?.channel_post) {
            const post = payload.channel_post;
            const text = post.text || post.caption || '';
            const chatId = post.chat.id;
            const messageId = post.message_id;

            // Auto-save channel ID on first message
            if (!CHANNEL_ID) {
                await setAgentSetting('agent_telegramChannelID', chatId.toString());
            }

            // Check for duplicate
            const existing = await getTelegramMessage(messageId);
            if (existing) {
                return { ok: true, duplicate: true };
            }

            // Get sender info
            let senderName = post.author_signature ||
                post.from?.username ||
                post.from?.first_name ||
                'Channel';

            // Store message
            await storeTelegramMessage(messageId, {
                text,
                from: senderName,
                chatId,
                date: post.date,
                type: 'channel'
            });

            // Create chat for agent to process
            await openkbs.chats({
                chatTitle: `TG: ${senderName}`,
                message: `[TELEGRAM] From ${senderName}:\n\n${text}`
            });

            return { ok: true, processed: 'channel_post', messageId };
        }

        return { ok: true, message: 'No action needed' };

    } catch (error) {
        console.error('Telegram webhook error:', error);
        // Always return ok:true to prevent Telegram retries
        return { ok: true, error: error.message };
    }
};
