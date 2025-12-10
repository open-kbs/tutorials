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

        if (!isValidCommand(commandName)) {
            continue;
        }

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

// Single command circle component
const CommandCircle = ({ command, index, response }) => {
    const [hovering, setHovering] = useState(false);
    const IconComponent = getCommandIcon(command.name) || BoltIcon;

    // Determine if command has completed (has response)
    const hasResponse = !!response;
    const isSuccess = response && !response.error;
    const isError = response && response.error;

    // Format tooltip content to show both request and response
    const getTooltipContent = () => {
        return (
            <Box sx={{ p: 1, maxWidth: 400 }}>
                {/* Command Name */}
                <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    color: '#4CAF50',
                    display: 'block',
                    mb: 0.5
                }}>
                    {command.name}
                </Typography>

                {/* Request Parameters */}
                {command.data && (
                    <>
                        <Typography variant="caption" sx={{
                            color: '#90CAF9',
                            fontSize: '10px',
                            fontWeight: 'bold'
                        }}>
                            REQUEST:
                        </Typography>
                        <Box sx={{
                            display: 'block',
                            fontSize: '10px',
                            color: '#fff',
                            ml: 1,
                            mb: 0.5,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {typeof command.data === 'object'
                                ? JSON.stringify(command.data, null, 2)
                                : String(command.data)
                            }
                        </Box>
                    </>
                )}

                {/* Response - skip CONTINUE and meta events */}
                {response && response.type !== 'CONTINUE' && !response._meta_type && (
                    <>
                        <Typography variant="caption" sx={{
                            color: response.error ? '#FF6B6B' : '#81C784',
                            fontSize: '10px',
                            fontWeight: 'bold'
                        }}>
                            RESPONSE:
                        </Typography>
                        <Box sx={{
                            display: 'block',
                            fontSize: '10px',
                            color: '#fff',
                            ml: 1,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {response.error
                                ? `Error: ${response.error}`
                                : JSON.stringify(response, null, 2)
                            }
                        </Box>
                    </>
                )}

                {/* Loading state */}
                {!response && (
                    <Typography variant="caption" sx={{
                        display: 'block',
                        fontSize: '10px',
                        color: '#FFA726',
                        fontStyle: 'italic',
                        mt: 0.5
                    }}>
                        Waiting for response...
                    </Typography>
                )}
            </Box>
        );
    };

    return (
        <Tooltip
            title={getTooltipContent()}
            placement="top"
            arrow
            TransitionComponent={Zoom}
            sx={{
                '& .MuiTooltip-tooltip': {
                    backgroundColor: 'rgba(0, 0, 0, 0.87)',
                    maxWidth: 300
                }
            }}
        >
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
                    transform: hovering ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: hovering ? '0 4px 20px rgba(25, 118, 210, 0.25)' : 'none',
                    animation: `fadeIn 0.5s ease-in-out ${index * 0.1}s both`,
                    '@keyframes fadeIn': {
                        '0%': {
                            opacity: 0,
                            transform: 'scale(0.8)'
                        },
                        '100%': {
                            opacity: 1,
                            transform: 'scale(1)'
                        }
                    }
                }}
            >
                <IconComponent
                    sx={{
                        fontSize: 18,
                        color: hovering
                            ? (isError ? '#f44336' : isSuccess ? '#4CAF50' : '#9e9e9e')
                            : (isError ? 'rgba(244, 67, 54, 0.7)' : isSuccess ? 'rgba(76, 175, 80, 0.7)' : 'rgba(0, 0, 0, 0.54)')
                    }}
                />
            </Box>
        </Tooltip>
    );
};

// Main component
const CommandRenderer = ({ content, responseData, markdownHandler }) => {
    // Filter out GEMINI_META comments
    const cleanContent = content.replace(/<!--GEMINI_META:.*?-->/gs, '').trim();
    const commands = parseCommands(cleanContent);

    if (commands.length === 0) return null;

    // Parse content to separate text and commands
    const parseContentWithText = () => {
        const parts = [];
        let lastIndex = 0;

        commands.forEach((cmd, cmdIndex) => {
            const cmdStart = cleanContent.indexOf(cmd.fullMatch, lastIndex);

            // Add text before command if exists
            if (cmdStart > lastIndex) {
                const textBefore = cleanContent.substring(lastIndex, cmdStart).trim();
                if (textBefore) {
                    parts.push({ type: 'text', content: textBefore });
                }
            }

            // Add command
            parts.push({
                type: 'command',
                command: cmd,
                index: cmdIndex,
                response: commands.length === 1 ? responseData : responseData
            });

            lastIndex = cmdStart + cmd.fullMatch.length;
        });

        // Add remaining text after last command
        if (lastIndex < cleanContent.length) {
            const textAfter = cleanContent.substring(lastIndex).trim();
            if (textAfter) {
                parts.push({ type: 'text', content: textAfter });
            }
        }

        return parts;
    };

    const contentParts = parseContentWithText();

    // Group consecutive commands together
    const groupedParts = [];
    let currentCommands = [];

    for (const part of contentParts) {
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
                    if (markdownHandler) {
                        return (
                            <Box key={`text-${index}`} sx={{ display: 'block' }}>
                                {markdownHandler(part.content)}
                            </Box>
                        );
                    }
                    return (
                        <Typography key={`text-${index}`} component="div" sx={{ mb: 1 }}>
                            {part.content}
                        </Typography>
                    );
                } else if (part.type === 'commands') {
                    return (
                        <Box key={`cmds-${index}`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, my: 1 }}>
                            {part.commands.map((cmd, cmdIdx) => (
                                <CommandCircle
                                    key={`cmd-${cmdIdx}`}
                                    command={cmd.command}
                                    index={cmd.index}
                                    response={cmd.response}
                                />
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
