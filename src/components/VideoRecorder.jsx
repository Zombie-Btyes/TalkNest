import React, { useState, useRef, useEffect } from 'react';
import { FaVideo, FaMicrophone, FaStop, FaSave, FaTimes } from 'react-icons/fa';
import '../styles/VideoRecorder.css';

const API_BASE = 'http://localhost:3000/api';

function VideoRecorder({ username, room, onRecordingComplete, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [chunkCounter, setChunkCounter] = useState(0);
  const [recordingType, setRecordingType] = useState('screen'); // 'screen' or 'voice'
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioStreamRef = useRef(null);

  // Start upload session
  const startUploadSession = async () => {
    try {
      const response = await fetch(`${API_BASE}/uploads/start-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          room,
          text: recordingType === 'screen' ? 'Screen recording' : 'Voice recording'
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setSessionId(data.sessionId);
        return data.sessionId;
      }
    } catch (error) {
      console.error('Error starting upload session:', error);
      throw error;
    }
  };

  // Upload a chunk
  const uploadChunk = async (chunkBlob, chunkIndex, currentSessionId) => {
    const formData = new FormData();
    formData.append('chunk', chunkBlob, `chunk-${chunkIndex}.webm`);
    formData.append('sessionId', currentSessionId);
    formData.append('chunkIndex', chunkIndex);
    
    try {
      const response = await fetch(`${API_BASE}/uploads/upload-chunk`, {
        method: 'POST',
        body: formData
      });
      
      return await response.json();
    } catch (error) {
      console.error('Error uploading chunk:', error);
      throw error;
    }
  };

  // Finalize upload
  const finalizeUpload = async (currentSessionId) => {
    try {
      const response = await fetch(`${API_BASE}/uploads/finalize-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId })
      });
      
      return await response.json();
    } catch (error) {
      console.error('Error finalizing upload:', error);
      throw error;
    }
  };

  // Start recording
  const startRecording = async (type = 'screen') => {
    try {
      setRecordingType(type);
      recordedChunksRef.current = [];
      
      // Start upload session
      const currentSessionId = await startUploadSession();
      setSessionId(currentSessionId);
      
      let stream;
      
      if (type === 'screen') {
        // Get screen and audio
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30, width: 1920, height: 1080 },
          audio: true
        });
        
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        
        // Combine streams
        stream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...screenStream.getAudioTracks(),
          ...audioStream.getAudioTracks()
        ]);
        
        screenStreamRef.current = screenStream;
        audioStreamRef.current = audioStream;
      } else {
        // Voice only
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        audioStreamRef.current = stream;
      }
      
      // Create media recorder with optimal settings for long recordings
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 1500000, // 1.5 Mbps for good quality
        audioBitsPerSecond: 128000   // 128 Kbps for audio
      });
      
      let chunks = [];
      let chunkIndex = 0;
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          
          // Upload chunks every 30 seconds or when reaching 10MB
          if (chunks.length >= 3 || event.data.size > 10 * 1024 * 1024) {
            const chunkBlob = new Blob(chunks, { type: 'video/webm' });
            chunks = [];
            
            try {
              await uploadChunk(chunkBlob, chunkIndex, currentSessionId);
              chunkIndex++;
              setChunkCounter(chunkIndex);
              
              // Update progress
              const progress = Math.min((chunkIndex * 30) / 600, 95); // Estimate for 10-minute recording
              setUploadProgress(progress);
            } catch (error) {
              console.error('Chunk upload failed:', error);
            }
          }
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Upload any remaining chunks
        if (chunks.length > 0) {
          const chunkBlob = new Blob(chunks, { type: 'video/webm' });
          try {
            await uploadChunk(chunkBlob, chunkIndex, currentSessionId);
            chunkIndex++;
          } catch (error) {
            console.error('Final chunk upload failed:', error);
          }
        }
        
        // Finalize upload
        try {
          const result = await finalizeUpload(currentSessionId);
          setUploadProgress(100);
          
          // Notify parent component
          if (onRecordingComplete) {
            onRecordingComplete({
              videoUrl: result.videoUrl,
              duration: result.duration,
              size: result.size,
              type
            });
          }
        } catch (error) {
          console.error('Failed to finalize upload:', error);
          alert('Failed to save recording. Please try again.');
        }
        
        // Cleanup
        stopAllTracks();
        clearInterval(timerRef.current);
      };
      
      // Start recording with 10-second chunks (good balance)
      mediaRecorder.start(10000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      
      // Start timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
      // Handle screen sharing stop
      if (type === 'screen' && screenStreamRef.current) {
        screenStreamRef.current.getVideoTracks()[0].onended = () => {
          stopRecording();
        };
      }
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      if (error.name !== 'NotAllowedError') {
        alert('Failed to start recording: ' + error.message);
      }
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // Pause/resume recording
  const togglePause = () => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
      } else {
        mediaRecorderRef.current.pause();
      }
      setIsPaused(!isPaused);
    }
  };

  // Stop all media tracks
  const stopAllTracks = () => {
    [screenStreamRef.current, audioStreamRef.current].forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    });
    screenStreamRef.current = null;
    audioStreamRef.current = null;
  };

  // Format time (seconds to MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
      stopAllTracks();
      clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="video-recorder-container">
      <div className="recorder-header">
        <h3>
          {isRecording ? (
            <span className="recording-indicator">⏺️ Recording...</span>
          ) : (
            'Record Media'
          )}
        </h3>
        {onCancel && (
          <button className="close-btn" onClick={onCancel}>
            <FaTimes />
          </button>
        )}
      </div>
      
      {isRecording ? (
        <div className="recording-controls">
          <div className="recording-info">
            <div className="time-display">
              <span className="time">{formatTime(recordingTime)}</span>
              <span className="recording-type">
                {recordingType === 'screen' ? 'Screen Recording' : 'Voice Recording'}
              </span>
            </div>
            
            {uploadProgress > 0 && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="progress-text">
                  Uploading... {Math.round(uploadProgress)}%
                </span>
              </div>
            )}
            
            <div className="control-buttons">
              <button 
                className={`btn ${isPaused ? 'resume' : 'pause'}`}
                onClick={togglePause}
              >
                {isPaused ? <FaVideo /> : <FaStop />}
                {isPaused ? ' Resume' : ' Pause'}
              </button>
              
              <button 
                className="btn stop"
                onClick={stopRecording}
              >
                <FaStop /> Stop & Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="recorder-options">
          <button 
            className="btn screen-record"
            onClick={() => startRecording('screen')}
          >
            <FaVideo /> Record Screen
          </button>
          
          <button 
            className="btn voice-record"
            onClick={() => startRecording('voice')}
          >
            <FaMicrophone /> Record Voice
          </button>
          
          <div className="recording-tips">
            <p><small>💡 Tips for long recordings:</small></p>
            <ul>
              <li><small>Screen recording: Up to several hours supported</small></li>
              <li><small>Automatically saves every 30 seconds</small></li>
              <li><small>Pause/resume anytime during recording</small></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoRecorder;