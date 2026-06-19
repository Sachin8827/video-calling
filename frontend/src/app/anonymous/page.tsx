"use client";

import { useEffect, useState } from "react";
import { useSignaling } from "@/hooks/useSignaling";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoTile } from "@/components/VideoTile";
import { CallControls } from "@/components/CallControls";
import { MatchmakingSpinner } from "@/components/MatchmakingSpinner";
import { ContactSaveBanner } from "@/components/ContactSaveBanner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AnonymousRoom() {
  const { emit, on, isConnected } = useSignaling();
  const { stream: localStream, startMedia, stopMedia, micEnabled, cameraEnabled, toggleMic, toggleCamera } = useMediaDevices();
  
  const [matchState, setMatchState] = useState<"idle" | "queue" | "matched">("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [showContactSave, setShowContactSave] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<any>(null);

  // WebRTC hook handles the SDP/ICE behind the scenes
  const { remoteStream, endCall } = useWebRTC({
    callId: callId || "",
    isInitiator,
    localStream,
    onCallEnded: () => {
      setMatchState("idle");
      // If we got info that both are registered, show banner
      if (partnerInfo?.bothRegistered) {
        setShowContactSave(true);
      }
    }
  });

  useEffect(() => {
    // Start local camera on mount
    startMedia(true, true);
    
    return () => {
      stopMedia();
      emit("call:end", { callId });
    };
  }, [startMedia, stopMedia, emit, callId]);

  useEffect(() => {
    if (isConnected && matchState === "idle" && !showContactSave) {
      // Auto-join queue once connected
      setMatchState("queue");
      emit("match:join-queue", { preferredType: "video" });
    }
  }, [isConnected, matchState, emit, showContactSave]);

  useEffect(() => {
    const unsubMatch = on("match:found", (data) => {
      setCallId(data.callId);
      setIsInitiator(data.isInitiator);
      setPartnerInfo(data);
      setMatchState("matched");
      setShowContactSave(false);
    });

    return () => {
      unsubMatch();
    };
  }, [on]);

  const handleNext = () => {
    endCall();
    setCallId(null);
    setPartnerInfo(null);
    setMatchState("queue");
    emit("match:join-queue", { preferredType: "video" });
  };

  const handleContactResponse = (accept: boolean) => {
    setShowContactSave(false);
    if (accept && callId && partnerInfo) {
      emit("contact:save-request", { callId, targetUserId: partnerInfo.userId });
    }
  };

  return (
    <div className="flex-1 relative flex flex-col bg-slate-900">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-4 z-40 flex items-center justify-between pointer-events-none">
        <Link 
          href="/" 
          onClick={endCall}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white pointer-events-auto hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="glass-panel px-4 py-1.5 rounded-full text-sm font-medium text-brand-300">
          Anonymous Mode
        </div>
      </header>

      <ContactSaveBanner 
        isVisible={showContactSave} 
        onAccept={() => handleContactResponse(true)}
        onDecline={() => handleContactResponse(false)}
        partnerName="your last match"
      />

      <div className="flex-1 flex items-center justify-center p-4 pt-20 pb-24 h-full relative">
        <AnimatePresence mode="wait">
          {matchState === "queue" && (
            <motion.div
              key="queue"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <MatchmakingSpinner />
              {/* Show local preview tiny in corner while waiting */}
              {localStream && (
                <div className="absolute bottom-24 right-4 w-48 h-64 shadow-2xl rounded-2xl overflow-hidden border border-slate-700/50 opacity-50 grayscale hover:grayscale-0 transition-all">
                  <VideoTile stream={localStream} isLocal isMuted />
                </div>
              )}
            </motion.div>
          )}

          {matchState === "matched" && (
            <motion.div
              key="matched"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col md:flex-row gap-4 max-w-7xl mx-auto"
            >
              {/* Remote Video (Main) */}
              <div className="flex-1 relative h-full min-h-[50vh]">
                <VideoTile 
                  stream={remoteStream} 
                  name="Stranger" 
                  className="w-full h-full shadow-[0_0_30px_rgba(37,99,235,0.1)] border-brand-500/20" 
                />
              </div>
              
              {/* Local Video (PIP or side) */}
              <div className="w-full md:w-1/3 h-64 md:h-full max-h-[50vh] md:max-h-none">
                <VideoTile stream={localStream} isLocal isMuted name="You" className="w-full h-full" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <CallControls 
        micEnabled={micEnabled}
        cameraEnabled={cameraEnabled}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onEndCall={handleNext} // "Skip" essentially ends current and starts next
      />
    </div>
  );
}
