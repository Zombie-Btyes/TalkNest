import React from 'react';
import { FaDownload, FaExternalLinkAlt } from 'react-icons/fa';

const API_BASE = 'http://localhost:3000';

function Message({ message, currentUser }) {
  const isSystemMessage = message.isSystemMessage || message.username === 'System';
  const isCurrentUser = message.username === currentUser;

  // Handle download
  const handleDownload = () => {
    console.log('Download clicked for:', message.videoUrl);
    
    if (message.videoUrl) {
      // Extract filename from videoUrl
      const videoPath = message.videoUrl;
      const filename = videoPath.split('/').pop();
      
      // Use the downloadUrl from message, or construct it
      const downloadUrl = message.downloadUrl 
        ? `${API_BASE}${message.downloadUrl}`
        : `${API_BASE}/api/recordings/download/${filename}`;
      
      console.log('Download URL:', downloadUrl);
      
      // Create a hidden link and click it
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename || 'recording.webm';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Open direct link
  const handleDirectLink = () => {
    if (message.videoUrl) {
      const videoPath = message.videoUrl;
      const filename = videoPath.split('/').pop();
      const downloadUrl = message.downloadUrl 
        ? `${API_BASE}${message.downloadUrl}`
        : `${API_BASE}/api/recordings/download/${filename}`;
      
      window.open(downloadUrl, '_blank');
    }
  };

  // Format time
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

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return '';
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Get video source URL
  const getVideoSource = () => {
    if (!message.videoUrl) return '';
    
    if (message.videoUrl.startsWith('http')) {
      return message.videoUrl;
    } else {
      return `${API_BASE}${message.videoUrl}`;
    }
  };

  // Determine message class
  let messageClass = 'message';
  if (isSystemMessage) {
    messageClass = 'message system-message';
  } else if (!isCurrentUser) {
    messageClass = 'message from-other';
  }

  return (
    <div className={messageClass}>
      <div className="message-header">
        <div className="message-meta">
          <strong className="username">{message.username}</strong>
          <span className="timestamp">
            {formatDate(message.timestamp)} {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
      
      <p className="message-text">{message.text}</p>
      
      {message.videoUrl && (
        <div className="video-container">
          <div className="video-header">
            <span className="video-type">
              {message.recordingType === 'screen' ? '🎥 Screen Recording' : '🎤 Voice Recording'}
              {message.isLongRecording && <span className="long-recording-badge">LONG</span>}
            </span>
            {(message.duration || message.fileSize) && (
              <span className="video-info-small">
                {message.duration && <span>{formatDuration(message.duration)}</span>}
                {message.fileSize && <span> • {formatFileSize(message.fileSize)}</span>}
              </span>
            )}
          </div>
          
          <video
            controls
            src={getVideoSource()}
            className="message-video"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
          
          <div className="video-actions">
            <button 
              onClick={handleDownload} 
              className="video-download-btn"
              title="Download immediately"
            >
              <FaDownload /> Download
            </button>
            <button 
              onClick={handleDirectLink}
              className="video-direct-btn"
              title="Open direct link"
            >
              <FaExternalLinkAlt /> Direct Link
            </button>
          </div>
        </div>
      )}
      
      {message.fileUrl && !message.videoUrl && (
        <a
          href={`${API_BASE}${message.fileUrl}`}
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