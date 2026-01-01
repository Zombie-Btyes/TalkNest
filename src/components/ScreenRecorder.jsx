// src/components/ScreenRecorder.jsx
import React, { useState, useRef, useEffect } from 'react';
import { FaVideo, FaMicrophone, FaStop, FaPause, FaPlay, FaTimes, FaSave } from 'react-icons/fa';
import '../styles/ScreenRecorder.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function ScreenRecorder({ username, room, onRecordingComplete, onCancel, onUploadStart }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recordingType, setRecordingType] = useState('screen'); // 'screen' or 'voice'
  const [statusMessage, setStatusMessage] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const startTimeRef = useRef(null);

  // Start recording function
  const startRecording = async (type = 'screen') => {
    try {
      setRecordingType(type);
      recordedChunksRef.current = [];
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setStatusMessage('Setting up recording...');
      
      let stream;
      let combinedStream;
      
      if (type === 'screen') {
        setStatusMessage('Select screen/window to record...');
        
        // Get screen capture
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });
        
        setStatusMessage('Setting up audio...');
        
        // Get microphone audio
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
            channelCount: 2
          }
        });
        
        // Combine streams
        combinedStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...screenStream.getAudioTracks(),
          ...audioStream.getAudioTracks()
        ]);
        
        screenStreamRef.current = screenStream;
        audioStreamRef.current = audioStream;
        
        // Handle screen sharing stop from browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          if (isRecording) {
            stopRecording();
          }
        };
        
      } else {
        // Voice only recording
        setStatusMessage('Requesting microphone access...');
        
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
            channelCount: 2
          }
        });
        audioStreamRef.current = stream;
        combinedStream = stream;
      }
      
      // Create media recorder with optimal settings
      const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000, // 2.5 Mbps for screen recording
        audioBitsPerSecond: 128000   // 128 Kbps for audio
      };
      
      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(combinedStream, options);
      } catch (e) {
        // Fallback options
        console.log('Trying alternative codecs...');
        const fallbackOptions = [
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4'
        ];
        
        for (const mimeType of fallbackOptions) {
          try {
            mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
            console.log(`Using ${mimeType}`);
            break;
          } catch (err) {
            continue;
          }
        }
        
        if (!mediaRecorder) {
          mediaRecorder = new MediaRecorder(combinedStream);
        }
      }
      
      // Set up data handling
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          console.log(`Chunk received: ${event.data.size} bytes`);
        }
      };
      
      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing chunks...');
        // Stop timer
        clearInterval(timerRef.current);
        
        // Combine all chunks
        if (recordedChunksRef.current.length === 0) {
          console.error('No recording data available');
          setStatusMessage('No recording data captured');
          cleanup();
          return;
        }
        
        const blobType = type === 'screen' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, { type: blobType });
        
        console.log(`Recording size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);
        
        // Upload the recording
        await uploadRecording(blob);
        
        // Clean up
        cleanup();
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setStatusMessage(`Recording error: ${event.error}`);
        cleanup();
      };
      
      // Start recording with 1-second chunks
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      
      // Start timer
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
        
        // Update status every 10 seconds
        if (elapsed % 10 === 0) {
          const size = recordedChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          const sizeMB = (size / (1024 * 1024)).toFixed(2);
          setStatusMessage(`Recording... ${formatTime(elapsed)} (${sizeMB} MB)`);
        }
      }, 1000);
      
      setStatusMessage('Recording in progress...');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      setStatusMessage(`Error: ${error.message}`);
      
      if (error.name !== 'NotAllowedError' && error.name !== 'NotFoundError') {
        alert(`Failed to start ${type} recording: ${error.message}`);
      }
      cleanup();
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setStatusMessage('Stopping recording...');
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
        startTimeRef.current = Date.now() - (recordingTime * 1000);
        setStatusMessage('Recording resumed...');
      } else {
        mediaRecorderRef.current.pause();
        setStatusMessage('Recording paused');
      }
      setIsPaused(!isPaused);
    }
  };

  // Upload recording to server
  const uploadRecording = async (blob) => {
    setStatusMessage('Preparing upload...');
    setUploadProgress(10);
    
    if (onUploadStart) {
      onUploadStart();
    }
    
    try {
      const formData = new FormData();
      
      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${recordingType}_recording_${timestamp}.webm`;
      
      formData.append('recording', blob, filename);
      formData.append('username', username || 'user');
      formData.append('room', room || 'default');
      formData.append('recordingType', recordingType);
      formData.append('duration', recordingTime.toString());
      formData.append('text', `${recordingType === 'screen' ? 'Screen' : 'Voice'} recording (${formatTime(recordingTime)})`);
      
      setUploadProgress(30);
      setStatusMessage('Uploading to server...');
      
      const response = await fetch(`${API_BASE}/api/recordings/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
      
      const result = await response.json();
      
      setUploadProgress(100);
      setStatusMessage('Upload complete!');
      
      if (result.success) {
        // Notify parent component
        if (onRecordingComplete) {
          onRecordingComplete({
            ...result.recording,
            duration: recordingTime,
            type: recordingType,
            blobUrl: URL.createObjectURL(blob) // For preview
          });
        }
        
        // Show success briefly
        setTimeout(() => {
          setUploadProgress(0);
          setStatusMessage('');
          if (onCancel) onCancel();
        }, 2000);
        
      } else {
        throw new Error(result.error || 'Upload failed');
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      setStatusMessage(`Upload failed: ${error.message}`);
      
      // Offer to download locally
      if (blob.size > 0) {
        const download = window.confirm(
          'Upload failed. Would you like to download the recording locally?'
        );
        
        if (download) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `recording_${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
      
      setUploadProgress(0);
    }
  };

  // Clean up resources
  const cleanup = () => {
    // Stop all media tracks
    [screenStreamRef.current, audioStreamRef.current].forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
        });
      }
    });
    
    screenStreamRef.current = null;
    audioStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
  };

  // Format time (seconds to MM:SS)
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calculate estimated file size
  const getEstimatedSize = () => {
    // Rough estimation: screen ~2.5 Mbps, voice ~0.128 Mbps
    const bitrate = recordingType === 'screen' ? 2500000 : 128000;
    const bits = bitrate * recordingTime;
    return formatFileSize(bits / 8);
  };

  // Component cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      cleanup();
    };
  }, []);

  return (
    <div className="screen-recorder-container">
      <div className="recorder-header">
        <h3>
          {isRecording ? (
            <span className="recording-indicator">
              <span className="pulsing-dot"></span>
              Recording {recordingType}...
            </span>
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
        <div className="recording-in-progress">
          <div className="recording-timer">
            <div className="timer-display">{formatTime(recordingTime)}</div>
            <div className="recording-info">
              <div className="recording-type">
                {recordingType === 'screen' ? 'Screen Recording' : 'Voice Recording'}
              </div>
              <div className="estimated-size">
                Est. size: {getEstimatedSize()}
              </div>
            </div>
          </div>
          
          {statusMessage && (
            <div className="status-message">
              {statusMessage}
            </div>
          )}
          
          {uploadProgress > 0 && (
            <div className="upload-progress">
              <div className="progress-label">
                Uploading... {uploadProgress}%
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          
          <div className="recording-controls">
            <button
              className={`control-btn ${isPaused ? 'resume' : 'pause'}`}
              onClick={togglePause}
              disabled={uploadProgress > 0}
            >
              {isPaused ? <FaPlay /> : <FaPause />}
              {isPaused ? ' Resume' : ' Pause'}
            </button>
            
            <button
              className="control-btn stop"
              onClick={stopRecording}
              disabled={uploadProgress > 0}
            >
              <FaStop /> Stop & Save
            </button>
          </div>
        </div>
      ) : (
        <div className="recorder-options">
          <button
            className="record-btn screen"
            onClick={() => startRecording('screen')}
            disabled={uploadProgress > 0}
          >
            <FaVideo /> Record Screen + Audio
          </button>
          
          <button
            className="record-btn voice"
            onClick={() => startRecording('voice')}
            disabled={uploadProgress > 0}
          >
            <FaMicrophone /> Record Voice Only
          </button>
          
          <div className="recording-info">
            <p><strong>Features:</strong></p>
            <ul>
              <li>✅ Unlimited recording time</li>
              <li>✅ Auto-save to MongoDB</li>
              <li>✅ Pause/Resume during recording</li>
              <li>✅ Real-time progress tracking</li>
              <li>✅ Fallback download if upload fails</li>
            </ul>
            
            <p className="note">
              <small>
                Note: Recordings are saved in WebM format. 
                Files are automatically uploaded to the server and stored in MongoDB.
              </small>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScreenRecorder;