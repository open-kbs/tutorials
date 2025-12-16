# Tutorial 8: Deep Research

Learn how to use the autonomous Deep Research agent for comprehensive web research and analysis.

## What is Deep Research?

Deep Research is an AI-powered research agent that autonomously:
1. Plans a research strategy
2. Searches the web for relevant sources
3. Reads and analyzes multiple sources
4. Iterates to fill knowledge gaps
5. Synthesizes findings into a comprehensive report

**Use cases:**
- Market research and competitive analysis
- Trend reports and industry overviews
- Technical research and documentation
- Due diligence and background research

## Prerequisites

Complete [Tutorial 2: Backend Commands](./02-backend-commands.md) first.

## Step 1: Add the Command

Add the deep research command to `src/Events/actions.js`:

```javascript
// Deep Research - autonomous multi-step research agent
[/<deepResearch>([\s\S]*?)<\/deepResearch>/s, async (match) => {
    try {
        const content = match[1].trim();
        const data = JSON.parse(content);

        const input = data.query || data.input;
        if (!input) {
            return { error: 'Missing query/input for deep research', ...meta };
        }

        const params = {};
        if (data.previous_interaction_id) {
            params.previous_interaction_id = data.previous_interaction_id;
        }

        const researchData = await openkbs.deepResearch(input, params);

        if (researchData?.status === 'in_progress') {
            return {
                type: 'DEEP_RESEARCH_PENDING',
                data: {
                    interactionId: researchData.interaction_id,
                    prepaidCredits: researchData.prepaid_credits,
                    message: 'Deep research in progress. Use continueDeepResearchPolling to check status.'
                },
                ...meta
            };
        }

        if (researchData?.status === 'completed') {
            return {
                type: 'DEEP_RESEARCH_COMPLETED',
                data: {
                    interactionId: researchData.interaction_id,
                    output: researchData.output,
                    usage: researchData.usage
                },
                ...meta
            };
        }

        return { error: 'Deep research failed', ...meta };
    } catch (error) {
        return { error: error.message || 'Deep research failed', ...meta };
    }
}],

// Continue polling for deep research status
[/<continueDeepResearchPolling>([\s\S]*?)<\/continueDeepResearchPolling>/s, async (match) => {
    try {
        const content = match[1].trim();
        const data = JSON.parse(content);
        const { interactionId, prepaidCredits } = data;

        if (!interactionId) {
            return { error: 'Missing interactionId', ...meta };
        }

        const researchData = await openkbs.checkDeepResearchStatus(interactionId, prepaidCredits || 0);

        if (researchData?.status === 'completed') {
            return {
                type: 'DEEP_RESEARCH_COMPLETED',
                data: {
                    interactionId: researchData.interaction_id,
                    output: researchData.output,
                    usage: researchData.usage
                },
                ...meta
            };
        } else if (researchData?.status === 'in_progress') {
            return {
                type: 'DEEP_RESEARCH_PENDING',
                data: {
                    interactionId: interactionId,
                    prepaidCredits: researchData.prepaid_credits,
                    message: 'Deep research still in progress. Continue polling.'
                },
                ...meta
            };
        }

        return { error: 'Deep research failed', ...meta };
    } catch (error) {
        return { error: error.message || 'Failed to check status', ...meta };
    }
}],
```

## Step 2: Add Instructions

Add to `app/instructions.txt`:

```
<deepResearch>
{
  "query": "Research topic or question",
  "previous_interaction_id": "optional - for follow-up questions"
}
</deepResearch>
Description: """
Autonomous deep research agent. Searches web, analyzes sources, synthesizes report.
Takes 5-20 minutes. Returns interaction_id for status polling.
"""

<continueDeepResearchPolling>
{
  "interactionId": "from_previous_response",
  "prepaidCredits": "from_previous_response"
}
</continueDeepResearchPolling>
Description: """
Check status of in-progress research. Include prepaidCredits from previous response.
"""
```

## Step 3: Understanding the Flow

Deep research is asynchronous due to its long running time:

```
┌─────────────────────────────────────────────────────────────┐
│  1. User: "Research AI trends in 2025"                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Agent calls: <deepResearch>{"query": "..."}             │
│     → Returns: status: 'in_progress', interaction_id        │
│     → Upfront charge: 50 credits                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Agent informs user: "Research started, please wait..."  │
│     (Research runs in background for 5-20 minutes)          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Agent polls: <continueDeepResearchPolling>              │
│     → Returns: status: 'completed', output: "..."           │
│     → Additional charges based on token usage               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Agent presents research report to user                  │
└─────────────────────────────────────────────────────────────┘
```

## Step 4: Frontend Rendering (Optional)

For a better UI, render deep research results nicely in `src/Frontend/contentRender.js`:

```javascript
const DeepResearchResult = ({ data }) => {
    const [expanded, setExpanded] = React.useState(false);
    const output = data?.output || '';
    const usage = data?.usage || {};
    const previewLength = 500;

    return (
        <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e0e0e0',
            borderRadius: 12,
            padding: 16
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>🔬</span>
                <span style={{ fontWeight: 600, color: '#1565c0' }}>Deep Research Complete</span>
                {usage.input_tokens !== undefined && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>
                        {((usage.input_tokens || 0) + (usage.output_tokens || 0)).toLocaleString()} tokens
                    </span>
                )}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>
                {expanded ? output : output.substring(0, previewLength) + '...'}
            </div>
            <button onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Show Less' : 'Show Full Report'}
            </button>
        </div>
    );
};
```

## Pricing

- **Minimum upfront:** 50 credits (~€0.50)
- **Input tokens:** 5 credits per 1K tokens
- **Output tokens:** 20 credits per 1K tokens
- Typical research: 100-500K tokens total

The upfront charge prevents abuse. If actual usage exceeds 50 credits, the difference is charged on completion.

## Best Practices

1. **Be specific** - "AI trends in healthcare 2025" is better than "AI trends"
2. **Set expectations** - Inform users about the 5-20 minute wait time
3. **Use follow-ups** - Pass `previous_interaction_id` for related questions
4. **Handle failures** - Research can fail for complex or impossible queries

## Example Prompts

Good research queries:
- "Analyze the competitive landscape of electric vehicle charging networks in Europe"
- "Research best practices for implementing RAG systems in enterprise applications"
- "Compare pricing models of major cloud providers for AI workloads in 2025"

## Next Steps

- See the full implementation in [ai-marketing agent](https://github.com/open-kbs/ai-marketing)
- Combine with [Memory System](./03-memory-system.md) to store research results
- Use [Scheduled Tasks](./04-scheduled-tasks.md) for periodic research updates
