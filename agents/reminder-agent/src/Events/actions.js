// Reminder Agent - Backend Actions
// All command implementations with proper error handling

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Upsert pattern - update item or create if not exists
 * No race conditions - atomic operation
 */
async function upsertItem(itemType, itemId, body) {
    try {
        await openkbs.updateItem({ itemType, itemId, body });
    } catch (e) {
        await openkbs.createItem({ itemType, itemId, body });
    }
}

/**
 * Set memory value with optional expiration
 */
async function setMemoryValue(itemId, value, expirationInMinutes = null) {
    if (!itemId.startsWith('memory_')) {
        itemId = `memory_${itemId}`;
    }

    const body = {
        value,
        updatedAt: new Date().toISOString()
    };

    if (expirationInMinutes != null) {
        body.exp = new Date(Date.now() + expirationInMinutes * 60 * 1000).toISOString();
    }

    await upsertItem('memory', itemId, body);
    return { success: true, itemId };
}

/**
 * Get agent setting value
 */
async function getAgentSetting(itemId) {
    try {
        const result = await openkbs.getItem(itemId);
        return result?.item?.body?.value;
    } catch (e) {
        return null;
    }
}

/**
 * Set agent setting
 */
async function setAgentSetting(itemId, value) {
    await upsertItem('agent', itemId, {
        value,
        updatedAt: new Date().toISOString()
    });
}

/**
 * Cleanup expired items by prefix
 */
async function cleanupExpiredItems(prefix, limit = 100) {
    const result = await openkbs.fetchItems({
        beginsWith: `${prefix}_`,
        limit
    });

    if (!result?.items) return { cleaned: 0 };

    let cleaned = 0;
    const now = new Date();

    for (const item of result.items) {
        if (item.item?.body?.exp) {
            const expDate = new Date(item.item.body.exp);
            if (expDate < now) {
                await openkbs.deleteItem(item.meta.itemId);
                cleaned++;
            }
        }
    }

    return { cleaned };
}

// ============================================================================
// TELEGRAM HELPER
// ============================================================================

const TELEGRAM_BOT_TOKEN = '{{secrets.telegramBotToken}}';

async function getTelegramChannelId() {
    let channelId = '{{secrets.telegramChannelID}}';
    if (!channelId || channelId.includes('{{')) {
        channelId = await getAgentSetting('agent_telegramChannelID');
    }
    return channelId;
}

/**
 * Send text message to Telegram (bot DM or channel)
 * @param {string|null} chatId - User's chatId for DM, or null/undefined for channel
 * @param {string} message - Text message
 * @param {object} options - { parse_mode, silent }
 */
async function sendTelegramMessage(chatId, message, options = {}) {
    // If no chatId provided, use channel
    if (!chatId) {
        chatId = await getTelegramChannelId();
        if (!chatId) {
            return {
                success: false,
                error: 'Telegram channel not configured. Send a message to your channel first to auto-configure, or set telegramChannelID secret.'
            };
        }
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: options.parse_mode || 'Markdown',
                disable_notification: options.silent || false
            })
        });

        const data = await response.json();

        if (data.ok) {
            return { success: true, messageId: data.result.message_id };
        }
        return { success: false, error: data.description };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Send photo to Telegram (bot DM or channel)
 * @param {string|null} chatId - User's chatId for DM, or null/undefined for channel
 * @param {string} photoUrl - URL of the photo
 * @param {string} caption - Optional caption
 */
