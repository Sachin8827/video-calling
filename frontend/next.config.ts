import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    "localhost:3001",
    "atlas-unincarnate-natalia.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok-free.app"
  ]
};

export default nextConfig;
