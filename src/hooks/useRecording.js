import { useState, useRef, useCallback } from 'react';
import { chatApi } from '../services/api';

function useRecording(username, room, sendMessage) {
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const screenStreamRef = useRef(null);
  const audioStreamRef = useRef(null);

  const startScreenRecording = useCallback(async () => {
    try {
      recordedChunksRef.current = [];
      
      // Get screen and audio
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      
      // Combine streams
      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...screenStream.getAudioTracks(),
        ...audioStream.getAudioTracks()
      ]);
      
      screenStreamRef.current = screenStream;
      audioStreamRef.current = audioStream;
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Save recording
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        await saveRecording(blob, 'screen recording');
        
        // Clean up
        stopAllTracks();
      };
      
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsScreenRecording(true);
      
      // Handle screen sharing stop from browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenRecording();
      };
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording: ' + error.message);
    }
  }, []);

  const startVoiceRecording = useCallback(async () => {
    try {
      recordedChunksRef.current = [];
      
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      
      audioStreamRef.current = audioStream;
      
      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm'
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        await saveRecording(blob, 'voice recording');
        
        stopAllTracks();
      };
      
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsVoiceRecording(true);
      
    } catch (error) {
      console.error('Failed to start voice recording:', error);
      alert('Failed to start voice recording: ' + error.message);
    }
  }, []);

  const stopScreenRecording = useCallback(() => {
    if (mediaRecorderRef.current && isScreenRecording) {
      mediaRecorderRef.current.stop();
      setIsScreenRecording(false);
      setIsPaused(false);
    }
  }, [isScreenRecording]);

  const stopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current && isVoiceRecording) {
      mediaRecorderRef.current.stop();
      setIsVoiceRecording(false);
      setIsPaused(false);
    }
  }, [isVoiceRecording]);

  const togglePauseRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
      } else {
        mediaRecorderRef.current.pause();
      }
      setIsPaused(!isPaused);
    }
  }, [isPaused]);

  const saveRecording = async (blob, type) => {
    const formData = new FormData();
    formData.append('video', blob, `recording-${Date.now()}.webm`);
    formData.append('text', `Shared a ${type}`);
    
    try {
      await chatApi.uploadFile(formData);
      console.log(`${type} saved successfully`);
    } catch (error) {
      console.error(`Failed to save ${type}:`, error);
      alert('Failed to save recording');
    }
  };

  const stopAllTracks = () => {
    [screenStreamRef.current, audioStreamRef.current].forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    });
    screenStreamRef.current = null;
    audioStreamRef.current = null;
  };

  return {
    isScreenRecording,
    isVoiceRecording,
    isPaused,
    startScreenRecording,
    stopScreenRecording,
    startVoiceRecording,
    stopVoiceRecording,
    togglePauseRecording
  };
}

export default useRecording;