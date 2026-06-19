import { io, Socket } from "socket.io-client";

// URL will point to Nginx reverse proxy (port 80/443) or direct to backend for local dev
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 
  (typeof window !== "undefined"
    ? (window.location.port === "3001" ? "http://localhost:3000/signal" : "/signal")
    : "http://localhost:3000/signal");

class SocketService {
  private static instance: Socket | null = null;

  public static getInstance(): Socket {
    if (!SocketService.instance) {
      SocketService.instance = io(SOCKET_URL, {
        autoConnect: false, // Wait for authentication before connecting
        transports: ["websocket"],
      });
    }
    return SocketService.instance;
  }
}

export const getSocket = () => SocketService.getInstance();
