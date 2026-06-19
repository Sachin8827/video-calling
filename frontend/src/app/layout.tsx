import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexus | Real-Time Communications",
  description: "High-performance WebRTC voice, video, and group calling platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased dark`} suppressHydrationWarning>
      <body className="min-h-screen bg-slate-900 text-slate-50 flex flex-col font-sans">
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
