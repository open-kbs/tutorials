# Tutorial 6: Frontend Rendering

Customize how commands and images are displayed in the chat UI.

## 6.1 The Problem

By default, when your agent executes commands like `<createAIImage>`, the raw XML is shown to users. We want:
- Commands displayed as clean icon circles
- Hover tooltips showing request/response details
- Images displayed with download buttons
- System messages hidden from view

## 6.2 Frontend Architecture

OpenKBS frontend is a React application that you can customize through `src/Frontend/contentRender.js`. Key exports:

| Export | Purpose |
|--------|---------|
| `onRenderChatMessage` | Custom message rendering |
| `Header` | Custom header component |

The `onRenderChatMessage` function receives each message and can return:
- `null` - Use default markdown rendering
- React component - Custom rendering
- `JSON.stringify({ type: 'HIDDEN_MESSAGE' })` - Hide the message

## 6.3 Create commands.js

Define all commands with their icons:

```javascript
// src/Frontend/commands.js
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import ArticleIcon from '@mui/icons-material/Article';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ClearIcon from '@mui/icons-material/Clear';
import TelegramIcon from '@mui/icons-material/Telegram';

// Single source of truth for all commands
// selfClosing: true means <command/>, false means <command>...</command>
export const COMMANDS = {
    setMemory: { icon: SaveIcon },
    deleteItem: { icon: DeleteIcon },
    cleanupMemory: { icon: ClearIcon, selfClosing: true },
    scheduleTask: { icon: ScheduleIcon },
    getScheduledTasks: { icon: ListAltIcon, selfClosing: true },
    deleteScheduledTask: { icon: ClearIcon },
    sendTelegram: { icon: TelegramIcon },
    sendTelegramPhoto: { icon: PhotoCameraIcon },
    googleSearch: { icon: SearchIcon },
    webpageToText: { icon: ArticleIcon },
    createAIImage: { icon: ImageIcon }
};

// Generate regex patterns from commands
export const COMMAND_PATTERNS = Object.entries(COMMANDS).map(([name, config]) => {
    if (config.selfClosing) {
        return new RegExp(`<${name}\\s*\\/>`);
    }
    return new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
});

// Get icon for a command
export const getCommandIcon = (name) => COMMANDS[name]?.icon;

// Check if command name is valid
export const isValidCommand = (name) => name in COMMANDS;
```

## 6.4 Create CommandRenderer.js

This component renders commands as interactive icon circles:

