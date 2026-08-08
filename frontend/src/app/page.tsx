"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Video, Mic, Globe2, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { isAuthenticated, userEmail, logout } = useAuth();
  return (
    <div className="flex-1 relative overflow-hidden flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -right-[10%] w-[70%] h-[70%] rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute -bottom-[40%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-600/20 blur-[120px]" />
      </div>

      {isAuthenticated && userEmail && (
        <div className="absolute top-6 right-6 z-50 flex items-center gap-4 bg-slate-800/50 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center font-bold text-white uppercase shadow-lg">
            {userEmail.charAt(0)}
          </div>
          <span className="text-sm font-medium text-slate-300 truncate max-w-[120px] sm:max-w-none">
            {userEmail}
          </span>
          <button
            onClick={() => logout()}
            className="text-slate-400 hover:text-white transition-colors ml-2"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 text-center max-w-4xl mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel mb-8 text-brand-300 text-sm font-medium">
          <Shield className="w-4 h-4" />
          <span>Secure, Scalable, Real-Time</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
          Connect instantly.<br/>Anywhere.
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Experience low-latency peer-to-peer voice, HD video, and massive group calls. 
          Jump into an anonymous lobby or sign in to connect with contacts.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-4 rounded-full bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-2"
          >
            <Video className="w-5 h-5" />
            Get Started
          </Link>
          <Link 
            href="/anonymous"
            className="w-full sm:w-auto px-8 py-4 rounded-full glass-button font-semibold flex items-center justify-center gap-2 text-white"
          >
            <Globe2 className="w-5 h-5" />
            Random Match
          </Link>
        </div>
      </motion.div>

      {/* Feature grid */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 max-w-5xl mx-auto w-full"
      >
        {[
          { icon: Mic, title: "Crystal Clear Audio", desc: "Opus-encoded, low-bandwidth voice calling." },
          { icon: Video, title: "HD Video & SFU", desc: "Scale to 50+ participants with MediaSoup." },
          { icon: Globe2, title: "Omegle-Style Match", desc: "Instantly pair with random users globally." }
        ].map((feat, i) => (
          <div key={i} className="glass-panel p-6 rounded-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-brand-500/20 flex items-center justify-center mb-4 text-brand-400">
              <feat.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{feat.title}</h3>
            <p className="text-sm text-slate-400">{feat.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
