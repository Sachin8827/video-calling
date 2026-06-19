"use client";

import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, X, Check } from "lucide-react";
import { useState } from "react";

interface ContactSaveBannerProps {
  isVisible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  partnerName?: string;
}

export function ContactSaveBanner({ isVisible, onAccept, onDecline, partnerName = "this user" }: ContactSaveBannerProps) {
  const [hasResponded, setHasResponded] = useState(false);

  const handleAccept = () => {
    setHasResponded(true);
    onAccept();
  };

  const handleDecline = () => {
    setHasResponded(true);
    onDecline();
  };

  return (
    <AnimatePresence>
      {isVisible && !hasResponded && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
        >
          <div className="glass-panel p-4 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Save Contact?</h3>
                <p className="text-xs text-slate-400">Would you like to connect with {partnerName}?</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handleDecline}
                className="w-8 h-8 rounded-full bg-slate-700/50 hover:bg-slate-600/80 flex items-center justify-center text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button 
                onClick={handleAccept}
                className="w-8 h-8 rounded-full bg-brand-600 hover:bg-brand-500 flex items-center justify-center text-white transition-colors shadow-[0_0_10px_rgba(37,99,235,0.4)]"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
