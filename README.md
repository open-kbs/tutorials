# OpenKBS Tutorials

Build AI agents from zero to production. This step-by-step tutorial series guides you through creating a fully-functional Telegram Agent.

## Prerequisites

- Node.js 18+ installed
- Basic JavaScript knowledge
- A text editor (VS Code recommended)

## What You'll Build

By the end of this series, you'll have a working **Telegram Agent** that can:

- Store persistent data (memory system)
- Schedule future reminders
- Send notifications via Telegram
- Search the web and generate images
- Clean up expired items automatically (cronjob)

## Tutorial Series

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 1 | [Getting Started](./01-getting-started.md) | Install CLI, create agent, deploy to cloud |
| 2 | [Backend Commands](./02-backend-commands.md) | Create custom commands with XML pattern |
| 3 | [Memory System](./03-memory-system.md) | Persistent storage with itemTypes |
| 4 | [Scheduled Tasks](./04-scheduled-tasks.md) | One-time reminders and cronjobs |
| 5 | [Telegram Integration](./05-telegram-integration.md) | Webhook setup and notifications |
| 6 | [Frontend Rendering](./06-frontend-rendering.md) | Custom UI for commands and images |

## Quick Start

```bash
# Install CLI
npm install -g openkbs

# Create agent
openkbs create telegram-agent
cd telegram-agent

# Login and deploy
openkbs login
openkbs push
```

## Complete Agent Code

The finished agent code is available in [agents/telegram-agent/](./agents/telegram-agent/).

You can copy it directly:

```bash
cp -r tutorials/agents/telegram-agent my-agent
cd my-agent
openkbs push
```

## Resources

- [OpenKBS GitHub](https://github.com/open-kbs/openkbs)
- [OpenKBS Console](https://openkbs.com)
