"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useSignaling } from "@/hooks/useSignaling";
import { VideoTile } from "@/components/VideoTile";
import { CallControls } from "@/components/CallControls";
import { ArrowLeft, UserCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function CallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callId = searchParams.get("callId") ?? "";
  const initiatorParam = searchParams.get("initiator");
  const [isInitiator] = useState(initiatorParam === "1" || initiatorParam === "true");
  const [callType, setCallType] = useState<"voice" | "video">("video");

  const { emit } = useSignaling();
  const { stream: localStream, startMedia, stopMedia, micEnabled, cameraEnabled, toggleMic, toggleCamera } = useMediaDevices();
  const { remoteStream, endCall } = useWebRTC({
    callId,
    isInitiator,
    localStream,
    onCallEnded: () => {
      stopMedia();
      router.push("/");
    },
  });

  useEffect(() => {
    if (!callId) {
      router.replace("/");
      return;
    }

    startMedia(callType === "video", true);
    return () => {
      stopMedia();
    };
  }, [callId, router, startMedia, stopMedia, callType]);

  const handleLeave = () => {
    endCall();
    router.push("/");
  };

  const handleSwitchType = () => {
    const newType = callType === "video" ? "voice" : "video";
    setCallType(newType);
    emit(newType === "video" ? "call:upgrade" : "call:downgrade", { callId });
    if (newType === "voice") {
      if (cameraEnabled) toggleCamera();
    } else if (!cameraEnabled) {
      toggleCamera();
    }
  };

  if (!callId) return null;

  return (
    <div className="flex-1 relative flex flex-col bg-slate-900 h-screen overflow-hidden">
      <header className="absolute top-0 left-0 right-0 p-4 z-40 flex items-center justify-between pointer-events-none">
        <button
          onClick={handleLeave}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white pointer-events-auto hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="glass-panel px-4 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium text-slate-200">
            <UserCircle className="w-4 h-4 text-brand-400" />
            <span>1:1 Call</span>
          </div>
          <div className="glass-panel px-4 py-1.5 rounded-full text-sm font-mono text-slate-400">
            ID: {callId.split("-")[0]}
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 pt-20 pb-24 h-full relative">
        <AnimatePresence mode="wait">
          {callType === "voice" ? (
            <motion.div
              key="voice"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center"
            >
              <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.2)]">
                <UserCircle className="w-16 h-16 text-slate-500" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold text-white">Voice Call</h2>
              <p className="text-slate-400 mt-2">Connected</p>

              {remoteStream && <audio autoPlay playsInline ref={(el) => { if (el) el.srcObject = remoteStream; }} />}
            </motion.div>
          ) : (
            <motion.div
              key="video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col md:flex-row gap-4 max-w-7xl mx-auto"
            >
              <div className="flex-1 relative h-full min-h-[50vh]">
                <VideoTile
                  stream={remoteStream}
                  name="Contact"
                  className="w-full h-full shadow-[0_0_30px_rgba(37,99,235,0.1)] border-brand-500/20"
                />
              </div>

              <div className="w-full md:w-1/3 h-64 md:h-full max-h-[50vh] md:max-h-none">
                <VideoTile stream={localStream} isLocal isMuted name="You" className="w-full h-full" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CallControls
        micEnabled={micEnabled}
        cameraEnabled={cameraEnabled}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onEndCall={handleLeave}
        onSwitchType={handleSwitchType}
        isVoiceOnly={callType === "voice"}
      />
    </div>
  );
}

export default function DirectCallRoom() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-slate-900 text-white">Loading call...</div>}>
      <CallContent />
    </Suspense>
  );
}
