import React, { useState, useEffect, useRef } from 'react';
import Message from './Message';
import MessageInput from './MessageInput';
import ScreenRecorder from './ScreenRecorder';
import '../styles/Chatroom.css';

const API_BASE = 'http://localhost:3000';

function ChatRoom({ username, currentRoom, isAuthenticated, onLogin }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingType, setRecordingType] = useState('screen');
  const [screenStream, setScreenStream] = useState(null);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load messages when component mounts or room changes
  useEffect(() => {
    if (isAuthenticated && currentRoom) {
      loadMessages();
      startAutoRefresh();
    }
    return () => {
      stopAutoRefresh();
    };
  }, [currentRoom, isAuthenticated]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clean up screen sharing on unmount
  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      stopAutoRefresh();
    };
  }, [screenStream]);

  // Auto-refresh messages every 10 seconds
  const refreshIntervalRef = useRef(null);
  
  const startAutoRefresh = () => {
    stopAutoRefresh();
    refreshIntervalRef.current = setInterval(() => {
      loadMessages();
    }, 10000); // Refresh every 10 seconds
  };

  const stopAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Load messages function
  const loadMessages = async () => {
    if (!currentRoom) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/messages/${currentRoom}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle different response formats
      if (Array.isArray(data)) {
        setMessages(data);
      } else if (data && data.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
      } else if (data && Array.isArray(data)) {
        setMessages(data);
      } else {
        console.error('Unexpected response format:', data);
        setMessages([]);
      }
      
    } catch (error) {
      console.error('Error loading messages:', error);
      // Keep existing messages if refresh fails
    } finally {
      setIsLoading(false);
    }
  };

  // Handle new message from recorder
  const handleNewMessage = (newMessage) => {
    setMessages(prev => {
      // Check for duplicates
      const exists = prev.some(msg => 
        msg._id === newMessage._id || 
        (msg.videoUrl === newMessage.videoUrl && 
         msg.username === newMessage.username && 
         msg.timestamp === newMessage.timestamp)
      );
      if (!exists) {
        return [...prev, newMessage];
      }
      return prev;
    });
    
    // Scroll to bottom
    setTimeout(scrollToBottom, 100);
  };

  // Send message
  const sendMessage = async (text) => {
    if (!text.trim()) return;
    
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic update - show message immediately
    const optimisticMessage = {
      _id: tempId,
      username,
      text,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      isSystemMessage: false
    };
    setMessages(prev => [...prev, optimisticMessage]);
    scrollToBottom();
    
    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          text, 
          room: currentRoom,
          isSystemMessage: false
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.message) {
        // Success - replace optimistic message with real one
        setMessages(prev => prev.map(msg => 
          msg._id === tempId ? { 
            ...result.message, 
            isOptimistic: false
          } : msg
        ));
      } else {
        // Error - remove optimistic message
        setMessages(prev => prev.filter(msg => msg._id !== tempId));
        alert('Failed to send message: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.filter(msg => msg._id !== tempId));
      alert('Failed to send message. Please try again.');
    }
  };

  // Screen Sharing Function (Same as before but simplified)
  const toggleScreenSharing = async () => {
    try {
      if (isSharingScreen) {
        // Stop sharing
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
          setScreenStream(null);
        }
        setIsSharingScreen(false);
        
        // Add system message
        addSystemMessage('Stopped sharing screen');
      } else {
        // Start sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: 15,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: true
        });
        
        setScreenStream(stream);
        setIsSharingScreen(true);
        
        // Add system message
        addSystemMessage('Started sharing screen');
        
        // Handle when user stops sharing from browser UI
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
          setIsSharingScreen(false);
          addSystemMessage('Stopped sharing screen');
        };
      }
    } catch (error) {
      console.error('Screen sharing error:', error);
      if (error.name !== 'NotAllowedError') {
        alert('Failed to share screen: ' + error.message);
      }
    }
  };

  // Add system message
  const addSystemMessage = (text) => {
    const systemMessage = {
      _id: `system-${Date.now()}`,
      username,
      text,
      timestamp: new Date().toISOString(),
      isSystemMessage: true
    };
    setMessages(prev => [...prev, systemMessage]);
  };

  // Handle recording completion
  const handleRecordingComplete = (recordingData) => {
    console.log('Recording completed:', recordingData);
    // Message is already added via onNewMessage prop
    setShowRecorder(false);
  };

  // Upload file
  const uploadFile = async (file) => {
    if (!file) return;
    
    setFileUploading(true);
    const formData = new FormData();
    formData.append('video', file);
    formData.append('username', username);
    formData.append('room', currentRoom);
    formData.append('text', `Uploaded: ${file.name}`);
    
    try {
      const response = await fetch(`${API_BASE}/api/upload-video`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Reload messages to show the uploaded file
        loadMessages();
        addSystemMessage(`File uploaded: ${file.name}`);
      } else {
        alert('Upload failed: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    } finally {
      setFileUploading(false);
    }
  };

  // Handle file upload button click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
    }
    e.target.value = ''; // Reset input
  };

  if (!isAuthenticated) {
    return (
      <div className="chat-room">
        <div className="login-prompt">
          <div className="prompt-container">
            <h2>Welcome to Chat</h2>
            <p><b>Please log in to chat</b></p>
            <button 
              className="btn guest-login"
              onClick={() => onLogin('GuestUser')}
            >
              Login as Guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="chat-room">
        <div className="no-room">
          <div className="no-room-container">
            <h2>No Room Selected</h2>
            <p>Please select a room from the sidebar to start chatting</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-room">
      <div className="chat-header">
        <div className="header-left">
          <h2>Chat Room: {currentRoom}</h2>
          {isSharingScreen && (
            <span className="sharing-indicator">
              <span className="sharing-dot"></span> Sharing Screen
            </span>
          )}
        </div>
        <div className="header-right">
          <span className="user-badge">{username}</span>
          <button 
            className="btn refresh-btn"
            onClick={loadMessages}
            disabled={isLoading}
          >
            {isLoading ? '🔄' : '↻'}
          </button>
        </div>
      </div>

      {showRecorder && (
        <div className="recorder-overlay">
          <div className="recorder-container">
            <ScreenRecorder
              username={username}
              room={currentRoom}
              onRecordingComplete={handleRecordingComplete}
              onCancel={() => setShowRecorder(false)}
              onNewMessage={handleNewMessage}
            />
          </div>
        </div>
      )}

      <div className="messages-container" ref={messagesContainerRef} id="messages">
        {isLoading && messages.length === 0 ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <div className="no-messages-icon">💬</div>
            <h3>No messages yet</h3>
            <p>Start the conversation!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message 
                key={message._id || message.timestamp || Math.random()} 
                message={message} 
                currentUser={username}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="message-input-container">
        <MessageInput onSendMessage={sendMessage} disabled={isLoading || fileUploading} />
      </div>

      <div className="media-controls">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          accept="video/*,audio/*,image/*,.pdf,.doc,.docx,.txt,.zip"
        />
        
        <button
          className={`btn upload ${fileUploading ? 'uploading' : ''}`}
          onClick={handleUploadClick}
          disabled={isLoading || fileUploading || showRecorder}
          title="Upload File"
        >
          {fileUploading ? '📤 Uploading...' : '📁 Upload'}
        </button>

        <button
          className={`btn screen-share ${isSharingScreen ? 'active' : ''}`}
          onClick={toggleScreenSharing}
          disabled={isLoading || showRecorder}
          title={isSharingScreen ? 'Stop Sharing Screen' : 'Share Screen'}
        >
          {isSharingScreen ? '🛑 Stop Sharing' : '🖥️ Share Screen'}
        </button>

        <button
          className="btn screen-record"
          onClick={() => {
            setRecordingType('screen');
            setShowRecorder(true);
          }}
          disabled={isLoading || showRecorder || isSharingScreen}
          title="Record Screen (12+ Hours)"
        >
          🎥 Record Screen
        </button>

        <button
          className="btn voice-record"
          onClick={() => {
            setRecordingType('voice');
            setShowRecorder(true);
          }}
          disabled={isLoading || showRecorder || isSharingScreen}
          title="Record Voice (12+ Hours)"
        >
          🎤 Record Voice
        </button>
      </div>

      <div className="recording-info">
        <p className="info-text">
          <strong>💡 Tip:</strong> Screen/Voice recording supports <strong>12+ hour sessions</strong> with auto-save every 5 seconds
        </p>
        <div className="info-features">
          <span className="feature-badge">🚀 Unlimited Duration</span>
          <span className="feature-badge">💾 Auto-save</span>
          <span className="feature-badge">⚡ Instant Chat Post</span>
        </div>
      </div>
    </div>
  );
}

export default ChatRoom;