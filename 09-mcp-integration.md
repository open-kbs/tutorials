# Tutorial 9: MCP Integration

Connect your AI agents to external tools using the Model Context Protocol (MCP) - search the web, access GitHub, Slack, and more.

## What is MCP?

MCP (Model Context Protocol) is an open standard by Anthropic for connecting AI models to external tools and data sources. Instead of building custom integrations, you connect to MCP servers that expose standardized tool interfaces.

**Available MCP servers:**
- `github` - Search repos, create issues, manage PRs
- `brave-search` - Web search with Brave's privacy-focused API
- `slack` - Read/write messages, manage channels

## Prerequisites

Complete [Tutorial 2: Backend Commands](./02-backend-commands.md) first.

## Step 1: Get a Brave API Key

1. Go to [brave.com/search/api](https://brave.com/search/api/)
2. Click "Get Started for Free"
3. Create an account and get your API key
4. Free tier includes 2,000 queries/month

## Step 2: Configure MCP Servers

Add MCP configuration to `app/settings.json`:

```json
{
  "chatVendor": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "options": {
    "mcpServers": {
      "brave-search": {}
    }
  }
}
```

You can add multiple servers:

```json
{
  "options": {
    "mcpServers": {
      "brave-search": {},
      "github": {},
      "slack": {}
    }
  }
}
```

### Custom MCP Server URL

By default, OpenKBS uses the hosted MCP service at `https://mcp.openkbs.com`. If you want to run your own MCP server, you can configure a custom URL:

```json
{
  "options": {
    "mcpServerUrl": "https://your-mcp-server.com",
    "mcpServers": {
      "brave-search": {},
      "your-custom-server": {}
    }
  }
}
```

This allows you to:
- Host your own MCP servers with custom tools
- Use private/internal MCP servers
- Add MCP servers not available in the default service

## Step 3: Add Secrets

Each MCP server needs specific API keys. Add them as KB secrets:

| Server | Required Secrets |
|--------|-----------------|
| `brave-search` | `BRAVE_API_KEY` |
| `github` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| `slack` | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` |

In the OpenKBS web interface:
1. Go to Settings → Secrets
2. Add `BRAVE_API_KEY` with your Brave API key

## Step 4: Add MCP Handler

The MCP handler is included in the default `src/Events/actions.js` template:

```javascript
// MCP (Model Context Protocol) Tool Handler
// Automatically handles all MCP tool calls: <mcp_{server}_{toolName}>{params}</mcp_{server}_{toolName}>
// Configure MCP servers in settings.json: { "options": { "mcpServers": { "github": {} } } }
// Add required secrets (e.g., GITHUB_PERSONAL_ACCESS_TOKEN) in KB secrets
[/<mcp_([a-z0-9-]+)_([a-z0-9_]+)>([\s\S]*?)<\/mcp_\1_\2>/s, async (match) => {
    try {
        const server = match[1];
        const toolName = match[2];
        const args = match[3].trim() ? JSON.parse(match[3].trim()) : {};

        const result = await openkbs.mcp.callTool(server, toolName, args);
        return {
            type: 'MCP_RESULT',
            server,
            tool: toolName,
            data: result?.content || [],
            ...meta,
            _meta_actions: ['REQUEST_CHAT_MODEL']
        };
    } catch (e) {
        return {
            type: 'MCP_ERROR',
            error: e.message,
            ...meta,
            _meta_actions: ['REQUEST_CHAT_MODEL']
        };
    }
}],
```

If you're upgrading an existing agent, add this handler to your `actions.js`.

## Step 5: Deploy and Test

```bash
openkbs push
```

Now chat with your agent:

> **You:** Search for the latest AI news

> **Agent:** I'll search for that using Brave Search.
> `<mcp_brave-search_brave_web_search>{"query": "latest AI news December 2025"}</mcp_brave-search_brave_web_search>`

The agent automatically discovers available MCP tools and uses them when appropriate.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. Agent starts → MCP tools auto-discovered                │
│     Tools injected into system prompt                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. User: "Search for React tutorials"                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. LLM outputs: <mcp_brave-search_brave_web_search>         │
│                  {"query": "React tutorials"}                │
│                  </mcp_brave-search_brave_web_search>        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. actions.js handler catches pattern                       │
│     → Calls openkbs.mcp.callTool('brave-search', ...)       │
│     → Returns results with _meta_actions: ['REQUEST_CHAT_MODEL']
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. LLM receives results, formats response for user          │
└─────────────────────────────────────────────────────────────┘
```

## Tool Discovery & Caching

MCP tools are discovered automatically when you first chat with the agent:
- Tools are cached for 24 hours
- Cache invalidates when you change `mcpServers` config
- No manual tool registration required

## Available Brave Search Tools

| Tool | Description |
|------|-------------|
| `brave_web_search` | General web search |
| `brave_local_search` | Local business search |

Example usage:

```xml
<mcp_brave-search_brave_web_search>
{"query": "best coffee shops in San Francisco", "count": 10}
</mcp_brave-search_brave_web_search>
```

## Available GitHub Tools

| Tool | Description |
|------|-------------|
| `search_repositories` | Search GitHub repos |
| `get_file_contents` | Read file from repo |
| `create_issue` | Create new issue |
| `list_issues` | List repo issues |
| `create_pull_request` | Create PR |

Example:

```xml
<mcp_github_search_repositories>
{"query": "language:typescript stars:>1000"}
</mcp_github_search_repositories>
```

## Adding Instructions

Help your agent know when to use MCP tools. Add to `app/instructions.txt`:

```
You have access to external tools via MCP (Model Context Protocol):

## Web Search (brave-search)
Use <mcp_brave-search_brave_web_search>{"query": "..."}</mcp_brave-search_brave_web_search>
for searching the web. Use for current events, research, finding documentation.

## GitHub (github)
Use <mcp_github_search_repositories>{"query": "..."}</mcp_github_search_repositories>
for searching GitHub repositories.

Always use these tools when the user asks for current information or external data.
```

## Error Handling

MCP errors return in a standard format:

```json
{
  "type": "MCP_ERROR",
  "error": "Invalid API key",
  "_meta_actions": ["REQUEST_CHAT_MODEL"]
}
```

The agent receives the error and can inform the user or retry.

## Best Practices

1. **Be specific in queries** - "React hooks tutorial 2025" beats "React tutorial"
2. **Limit result counts** - Use `count` parameter to avoid token overflow
3. **Combine tools** - Search GitHub, then read specific files
4. **Cache awareness** - Tool list updates every 24 hours or on config change

## Troubleshooting

**Tools not appearing:**
- Check `mcpServers` in settings.json
- Verify secrets are added correctly
- Check CloudWatch logs for discovery errors

**API errors:**
- Verify API key is valid
- Check rate limits (Brave free tier: 2000/month)
- Ensure secret name matches exactly (case-sensitive)

## Next Steps

- Add [Memory System](./03-memory-system.md) to remember search preferences
- Use [Scheduled Tasks](./04-scheduled-tasks.md) for periodic searches
- Combine with [Deep Research](./08-deep-research.md) for comprehensive analysis
