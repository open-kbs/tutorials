// Cronjob handler - Morning Briefing

export const handler = async (event) => {
    const now = new Date();

    // Cleanup expired memory items
    let cleaned = 0;
    try {
        const result = await openkbs.fetchItems({
            beginsWith: 'memory_',
            limit: 100
        });

        for (const item of result?.items || []) {
            if (item.item?.body?.exp && new Date(item.item.body.exp) < now) {
                await openkbs.deleteItem(item.meta.itemId);
                cleaned++;
            }
        }
    } catch (e) {}

    // Create morning briefing chat
    await openkbs.chats({
        chatTitle: `Morning Briefing - ${now.toISOString().split('T')[0]}`,
        message: `[SCHEDULED_TASK] Create a morning briefing:
1. Search for today's weather in the user's city (check memory for location)
2. List any scheduled tasks for today
3. Send a friendly morning summary to Telegram
${cleaned > 0 ? `\nNote: Cleaned ${cleaned} expired memory items.` : ''}`
    });

    return { success: true, cleaned };
};

// Run daily at 9 AM
handler.CRON_SCHEDULE = "0 9 * * *";
