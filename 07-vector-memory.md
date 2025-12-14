# Tutorial 7: Vector Memory (Long-term Archive)

Implement a two-tier memory system: active memory for current context + VectorDB archive for semantic search of historical data.

## 7.1 The Two-Tier Model

OpenKBS supports two memory layers:

| Layer | Storage | Access | Use Case |
|-------|---------|--------|----------|
| **Active Memory** | Priority Items | Always in LLM context | Current state, ongoing work |
| **Archive** | VectorDB | Semantic search on-demand | Historical data, past contexts |

**Why two tiers?**
- Active memory is limited (~100 items) and always loaded
- Archive is unlimited and searchable by meaning
- Keeps current context clean while preserving history

## 7.2 Configure settings.json

Enable VectorDB and add the `archive` itemType:

```json
{
  "model": "gemini-2.5-pro-preview-03-25",
  "embeddingModel": "text-embedding-3-large",
  "embeddingDimension": 3072,
  "searchEngine": "VectorDB",
  "itemTypes": {
    "memory": {
      "attributes": [
        { "attrName": "itemId", "attrType": "itemId", "encrypted": false },
        { "attrName": "body", "attrType": "body", "encrypted": true }
      ]
    },
    "archive": {
      "attributes": [
        { "attrName": "itemId", "attrType": "itemId", "encrypted": false },
        { "attrName": "body", "attrType": "body", "encrypted": true }
      ]
    }
  },
  "options": {
    "vectorDBMaxTokens": 25000,
    "vectorDBTopK": 30,
    "vectorDBMinScore": 90,
    "priorityItems": [
      { "prefix": "memory", "limit": 100 }
    ]
  }
}
```

**Key settings:**
- `embeddingModel` - Model for creating vector embeddings
- `embeddingDimension` - Vector size (3072 for text-embedding-3-large)
- `vectorDBTopK` - Max results from semantic search
- `vectorDBMinScore` - Minimum score for **automatic** injection (see below)
- `archive` itemType - Storage for archived items (not in priorityItems = not auto-loaded)

## 7.3 Two Ways to Access Archive

Archive items can surface in two ways:

### Automatic Injection (Passive)

When `vectorDBMinScore` is set (e.g., 90), the system automatically searches the archive for every user message. Items with score >= 90 are **injected into LLM context** without any command.

```json
"options": {
  "vectorDBMinScore": 90
}
```

**How it works:**
1. User sends message: "Plan summer campaign"
2. System automatically searches VectorDB for similar content
3. Archive items with score >= 90 appear in context
4. LLM sees them without calling `searchArchive`

This enables "memories surfacing naturally" - relevant history appears when contextually appropriate.

### Explicit Search (Active)

The `searchArchive` command with `minScore: 0` returns ALL matches regardless of score. The LLM decides what's relevant.

```javascript
const minScore = data.minScore || 0;  // Returns everything
```

**When to use which:**
- **High vectorDBMinScore (90)** - Only highly relevant memories auto-surface. Clean context.
- **Low vectorDBMinScore (50)** - More memories auto-surface. Richer but noisier context.
- **searchArchive command** - LLM explicitly searches when it needs historical data

## 7.4 Archive Command

Add to `src/Events/actions.js`:

```javascript
// Archive items to long-term VectorDB storage
[/<archiveItems>([\s\S]*?)<\/archiveItems>/s, async (match) => {
    try {
        const content = match[1].trim();
        const itemIds = JSON.parse(content);

        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            throw new Error('Must provide an array of itemIds to archive');
        }

        const results = [];
        const embeddingModel = 'text-embedding-3-large';
        const embeddingDimension = 3072;
        const timestamp = Date.now();

        for (const itemId of itemIds) {
            try {
                // 1. Fetch the original item
                const originalItem = await openkbs.getItem(itemId);
                if (!originalItem?.item?.body) {
                    results.push({ itemId, status: 'error', error: 'Item not found' });
                    continue;
                }

                const body = originalItem.item.body;
                const originalItemType = itemId.split('_')[0];

                // 2. Build embedding text
                let embeddingText = '';
                if (originalItemType === 'memory') {
                    embeddingText = `${itemId}: ${typeof body.value === 'string' ? body.value : JSON.stringify(body.value)}`;
                } else {
                    embeddingText = `${itemId}: ${JSON.stringify(body)}`;
                }

                // 3. Create embeddings
                const { embeddings, totalTokens } = await openkbs.createEmbeddings(embeddingText, embeddingModel);

                // 4. Create archive item with timestamp for uniqueness
                const archiveItemId = `archive_${timestamp}_${itemId}`;
                const archiveBody = {
                    originalItemId: itemId,
                    originalItemType: originalItemType,
                    content: body,
                    archivedAt: new Date().toISOString()
                };

                await openkbs.items({
                    action: 'createItem',
                    itemType: 'archive',
                    itemId: archiveItemId,
                    attributes: [
                        { attrType: 'itemId', attrName: 'itemId', encrypted: false },
                        { attrType: 'body', attrName: 'body', encrypted: true }
                    ],
                    item: { body: await openkbs.encrypt(JSON.stringify(archiveBody)) },
                    totalTokens,
                    embeddings: embeddings ? embeddings.slice(0, embeddingDimension) : undefined,
                    embeddingModel,
                    embeddingDimension
                });

                // 5. Delete original from active memory
                await openkbs.deleteItem(itemId);

                results.push({
                    itemId,
                    archiveItemId,
                    status: 'success',
                    tokens: totalTokens
                });

            } catch (e) {
                results.push({ itemId, status: 'error', error: e.message });
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;

        return {
            type: "ITEMS_ARCHIVED",
            summary: `Archived ${successCount} of ${itemIds.length} items`,
            results,
            _meta_actions: ["REQUEST_CHAT_MODEL"]
        };
    } catch (e) {
        return {
            type: "ARCHIVE_ERROR",
            error: e.message,
            _meta_actions: ["REQUEST_CHAT_MODEL"]
        };
    }
}],
```

