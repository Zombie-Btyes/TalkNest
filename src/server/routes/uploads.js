const express = require('express');
const router = express.Router();
const uploadStream = require('../middleware/uploadStream');

// Start a new upload session
router.post('/start-session', (req, res) => {
  try {
    const { username, room, text } = req.body;
    
    if (!username || !room) {
      return res.status(400).json({ error: 'Username and room are required' });
    }
    
    const sessionId = uploadStream.createSession(username, room, text);
    
    res.json({
      success: true,
      sessionId,
      message: 'Upload session started'
    });
    
  } catch (error) {
    console.error('Error starting upload session:', error);
    res.status(500).json({ error: 'Failed to start upload session' });
  }
});

// Upload a chunk
router.post('/upload-chunk', async (req, res) => {
  try {
    const { sessionId, chunkIndex } = req.body;
    
    if (!sessionId || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Session ID and chunk index are required' });
    }
    
    if (!req.files || !req.files.chunk) {
      return res.status(400).json({ error: 'No chunk file provided' });
    }
    
    const chunkFile = req.files.chunk;
    const chunkBuffer = chunkFile.data;
    
    await uploadStream.uploadChunk(sessionId, chunkBuffer, parseInt(chunkIndex));
    
    res.json({
      success: true,
      chunkIndex,
      message: 'Chunk uploaded successfully'
    });
    
  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({ error: error.message });
  }
});

// Finalize upload and create message
router.post('/finalize-upload', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const videoInfo = await uploadStream.finalizeUpload(sessionId);
    
    // Here you would create a message in your database
    // const message = await Message.create({
    //   username: req.body.username,
    //   text: req.body.text || 'Screen recording',
    //   videoUrl: videoInfo.path,
    //   room: req.body.room,
    //   fileSize: videoInfo.size,
    //   duration: videoInfo.duration
    // });
    
    res.json({
      success: true,
      videoUrl: videoInfo.path,
      filename: videoInfo.filename,
      size: videoInfo.size,
      duration: videoInfo.duration,
      // messageId: message._id
    });
    
  } catch (error) {
    console.error('Error finalizing upload:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;