```javascript
// src/Frontend/CommandRenderer.js
import React, { useState } from 'react';
import { Box, Tooltip, Typography, Zoom } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { getCommandIcon, isValidCommand } from './commands';

// Parse commands from content
const parseCommands = (content) => {
    if (!content) return [];

    const commands = [];
    const regex = /<(\w+)(?:>([\s\S]*?)<\/\1>|\s*\/>)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const commandName = match[1];
        if (!isValidCommand(commandName)) continue;

        const commandContent = match[2] || '';
        let parsedData = null;
        if (commandContent) {
            try {
                parsedData = JSON.parse(commandContent.trim());
            } catch (e) {
                parsedData = commandContent.trim();
            }
        }

        commands.push({
            name: commandName,
            data: parsedData,
            fullMatch: match[0]
        });
    }

    return commands;
};

// Single command circle with tooltip
const CommandCircle = ({ command, index, response }) => {
    const [hovering, setHovering] = useState(false);
    const IconComponent = getCommandIcon(command.name) || BoltIcon;

    const isSuccess = response && !response.error;
    const isError = response && response.error;

    const getTooltipContent = () => (
        <Box sx={{ p: 1, maxWidth: 400 }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#4CAF50', display: 'block', mb: 0.5 }}>
                {command.name}
            </Typography>

            {command.data && (
                <>
                    <Typography variant="caption" sx={{ color: '#90CAF9', fontSize: '10px', fontWeight: 'bold' }}>
                        REQUEST:
                    </Typography>
                    <Box sx={{ fontSize: '10px', color: '#fff', ml: 1, mb: 0.5, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {typeof command.data === 'object' ? JSON.stringify(command.data, null, 2) : String(command.data)}
                    </Box>
                </>
            )}

            {response && response.type !== 'CONTINUE' && !response._meta_type && (
                <>
                    <Typography variant="caption" sx={{ color: response.error ? '#FF6B6B' : '#81C784', fontSize: '10px', fontWeight: 'bold' }}>
                        RESPONSE:
                    </Typography>
                    <Box sx={{ fontSize: '10px', color: '#fff', ml: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {response.error ? `Error: ${response.error}` : JSON.stringify(response, null, 2)}
                    </Box>
                </>
            )}

            {!response && (
                <Typography variant="caption" sx={{ fontSize: '10px', color: '#FFA726', fontStyle: 'italic' }}>
                    Waiting for response...
                </Typography>
            )}
        </Box>
    );

    return (
        <Tooltip title={getTooltipContent()} placement="top" arrow TransitionComponent={Zoom}>
            <Box
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: hovering
                        ? (isError ? 'rgba(244, 67, 54, 0.15)' : isSuccess ? 'rgba(76, 175, 80, 0.15)' : 'rgba(158, 158, 158, 0.15)')
                        : (isError ? 'rgba(244, 67, 54, 0.08)' : isSuccess ? 'rgba(76, 175, 80, 0.08)' : 'rgba(0, 0, 0, 0.04)'),
                    border: '2px solid',
                    borderColor: hovering
                        ? (isError ? '#f44336' : isSuccess ? '#4CAF50' : '#9e9e9e')
                        : (isError ? 'rgba(244, 67, 54, 0.3)' : isSuccess ? 'rgba(76, 175, 80, 0.3)' : 'rgba(0, 0, 0, 0.12)'),
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: hovering ? 'scale(1.1)' : 'scale(1)'
                }}
            >
                <IconComponent sx={{
                    fontSize: 18,
                    color: hovering
                        ? (isError ? '#f44336' : isSuccess ? '#4CAF50' : '#9e9e9e')
                        : (isError ? 'rgba(244, 67, 54, 0.7)' : isSuccess ? 'rgba(76, 175, 80, 0.7)' : 'rgba(0, 0, 0, 0.54)')
                }} />
            </Box>
        </Tooltip>
    );
};

// Main component
const CommandRenderer = ({ content, responseData, markdownHandler }) => {
    const cleanContent = content.replace(/<!--GEMINI_META:.*?-->/gs, '').trim();
    const commands = parseCommands(cleanContent);

    if (commands.length === 0) return null;

    // Parse content to separate text and commands
    const parts = [];
    let lastIndex = 0;

    commands.forEach((cmd, cmdIndex) => {
        const cmdStart = cleanContent.indexOf(cmd.fullMatch, lastIndex);

        if (cmdStart > lastIndex) {
            const textBefore = cleanContent.substring(lastIndex, cmdStart).trim();
            if (textBefore) parts.push({ type: 'text', content: textBefore });
        }

        parts.push({ type: 'command', command: cmd, index: cmdIndex, response: responseData });
        lastIndex = cmdStart + cmd.fullMatch.length;
    });

    if (lastIndex < cleanContent.length) {
        const textAfter = cleanContent.substring(lastIndex).trim();
        if (textAfter) parts.push({ type: 'text', content: textAfter });
    }

    // Group consecutive commands
    const groupedParts = [];
    let currentCommands = [];

    for (const part of parts) {
        if (part.type === 'command') {
            currentCommands.push(part);
        } else {
            if (currentCommands.length > 0) {
                groupedParts.push({ type: 'commands', commands: currentCommands });
                currentCommands = [];
            }
            groupedParts.push(part);
        }
    }
    if (currentCommands.length > 0) {
        groupedParts.push({ type: 'commands', commands: currentCommands });
    }

    return (
        <Box sx={{ my: 1 }}>
            {groupedParts.map((part, index) => {
                if (part.type === 'text') {
                    return markdownHandler
                        ? <Box key={`text-${index}`}>{markdownHandler(part.content)}</Box>
                        : <Typography key={`text-${index}`} component="div" sx={{ mb: 1 }}>{part.content}</Typography>;
                }
                if (part.type === 'commands') {
                    return (
                        <Box key={`cmds-${index}`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, my: 1 }}>
                            {part.commands.map((cmd, idx) => (
                                <CommandCircle key={`cmd-${idx}`} command={cmd.command} index={cmd.index} response={cmd.response} />
                            ))}
                        </Box>
                    );
                }
                return null;
            })}
        </Box>
    );
};

export default CommandRenderer;
```

