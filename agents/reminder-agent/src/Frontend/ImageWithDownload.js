import React, { useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';

const isMobile = window.innerWidth < 960;

const ImageWithDownload = ({ imageUrl }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    const handleDownload = async () => {
        try {
            // Create a temporary anchor element for download
            const link = document.createElement('a');
            link.href = imageUrl;

            // Extract filename from URL or use default
            const urlParts = imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1] || 'image.png';

            // Set download attribute with filename
            link.download = filename;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            // For cross-origin images, we need to fetch and create blob
            if (imageUrl.includes('http') && !imageUrl.startsWith(window.location.origin)) {
                try {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    link.href = blobUrl;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    // Clean up the blob URL
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                } catch (fetchError) {
                    // If fetch fails (CORS), fallback to direct download
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error('Error downloading image:', error);
            // Fallback: open in new tab
            window.open(imageUrl, '_blank');
        }
    };

    return (
        <div style={{ display: 'inline-block', maxWidth: isMobile ? '100%' : 600 }}>
            {!imageError ? (
                <>
                    <img
                        src={imageUrl}
                        alt="Chat Image"
                        onLoad={() => setIsLoading(false)}
                        onError={() => {
                            setImageError(true);
                            setIsLoading(false);
                        }}
                        style={{
                            width: '100%',
                            height: 'auto',
                            maxHeight: 500,
                            display: isLoading ? 'none' : 'block'
                        }}
                    />
                    {isLoading && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: 200,
                            backgroundColor: '#f5f5f5'
                        }}>
                            <span style={{ color: '#999' }}>Loading...</span>
                        </div>
                    )}
                    {!isLoading && (
                        <button
                            onClick={handleDownload}
                            style={{
                                marginTop: '4px',
                                padding: '6px 12px',
                                backgroundColor: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#666',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#e0e0e0';
                                e.target.style.color = '#333';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = '#f0f0f0';
                                e.target.style.color = '#666';
                            }}
                        >
                            <DownloadIcon style={{ fontSize: '18px' }} />
                            Download
                        </button>
                    )}
                </>
            ) : (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: 200,
                    backgroundColor: '#f5f5f5'
                }}>
                    <span style={{ color: '#d32f2f' }}>Error loading image</span>
                </div>
            )}
        </div>
    );
};

export default ImageWithDownload;
