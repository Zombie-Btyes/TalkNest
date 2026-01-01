import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';
import dotenv from 'dotenv';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// MONGODB CONNECTION
console.log('🔗 Connecting to MongoDB...');

const mongoURI = process.env.MONGODB_URI || 
  'mongodb+srv://junxiang:Airport01@cluster0.t7ttu.mongodb.net/ViteChat?retryWrites=true&w=majority';

mongoose.connect(mongoURI)
.then(async () => {
  console.log('✅ MongoDB Connected!');
  await createCollectionsIfNeeded();
})
.catch(err => {
  console.error('❌ MongoDB Connection Error:', err.message);
});

// Create collections
async function createCollectionsIfNeeded() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  
  const requiredCollections = ['messages', 'videos', 'recording_sessions', 'users'];
  
  for (const collection of requiredCollections) {
    if (!collectionNames.includes(collection)) {
      await db.createCollection(collection);
      console.log(`✅ Created "${collection}" collection`);
    }
  }
}

// Create upload directories
const uploadsDir = path.join(__dirname, 'uploads');
const recordingsDir = path.join(uploadsDir, 'recordings');
const recordingChunksDir = path.join(uploadsDir, 'recording-chunks');

[uploadsDir, recordingsDir, recordingChunksDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created ${dir} directory`);
  }
});

// Store recording sessions in memory (use Redis in production)
const recordingSessions = new Map();

// MIDDLEWARE
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================
// TEST ROUTES FOR DEBUGGING
// ======================

// Test if a file exists
app.get('/api/recordings/test/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(recordingsDir, filename);
    
    const exists = fs.existsSync(filePath);
    const stats = exists ? fs.statSync(filePath) : null;
    
    res.json({
      success: true,
      exists,
      filename,
      path: filePath,
      size: stats ? stats.size : 0,
      created: stats ? stats.mtime : null,
      recordingsDir
    });
    
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all recordings
app.get('/api/recordings/list', (req, res) => {
  try {
    const files = fs.readdirSync(recordingsDir);
    const recordings = files.map(filename => {
      const filePath = path.join(recordingsDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        created: stats.mtime,
        url: `/uploads/recordings/${filename}`,
        downloadUrl: `/api/recordings/download/${filename}`
      };
    });
    
    res.json({
      success: true,
      count: recordings.length,
      recordings,
      directory: recordingsDir
    });
    
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ======================
// CHUNKED RECORDING API (UNLIMITED DURATION)
// ======================

// Start a long recording session
app.post('/api/recordings/long/start', (req, res) => {
  try {
    const { username, room, recordingType, title } = req.body;
    const sessionId = uuidv4();
    
    // Create session directory
    const sessionDir = path.join(recordingChunksDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    const session = {
      sessionId,
      username,
      room,
      recordingType: recordingType || 'screen',
      title: title || `${recordingType || 'screen'} recording`,
      chunks: [],
      totalSize: 0,
      startedAt: new Date(),
      lastChunkAt: new Date(),
      isActive: true,
      sessionDir,
      chunkCount: 0
    };
    
    recordingSessions.set(sessionId, session);
    
    // Clean old sessions
    cleanupOldSessions();
    
    res.json({
      success: true,
      sessionId,
      message: 'Long recording session started',
      maxChunkSize: 50 * 1024 * 1024, // 50MB per chunk
      recommendedChunkDuration: 300 // Upload every 5 minutes
    });
    
  } catch (error) {
    console.error('Error starting long recording:', error);
    res.status(500).json({ error: 'Failed to start recording session' });
  }
});

// Upload a recording chunk
app.post('/api/recordings/long/chunk', async (req, res) => {
  try {
    const { sessionId, chunkIndex, isFinal } = req.body;
    
    if (!sessionId || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Session ID and chunk index required' });
    }
    
    const session = recordingSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Recording session not found' });
    }
    
    if (!req.files || !req.files.chunk) {
      return res.status(400).json({ error: 'No chunk file uploaded' });
    }
    
    const chunk = req.files.chunk;
    const chunkFilename = `chunk-${chunkIndex.toString().padStart(6, '0')}.webm`;
    const chunkPath = path.join(session.sessionDir, chunkFilename);
    
    // Save chunk to disk
    await chunk.mv(chunkPath);
    
    // Update session
    session.chunks.push({
      index: parseInt(chunkIndex),
      filename: chunkFilename,
      path: chunkPath,
      size: chunk.size,
      uploadedAt: new Date()
    });
    
    session.totalSize += chunk.size;
    session.chunkCount++;
    session.lastChunkAt = new Date();
    
    // Generate final filename early
    const timestamp = Date.now();
    const finalFilename = `${session.recordingType}-${session.username}-${timestamp}-${sessionId.slice(0, 8)}.webm`;
    
    // If this is the final chunk, process the recording
    if (isFinal === 'true') {
      session.isActive = false;
      
      // Process in background
      processRecordingChunks(sessionId).catch(console.error);
      
      res.json({
        success: true,
        message: 'Final chunk received. Processing recording...',
        chunkIndex,
        totalChunks: session.chunkCount,
        filename: finalFilename,
        downloadUrl: `/api/recordings/download/${finalFilename}`,
        partialUrl: `/api/recordings/long/partial/${sessionId}`
      });
    } else {
      res.json({
        success: true,
        chunkIndex,
        message: 'Chunk uploaded successfully',
        totalSize: session.totalSize,
        chunkCount: session.chunkCount,
        partialUrl: `/api/recordings/long/partial/${sessionId}`
      });
    }
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process and combine chunks
async function processRecordingChunks(sessionId) {
  const session = recordingSessions.get(sessionId);
  if (!session) return;
  
  try {
    console.log(`🔄 Processing recording ${sessionId} with ${session.chunks.length} chunks...`);
    
    // Sort chunks by index
    session.chunks.sort((a, b) => a.index - b.index);
    
    // Generate final filename
    const timestamp = Date.now();
    const finalFilename = `${session.recordingType}-${session.username}-${timestamp}-${sessionId.slice(0, 8)}.webm`;
    const finalPath = path.join(recordingsDir, finalFilename);
    
    // Combine chunks
    const writeStream = fs.createWriteStream(finalPath);
    
    for (const chunk of session.chunks) {
      const chunkBuffer = fs.readFileSync(chunk.path);
      writeStream.write(chunkBuffer);
      
      // Delete chunk file after writing
      fs.unlinkSync(chunk.path);
    }
    
    writeStream.end();
    
    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Delete session directory
    fs.rmdirSync(session.sessionDir, { recursive: true });
    
    // Calculate actual duration based on chunk times
    const duration = Math.floor((Date.now() - session.startedAt) / 1000);
    
    // Create video record
    const db = mongoose.connection.db;
    await db.collection('videos').insertOne({
      sessionId,
      filename: finalFilename,
      filePath: `/uploads/recordings/${finalFilename}`,
      downloadUrl: `/api/recordings/download/${finalFilename}`,
      recordingType: session.recordingType,
      duration,
      fileSize: session.totalSize,
      chunkCount: session.chunkCount,
      uploadedBy: session.username,
      room: session.room,
      title: session.title,
      startedAt: session.startedAt,
      completedAt: new Date(),
      isLongRecording: true
    });
    
    // Create message
    await db.collection('messages').insertOne({
      username: session.username,
      text: `${session.title} (${Math.floor(duration / 60)} minutes)`,
      room: session.room,
      videoUrl: `/uploads/recordings/${finalFilename}`,
      downloadUrl: `/api/recordings/download/${finalFilename}`,
      timestamp: new Date(),
      fileSize: session.totalSize,
      duration,
      recordingType: session.recordingType,
      isLongRecording: true,
      isSystemMessage: false
    });
    
    console.log(`✅ Long recording processed: ${finalFilename} (${duration} seconds)`);
    
  } catch (error) {
    console.error('Error processing recording chunks:', error);
  } finally {
    recordingSessions.delete(sessionId);
  }
}

// Get partial recording (download what's uploaded so far)
app.get('/api/recordings/long/partial/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = recordingSessions.get(sessionId);
    
    if (!session || session.chunks.length === 0) {
      return res.status(404).json({ error: 'No recording data available yet' });
    }
    
    // Sort chunks by index
    session.chunks.sort((a, b) => a.index - b.index);
    
    // Create a temporary combined file
    const tempFilePath = path.join(session.sessionDir, 'partial.webm');
    const writeStream = fs.createWriteStream(tempFilePath);
    
    for (const chunk of session.chunks) {
      const chunkData = fs.readFileSync(chunk.path);
      writeStream.write(chunkData);
    }
    
    writeStream.end();
    
    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Get file stats
    const stats = fs.statSync(tempFilePath);
    
    // Stream the file
    res.setHeader('Content-Type', session.recordingType === 'screen' ? 'video/webm' : 'audio/webm');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="partial-${sessionId.slice(0, 8)}.webm"`);
    
    const readStream = fs.createReadStream(tempFilePath);
    readStream.pipe(res);
    
    // Clean up temp file after streaming
    readStream.on('end', () => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    });
    
    readStream.on('error', (error) => {
      console.error('Read stream error:', error);
      res.status(500).json({ error: 'Stream error' });
    });
    
  } catch (error) {
    console.error('Partial download error:', error);
    res.status(500).json({ error: 'Failed to prepare partial recording' });
  }
});

