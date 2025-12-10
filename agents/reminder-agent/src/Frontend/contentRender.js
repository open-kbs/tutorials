import React, { useEffect } from 'react';

/**
 * Custom message rendering
 * Return null for default rendering, or a React component for custom
 */
const onRenderChatMessage = async (params) => {
    const { content, role } = params.messages[params.msgIndex];

    // Hide system messages
    if (role === 'system') {
        return JSON.stringify({ type: 'HIDDEN_MESSAGE' });
    }

    // Default markdown rendering
    return null;
};

/**
 * Custom header component
 */
const Header = ({ setRenderSettings }) => {
    useEffect(() => {
        setRenderSettings({
            disableShareButton: true,
            disableBalanceView: true,
            disableSentLabel: false,
            disableChatAvatar: false,
            disableChatModelsSelect: false,
            disableContextItems: false,
            disableCopyButton: false,
            disableEmojiButton: false,
            disableTextToSpeechButton: false,
            disableMobileLeftButton: false
        });
    }, [setRenderSettings]);

    return null;
};

const exports = { onRenderChatMessage, Header };
window.contentRender = exports;
export default exports;
