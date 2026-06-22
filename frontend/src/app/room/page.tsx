"use client";

import { useEffect, useState, use, Suspense } from "react";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useSFU } from "@/hooks/useSFU";
import { useSignaling } from "@/hooks/useSignaling";
import { VideoGrid } from "@/components/VideoGrid";
import { CallControls } from "@/components/CallControls";
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";

function RoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId") || "default";

  const { emit, isConnected } = useSignaling();
  const { stream: localStream, startMedia, stopMedia, micEnabled, cameraEnabled, toggleMic, toggleCamera } = useMediaDevices();
  const { consumers, error } = useSFU({ roomId, localStream });

  useEffect(() => {
    startMedia(true, true);
    return () => {
      stopMedia();
    };
  }, [startMedia, stopMedia]);

  const handleLeave = () => {
    emit("sfu:leave", { roomId });
    stopMedia();
    router.push("/dashboard");
  };

  return (
    <div className="flex-1 relative flex flex-col bg-slate-900 h-screen overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-4 z-40 flex items-center justify-between pointer-events-none">
        <button 
          onClick={handleLeave}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white pointer-events-auto hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4 pointer-events-auto">
          {error && (
            <div className="bg-red-500/20 text-red-300 px-4 py-1.5 rounded-full text-sm font-medium backdrop-blur-md border border-red-500/30">
              {error}
            </div>
          )}
          <div className="glass-panel px-4 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium text-slate-200">
            <Users className="w-4 h-4 text-brand-400" />
            <span>{consumers.size + 1}</span>
          </div>
          <div className="glass-panel px-4 py-1.5 rounded-full text-sm font-mono text-slate-400">
            Room: {roomId.split('-')[0]}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 pt-20 pb-24 h-full relative">
        <VideoGrid 
          localStream={localStream}
          remoteStreams={consumers}
        />
      </div>

      {/* Controls */}
      <CallControls 
        micEnabled={micEnabled}
        cameraEnabled={cameraEnabled}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onEndCall={handleLeave}
      />
    </div>
  );
}

export default function GroupCallRoom() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-slate-900 text-white">Loading room...</div>}>
        <RoomContent />
      </Suspense>
    </ProtectedRoute>
  );
}
