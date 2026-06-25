'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch, setAccessToken, setRefreshToken, refreshAuthToken } from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Attempt to silently refresh token on initial load
    let mounted = true;
    const initAuth = async () => {
      try {
        const refreshed = await refreshAuthToken();
        if (refreshed) {
          if (mounted) {
            setIsAuthenticated(true);
            setUserEmail(localStorage.getItem('userEmail'));
          }
        } else {
          if (mounted) setIsAuthenticated(false);
        }
      } catch (error) {
        if (mounted) setIsAuthenticated(false);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    // Listen for unauthorized events from api.ts
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      router.push('/login');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      mounted = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []); // Only run once on mount

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Login failed');
      }
      const data = await res.json();
      setAccessToken(data.data.accessToken);
      setRefreshToken(data.data.refreshToken);
      setIsAuthenticated(true);
      setUserEmail(email);
      localStorage.setItem('userEmail', email);
      router.push('/dashboard');
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Registration failed');
      }
      // After registering, automatically log in
      await login(email, password);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
      setUserEmail(null);
      localStorage.removeItem('userEmail');
      setIsLoading(false);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, userEmail, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
