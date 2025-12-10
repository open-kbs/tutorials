import React from 'react';
import ImageWithDownload from './ImageWithDownload';

/**
 * Component to render mixed content (text + images) from user messages
 * Images are displayed 2 per row
 */
const MultiContentRenderer = ({ content }) => {
    // content is an array like:
    // [{"type":"text","text":"..."}, {"type":"text","text":"Image Uploaded: ..."}, {"type":"image_url","image_url":{"url":"..."}}]

    if (!Array.isArray(content)) {
        return null;
    }

    // Separate text and images
    const textParts = [];
    const images = [];

    content.forEach((item, index) => {
        if (item.type === 'text') {
            // Skip "Image Uploaded: ..." text notifications
            if (!item.text.startsWith('Image Uploaded:')) {
                textParts.push(item.text);
            }
        } else if (item.type === 'image_url' && item.image_url?.url) {
            images.push({
                url: item.image_url.url,
                index: index
            });
        }
    });

    return (
        <div style={{ width: '100%' }}>
            {/* Render text content */}
            {textParts.length > 0 && (
                <div style={{ marginBottom: images.length > 0 ? '12px' : '0' }}>
                    {textParts.map((text, idx) => (
                        <div key={`text-${idx}`} style={{ marginBottom: '4px' }}>
                            {text}
                        </div>
                    ))}
                </div>
            )}

            {/* Render images in a 2-column grid */}
            {images.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                    gap: '8px',
                    width: '100%'
                }}>
                    {images.map((img, idx) => (
                        <div key={`img-${idx}`} style={{
                            width: '100%',
                            maxWidth: '100%'
                        }}>
                            <ImageWithDownload
                                imageUrl={img.url}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    borderRadius: '8px',
                                    objectFit: 'cover'
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiContentRenderer;
