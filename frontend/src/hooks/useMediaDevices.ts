"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startMedia = useCallback(async (video = true, audio = true) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: audio,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setCameraEnabled(video && mediaStream.getVideoTracks().some((track) => track.enabled));
      setMicEnabled(audio && mediaStream.getAudioTracks().some((track) => track.enabled));
      setError(null);
      return mediaStream;
    } catch (err: any) {
      setError(err.message || "Failed to access media devices");
      return null;
    }
  }, []);

  const stopMedia = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setCameraEnabled(false);
      setMicEnabled(false);
    }
  }, []);

  const toggleMic = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const audioTrack = currentStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicEnabled(audioTrack.enabled);
      return;
    }

    setMicEnabled(false);
  }, []);

  const toggleCamera = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const videoTrack = currentStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraEnabled(videoTrack.enabled);
      return;
    }

    setCameraEnabled(false);
  }, []);

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
