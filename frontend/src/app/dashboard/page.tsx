"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Phone, Users, Plus, Globe2 } from "lucide-react";
import { motion } from "framer-motion";
import { useSignaling } from "@/hooks/useSignaling";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { useContacts } from "@/hooks/useContacts";

export default function Dashboard() {
  const router = useRouter();
  const { emit, emitWithAck, on } = useSignaling();
  const { logout, userEmail } = useAuth();
  const { contacts, acceptRequest, rejectRequest, deleteContact } = useContacts();
  const [targetEmail, setTargetEmail] = useState("");
  const [incomingRequest, setIncomingRequest] = useState<{ requestId: string, fromUserId: string, callId: string } | null>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);

  useEffect(() => {
    const cleanupReq = on("contact:save-request", (data: any) => {
      setIncomingRequest(data);
    });
    const cleanupCall = on("call:incoming", (data: any) => {
      setIncomingCall(data);
    });
    return () => {
      cleanupReq();
      cleanupCall();
    };
  }, [on]);

  const handleAcceptRequest = async () => {
    if (incomingRequest) {
      await acceptRequest(incomingRequest.requestId);
      setIncomingRequest(null);
    }
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      emit("call:accept", { callId: incomingCall.callId, callType: incomingCall.callType });
      router.push(`/call?callId=${incomingCall.callId}`);
    }
  };

  const handleStartCall = async (type: "voice" | "video", email?: string) => {
    const target = email || targetEmail;
    if (!target) return alert("Enter a target user's email");
    try {
      const res = await emitWithAck("call:initiate", { targetEmail: target, callType: type });
      if (res?.callId) {
        router.push(`/call?callId=${res.callId}&initiator=true`);
      } else if (res?.error) {
        alert(res.error);
      }
    } catch (err: any) {
      alert("Failed to initiate call: " + (err.message || "Unknown error"));
    }
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
            {userEmail && (
              <span className="text-sm font-medium text-slate-300 truncate max-w-[120px] sm:max-w-none mr-2">
                {userEmail}
              </span>
            )}
            <button
              onClick={() => logout()}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center font-bold text-white uppercase shadow-lg shadow-brand-500/20">
              {userEmail ? userEmail.charAt(0) : 'U'}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-1 md:col-span-2 flex flex-col gap-6"
          >
            {incomingRequest && (
              <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-brand-500/50 bg-brand-500/10 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">New Contact Request</h3>
                    <p className="text-sm text-slate-300">User wants to save your contact</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAcceptRequest} className="px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-medium transition-colors">Accept</button>
                  <button onClick={() => setIncomingRequest(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors">Dismiss</button>
                </div>
              </div>
            )}

            {incomingCall && (
              <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-green-500/50 bg-green-500/10 mb-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                    {incomingCall.callType === 'video' ? <Video className="w-5 h-5 text-white" /> : <Phone className="w-5 h-5 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Incoming Call</h3>
                    <p className="text-sm text-slate-300">from {incomingCall.callerEmail || 'a contact'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAcceptCall} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors">Answer</button>
                  <button onClick={() => setIncomingCall(null)} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors">Decline</button>
                </div>
              </div>
            )}

            <div className="glass-panel p-6 rounded-2xl">
              <h2 className="text-xl font-semibold mb-6">Start a Connection</h2>

              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="email"
                    placeholder="Target User Email"
                    className="flex-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
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

                <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={handleCreateGroup}
                  className="w-full px-6 py-4 rounded-xl border-2 border-dashed border-slate-600 hover:border-brand-500 hover:bg-brand-500/10 text-slate-300 font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Users className="w-5 h-5 text-brand-400" /> 
                  Group Call
                </button>

                <button 
                  onClick={() => router.push('/anonymous')}
                  className="w-full px-6 py-4 rounded-xl border-2 border-dashed border-slate-600 hover:border-indigo-500 hover:bg-indigo-500/10 text-slate-300 font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Globe2 className="w-5 h-5 text-indigo-400" /> 
                  Random Match
                </button>
              </div>
            </div>
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
              {contacts.length === 0 ? (
                <div className="text-sm text-slate-400 text-center mt-10">No contacts saved yet</div>
              ) : (
                contacts.map((contact, i) => (
                  <div key={contact.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-700/30 transition-colors group cursor-pointer border border-transparent hover:border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-indigo-600 flex items-center justify-center font-semibold shadow-sm text-white">
                        {contact.nickname ? contact.nickname.charAt(0).toUpperCase() : contact.contactEmail.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-200">{contact.nickname || contact.contactEmail.split('@')[0]}</div>
                        <div className="text-xs text-slate-400">{contact.contactEmail}</div>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleStartCall("video", contact.contactEmail)} className="p-2 rounded-lg hover:bg-slate-600 text-slate-300 hover:text-white transition-colors" title="Video Call">
                        <Video className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleStartCall("voice", contact.contactEmail)} className="p-2 rounded-lg hover:bg-slate-600 text-slate-300 hover:text-white transition-colors" title="Voice Call">
                        <Phone className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