## 6.5 Create ImageWithDownload.js

Display images with a download button:

```javascript
// src/Frontend/ImageWithDownload.js
import React, { useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';

const isMobile = window.innerWidth < 960;

const ImageWithDownload = ({ imageUrl }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    const handleDownload = async () => {
        try {
            const link = document.createElement('a');
            const urlParts = imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1] || 'image.png';

            link.download = filename;
            link.target = '_blank';

            // Handle cross-origin images
            if (imageUrl.includes('http') && !imageUrl.startsWith(window.location.origin)) {
                try {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    link.href = URL.createObjectURL(blob);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } catch {
                    link.href = imageUrl;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                link.href = imageUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            window.open(imageUrl, '_blank');
        }
    };

    return (
        <div style={{ display: 'inline-block', maxWidth: isMobile ? '100%' : 600 }}>
            {!imageError ? (
                <>
                    <img
                        src={imageUrl}
                        alt="Generated"
                        onLoad={() => setIsLoading(false)}
                        onError={() => { setImageError(true); setIsLoading(false); }}
                        style={{ width: '100%', height: 'auto', maxHeight: 500, display: isLoading ? 'none' : 'block' }}
                    />
                    {isLoading && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, backgroundColor: '#f5f5f5' }}>
                            <span style={{ color: '#999' }}>Loading...</span>
                        </div>
                    )}
                    {!isLoading && (
                        <button
                            onClick={handleDownload}
                            style={{
                                marginTop: '4px', padding: '6px 12px', backgroundColor: '#f0f0f0',
                                border: 'none', borderRadius: '4px', color: '#666', cursor: 'pointer',
                                fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <DownloadIcon style={{ fontSize: '18px' }} />
                            Download
                        </button>
                    )}
                </>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, backgroundColor: '#f5f5f5' }}>
                    <span style={{ color: '#d32f2f' }}>Error loading image</span>
                </div>
            )}
        </div>
    );
};

export default ImageWithDownload;
```

## 6.6 Create MultiContentRenderer.js

Handle mixed text + images content:

```javascript
// src/Frontend/MultiContentRenderer.js
import React from 'react';
import ImageWithDownload from './ImageWithDownload';

const MultiContentRenderer = ({ content }) => {
    if (!Array.isArray(content)) return null;

    const textParts = [];
    const images = [];

    content.forEach((item, index) => {
        if (item.type === 'text' && !item.text.startsWith('Image Uploaded:')) {
            textParts.push(item.text);
        } else if (item.type === 'image_url' && item.image_url?.url) {
            images.push({ url: item.image_url.url, index });
        }
    });

    return (
        <div style={{ width: '100%' }}>
            {textParts.length > 0 && (
                <div style={{ marginBottom: images.length > 0 ? '12px' : '0' }}>
                    {textParts.map((text, idx) => <div key={`text-${idx}`} style={{ marginBottom: '4px' }}>{text}</div>)}
                </div>
            )}
            {images.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '8px' }}>
                    {images.map((img, idx) => (
                        <div key={`img-${idx}`}><ImageWithDownload imageUrl={img.url} /></div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiContentRenderer;
```

## 6.7 Update contentRender.js

Tie everything together:

