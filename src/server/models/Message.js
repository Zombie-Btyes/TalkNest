import React from 'react';

function Message({ message, currentUser }) {
  const isSystemMessage = message.isSystemMessage || message.username === 'System';
  const isCurrentUser = message.username === currentUser;
  const isOptimistic = message.isOptimistic; // Check if it's an optimistic message
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (e) {
      return '';
    }
  };

  // Determine message class
  let messageClass = 'message';
  if (isSystemMessage) {
    messageClass = 'message system-message';
  } else if (!isCurrentUser) {
    messageClass = 'message from-other';
  }

  // Add optimistic class if needed
  if (isOptimistic) {
    messageClass += ' optimistic-message';
  }

  // Fix video URL if needed
  const getVideoUrl = () => {
    if (!message.videoUrl) return null;
    if (message.videoUrl.startsWith('http') || message.videoUrl.startsWith('/uploads')) {
      return message.videoUrl;
    }
    return `/uploads/videos/${message.videoUrl}`;
  };

  const videoUrl = getVideoUrl();

  return (
    <div className={messageClass}>
      <div className="message-header">
        <strong className="username">
          {message.username}
          {isOptimistic && <span className="optimistic-badge">Sending...</span>}
        </strong>
        <span className="timestamp">{formatTime(message.timestamp)}</span>
      </div>
      
      <p className="message-text">{message.text}</p>
      
      {videoUrl && videoUrl !== '#' && !isOptimistic && (
        <div className="video-container">
          <video
            controls
            src={videoUrl.startsWith('/') ? `http://localhost:3000${videoUrl}` : videoUrl}
            className="message-video"
          />
          <p className="video-info">
            <small>Video shared by {message.username}</small>
          </p>
        </div>
      )}
      
      {message.fileUrl && !isOptimistic && (
        <a
          href={message.fileUrl}
          download
          className="file-download"
        >
          📁 Download File
        </a>
      )}
    </div>
  );
}

export default Message;