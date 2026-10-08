// frontend/src/VoiceModeOverlay.tsx
import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from './config';

interface VoiceModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  webSearchEnabled: boolean;
  userEmail: string | null;
}

const LANGUAGES = [
  { label: 'English (US)', code: 'en-US', name: 'English' },
  { label: 'Hindi (हिंदी)', code: 'hi-IN', name: 'Hindi' },
  { label: 'Telugu (తెలుగు)', code: 'te-IN', name: 'Telugu' },
  { label: 'Tamil (தமிழ்)', code: 'ta-IN', name: 'Tamil' },
  { label: 'Bengali (বাংলা)', code: 'bn-IN', name: 'Bengali' },
  { label: 'Marathi (मराठी)', code: 'mr-IN', name: 'Marathi' },
  { label: 'Gujarati (ગુજરાતી)', code: 'gu-IN', name: 'Gujarati' },
  { label: 'Punjabi (ਪੰਜਾਬੀ)', code: 'pa-IN', name: 'Punjabi' },
  { label: 'Urdu (اردو)', code: 'ur-PK', name: 'Urdu' },
  { label: 'Kannada (ಕನ್ನಡ)', code: 'kn-IN', name: 'Kannada' },
  { label: 'Malayalam (മലയാളം)', code: 'ml-IN', name: 'Malayalam' },
  { label: 'Spanish (Español)', code: 'es-ES', name: 'Spanish' },
  { label: 'French (Français)', code: 'fr-FR', name: 'French' },
  { label: 'German (Deutsch)', code: 'de-DE', name: 'German' },
  { label: 'Mandarin Chinese (中文)', code: 'zh-CN', name: 'Mandarin Chinese' },
  { label: 'Japanese (日本語)', code: 'ja-JP', name: 'Japanese' },
  { label: 'Korean (한국어)', code: 'ko-KR', name: 'Korean' },
  { label: 'Arabic (العربية)', code: 'ar-SA', name: 'Arabic' },
  { label: 'Portuguese (Português)', code: 'pt-BR', name: 'Portuguese' },
  { label: 'Russian (Русский)', code: 'ru-RU', name: 'Russian' },
  { label: 'Italian (Italiano)', code: 'it-IT', name: 'Italian' },
  { label: 'Turkish (Türkçe)', code: 'tr-TR', name: 'Turkish' },
  { label: 'Vietnamese (Tiếng Việt)', code: 'vi-VN', name: 'Vietnamese' },
];

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export const VoiceModeOverlay: React.FC<VoiceModeOverlayProps> = ({
  isOpen,
  onClose,
  webSearchEnabled,
  userEmail,
}) => {
  const [selectedLang, setSelectedLang] = useState('en-US');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [statusText, setStatusText] = useState('Select language and click Start Recording');
  const [aiResponseText, setAiResponseText] = useState('');

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopAllAudio();
      setIsRecording(false);
      setTranscript('');
      setAiResponseText('');
      setState('idle');
      return;
    }

    return () => {
      stopAllAudio();
    };
  }, [isOpen]);

  const stopAllAudio = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const startRecording = () => {
    stopAllAudio();
    setTranscript('');
    setAiResponseText('');

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setStatusText('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onstart = () => {
      setIsRecording(true);
      setState('listening');
      setStatusText(`Listening in ${LANGUAGES.find(l => l.code === selectedLang)?.name || 'selected language'}...`);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const currentText = final || interim;
      if (currentText) {
        setTranscript(currentText);
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setState('idle');
      setStatusText('Recording paused. Edit text or click Start again.');
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (state === 'listening') {
        setState('idle');
        setStatusText('Recording finished. Review your text and click Send.');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setIsRecording(false);
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    setIsRecording(false);
    setState('idle');
    setStatusText('Review your transcript below, edit if needed, and click Send.');
  };

  const handleSendQuery = async () => {
    if (!transcript.trim()) return;

    const spokenText = transcript.trim();
    setState('thinking');
    setStatusText('Processing with Neural Engine...');
    setAiResponseText('');

    const currentLangObj = LANGUAGES.find(l => l.code === selectedLang);
    const languageName = currentLangObj ? currentLangObj.name : 'English';

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: spokenText }],
          mode: 'auto',
          webSearch: webSearchEnabled,
          language: languageName,
          isVoice: true,
          userEmail,
        }),
      });

      if (!response.ok) throw new Error('Backend failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      let aiAnswer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '').trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                aiAnswer += parsed.text;
                setAiResponseText(aiAnswer);
              }
            } catch (e) {}
          }
        }
      }

      playCloudAudio(aiAnswer, selectedLang);

    } catch (error) {
      setStatusText('Connection error. Please try again.');
      setState('idle');
    }
  };

  const playCloudAudio = async (text: string, langCode: string) => {
    const cleanText = text.replace(/```[\s\S]*?```/g, ' code block ').replace(/[*_#`]/g, '');
    if (!cleanText.trim()) {
      setState('idle');
      setStatusText('Ready for next query');
      return;
    }

    setState('speaking');
    setStatusText('Generating cloud voice stream...');

    try {
      const res = await fetch(`${API_BASE}/api/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, languageCode: langCode }),
      });

      if (!res.ok) throw new Error('TTS stream failed');

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setState('idle');
        setStatusText('Ready for next query. Click Start Recording.');
      };

      audio.onerror = () => {
        setState('idle');
        setStatusText('Ready for next query.');
      };

      await audio.play();
      setStatusText('Speaking response...');
    } catch (e) {
      console.error('Cloud audio playback error:', e);
      setState('idle');
      setStatusText('Ready for next query.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-between p-8 select-none text-white animate-fadeIn">
      {/* TOP BAR */}
      <div className="w-full flex items-center justify-between max-w-4xl">
        <div className="flex items-center gap-3">
          <img src="/coron-logo.png" alt="CORON Logo" className="w-8 h-8 object-contain rounded-lg" />
          <span className="font-extrabold text-sm tracking-tight text-slate-200">CORON Cloud Voice Mode (Universal Audio)</span>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            disabled={isRecording || state === 'thinking' || state === 'speaking'}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer font-medium shadow-md max-w-[200px]"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer text-base font-bold shadow-lg"
            title="Close Voice Mode"
          >
            ✕
          </button>
        </div>
      </div>

      {/* CENTER INTERACTIVE AREA */}
      <div className="flex flex-col items-center justify-center space-y-6 my-auto w-full max-w-2xl px-4">
        {/* ORB */}
        <div className="relative flex items-center justify-center w-36 h-36">
          <div className={`absolute inset-0 rounded-full bg-gradient-to-tr ${
            state === 'listening' ? 'from-blue-500 to-cyan-400 shadow-blue-500/50' :
            state === 'thinking' ? 'from-orange-500 to-yellow-400 shadow-orange-500/50' :
            state === 'speaking' ? 'from-emerald-500 to-teal-400 shadow-emerald-500/50' :
            'from-indigo-500 to-purple-400 shadow-indigo-500/30'
          } opacity-40 blur-2xl animate-pulse`} />

          <div className={`w-24 h-24 rounded-full bg-gradient-to-tr ${
            state === 'listening' ? 'from-blue-600 via-indigo-600 to-cyan-400 animate-pulse' :
            state === 'thinking' ? 'from-amber-600 via-orange-600 to-yellow-400 animate-spin' :
            state === 'speaking' ? 'from-emerald-600 via-teal-600 to-cyan-400' :
            'from-indigo-600 via-blue-600 to-violet-600'
          } shadow-2xl flex items-center justify-center relative z-10`}>
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              {state}
            </span>
          </div>
        </div>

        <p className="text-sm font-medium text-slate-300 text-center px-2">
          {statusText}
        </p>

        {/* EDITABLE TRANSCRIPT BOX */}
        <div className="w-full space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Spoken Transcript (Editable):
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Click 'Start Recording' and speak, or type/edit your message here..."
            rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none shadow-inner"
          />
        </div>

        {/* AI RESPONSE BOX */}
        {aiResponseText && (
          <div className="w-full space-y-1.5 animate-fadeIn">
            <label className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              CORON Cloud Voice Response:
            </label>
            <div className="w-full bg-slate-900/90 border border-emerald-500/40 rounded-xl p-3 text-sm text-emerald-200 max-h-36 overflow-y-auto">
              {aiResponseText}
            </div>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-3 pt-2">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={state === 'thinking' || state === 'speaking'}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition shadow-md shadow-blue-500/20 cursor-pointer flex items-center gap-2"
            >
              <span>🎙️</span> Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition shadow-md shadow-red-500/20 cursor-pointer flex items-center gap-2 animate-pulse"
            >
              <span>⏹️</span> Stop Recording
            </button>
          )}

          <button
            onClick={handleSendQuery}
            disabled={!transcript.trim() || isRecording || state === 'thinking' || state === 'speaking'}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-semibold text-xs transition shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-2"
          >
            <span>Send to CORON</span>
            <span>↑</span>
          </button>
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 font-medium pb-2">
        CORON Cloud Voice • Universal Audio Streaming • Works on all devices without language packs
      </div>
    </div>
  );
};