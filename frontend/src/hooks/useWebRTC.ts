"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSignaling } from "./useSignaling";

interface WebRTCConfig {
  callId: string;
  isInitiator: boolean;
  localStream: MediaStream | null;
  onCallEnded?: () => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // TURN server config should be injected via API/Env in production
  ],
};

export function useWebRTC({ callId, isInitiator, localStream, onCallEnded }: WebRTCConfig) {
  const { socket, emit, isConnected } = useSignaling();
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const initPeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit("signal:ice", { callId, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        endCall();
      }
    };

    return pc;
  }, [localStream, callId, emit]);

  const endCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    emit("call:end", { callId });
    if (onCallEnded) onCallEnded();
  }, [callId, emit, onCallEnded]);

  useEffect(() => {
    if (!isConnected || !callId) return;

    const pc = initPeerConnection();

    const handleOffer = async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      emit("signal:answer", { callId, sdp: answer });
    };

    const handleAnswer = async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    };

    const handleIce = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Error adding received ice candidate", e);
      }
    };

    const handleCallEnded = () => {
      endCall();
    };

    socket.on("signal:offer", handleOffer);
    socket.on("signal:answer", handleAnswer);
    socket.on("signal:ice", handleIce);
    socket.on("call:ended", handleCallEnded);

    // If initiator, create and send offer immediately
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => emit("signal:offer", { callId, sdp: pc.localDescription }))
        .catch(console.error);
    }

    return () => {
      socket.off("signal:offer", handleOffer);
      socket.off("signal:answer", handleAnswer);
      socket.off("signal:ice", handleIce);
      socket.off("call:ended", handleCallEnded);
    };
  }, [isConnected, callId, isInitiator, initPeerConnection, emit, socket, endCall]);

  return { remoteStream, endCall };
}
