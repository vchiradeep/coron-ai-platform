// frontend/src/AuthModal.tsx
import React, { useState } from 'react';
import { API_BASE } from './config';

interface AuthModalProps {
  onLoginSuccess: (email: string) => void;
}

export default function AuthModal({ onLoginSuccess }: AuthModalProps) {
  const [step, setStep] = useState<'login' | 'signup' | 'forgot' | 'verify' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (step === 'login') {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        onLoginSuccess(data.email);
      } else if (step === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sign up failed');
        setMessage('Account created successfully! Welcome email sent. Please log in.');
        setStep('login');
      } else if (step === 'forgot') {
        const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
        setMessage('Verification code sent to your email.');
        setStep('verify');
      } else if (step === 'verify') {
        const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid code');
        setStep('reset');
      } else if (step === 'reset') {
        if (newPassword !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Password reset failed');
        setMessage('Password updated successfully! Confirmation email sent. Please log in.');
        setStep('login');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-2xl border border-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <img src="/coron-logo.png" alt="CORON Logo" className="w-12 h-12 object-contain mx-auto rounded-xl shadow-md" />
          <h2 className="text-2xl font-extrabold text-slate-900">CORON</h2>
          <p className="text-xs text-slate-500 font-medium">One AI. Every Task.</p>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">{error}</div>}
        {message && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(step === 'login' || step === 'signup' || step === 'forgot') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {(step === 'login' || step === 'signup') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {showPassword ? '👁️‍🗨️' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {step === 'signup' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Enter 6-Digit Verification Code</label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-center text-lg tracking-widest font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {step === 'reset' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Processing...' : step === 'login' ? 'Sign In' : step === 'signup' ? 'Create Account' : step === 'forgot' ? 'Send Code' : step === 'verify' ? 'Verify Code' : 'Update Password'}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 font-medium">
          {step === 'login' && (
            <>
              <button onClick={() => setStep('forgot')} className="hover:text-blue-600 transition cursor-pointer">Forgot password?</button>
              <button onClick={() => setStep('signup')} className="text-blue-600 hover:underline transition cursor-pointer font-semibold">Create account</button>
            </>
          )}
          {step === 'signup' && (
            <button onClick={() => setStep('login')} className="w-full text-center hover:text-blue-600 transition cursor-pointer">Already have an account? Sign in</button>
          )}
          {(step === 'forgot' || step === 'verify' || step === 'reset') && (
            <button onClick={() => setStep('login')} className="w-full text-center hover:text-blue-600 transition cursor-pointer">Back to Sign In</button>
          )}
        </div>
      </div>
    </div>
  );
}