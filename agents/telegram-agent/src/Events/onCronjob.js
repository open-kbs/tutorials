// Cronjob handler - runs on schedule

export const handler = async (event) => {
    const now = new Date();

    const result = await openkbs.fetchItems({
        beginsWith: 'memory_',
        limit: 100
    });

    let cleaned = 0;
    const items = result?.items || [];

    for (const item of items) {
        if (item.item?.body?.exp) {
            const expDate = new Date(item.item.body.exp);
            if (expDate < now) {
                await openkbs.deleteItem(item.meta.itemId);
                cleaned++;
            }
        }
    }

    await openkbs.chats({
        chatTitle: `Cronjob - ${now.toISOString()}`,
        message: `[SCHEDULED_TASK] Memory cleanup report. Total: ${items.length}, Expired deleted: ${cleaned}, Remaining: ${items.length - cleaned}. Send to Telegram.`
    });

    return { success: true, timestamp: now.toISOString(), items: items.length, cleaned };
};

// Run every minute for testing
handler.CRON_SCHEDULE = "* * * * *";
