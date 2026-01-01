const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Get messages for a room
router.get('/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const messages = await Message.getByRoom(room, limit, skip);
    
    res.json({
      success: true,
      count: messages.length,
      messages: messages.map(msg => msg.toPublicJSON())
    });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch messages' 
    });
  }
});

// Send a new message
router.post('/', async (req, res) => {
  try {
    const { username, text, room, videoUrl, fileSize, duration } = req.body;
    
    if (!username || !text || !room) {
      return res.status(400).json({
        success: false,
        error: 'Username, text, and room are required'
      });
    }
    
    const message = new Message({
      username,
      text,
      room,
      videoUrl: videoUrl || null,
      fileSize: fileSize || 0,
      duration: duration || 0,
      messageType: videoUrl ? 'video' : 'text'
    });
    
    await message.save();
    
    // Get the populated message
    const savedMessage = await Message.findById(message._id);
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: savedMessage.toPublicJSON()
    });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message' 
    });
  }
});

// Get message by ID
router.get('/id/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
    
    res.json({
      success: true,
      message: message.toPublicJSON()
    });
    
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch message' 
    });
  }
});

// Delete a message (optional, for cleanup)
router.delete('/:id', async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete message' 
    });
  }
});

module.exports = router;