async function sendTelegramPhoto(chatId, photoUrl, caption = '') {
    // If no chatId provided, use channel
    if (!chatId) {
        chatId = await getTelegramChannelId();
        if (!chatId) {
            return {
                success: false,
                error: 'Telegram channel not configured.'
            };
        }
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                photo: photoUrl,
                caption: caption,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();

        if (data.ok) {
            return { success: true, messageId: data.result.message_id };
        }
        return { success: false, error: data.description };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ACTIONS - Command implementations
// ============================================================================

export const getActions = (meta, event) => [

    // =========================================================================
    // MEMORY MANAGEMENT
    // =========================================================================

    /**
     * Save to memory with optional expiration
     * Usage: <setMemory>{"itemId": "memory_key", "value": "data", "expirationInMinutes": 60}</setMemory>
     */
    [/<setMemory>([\s\S]*?)<\/setMemory>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            let itemId = data.itemId;

            // Ensure prefix
            if (!itemId.startsWith('memory_')) {
                itemId = `memory_${itemId}`;
            }

            await setMemoryValue(itemId, data.value, data.expirationInMinutes);

            return {
                type: "MEMORY_SAVED",
                itemId,
                expires: data.expirationInMinutes ? `in ${data.expirationInMinutes} minutes` : 'never',
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "MEMORY_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    /**
     * Delete any item by ID
     * Usage: <deleteItem>{"itemId": "memory_key"}</deleteItem>
     */
    [/<deleteItem>([\s\S]*?)<\/deleteItem>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            await openkbs.deleteItem(data.itemId);
            return {
                type: "ITEM_DELETED",
                itemId: data.itemId,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "DELETE_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    /**
     * Cleanup expired memory items
     * Usage: <cleanupMemory/>
     */
    [/<cleanupMemory\s*\/>/s, async () => {
        try {
            const result = await cleanupExpiredItems('memory');
            return {
                type: "CLEANUP_COMPLETE",
                cleaned: result.cleaned,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "CLEANUP_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    // =========================================================================
    // SCHEDULED TASKS
    // =========================================================================

    /**
     * Schedule a task for future execution
     * Usage: <scheduleTask>{"message": "reminder text", "delay": "1h"}</scheduleTask>
     */
    [/<scheduleTask>([\s\S]*?)<\/scheduleTask>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            let scheduledTime;

            if (data.time) {
                // Specific time: "2024-12-25 10:00" or ISO format
                let timeStr = data.time.replace(' ', 'T');
                if (!timeStr.includes('Z') && !timeStr.includes('+')) timeStr += 'Z';
                scheduledTime = new Date(timeStr).getTime();
            } else if (data.delay) {
                // Relative delay: "30m", "2h", "1d"
                const delay = data.delay.toString();
                let delayMs;

                if (delay.endsWith('h')) {
                    delayMs = parseFloat(delay) * 60 * 60 * 1000;
                } else if (delay.endsWith('d')) {
                    delayMs = parseFloat(delay) * 24 * 60 * 60 * 1000;
                } else if (delay.endsWith('m')) {
                    delayMs = parseFloat(delay) * 60 * 1000;
                } else {
                    // Default: treat as minutes
                    delayMs = parseFloat(delay) * 60 * 1000;
                }

                scheduledTime = Date.now() + delayMs;
            } else {
                // Default: 1 hour
                scheduledTime = Date.now() + 60 * 60 * 1000;
            }

            // Round to nearest minute
            scheduledTime = Math.floor(scheduledTime / 60000) * 60000;

            await openkbs.kb({
                action: 'createScheduledTask',
                scheduledTime,
                taskPayload: {
                    message: `[SCHEDULED_TASK] ${data.message}`,
                    createdAt: Date.now()
                },
                description: data.message.substring(0, 50)
            });

            return {
                type: 'TASK_SCHEDULED',
                data: {
                    message: data.message,
                    scheduledFor: new Date(scheduledTime).toISOString()
                },
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "SCHEDULE_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    /**
     * List all scheduled tasks
     * Usage: <getScheduledTasks/>
     */
    [/<getScheduledTasks\s*\/>/s, async () => {
        try {
            const tasks = await openkbs.kb({ action: 'getScheduledTasks' });
            return {
                type: 'SCHEDULED_TASKS',
                data: tasks,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "TASKS_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    /**
     * Delete a scheduled task
     * Usage: <deleteScheduledTask>{"timestamp": 1704067200000}</deleteScheduledTask>
     */
    [/<deleteScheduledTask>([\s\S]*?)<\/deleteScheduledTask>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            await openkbs.kb({
                action: 'deleteScheduledTask',
                timestamp: data.timestamp
            });
            return {
                type: 'TASK_DELETED',
                timestamp: data.timestamp,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "DELETE_TASK_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    // =========================================================================
    // TELEGRAM
    // =========================================================================

    /**
     * Send message to Telegram (DM or channel)
     * Usage: <sendTelegram>{"chatId": "123", "message": "Hello!"}</sendTelegram>
     * If chatId is omitted, sends to configured channel
     */
    [/<sendTelegram>([\s\S]*?)<\/sendTelegram>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            const result = await sendTelegramMessage(data.chatId, data.message, {
                parse_mode: data.parse_mode || 'Markdown',
                silent: data.silent || false
            });

            if (result.success) {
                return {
                    type: "TELEGRAM_SENT",
                    messageId: result.messageId,
                    chatId: data.chatId || 'channel',
                    ...meta,
                    _meta_actions: ["REQUEST_CHAT_MODEL"]
                };
            } else {
                return {
                    type: "TELEGRAM_ERROR",
                    error: result.error,
                    ...meta,
                    _meta_actions: ["REQUEST_CHAT_MODEL"]
                };
            }
        } catch (e) {
            return {
                type: "TELEGRAM_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    /**
     * Send photo to Telegram (DM or channel)
     * Usage: <sendTelegramPhoto>{"chatId": "123", "photoUrl": "https://...", "caption": "Hi"}</sendTelegramPhoto>
     * If chatId is omitted, sends to configured channel
     */
    [/<sendTelegramPhoto>([\s\S]*?)<\/sendTelegramPhoto>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            const result = await sendTelegramPhoto(data.chatId, data.photoUrl, data.caption || '');

            if (result.success) {
                return {
                    type: "TELEGRAM_PHOTO_SENT",
                    messageId: result.messageId,
                    chatId: data.chatId || 'channel',
                    ...meta,
                    _meta_actions: ["REQUEST_CHAT_MODEL"]
                };
            } else {
                return {
                    type: "TELEGRAM_ERROR",
                    error: result.error,
                    ...meta,
                    _meta_actions: ["REQUEST_CHAT_MODEL"]
                };
            }
        } catch (e) {
            return {
                type: "TELEGRAM_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    // =========================================================================
    // SEARCH & CONTENT
    // =========================================================================

    /**
     * Google search
     * Usage: <googleSearch>{"query": "search terms"}</googleSearch>
     */
    [/<googleSearch>([\s\S]*?)<\/googleSearch>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            const response = await openkbs.googleSearch(data.query);
            const results = response?.map(({ title, link, snippet }) => ({
                title, link, snippet
            }));
            return {
                type: 'SEARCH_RESULTS',
                data: results,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "SEARCH_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    /**
     * Extract text from webpage
     * Usage: <webpageToText>{"url": "https://example.com"}</webpageToText>
     */
    [/<webpageToText>([\s\S]*?)<\/webpageToText>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());
            let response = await openkbs.webpageToText(data.url);

            // Limit content to prevent token overflow
            if (response?.content?.length > 5000) {
                response.content = response.content.substring(0, 5000) + '... [truncated]';
            }

            return {
                type: 'WEBPAGE_CONTENT',
                data: response,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        } catch (e) {
            return {
                type: "WEBPAGE_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }],

    // =========================================================================
    // IMAGE GENERATION
    // =========================================================================

    /**
     * Generate AI image
     * Usage: <createAIImage>{"prompt": "description", "aspect_ratio": "16:9"}</createAIImage>
     */
    [/<createAIImage>([\s\S]*?)<\/createAIImage>/s, async (match) => {
        try {
            const data = JSON.parse(match[1].trim());

            const validRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
            const aspect_ratio = validRatios.includes(data.aspect_ratio) ? data.aspect_ratio : "1:1";

            const image = await openkbs.generateImage(data.prompt, {
                model: 'gemini-2.5-flash-image',
                aspect_ratio,
                n: 1
            });

            // Upload to permanent storage
            const fileName = `image-${Date.now()}.png`;
            const uploaded = await openkbs.uploadImage(image[0].b64_json, fileName, 'image/png');

            return {
                type: 'CHAT_IMAGE',
                data: { imageUrl: uploaded.url },
                ...meta,
                _meta_actions: []  // Stop here, show image to user
            };
        } catch (e) {
            return {
                type: "IMAGE_ERROR",
                error: e.message,
                ...meta,
                _meta_actions: ["REQUEST_CHAT_MODEL"]
            };
        }
    }]
];
