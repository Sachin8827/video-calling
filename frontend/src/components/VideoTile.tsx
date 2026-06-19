"use client";

import { useEffect, useRef } from "react";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoTileProps {
  stream: MediaStream | null;
  isMuted?: boolean;
  isLocal?: boolean;
  name?: string;
  className?: string;
}

export function VideoTile({ stream, isMuted, isLocal, name, className }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // If there's a stream but no video tracks (or they are disabled), we show an avatar fallback.
  const hasVideo = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;

  return (
    <div className={cn("relative rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 shadow-lg group", className)}>
      {stream && hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Always mute local video to prevent feedback loop
          className={cn("w-full h-full object-cover", isLocal && "scale-x-[-1]")} // Mirror local video
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-3xl font-bold text-slate-400">
            {name ? name.charAt(0).toUpperCase() : "?"}
          </div>
        </div>
      )}

      {/* Overlay controls */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md text-sm font-medium text-white max-w-[70%] truncate">
          {name || (isLocal ? "You" : "Participant")}
        </div>
        {isMuted && (
          <div className="p-1.5 rounded-lg bg-red-500/80 backdrop-blur-md text-white">
            <MicOff className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
