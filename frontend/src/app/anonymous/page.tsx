"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSignaling } from "@/hooks/useSignaling";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoTile } from "@/components/VideoTile";
import { CallControls } from "@/components/CallControls";
import { MatchmakingSpinner } from "@/components/MatchmakingSpinner";
import { ContactSaveBanner } from "@/components/ContactSaveBanner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function AnonymousRoom() {
  const router = useRouter();
  const { emit, on, isConnected } = useSignaling();
  const { stream: localStream, startMedia, stopMedia, micEnabled, cameraEnabled, toggleMic, toggleCamera } = useMediaDevices();

  const [matchState, setMatchState] = useState<"idle" | "queue" | "matched">("queue");
  const [callId, setCallId] = useState<string | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [showContactSave, setShowContactSave] = useState(false);
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [contactRequestSent, setContactRequestSent] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<any>(null);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [searchingUsers, setSearchingUsers] = useState(0);
  const queuedRef = useRef(false);

  // WebRTC hook handles the SDP/ICE behind the scenes
  const { remoteStream, endCall } = useWebRTC({
    callId: callId || "",
    isInitiator,
    localStream,
    onCallEnded: () => {
      setShowContactSave(false);
      setCallId(null);
      setPartnerInfo(null);
      setIsInitiator(false);
      setContactRequestSent(false);
      setMatchState("queue");
      queuedRef.current = true;
      emit("match:join-queue", { preferredType: "video" });
    }
  });

  useEffect(() => {
    // Start local camera on mount and leave it running until unmount.
    startMedia(true, true);

    return () => {
      stopMedia();
      if (callId) {
        emit("call:end", { callId });
      }
    };
  }, [startMedia, stopMedia, emit]);

  useEffect(() => {
    const unsubQueued = on("match:queued", (data) => {
      console.log("[anonymous] match:queued", data);
      setOnlineUsers(data.onlineUsers ?? 0);
      setSearchingUsers(data.searchingUsers ?? 0);
    });

    const unsubMatch = on("match:found", (data) => {
      console.log("[anonymous] match:found", data);
      setCallId(data.callId);
      setIsInitiator(data.isInitiator);
      setPartnerInfo(data);
      setMatchState("matched");
      setShowContactSave(false);
      setContactRequestSent(false);
    });

    const unsubStatus = on("match:queue-status", (data) => {
      console.log("[anonymous] match:queue-status", data);
      setOnlineUsers(data.onlineUsers ?? 0);
      setSearchingUsers(data.searchingUsers ?? 0);
    });

    const unsubSaveRequest = on("contact:save-request", (data: any) => {
      console.log("[anonymous] contact:save-request received", data);
      setIncomingRequestId(data.requestId);
      setShowContactSave(true);
    });

    if (isConnected) {
      console.log("[anonymous] request status");
      emit("match:queue-status-request");
    } else {
      console.log("[anonymous] socket not connected yet");
    }

    if (isConnected && matchState === "queue" && !showContactSave && !queuedRef.current) {
      queuedRef.current = true;
      console.log("[anonymous] join queue");
      emit("match:join-queue", { preferredType: "video" });
    }

    return () => {
      unsubQueued();
      unsubMatch();
      unsubStatus();
      unsubSaveRequest();
    };
  }, [on, isConnected, emit, matchState, showContactSave]);

  const handleLeave = () => {
    console.log("[anonymous] handleLeave: exit to root", { callId, matchState });
    if (callId) {
      endCall();
    }
    queuedRef.current = false;
    setCallId(null);
    setPartnerInfo(null);
    setShowContactSave(false);
    setContactRequestSent(false);
    setMatchState("idle");
    router.push("/");
  };

  const handleContactResponse = async (accept: boolean) => {
    console.log("[anonymous] handleContactResponse", { accept, incomingRequestId });
    setShowContactSave(false);

    if (incomingRequestId) {
      try {
        if (accept) {
          await apiFetch('/contacts/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: incomingRequestId })
          });
        } else {
          await apiFetch(`/contacts/reject/${incomingRequestId}`, {
            method: 'POST'
          });
        }
      } catch (e) {
        console.error("Failed to respond to contact request", e);
      }
    }
    setIncomingRequestId(null);
  };

  const handleSaveContact = () => {
    if (!partnerInfo?.partnerUserId || !callId) return;
    emit("contact:request-save", { callId, toUserId: partnerInfo.partnerUserId });
    setContactRequestSent(true);
  };

  return (
    <div className="flex-1 relative flex flex-col bg-slate-900">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-4 z-40 flex items-center justify-between pointer-events-none">
        <Link
          href="/"
          onClick={endCall}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white pointer-events-auto hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-4 pointer-events-auto">
          {(() => {
            console.log("[anonymous] Render Save Contact Check -> matchState:", matchState, "partnerInfo:", partnerInfo);
            return matchState === "matched" && partnerInfo?.bothRegistered && !contactRequestSent && (
              <button
                onClick={handleSaveContact}
                className="glass-panel px-4 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium text-brand-400 hover:bg-brand-500/20 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                <span>Save Contact</span>
              </button>
            );
          })()}
          {matchState === "matched" && contactRequestSent && (
            <div className="glass-panel px-4 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium text-green-400">
              <span>Request Sent!</span>
            </div>
          )}
          <div className="glass-panel px-4 py-1.5 rounded-full text-sm font-medium text-brand-300">
            Anonymous Mode
          </div>
        </div>
      </header>

      <ContactSaveBanner
        isVisible={showContactSave}
        onAccept={() => handleContactResponse(true)}
        onDecline={() => handleContactResponse(false)}
        partnerName="your last match"
      />

      <div className="flex-1 flex items-center justify-center p-4 pt-20 pb-24 h-full relative">
        <AnimatePresence mode="wait">
          {matchState === "queue" && (
            <motion.div
              key="queue"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="absolute top-8 left-1/2 -translate-x-1/2 rounded-3xl bg-slate-950/95 border border-slate-700/50 px-4 py-3 text-center shadow-xl backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Matchmaking status</p>
                <div className="mt-2 flex items-center justify-center gap-6 text-white">
                  <div>
                    <p className="text-2xl font-semibold">{searchingUsers}</p>
                    <p className="text-xs text-slate-400">searching</p>
                  </div>
                  <div className="h-8 w-px bg-slate-700/80" />
                  <div>
                    <p className="text-2xl font-semibold">{onlineUsers}</p>
                    <p className="text-xs text-slate-400">online</p>
                  </div>
                </div>
              </div>
              <MatchmakingSpinner />
              {/* Show local preview tiny in corner while waiting */}
              {localStream && (
                <div className="absolute bottom-24 right-4 w-48 h-64 shadow-2xl rounded-2xl overflow-hidden border border-slate-700/50 opacity-50 grayscale hover:grayscale-0 transition-all">
                  <VideoTile stream={localStream} isLocal isMuted name="You" className="w-full h-full" />
                </div>
              )}
            </motion.div>
          )}

          {matchState === "matched" && (
            <motion.div
              key="matched"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black z-0"
            >
              {/* Remote Video (Main) */}
              <div className="w-full h-full">
                <VideoTile
                  stream={remoteStream}
                  name="Stranger"
                  className="w-full h-full rounded-none border-none object-cover"
                />
              </div>

              {/* Local Video (PIP) */}
              <div className="absolute bottom-24 right-4 w-48 h-64 shadow-2xl rounded-2xl overflow-hidden border border-slate-700/50 transition-all z-10 hover:scale-105">
                <VideoTile stream={localStream} isLocal isMuted name="You" className="w-full h-full" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
