"use client";

import { useMemo } from "react";
import { VideoTile } from "./VideoTile";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participantsMap?: Map<string, { name: string; isMuted: boolean }>;
}

export function VideoGrid({ localStream, remoteStreams, participantsMap }: VideoGridProps) {
  // Convert map to array for easier rendering
  const streams = useMemo(() => Array.from(remoteStreams.entries()), [remoteStreams]);
  
  const totalTiles = streams.length + (localStream ? 1 : 0);

  // Dynamic grid calculation based on participant count
  const gridClass = useMemo(() => {
    if (totalTiles === 1) return "grid-cols-1";
    if (totalTiles === 2) return "grid-cols-1 md:grid-cols-2";
    if (totalTiles <= 4) return "grid-cols-2";
    if (totalTiles <= 6) return "grid-cols-2 md:grid-cols-3";
    if (totalTiles <= 9) return "grid-cols-3";
    if (totalTiles <= 12) return "grid-cols-3 md:grid-cols-4";
    return "grid-cols-4 md:grid-cols-5";
  }, [totalTiles]);

  return (
    <div className={cn("w-full h-full p-4 grid gap-4 max-w-7xl mx-auto auto-rows-fr", gridClass)}>
      <AnimatePresence>
        {localStream && (
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-full h-full min-h-[200px]"
          >
            <VideoTile stream={localStream} isLocal isMuted name="You" className="w-full h-full shadow-[0_0_20px_rgba(37,99,235,0.15)] border-brand-500/30" />
          </motion.div>
        )}

        {streams.map(([id, stream]) => {
          const participant = participantsMap?.get(id);
          
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full h-full min-h-[200px]"
            >
              <VideoTile 
                stream={stream} 
                name={participant?.name || `User ${id.substring(0,4)}`} 
                isMuted={participant?.isMuted}
                className="w-full h-full border-transparent"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
