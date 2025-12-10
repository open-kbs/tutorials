import {getActions} from './actions.js';

const isContentArray = (r) => {
    return Array.isArray(r?.data) && r.data.some(item => item?.type === 'image_url');
};

const getMeta = (results) => {
    const needsChat = results.some(r => r?._meta_actions?.includes('REQUEST_CHAT_MODEL'));
    return needsChat ? ["REQUEST_CHAT_MODEL"] : [];
};

export const backendHandler = async (event) => {
    const lastMessage = event.payload.messages[event.payload.messages.length - 1];
    const content = lastMessage.content || '';
    const actions = getActions({_meta_actions: ["REQUEST_CHAT_MODEL"]}, event);

    const pendingActions = [];
    for (const [regex, action] of actions) {
        const matches = [...content.matchAll(new RegExp(regex, 'g'))];
        for (const match of matches) {
            pendingActions.push(action(match, event));
        }
    }

    if (pendingActions.length === 0) {
        return { type: 'CONTINUE' };
    }

    try {
        const results = await Promise.all(pendingActions);
        const meta = getMeta(results);

        // Handle image_url content arrays (for LLM vision)
        if (results.some(isContentArray)) {
            const mergedData = [];
            for (const r of results) {
                if (isContentArray(r)) {
                    mergedData.push(...r.data);
                } else {
                    mergedData.push({ type: 'text', text: JSON.stringify(r, null, 2) });
                }
            }
            return { data: mergedData, _meta_actions: meta };
        }

        return { type: 'RESPONSE', results, _meta_actions: meta };
    } catch (error) {
        return { type: 'ERROR', error: error.message, _meta_actions: ["REQUEST_CHAT_MODEL"] };
    }
};
