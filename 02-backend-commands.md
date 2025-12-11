# Tutorial 2: Backend Commands

Create custom commands using the XML pattern. Learn how the LLM executes actions.

## 2.1 The Command Pattern

OpenKBS agents use XML tags to execute commands. The LLM outputs commands as text:

```xml
<googleSearch>
{
  "query": "best restaurants in New York"
}
</googleSearch>
```

The backend parses these tags and executes the matching action.

## 2.2 How Commands Work

```
LLM outputs: "Let me search. <googleSearch>{"query": "..."}</googleSearch>"
                                    ↓
┌──────────────────────────────────────────────────┐
│  handler.js parses XML tags                       │
│  Matches against regex patterns in actions.js    │
│  Executes the async function                     │
└──────────────────────────────────────────────────┘
                                    ↓
Result returned with _meta_actions:
  - ["REQUEST_CHAT_MODEL"] → send back to LLM
  - [] → display to user, stop
```

## 2.3 The Handler

Open `src/Events/handler.js`:

```javascript
import { getActions } from './actions.js';

export const backendHandler = async (event) => {
    const meta = { _meta_actions: ["REQUEST_CHAT_MODEL"] };
    const lastMessage = event.payload.messages[event.payload.messages.length - 1];
    const actions = getActions(meta, event);

    const matchingActions = [];
    actions.forEach(([regex, action]) => {
        const matches = [...(lastMessage.content || '').matchAll(new RegExp(regex, 'g'))];
        matches.forEach(match => {
            matchingActions.push(action(match, event));
        });
    });

    if (matchingActions.length > 0) {
        const results = await Promise.all(matchingActions);
        // ... handle results
    }

    return { type: 'CONTINUE' };
};
```

Key points:
- Parses the last message for XML command tags
- Multiple commands execute **in parallel** via `Promise.all`
- Results can trigger another LLM call or stop

## 2.4 Creating Your First Command

Edit `src/Events/actions.js`:

```javascript
export const getActions = (meta, event) => [
    // Google Search
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
            return { type: "ERROR", error: e.message, ...meta };
        }
    }],
];
```

**Pattern breakdown:**
- `/<googleSearch>([\s\S]*?)<\/googleSearch>/s` - Regex to match the XML tag
- `match[1]` - The content between tags (JSON)
- `...meta` - Spreads `_meta_actions` for LLM callback
- Return object becomes the command result

## 2.5 The Meta Actions System

Control whether results go back to the LLM:

```javascript
// Result goes to LLM for follow-up response
return { data: result, _meta_actions: ["REQUEST_CHAT_MODEL"] };

// Result displayed to user, conversation stops
return { data: result, _meta_actions: [] };
```

Use `["REQUEST_CHAT_MODEL"]` when:
- LLM needs to process the result (search results, errors)
- Multi-step workflows

Use `[]` when:
- Final output (images, confirmations)
- No further processing needed

## 2.6 Built-in SDK Functions

The `openkbs` object is available globally in backend handlers:

### Google Search
```javascript
const results = await openkbs.googleSearch('AI trends 2025');
// Returns: [{ title, link, snippet, pagemap }, ...]
```

### Image Generation
```javascript
const images = await openkbs.generateImage('sunset over mountains', {
    model: 'gemini-2.5-flash-image',
    aspect_ratio: '16:9'  // 1:1, 16:9, 9:16, 4:3
});

// Upload to permanent storage
const uploaded = await openkbs.uploadImage(
    images[0].b64_json,
    'image.png',
    'image/png'
);
console.log(uploaded.url);
```

### Web Scraping
```javascript
const content = await openkbs.webpageToText('https://example.com');
// Returns: { content: "page text..." }
```

### Send Email
```javascript
await openkbs.sendMail('user@example.com', 'Subject', '<h1>HTML body</h1>');
```

## 2.7 Complete Example: Image Generation

```javascript
[/<createAIImage>([\s\S]*?)<\/createAIImage>/s, async (match) => {
    try {
        const data = JSON.parse(match[1].trim());

        const validRatios = ["1:1", "16:9", "9:16", "4:3"];
        const aspect_ratio = validRatios.includes(data.aspect_ratio)
            ? data.aspect_ratio : "1:1";

        const image = await openkbs.generateImage(data.prompt, {
            model: 'gemini-2.5-flash-image',
            aspect_ratio,
            n: 1
        });

        // Upload to permanent storage
        const fileName = `image-${Date.now()}.png`;
        const uploaded = await openkbs.uploadImage(
            image[0].b64_json,
            fileName,
            'image/png'
        );

        return {
            type: 'CHAT_IMAGE',
            data: { imageUrl: uploaded.url },
            ...meta,
            _meta_actions: []  // Stop here, show image
        };
    } catch (e) {
        return { type: "ERROR", error: e.message, ...meta };
    }
}],
```

## 2.8 Define Commands in Instructions

Tell the LLM what commands are available in `app/instructions.txt`:

```text
You are a reminder assistant with these commands:

<googleSearch>
{
  "query": "search terms"
}
</googleSearch>
Description: Search Google for information.

<createAIImage>
{
  "prompt": "image description",
  "aspect_ratio": "16:9"
}
</createAIImage>
Description: Generate an AI image. Aspect ratios: 1:1, 16:9, 9:16, 4:3.

You can use multiple commands at once - they execute in parallel.
```

## 2.9 Rendering Command Results

When `createAIImage` executes, it returns:

```json
{
  "type": "CHAT_IMAGE",
  "data": { "imageUrl": "https://file.openkbs.com/files/.../image.png" },
  "_meta_actions": []
}
```

To render this image in the chat, update `src/Frontend/contentRender.js`:

```javascript
const onRenderChatMessage = async (params) => {
    const { content } = params.messages[params.msgIndex];

    // Try to parse as JSON command result
    try {
        const parsed = JSON.parse(content);

        // Render CHAT_IMAGE
        if (parsed.type === 'CHAT_IMAGE' && parsed.data?.imageUrl) {
            return (
                <img
                    src={parsed.data.imageUrl}
                    alt="Generated image"
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                />
            );
        }
    } catch (e) {
        // Not JSON, render as text
    }

    return null; // Use default rendering
};

```

## 2.10 Deploy and Test

```bash
openkbs push
```

Test by asking: "Generate an image of a sunset over mountains"

The agent will execute `<createAIImage>` and display the generated image in chat.

## Summary

- Commands use XML tags with JSON content
- `actions.js` maps regex patterns to async functions
- `_meta_actions` controls LLM callback vs user display
- Built-in SDK: googleSearch, generateImage, sendMail, webpageToText
- Multiple commands run in parallel

## Next

[Tutorial 3: Memory System](./03-memory-system.md) - Persistent storage.
