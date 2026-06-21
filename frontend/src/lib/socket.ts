import { io, Socket } from "socket.io-client";

const DEFAULT_BACKEND_SOCKET_URL = "https://jolene-unprosaical-questioningly.ngrok-free.dev/signal";

// Always use the configured backend socket URL unless explicitly overridden.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL_BACKEND ?? DEFAULT_BACKEND_SOCKET_URL;

class SocketService {
  private static instance: Socket | null = null;

  public static getInstance(): Socket {
    if (!SocketService.instance) {
      SocketService.instance = io(SOCKET_URL, {
        autoConnect: false,
        transports: ["websocket"],
      });
    }
    return SocketService.instance;
  }
}

export const getSocket = () => SocketService.getInstance();
