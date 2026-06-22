"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Phone, Users, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useSignaling } from "@/hooks/useSignaling";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const router = useRouter();
  const { emit } = useSignaling();
  const { logout } = useAuth();
  const [targetUserId, setTargetUserId] = useState("");

  const handleStartCall = (type: "voice" | "video") => {
    if (!targetUserId) return alert("Enter a target user ID");
    emit("call:initiate", { targetUserId, callType: type });
    const demoCallId = `call-${Math.random().toString(36).substr(2, 9)}`;
    router.push(`/call?callId=${demoCallId}&initiator=true`);
  };

  const handleCreateGroup = () => {
    const roomId = `room-${Math.random().toString(36).substr(2, 9)}`;
    router.push(`/room?roomId=${roomId}`);
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full">
        <header className="flex items-center justify-between py-6 mb-8 border-b border-slate-800">
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => logout()}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center font-bold text-white">
              U
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-1 md:col-span-2 glass-panel p-6 rounded-2xl"
          >
            <h2 className="text-xl font-semibold mb-6">Start a Connection</h2>
            
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <input 
                  type="text" 
                  placeholder="Target User ID (UUID)"
                  className="flex-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleStartCall("video")}
                    className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium flex items-center gap-2 transition-all shadow-lg shadow-brand-500/20"
                  >
                    <Video className="w-4 h-4" /> Video Call
                  </button>
                  <button 
                    onClick={() => handleStartCall("voice")}
                    className="px-6 py-3 rounded-xl glass-button text-white font-medium flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> Voice
                  </button>
                </div>
              </div>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700/50"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-800 text-slate-400 rounded-full">Or</span>
                </div>
              </div>

              <button 
                onClick={handleCreateGroup}
                className="w-full px-6 py-4 rounded-xl border-2 border-dashed border-slate-600 hover:border-brand-500 hover:bg-brand-500/10 text-slate-300 font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Users className="w-5 h-5 text-brand-400" /> 
                Create Group Call Room
              </button>
            </div>
          </motion.div>

          {/* Contacts Sidebar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="col-span-1 glass-panel p-6 rounded-2xl flex flex-col h-[500px]"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Contacts</h2>
              <button className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-brand-400 hover:text-white">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {/* Dummy Contacts */}
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-700/30 transition-colors group cursor-pointer border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-indigo-600 flex items-center justify-center font-semibold shadow-sm">
                      C{i}
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">Contact {i}</div>
                      <div className="text-xs text-green-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Online
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 rounded-lg hover:bg-slate-600 text-slate-300 hover:text-white transition-colors">
                      <Video className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-slate-600 text-slate-300 hover:text-white transition-colors">
                      <Phone className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