```javascript
// src/Frontend/contentRender.js
import React, { useEffect } from 'react';
import ImageWithDownload from './ImageWithDownload';
import CommandRenderer from './CommandRenderer';
import MultiContentRenderer from './MultiContentRenderer';
import { COMMAND_PATTERNS } from './commands';

const HIDDEN = JSON.stringify({ type: 'HIDDEN_MESSAGE' });

const isVisualResult = (r) => r?.type === 'CHAT_IMAGE' && r?.data?.imageUrl;

const renderVisualResults = (results) => {
    const visuals = results.filter(isVisualResult);
    if (visuals.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', maxWidth: '100%' }}>
            {visuals.map((item, idx) => (
                <div key={`img-${idx}`} style={{ flex: '1 1 calc(50% - 6px)', minWidth: 200, maxWidth: 400 }}>
                    <ImageWithDownload imageUrl={item.data.imageUrl} />
                </div>
            ))}
        </div>
    );
};

const onRenderChatMessage = async (params) => {
    const { content, role } = params.messages[params.msgIndex];
    const { msgIndex, messages, markdownHandler } = params;

    // Debug mode - show raw content
    if (new URLSearchParams(window.location.search).get('debug')) return null;

    let JSONData;
    try { JSONData = JSON.parse(content); } catch (e) {}

    // Multi-content array with images
    if (Array.isArray(JSONData) && JSONData.some(item => item.type === 'image_url')) {
        return <MultiContentRenderer content={JSONData} />;
    }

    // Hide CONTINUE messages
    if (JSONData?.type === 'CONTINUE') return HIDDEN;

    // Handle RESPONSE with visual results
    if (JSONData?.type === 'RESPONSE' && Array.isArray(JSONData?.results)) {
        if (JSONData.results.some(isVisualResult)) {
            return renderVisualResults(JSONData.results);
        }
    }

    // Hide system responses to commands
    if (role === 'system' && JSONData &&
        (JSONData._meta_type === 'EVENT_STARTED' || JSONData._meta_type === 'EVENT_FINISHED')) {

        const hasVisual = JSONData.type === 'RESPONSE' &&
                          Array.isArray(JSONData.results) &&
                          JSONData.results.some(isVisualResult);

        if (!hasVisual && msgIndex > 0) {
            const prevMessage = messages[msgIndex - 1];
            if (COMMAND_PATTERNS.some(pattern => pattern.test(prevMessage.content))) {
                return HIDDEN;
            }
        }
    }

    // Render messages with commands
    if (COMMAND_PATTERNS.some(pattern => pattern.test(content))) {
        let responseData = null;

        if (msgIndex < messages.length - 1) {
            const nextMessage = messages[msgIndex + 1];
            if (nextMessage.role === 'system') {
                try {
                    const nextJSON = JSON.parse(nextMessage.content);
                    if (nextJSON._meta_type === 'EVENT_STARTED' || nextJSON._meta_type === 'EVENT_FINISHED') {
                        responseData = nextJSON;
                    }
                } catch (e) {}
            }
        }

        return <CommandRenderer content={content} responseData={responseData} markdownHandler={markdownHandler} />;
    }

    return null;
};

const Header = ({ setRenderSettings }) => {
    useEffect(() => {
        setRenderSettings({
            disableShareButton: true,
            disableBalanceView: true
        });
    }, [setRenderSettings]);

    return null;
};

const exports = { onRenderChatMessage, Header };
window.contentRender = exports;
export default exports;
```

## 6.8 Update contentRender.json

Add the required dependencies:

```json
{
  "dependencies": {
    "react": "^18.2.0 (fixed)",
    "react-dom": "^18.2.0 (fixed)",
    "@mui/material": "^5.16.1 (fixed)",
    "@mui/icons-material": "^5.16.1 (fixed)",
    "@emotion/react": "^11.10.6 (fixed)",
    "@emotion/styled": "^11.10.6 (fixed)"
  }
}
```

The `(fixed)` suffix indicates these are built-in libraries provided by OpenKBS - they don't need to be bundled.

## 6.9 Deploy and Test

```bash
openkbs push
```

Now test your agent:
1. Ask "Generate an image of a sunset"
2. You should see:
   - An image icon circle while processing
   - The actual image displayed with download button when complete
   - Hover over the icon to see request/response details

## 6.10 Debug Mode

Add `?debug` to your agent URL to see raw message content:
```
https://YOUR_KB_ID.apps.openkbs.com?debug
```

This helps troubleshoot rendering issues by showing all messages without custom rendering.

## Summary

- `commands.js` - Defines commands and generates regex patterns
- `CommandRenderer.js` - Renders commands as icon circles with tooltips
- `ImageWithDownload.js` - Displays images with download button
- `MultiContentRenderer.js` - Handles mixed text+image content
- `contentRender.js` - Main rendering logic
- `contentRender.json` - Declares MUI dependencies as `(fixed)`

## Complete Agent

The complete frontend code is in [agents/telegram-agent/src/Frontend/](./agents/telegram-agent/src/Frontend/).
