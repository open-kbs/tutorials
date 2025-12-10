// Cronjob handler - runs on schedule to cleanup expired items

export const handler = async (event) => {
    console.log('Cronjob executed at:', new Date().toISOString());

    // Cleanup expired memory items
    const result = await openkbs.fetchItems({
        beginsWith: 'memory_',
        limit: 100
    });

    if (result?.items) {
        const now = new Date();
        let cleaned = 0;

        for (const item of result.items) {
            if (item.item?.body?.exp) {
                const expDate = new Date(item.item.body.exp);
                if (expDate < now) {
                    await openkbs.deleteItem(item.meta.itemId);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned ${cleaned} expired memory items`);
        }
    }

    return { success: true };
};

// Run every hour at minute 0
handler.CRON_SCHEDULE = "0 * * * *";
