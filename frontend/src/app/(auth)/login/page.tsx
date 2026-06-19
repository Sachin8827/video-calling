"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { LogIn, ArrowRight } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // In a real app, hit the NestJS backend
      /*
      const res = await fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      localStorage.setItem("access_token", data.accessToken);
      */
      
      // For demo, just redirect
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-panel p-8 rounded-3xl"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/20 flex items-center justify-center">
            <LogIn className="w-8 h-8 text-brand-400" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-white mb-2">Welcome Back</h1>
        <p className="text-slate-400 text-center mb-8">Sign in to manage your connections.</p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input 
              type="email" 
              required
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit"
            className="w-full py-3 mt-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
          >
            Sign In <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Don't have an account?{" "}
          <Link href="/register" className="text-brand-400 hover:text-brand-300 font-medium">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