// Get active recording sessions
app.get('/api/recordings/long/active', (req, res) => {
  const activeSessions = Array.from(recordingSessions.values())
    .filter(session => session.isActive)
    .map(session => ({
      sessionId: session.sessionId,
      username: session.username,
      recordingType: session.recordingType,
      title: session.title,
      startedAt: session.startedAt,
      chunkCount: session.chunkCount,
      totalSize: session.totalSize,
      duration: Math.floor((Date.now() - session.startedAt) / 1000),
      partialUrl: `/api/recordings/long/partial/${session.sessionId}`
    }));
  
  res.json({ success: true, sessions: activeSessions });
});

// ======================
// DIRECT DOWNLOAD API (SOLVES THE WAITING PROBLEM)
// ======================

// Direct download endpoint for recordings
app.get('/api/recordings/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(recordingsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return res.status(404).json({ 
        error: 'File not found',
        filename,
        path: filePath,
        exists: false
      });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    console.log(`✅ Serving download: ${filename} (${fileSize} bytes)`);
    
    // Set headers for download
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      res.status(500).json({ error: 'Stream error' });
    });
    
  } catch (error) {
    console.error('Download route error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recording metadata
app.get('/api/recordings/metadata/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(recordingsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Metadata request: File not found: ${filePath}`);
      return res.status(404).json({ 
        error: 'File not found',
        filename,
        path: filePath
      });
    }
    
    const stats = fs.statSync(filePath);
    const createdDate = stats.mtime;
    
    // Try to get duration from database
    const db = mongoose.connection.db;
    
    db.collection('videos').findOne({ filename }, (err, videoDoc) => {
      if (err) {
        console.error('Database error:', err);
        // Return basic info even if DB fails
        return res.json({
          success: true,
          filename,
          fileSize: stats.size,
          created: createdDate,
          downloadUrl: `/api/recordings/download/${filename}`,
          directUrl: `/uploads/recordings/${filename}`,
          duration: 0,
          recordingType: 'unknown',
          uploadedBy: 'unknown'
        });
      }
      
      res.json({
        success: true,
        filename,
        fileSize: stats.size,
        created: createdDate,
        downloadUrl: `/api/recordings/download/${filename}`,
        directUrl: `/uploads/recordings/${filename}`,
        duration: videoDoc ? videoDoc.duration : 0,
        recordingType: videoDoc ? videoDoc.recordingType : 'unknown',
        uploadedBy: videoDoc ? videoDoc.uploadedBy : 'unknown',
        title: videoDoc ? videoDoc.title : 'Recording'
      });
    });
    
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ======================
// REGULAR RECORDING UPLOAD (with download support)
// ======================

app.post('/api/recordings/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.recording) {
      return res.status(400).json({ error: 'No recording file uploaded' });
    }
    
    const recording = req.files.recording;
    const { username, room, recordingType, duration, text } = req.body;
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `recording-${timestamp}.webm`;
    const filePath = path.join(recordingsDir, filename);
    
    // Save file
    await recording.mv(filePath);
    
    // Save to database
    const db = mongoose.connection.db;
    
    await db.collection('videos').insertOne({
      filename,
      filePath: `/uploads/recordings/${filename}`,
      downloadUrl: `/api/recordings/download/${filename}`,
      recordingType: recordingType || 'screen',
      duration: parseInt(duration) || 0,
      fileSize: recording.size,
      uploadedBy: username,
      room: room,
      title: text || 'Recording',
      uploadedAt: new Date(),
      isLongRecording: false
    });
    
    // Create message
    await db.collection('messages').insertOne({
      username: username,
      text: text || `${recordingType === 'screen' ? 'Screen' : 'Voice'} recording`,
      room: room,
      videoUrl: `/uploads/recordings/${filename}`,
      downloadUrl: `/api/recordings/download/${filename}`,
      timestamp: new Date(),
      fileSize: recording.size,
      duration: parseInt(duration) || 0,
      recordingType: recordingType || 'screen',
      isLongRecording: false,
      isSystemMessage: false
    });
    
    res.json({
      success: true,
      message: 'Recording uploaded successfully',
      recordingUrl: `/uploads/recordings/${filename}`,
      downloadUrl: `/api/recordings/download/${filename}`,
      filename: filename,
      fileSize: recording.size,
      duration: duration
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ======================
// MESSAGE ROUTES
// ======================

// Get all messages for a room
app.get('/api/messages/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const db = mongoose.connection.db;
    
    const messages = await db.collection('messages')
      .find({ room })
      .sort({ timestamp: 1 })
      .toArray();
    
    // Ensure each video message has downloadUrl
    const enhancedMessages = messages.map(msg => {
      if (msg.videoUrl && !msg.downloadUrl) {
        const filename = msg.videoUrl.split('/').pop();
        return {
          ...msg,
          downloadUrl: `/api/recordings/download/${filename}`
        };
      }
      return msg;
    });
    
    res.json(enhancedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message
app.post('/api/messages', async (req, res) => {
  try {
    const { username, text, room, isSystemMessage } = req.body;
    
    if (!username || !text || !room) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const db = mongoose.connection.db;
    const message = {
      username,
      text,
      room,
      timestamp: new Date(),
      isSystemMessage: isSystemMessage || false
    };
    
    const result = await db.collection('messages').insertOne(message);
    
    // Get the inserted message with its ID
    const insertedMessage = await db.collection('messages').findOne({ _id: result.insertedId });
    
    res.json({
      success: true,
      message: insertedMessage
    });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get all recordings for a room
app.get('/api/recordings/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const db = mongoose.connection.db;
    
    const recordings = await db.collection('videos')
      .find({ room })
      .sort({ uploadedAt: -1 })
      .toArray();
    
    // Add download URLs if not present
    const enhancedRecordings = recordings.map(rec => ({
      ...rec,
      downloadUrl: rec.downloadUrl || `/api/recordings/download/${rec.filename}`
    }));
    
    res.json(enhancedRecordings);
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// ======================
// FILE UPLOAD ROUTE (for non-recording files)
// ======================

app.post('/api/upload-video', async (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    
    const video = req.files.video;
    const { username, room, text } = req.body;
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `upload-${timestamp}-${video.name}`;
    const filePath = path.join(recordingsDir, filename);
    
    // Save file
    await video.mv(filePath);
    
    // Create message
    const db = mongoose.connection.db;
    await db.collection('messages').insertOne({
      username: username,
      text: text || `Uploaded: ${video.name}`,
      room: room,
      fileUrl: `/uploads/recordings/${filename}`,
      timestamp: new Date(),
      fileSize: video.size,
      isSystemMessage: false
    });
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileUrl: `/uploads/recordings/${filename}`,
      filename: filename
    });
    
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ======================
// HEALTH CHECK
// ======================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date(),
    endpoints: {
      messages: '/api/messages/:room',
      upload: '/api/recordings/upload',
      download: '/api/recordings/download/:filename',
      longRecording: '/api/recordings/long/*'
    }
  });
});

// Clean up old sessions (older than 24 hours)
function cleanupOldSessions() {
  const now = Date.now();
  for (const [sessionId, session] of recordingSessions.entries()) {
    if (now - session.lastChunkAt > 24 * 60 * 60 * 1000) { // 24 hours
      // Clean up chunk files
      if (fs.existsSync(session.sessionDir)) {
        fs.rmdirSync(session.sessionDir, { recursive: true });
      }
      recordingSessions.delete(sessionId);
    }
  }
}

// ======================
// START SERVER
// ======================

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Database: ViteChat`);
  console.log(`🎥 UNLIMITED RECORDING ENABLED (10+ hours support)`);
  console.log(`📂 Upload directory: ${recordingsDir}`);
  console.log(`🌐 Available Endpoints:`);
  console.log(`   GET  /api/health                    - Health check`);
  console.log(`   GET  /api/messages/:room           - Get messages`);
  console.log(`   POST /api/messages                 - Send message`);
  console.log(`   POST /api/recordings/upload        - Upload recording`);
  console.log(`   GET  /api/recordings/download/:filename - Direct download`);
  console.log(`   GET  /api/recordings/list          - List all recordings (debug)`);
  console.log(`   GET  /api/recordings/test/:filename - Test if file exists`);
  console.log(`   POST /api/recordings/long/start    - Start unlimited recording`);
  console.log(`   POST /api/recordings/long/chunk    - Upload chunks`);
  console.log(`   GET  /api/recordings/long/partial/:sessionId - Partial download`);
  console.log(`📢 IMPORTANT: Direct downloads work immediately - no waiting for videos to load!`);
});