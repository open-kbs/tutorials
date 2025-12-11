# Tutorial 4: Scheduled Tasks

Schedule one-time reminders and set up automatic cronjobs.

## 4.1 One-Time Scheduled Tasks

Schedule a task to run at a specific time in the future. When it fires, a new chat is automatically created with your message.

### Add Commands to actions.js

```javascript
// Schedule a task
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
                delayMs = parseFloat(delay) * 60 * 1000; // default minutes
            }

            scheduledTime = Date.now() + delayMs;
        } else {
            scheduledTime = Date.now() + 60 * 60 * 1000; // default 1 hour
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
        return { type: "ERROR", error: e.message, ...meta };
    }
}],

// List scheduled tasks
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
        return { type: "ERROR", error: e.message, ...meta };
    }
}],

// Delete scheduled task
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
        return { type: "ERROR", error: e.message, ...meta };
    }
}],
```

### How Scheduled Tasks Work

When a task fires:
1. OpenKBS creates a **new chat** automatically
2. The chat starts with your message prefixed by `[SCHEDULED_TASK]`
3. The agent processes this message (can send Telegram notification, etc.)
4. Results are logged in the chat history

### Define in Instructions

```text
## Scheduled Tasks

<scheduleTask>
{
  "message": "Call mom",
  "delay": "2h"
}
</scheduleTask>
Description: Schedule a reminder. Delay formats: "30m", "2h", "1d".
Or use specific time: "time": "2024-12-25 10:00"

<getScheduledTasks/>
Description: List all pending tasks.

<deleteScheduledTask>
{
  "timestamp": 1704067200000
}
</deleteScheduledTask>
Description: Cancel a task by its timestamp.
```

## 4.2 Cronjobs (Periodic Execution)

Run tasks on a schedule without user interaction.

### Create onCronjob.js

```javascript
// src/Events/onCronjob.js

export const handler = async (event) => {
    const now = new Date();

    // Fetch all memory items
    const result = await openkbs.fetchItems({
        beginsWith: 'memory_',
        limit: 100
    });

    let cleaned = 0;
    const items = result?.items || [];

    // Delete expired items
    for (const item of items) {
        if (item.item?.body?.exp) {
            const expDate = new Date(item.item.body.exp);
            if (expDate < now) {
                await openkbs.deleteItem(item.meta.itemId);
                cleaned++;
            }
        }
    }

    // Send report to Telegram via chat
    await openkbs.chats({
        chatTitle: `Cronjob - ${now.toISOString()}`,
        message: `[SCHEDULED_TASK] Memory cleanup report. Total: ${items.length}, Expired deleted: ${cleaned}, Remaining: ${items.length - cleaned}. Send to Telegram.`
    });

    return { success: true, timestamp: now.toISOString(), items: items.length, cleaned };
};

// Schedule: Run every hour at minute 0
handler.CRON_SCHEDULE = "0 * * * *";
```

### Create onCronjob.json

```json
{
  "dependencies": {}
}
```

### Cron Schedule Syntax

```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-7, Sunday=0 or 7)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

**Common patterns:**
```javascript
"* * * * *"      // Every minute
"*/5 * * * *"    // Every 5 minutes
"0 * * * *"      // Every hour at :00
"0 0 * * *"      // Daily at midnight
"0 9 * * 1"      // Every Monday at 9:00 AM
"0 */6 * * *"    // Every 6 hours
```

## 4.3 Deploy and Test

```bash
openkbs push
```

Test scheduled tasks:
1. "Remind me to call mom in 5 minutes"
2. Wait 5 minutes - new chat should appear with reminder
3. "Show my scheduled tasks"
4. "Cancel the reminder" (if you set multiple)

Test cronjob:
- Wait for the scheduled time
- Check logs in OpenKBS Console

## Summary

- `openkbs.kb({ action: 'createScheduledTask' })` creates one-time tasks
- Tasks create new chats when they fire
- `handler.CRON_SCHEDULE` defines periodic execution
- Cronjobs run in background without user interaction
- Use cronjobs for cleanup, daily reports, monitoring

## Next

[Tutorial 5: Telegram Integration](./05-telegram-integration.md) - Webhooks and notifications.
