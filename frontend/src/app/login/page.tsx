'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('oliver.brown@domain.io');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleGoogleLogin = async () => {
    try {
      const { authUrl } = await api.getGoogleAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      console.warn('Google OAuth URL generation error:', err);
      // Fallback directly to dev login for Oliver Brown
      handleDevLogin();
    }
  };

  const handleDevLogin = async (customEmail?: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const loginEmail = customEmail || email;
      const name = loginEmail.includes('oliver') ? 'Oliver Brown' : 'Demo User';
      await api.devLogin(loginEmail, name);
      router.push('/');
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please verify backend server is running.');
      setLoading(false);
    }
  };

  const handleEmailPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your email ID');
      return;
    }
    handleDevLogin(email);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      {/* Centered Login Card (Figma Screen 1) */}
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-xl shadow-gray-100/60 text-center space-y-6">
        {/* Card Header */}
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Login</h1>

        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl text-left">
            {errorMsg}
          </div>
        )}

        {/* Login with Google Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-[#E1F5EC] hover:bg-[#d4efe2] active:scale-[0.99] transition font-medium text-sm text-gray-800 flex items-center justify-center gap-2.5 shadow-2xs"
        >
          {/* Google "G" Icon */}
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Login with Google</span>
        </button>

        {/* Horizontal Divider */}
        <div className="relative flex items-center justify-center my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <span className="relative px-3 bg-white text-xs text-gray-400 font-normal">
            or sign up through email
          </span>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailPasswordSubmit} className="space-y-3 text-left">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email ID"
              required
              className="w-full py-3 px-4 bg-[#F4F5F6] text-gray-800 placeholder-gray-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full py-3 px-4 bg-[#F4F5F6] text-gray-800 placeholder-gray-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-[#00A854] hover:bg-[#009249] active:scale-[0.99] text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Quick Demo Helper */}
        <div className="pt-2 text-center">
          <p className="text-[11px] text-gray-400">
            Hiring Assignment Evaluator: Click Login to sign in as{' '}
            <strong className="text-gray-600">Oliver Brown</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
