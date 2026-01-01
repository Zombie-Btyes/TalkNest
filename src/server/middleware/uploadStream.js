const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class UploadStream {
  constructor() {
    this.uploadSessions = new Map();
    this.tempDir = path.join(__dirname, '../uploads/temp');
    this.videosDir = path.join(__dirname, '../uploads/videos');
    
    // Create directories if they don't exist
    [this.tempDir, this.videosDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Clean old temp files on startup
    this.cleanupTempFiles();
  }

  // Clean up temporary files older than 1 hour
  cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      
      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        
        // Delete files older than 1 hour
        if (now - stats.mtimeMs > 3600000) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up temp file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Error cleaning temp files:', error);
    }
  }

  // Create a new upload session
  createSession(username, room, text = 'Screen recording') {
    const sessionId = uuidv4();
    
    this.uploadSessions.set(sessionId, {
      id: sessionId,
      username,
      room,
      text,
      chunks: [],
      totalSize: 0,
      createdAt: Date.now(),
      lastChunkAt: Date.now()
    });
    
    // Clean up old sessions (older than 24 hours)
    this.cleanupOldSessions();
    
    return sessionId;
  }

  // Upload a chunk
  async uploadChunk(sessionId, chunk, chunkIndex) {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    // Update session timestamp
    session.lastChunkAt = Date.now();
    
    // Save chunk to temp file
    const chunkFileName = `${sessionId}_chunk_${chunkIndex}.webm`;
    const chunkPath = path.join(this.tempDir, chunkFileName);
    
    await fs.promises.writeFile(chunkPath, chunk);
    session.chunks.push({ index: chunkIndex, path: chunkPath });
    session.totalSize += chunk.length;
    
    return chunkIndex;
  }

  // Combine all chunks into final video
  async finalizeUpload(sessionId) {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    // Sort chunks by index
    session.chunks.sort((a, b) => a.index - b.index);
    
    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${session.username}_${timestamp}_${sessionId.slice(0, 8)}.webm`;
    const filePath = path.join(this.videosDir, fileName);
    
    // Combine chunks
    const writeStream = fs.createWriteStream(filePath);
    
    for (const chunk of session.chunks) {
      const chunkBuffer = await fs.promises.readFile(chunk.path);
      writeStream.write(chunkBuffer);
      
      // Clean up chunk file
      await fs.promises.unlink(chunk.path);
    }
    
    writeStream.end();
    
    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Clean up session
    this.uploadSessions.delete(sessionId);
    
    return {
      filename: fileName,
      path: `/uploads/videos/${fileName}`,
      size: session.totalSize,
      duration: Math.floor((Date.now() - session.createdAt) / 1000)
    };
  }

  // Clean up old sessions
  cleanupOldSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.uploadSessions.entries()) {
      if (now - session.lastChunkAt > 3600000) { // 1 hour
        // Clean up any remaining chunk files
        session.chunks.forEach(chunk => {
          if (fs.existsSync(chunk.path)) {
            fs.unlinkSync(chunk.path);
          }
        });
        this.uploadSessions.delete(sessionId);
      }
    }
  }
}

module.exports = new UploadStream();