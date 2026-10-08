// frontend/src/ProfileModal.tsx
import React, { useState, useEffect } from 'react';
import { API_BASE } from './config';

interface ProfileModalProps {
  email: string;
  onClose: () => void;
}

export default function ProfileModal({ email, onClose }: ProfileModalProps) {
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [customContext, setCustomContext] = useState('');
  const [password, setPassword] = useState('••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/profile?email=${email}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setFullName(data.fullName || '');
          setBio(data.bio || '');
          setCustomContext(data.customContext || '');
          setPassword(data.password || '••••••••');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, bio, customContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Profile updated successfully! AI models now know your details.');
    } catch (err: any) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white/95 backdrop-blur-2xl border border-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {email[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">User Profile</h2>
              <p className="text-xs text-slate-500">Manage your information & AI knowledge base</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition cursor-pointer font-bold">✕</button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-500 animate-pulse">Loading profile...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {message && <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-xl">{message}</div>}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Email (Locked)</label>
              <input
                type="email"
                readOnly
                value={email}
                className="w-full bg-slate-200/70 border border-slate-300 rounded-xl p-3 text-sm text-slate-600 cursor-not-allowed select-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Password (Locked)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  readOnly
                  value={password}
                  className="w-full bg-slate-200/70 border border-slate-300 rounded-xl p-3 text-sm text-slate-700 pr-12 font-mono select-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 px-3.5 flex items-center text-slate-600 hover:text-slate-900 cursor-pointer z-10 select-none"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? '👁️‍🗨️' : '👁️'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Chiru Sathish"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Short Bio</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. AI Developer & B.Tech Student"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Additional Info for AI Models (Custom Context)</label>
              <textarea
                rows={3}
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Write any facts about yourself you want CORON chat & voice models to automatically know..."
                className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Profile & Update AI Knowledge'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}