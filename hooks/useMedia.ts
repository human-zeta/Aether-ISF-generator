import { useState, useEffect, useRef, useCallback } from 'react';

export const useMedia = () => {
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // We expose the raw data array for the canvas to bind as a texture
  const audioDataArrayRef = useRef<Uint8Array | null>(null);
  
  const animationFrameRef = useRef<number>();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Webcam Logic
  const toggleWebcam = useCallback(async () => {
    if (isWebcamActive) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsWebcamActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsWebcamActive(true);
      } catch (e) {
        console.error("Failed to access webcam", e);
        alert("Could not access webcam. Please check permissions.");
      }
    }
  }, [isWebcamActive]);

  // Microphone Logic
  const toggleMic = useCallback(async () => {
    if (isMicActive) {
      audioContextRef.current?.close();
      audioContextRef.current = null;
      setIsMicActive(false);
      setAudioVolume(0);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // 128 frequency bins
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount; // 128
        const dataArray = new Uint8Array(bufferLength);
        audioDataArrayRef.current = dataArray;

        const updateAnalysis = () => {
          if (!analyserRef.current || !audioDataArrayRef.current) return;
          
          // Get Frequency Data (FFT)
          analyserRef.current.getByteFrequencyData(audioDataArrayRef.current);
          
          // Calculate average volume
          let sum = 0;
          for(let i = 0; i < audioDataArrayRef.current.length; i++) {
            sum += audioDataArrayRef.current[i];
          }
          const avg = sum / audioDataArrayRef.current.length;
          setAudioVolume(avg / 255.0); // Normalize 0-1
          
          animationFrameRef.current = requestAnimationFrame(updateAnalysis);
        };
        
        setIsMicActive(true);
        updateAnalysis();

      } catch (e) {
        console.error("Failed to access microphone", e);
        alert("Could not access microphone.");
      }
    }
  }, [isMicActive]);

  // Recording Logic
  const startRecording = useCallback((canvas: HTMLCanvasElement) => {
    try {
      const stream = canvas.captureStream(30); // 30 FPS
      
      const options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'video/webm'; // Fallback
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Aether_Rec_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      recorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error("Failed to start recording", e);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  useEffect(() => {
    return () => {
        // Cleanup
        if (isWebcamActive) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream?.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) audioContextRef.current.close();
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  return {
    videoElement: videoRef.current,
    audioDataArray: audioDataArrayRef.current, // Expose raw FFT data
    isWebcamActive,
    toggleWebcam,
    isMicActive,
    toggleMic,
    audioVolume,
    isRecording,
    startRecording,
    stopRecording
  };
};
