# Tutorial 3: Memory System

Implement persistent storage with itemTypes. Store data that persists between conversations.

## 3.1 Understanding Memory

OpenKBS provides a built-in key-value store that:
- Persists data between conversations
- Automatically encrypts sensitive fields
- Injects priority items into LLM context
- Supports TTL (expiration)

## 3.2 Configure itemTypes

Edit `app/settings.json`:

```json
{
  "model": "gemini-2.5-pro-preview-03-25",
  "inputTools": ["speechToText"],
  "itemTypes": {
    "memory": {
      "attributes": [
        { "attrName": "itemId", "attrType": "itemId", "encrypted": false },
        { "attrName": "body", "attrType": "body", "encrypted": true }
      ]
    },
    "agent": {
      "attributes": [
        { "attrName": "itemId", "attrType": "itemId", "encrypted": false },
        { "attrName": "body", "attrType": "body", "encrypted": true }
      ]
    }
  },
  "options": {
    "priorityItems": [
      { "prefix": "memory", "limit": 100 },
      { "prefix": "agent", "limit": 20 }
    ]
  }
}
```

**Key settings:**
- `itemTypes` - Define storage collections (memory, agent)
- `encrypted: true` - Body is automatically encrypted at rest
- `priorityItems` - Items with these prefixes are always in LLM context
- `limit` - Max items per prefix (prevents context overflow)

## 3.3 Priority Items

Items matching `priorityItems` prefixes are **automatically injected** into the LLM context before each request:

```json
"priorityItems": [
  { "prefix": "memory", "limit": 100 },
  { "prefix": "agent", "limit": 20 }
]
```

This means:
- All `memory_*` items (up to 100) are visible to the LLM
- All `agent_*` items (up to 20) are visible to the LLM
- No need to manually fetch them - they're in context automatically

## 3.4 Memory Commands

Add to `src/Events/actions.js`:

### Helper Functions

```javascript
// Upsert pattern - update or create if not exists
async function upsertItem(itemType, itemId, body) {
    try {
        await openkbs.updateItem({ itemType, itemId, body });
    } catch (e) {
        await openkbs.createItem({ itemType, itemId, body });
    }
}

// Set memory with optional expiration
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
```

### setMemory Command

```javascript
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
            expires: data.expirationInMinutes
                ? `in ${data.expirationInMinutes} minutes`
                : 'never',
            ...meta,
            _meta_actions: ["REQUEST_CHAT_MODEL"]
        };
    } catch (e) {
        return { type: "ERROR", error: e.message, ...meta };
    }
}],
```

### deleteItem Command

```javascript
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
        return { type: "ERROR", error: e.message, ...meta };
    }
}],
```

### cleanupMemory Command

```javascript
[/<cleanupMemory\s*\/>/s, async () => {
    try {
        const result = await openkbs.fetchItems({
            beginsWith: 'memory_',
            limit: 100
        });

        if (!result?.items) return { cleaned: 0, ...meta };

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

        return {
            type: "CLEANUP_COMPLETE",
            cleaned,
            ...meta,
            _meta_actions: ["REQUEST_CHAT_MODEL"]
        };
    } catch (e) {
        return { type: "ERROR", error: e.message, ...meta };
    }
}],
```

## 3.5 Define in Instructions

Add to `app/instructions.txt`:

```text
## Memory Commands

<setMemory>
{
  "itemId": "memory_user_name",
  "value": "John",
  "expirationInMinutes": null
}
</setMemory>
Description: Save data to memory. Use null for permanent storage.

<deleteItem>
{
  "itemId": "memory_old_data"
}
</deleteItem>
Description: Delete a memory item.

<cleanupMemory/>
Description: Remove all expired memory items.

## Memory Best Practices

1. Use descriptive IDs: memory_user_preferences, memory_project_notes
2. Keep under 100 items total
3. Set expiration for temporary data
4. Consolidate related data into single items
```

## 3.6 SDK Methods

### Create/Update Item

```javascript
// Create new item
await openkbs.createItem({
    itemType: 'memory',
    itemId: 'memory_user_name',
    body: { value: 'John', updatedAt: new Date().toISOString() }
});

// Update existing item
await openkbs.updateItem({
    itemType: 'memory',
    itemId: 'memory_user_name',
    body: { value: 'Jane', updatedAt: new Date().toISOString() }
});
```

### Get Item

```javascript
const result = await openkbs.getItem('memory_user_name');
console.log(result.item.body.value); // 'Jane'
```

### Fetch Multiple Items

```javascript
const items = await openkbs.fetchItems({
    itemType: 'memory',
    beginsWith: 'memory_',
    limit: 100
});

for (const { item, meta } of items.items) {
    console.log(meta.itemId, item.body.value);
}
```

### Delete Item

```javascript
await openkbs.deleteItem('memory_user_name');
```

## 3.7 Deploy and Test

```bash
openkbs push
```

Test:
1. "Remember my name is John" → Should save to memory
2. "What's my name?" → Should recall from memory
3. "Forget my name" → Should delete the item

## Summary

- `itemTypes` in settings.json define storage collections
- `priorityItems` auto-inject items into LLM context
- Upsert pattern handles create vs update
- TTL support via `exp` field
- Limit items to ~100 per prefix to avoid context overflow

## Next

[Tutorial 4: Scheduled Tasks](./04-scheduled-tasks.md) - One-time reminders and cronjobs.
