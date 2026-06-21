"use client";

import { motion } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, PhoneForwarded } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallControlsProps {
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onSwitchType?: () => void; // Switch voice <-> video
  isVoiceOnly?: boolean;
}

export function CallControls({
  micEnabled,
  cameraEnabled,
  onToggleMic,
  onToggleCamera,
  onEndCall,
  onSwitchType,
  isVoiceOnly = false,
}: CallControlsProps) {
  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-full glass-panel z-50"
    >
      <button
        type="button"
        onClick={onToggleMic}
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center transition-all",
          micEnabled ? "bg-slate-700/50 hover:bg-slate-600/50" : "bg-red-500/80 hover:bg-red-500 text-white"
        )}
      >
        {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {!isVoiceOnly && (
        <button
          type="button"
          onClick={onToggleCamera}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            cameraEnabled ? "bg-slate-700/50 hover:bg-slate-600/50" : "bg-red-500/80 hover:bg-red-500 text-white"
          )}
        >
          {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
      )}

      {onSwitchType && (
        <button
          type="button"
          onClick={onSwitchType}
          className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-700/50 hover:bg-slate-600/50 transition-all text-brand-300"
          title={isVoiceOnly ? "Switch to Video" : "Switch to Voice"}
        >
          <PhoneForwarded className="w-5 h-5" />
        </button>
      )}

      <button
        type="button"
        onClick={onEndCall}
        className="w-14 h-14 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all transform hover:scale-110"
      >
        <PhoneOff className="w-6 h-6" />
      </button>
    </motion.div>
  );
}
