"use client";

import { useState, useCallback, useEffect } from "react";

export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const startMedia = useCallback(async (video = true, audio = true) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: audio,
      });
      setStream(mediaStream);
      setCameraEnabled(video);
      setMicEnabled(audio);
      setError(null);
      return mediaStream;
    } catch (err: any) {
      setError(err.message || "Failed to access media devices");
      return null;
    }
  }, []);

  const stopMedia = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const toggleMic = useCallback(() => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicEnabled(audioTrack.enabled);
      }
    }
  }, [stream]);

  const toggleCamera = useCallback(() => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCameraEnabled(videoTrack.enabled);
      }
    }
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMedia();
    };
  }, [stopMedia]);

  return {
    stream,
    startMedia,
    stopMedia,
    micEnabled,
    cameraEnabled,
    toggleMic,
    toggleCamera,
    error,
  };
}
