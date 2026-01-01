import { useState, useEffect, useCallback } from 'react';
import { chatApi } from '../services/api';

function useChat(username, room) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load initial messages
  useEffect(() => {
    if (room) {
      loadMessages();
    }
  }, [room]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const data = await chatApi.getMessages(room);
      setMessages(data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = useCallback(async (text) => {
    setIsLoading(true);
    try {
      const newMessage = {
        username,
        text,
        room,
        timestamp: new Date().toISOString()
      };

      // Optimistic update
      setMessages(prev => [...prev, { ...newMessage, _id: `temp-${Date.now()}` }]);

      // Send to server
      const savedMessage = await chatApi.sendMessage(newMessage);
      
      // Replace optimistic message with server response
      setMessages(prev => prev.map(msg => 
        msg._id === newMessage._id ? savedMessage : msg
      ));
    } catch (err) {
      setError(err.message);
      console.error('Failed to send message:', err);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => !msg._id.includes('temp-')));
    } finally {
      setIsLoading(false);
    }
  }, [username, room]);

  const uploadFile = useCallback(async (file, text = 'Uploaded a file') => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('text', text);

      const savedMessage = await chatApi.uploadFile(formData);
      setMessages(prev => [...prev, savedMessage]);
    } catch (err) {
      setError(err.message);
      console.error('Failed to upload file:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    sendMessage,
    uploadFile,
    isLoading,
    error,
    loadMessages
  };
}

export default useChat;