**How archiving works:**
1. Fetch original item from active memory
2. Generate vector embedding from content
3. Store in VectorDB with `archive_` prefix + timestamp
4. Delete original to free active memory slot

The timestamp ensures uniqueness - the same item can be archived multiple times (e.g., monthly snapshots).

## 7.5 Search Archive Command

```javascript
// Search archive with semantic/meaning-based search
[/<searchArchive>([\s\S]*?)<\/searchArchive>/s, async (match) => {
    try {
        const content = match[1].trim();
        const data = JSON.parse(content);

        if (!data.query) {
            throw new Error('Must provide a "query" for semantic search');
        }

        const topK = data.topK || 10;
        const minScore = data.minScore || 0;

        // Call VectorDB semantic search
        const searchResult = await openkbs.items({
            action: 'searchVectorDBItems',
            queryText: data.query,
            topK: topK,
            minScore: minScore
        });

        // Decrypt and format results
        const formattedResults = [];

        for (const item of (searchResult?.items || [])) {
            try {
                let parsed = null;
                if (item.body) {
                    const decryptedBody = await openkbs.decrypt(item.body);
                    parsed = JSON.parse(decryptedBody);
                }

                formattedResults.push({
                    archiveItemId: item.itemId,
                    originalItemId: parsed?.originalItemId,
                    originalItemType: parsed?.originalItemType,
                    content: parsed?.content,
                    archivedAt: parsed?.archivedAt,
                    score: item.score
                });
            } catch (e) {
                formattedResults.push({
                    archiveItemId: item.itemId,
                    score: item.score,
                    error: 'Failed to decrypt: ' + e.message
                });
            }
        }

        return {
            type: "ARCHIVE_SEARCH_RESULTS",
            query: data.query,
            count: formattedResults.length,
            results: formattedResults,
            _meta_actions: ["REQUEST_CHAT_MODEL"]
        };
    } catch (e) {
        return {
            type: "ARCHIVE_SEARCH_ERROR",
            error: e.message,
            _meta_actions: ["REQUEST_CHAT_MODEL"]
        };
    }
}],
```

**Search parameters:**
- `query` - Natural language description of what you're looking for
- `topK` - Maximum results (default: 10)
- `minScore` - Minimum relevance threshold 0-100 (default: 0 = return all)

Results include `score` - how closely the item matches semantically.

## 7.6 Define in Instructions

Add to `app/instructions.txt`:

```text
## TWO-TIER MEMORY SYSTEM

Active Memory (memory_*) = working context, always loaded, limited to 100 items
Archive (VectorDB) = long-term storage, unlimited, semantic search on-demand

Strategy:
- Active memory holds CURRENT state: ongoing work, active projects, recent decisions
- Archive holds PAST states: completed work, previous contexts, historical patterns
- When context shifts (project ends, season changes, strategy pivots), archive the old context
- Before starting similar work, search archive for relevant past experience

Archive enables learning from history without polluting current context.

## Archive Commands

<archiveItems>
["memory_old_campaign", "memory_completed_project"]
</archiveItems>
Description: Move items from active memory to searchable archive.
- Creates vector embeddings for semantic search
- Deletes originals from active memory
- Use for completed projects, outdated contexts, historical data

<searchArchive>
{
  "query": "marketing strategies for summer products",
  "topK": 10
}
</searchArchive>
Description: Search archive by meaning, not keywords.
- query: Natural language description
- topK: Max results (default: 10)
- Returns matches with relevance scores
```

## 7.7 Frontend Rendering

Add archive commands to `src/Frontend/commands.js`:

```javascript
import ArchiveIcon from '@mui/icons-material/Archive';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';

export const COMMANDS = {
    // ... existing commands
    archiveItems: { icon: ArchiveIcon },
    searchArchive: { icon: ManageSearchIcon }
};
```

Now archive operations display as clean icon circles with hover tooltips.
