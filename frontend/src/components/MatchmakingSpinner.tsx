"use client";

import { motion } from "framer-motion";
import { Globe2 } from "lucide-react";

export function MatchmakingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="w-32 h-32 rounded-full border-2 border-dashed border-brand-500/50"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400">
            <Globe2 className="w-8 h-8" />
          </div>
        </motion.div>
      </div>
      
      <h2 className="mt-8 text-2xl font-semibold text-white tracking-tight">Looking for a match...</h2>
      <p className="mt-2 text-slate-400">Connecting you to someone randomly around the world.</p>
    </div>
  );
}
