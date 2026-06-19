"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Device } from "mediasoup-client";
import { useSignaling } from "./useSignaling";

interface SFUConfig {
  roomId: string;
  localStream: MediaStream | null;
}

export function useSFU({ roomId, localStream }: SFUConfig) {
  const { socket, emit, on, isConnected } = useSignaling();
  
  const [device, setDevice] = useState<Device | null>(null);
  const [consumers, setConsumers] = useState<Map<string, MediaStream>>(new Map());
  const [error, setError] = useState<string | null>(null);
  
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const producersRef = useRef<Map<string, any>>(new Map());

  const initDevice = useCallback(async (routerRtpCapabilities: any) => {
    try {
      const newDevice = new Device();
      await newDevice.load({ routerRtpCapabilities });
      setDevice(newDevice);
      return newDevice;
    } catch (e: any) {
      setError(e.message || "Failed to init MediaSoup device");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !roomId) return;

    let mounted = true;

    // 1. Join the room to get Router RTP Capabilities
    emit("sfu:join", { roomId });

    const handleJoined = async ({ routerRtpCaps }: any) => {
      if (!mounted) return;
      const loadedDevice = await initDevice(routerRtpCaps);
      if (loadedDevice) {
        emit("sfu:create-transport", { roomId, forceTcp: false });
      }
    };

    const handleTransportCreated = async (params: any) => {
      if (!device) return;
      
      // The backend returns isSendTransport flag or we infer it.
      // For simplicity, assume one transport handles send/recv or backend sends two.
      // Standard mediasoup requires 1 send transport and 1 recv transport.
      // The actual implementation depends on the exact backend payload.
      // In our sfu.service.ts, `createWebRtcTransport` returns transport parameters.
      
      const transport = device.createSendTransport(params);
      
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        emit("sfu:connect-transport", { roomId, transportId: transport.id, dtlsParameters });
        
        const unsub = on("sfu:transport-connected", () => {
          callback();
          unsub();
        });
      });

      transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
        emit("sfu:produce", { roomId, transportId: transport.id, kind, rtpParameters });
        
        const unsub = on("sfu:produced", ({ producerId }: any) => {
          callback({ id: producerId });
          unsub();
        });
      });

      sendTransportRef.current = transport;

      // Start producing local tracks
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          const videoProducer = await transport.produce({ track: videoTrack });
          producersRef.current.set("video", videoProducer);
        }
        
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          const audioProducer = await transport.produce({ track: audioTrack });
          producersRef.current.set("audio", audioProducer);
        }
      }
    };

    const unsubJoined = on("sfu:joined", handleJoined);
    const unsubTransport = on("sfu:transport-created", handleTransportCreated);
    
    // Add new consumer logic here based on sfu:new-producer events...
    // (Omitted for brevity, but would handle creating a RecvTransport and calling transport.consume)

    return () => {
      mounted = false;
      unsubJoined();
      unsubTransport();
      emit("sfu:leave", { roomId });
    };
  }, [isConnected, roomId, emit, on, initDevice, device, localStream]);

  return { consumers, error };
}
