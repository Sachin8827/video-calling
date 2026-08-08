'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSignaling } from './useSignaling';

interface WebRTCConfig {
  callId: string;
  isInitiator: boolean;
  localStream: MediaStream | null;
  onCallEnded?: (reason?: 'ended' | 'peer_disconnected') => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // TURN server config should be injected via API/Env in production
  ],
};

export function useWebRTC({ callId, isInitiator, localStream, onCallEnded }: WebRTCConfig) {
  const { socket, emit, isConnected } = useSignaling();
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const offerSentRef = useRef(false);
  const [partnerJoined, setPartnerJoined] = useState(!isInitiator);

  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    offerSentRef.current = false;
    setRemoteStream(null);
  }, []);

  const endCall = useCallback(() => {
    console.log('[webrtc] endCall', { callId });
    cleanupPeerConnection();
    emit('call:end', { callId });
  }, [callId, cleanupPeerConnection, emit]);

  const initPeerConnection = useCallback(() => {
    console.log('[webrtc] initPeerConnection', { callId, isInitiator, localStream: !!localStream });
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    const attachLocalTracks = () => {
      if (!localStream) return;

      const existingTrackIds = new Set(
        pc
          .getSenders()
          .map((sender) => sender.track?.id)
          .filter((id): id is string => Boolean(id)),
      );

      localStream.getTracks().forEach((track) => {
        if (!existingTrackIds.has(track.id)) {
          console.log('[webrtc] adding local track', track.kind, track.id);
          pc.addTrack(track, localStream);
        }
      });
    };

    attachLocalTracks();
    pcRef.current = pc;

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('[webrtc] remote track received', event.streams.length);
      setRemoteStream(event.streams[0]);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      console.log('[webrtc] onicecandidate', event.candidate);
      if (event.candidate) {
        emit('signal:ice', { callId, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[webrtc] iceConnectionState', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        endCall();
      }
    };

    pc.onnegotiationneeded = async () => {
      console.log('[webrtc] onnegotiationneeded', {
        isInitiator,
        partnerJoined,
        signalingState: pc.signalingState,
      });
      if (isInitiator && partnerJoined) {
        try {
          offerSentRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          emit('signal:offer', { callId, sdp: pc.localDescription });
        } catch (error) {
          console.error('Error during negotiation', error);
        }
      }
    };

    return pc;
  }, [localStream, callId, emit, isInitiator, endCall, partnerJoined]);

  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;
    const existingTrackIds = new Set(
      pc
        .getSenders()
        .map((sender) => sender.track?.id)
        .filter((id): id is string => Boolean(id)),
    );

    localStream.getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        console.log('[webrtc] adding track to existing peer connection', track.kind, track.id);
        pc.addTrack(track, localStream);
      }
    });
  }, [localStream]);

  // Initial peer connection setup
  useEffect(() => {
    if (!isConnected || !callId) return;
    initPeerConnection();
  }, [isConnected, callId, initPeerConnection]);

  // Trigger offer when partner joins if we are the initiator
  useEffect(() => {
    if (!isConnected || !callId || !isInitiator || !partnerJoined) return;
    const pc = pcRef.current;
    if (!pc || pc.signalingState !== 'stable' || offerSentRef.current) return;

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        offerSentRef.current = true;
        emit('signal:offer', { callId, sdp: pc.localDescription });
      })
      .catch(console.error);
  }, [isConnected, callId, isInitiator, partnerJoined, emit]);

  useEffect(() => {
    if (!isConnected || !callId) return;

    const pc = initPeerConnection();

    const handleAccepted = () => {
      console.log('[webrtc] call:accepted received! Partner joined.');
      setPartnerJoined(true);
    };

    const handleOffer = async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[webrtc] received signal:offer', callId, sdp?.type);
      if (!pcRef.current) return;
      if (isInitiator) return;
      if (pcRef.current.signalingState !== 'stable') {
        console.warn(
          '[webrtc] ignoring offer because peer connection is not stable',
          pcRef.current.signalingState,
        );
        return;
      }
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      emit('signal:answer', { callId, sdp: answer });
    };

    const handleAnswer = async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[webrtc] received signal:answer', callId, sdp?.type);
      if (!pcRef.current) return;
      if (!isInitiator) return;
      if (pcRef.current.signalingState !== 'have-local-offer') {
        console.warn(
          '[webrtc] ignoring answer because signaling state is',
          pcRef.current.signalingState,
        );
        return;
      }
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    };

    const handleIce = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      console.log('[webrtc] received signal:ice', callId, candidate);
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding received ice candidate', e);
      }
    };

    const handleCallEnded = (payload?: {
      callId?: string;
      reason?: 'ended' | 'peer_disconnected';
    }) => {
      console.log('[webrtc] received call:ended', callId, payload?.reason);
      cleanupPeerConnection();
      onCallEnded?.(payload?.reason);
    };

    socket.on('call:accepted', handleAccepted);
    socket.on('signal:offer', handleOffer);
    socket.on('signal:answer', handleAnswer);
    socket.on('signal:ice', handleIce);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('call:accepted', handleAccepted);
      socket.off('signal:offer', handleOffer);
      socket.off('signal:answer', handleAnswer);
      socket.off('signal:ice', handleIce);
      socket.off('call:ended', handleCallEnded);
    };
  }, [
    isConnected,
    callId,
    isInitiator,
    localStream,
    initPeerConnection,
    emit,
    socket,
    cleanupPeerConnection,
    onCallEnded,
  ]);

  return { remoteStream, endCall };
}
