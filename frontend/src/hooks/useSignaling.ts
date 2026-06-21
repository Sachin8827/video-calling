"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";

export function useSignaling() {
  const [isConnected, setIsConnected] = useState(false);
  const socket = getSocket();

  useEffect(() => {
    // Attempt to connect immediately. If a token exists in localStorage, attach it.
    const token = localStorage.getItem("access_token");
    console.log("[signaling] auth token", token ? "present" : "none");
    if (token) {
      socket.auth = { token };
    } else {
      socket.auth = {}; // Anonymous
    }

    socket.connect();

    const onConnect = () => {
      console.log("[signaling] connected", socket.id);
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log("[signaling] disconnected", socket.id);
      setIsConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  // Expose typed wrappers
  const emit = useCallback((event: string, payload?: any) => {
    console.log("[signaling] emit", event, payload);
    socket.emit(event, payload);
  }, [socket]);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    socket.on(event, callback);
    return () => socket.off(event, callback);
  }, [socket]);

  return { isConnected, emit, on, socket };
}
