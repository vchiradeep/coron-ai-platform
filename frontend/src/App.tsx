// frontend/src/App.tsx
import React, { useState, useRef, useEffect } from 'react';
import { VoiceModeOverlay } from './VoiceModeOverlay';
import AuthModal from './AuthModal';
import ProfileModal from './ProfileModal';
import { API_BASE } from './config';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  attachment?: { name: string; type: string; url: string };
  imageUrl?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export default function App() {
  const isAboutPage = new URLSearchParams(window.location.search).get('about') === 'true';

  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('coron_user'));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: '1', title: 'New Conversation', messages: [] }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('1');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'auto' | 'code' | 'deep' | 'image'>('auto');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; type: string; url: string } | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const [visibleMessageCount, setVisibleMessageCount] = useState(15);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);

  const [statLanguages, setStatLanguages] = useState(0);
  const [statSpeed, setStatSpeed] = useState(0);
  const [statPrecision, setStatPrecision] = useState(0);

  useEffect(() => {
    if (isAboutPage) {
      const interval = setInterval(() => {
        setStatLanguages((prev) => (prev < 25 ? prev + 1 : 25));
        setStatSpeed((prev) => (prev < 300 ? prev + 15 : 300));
        setStatPrecision((prev) => (prev < 99.9 ? Number((prev + 4.5).toFixed(1)) : 99.9));
      }, 40);
      return () => clearInterval(interval);
    }
  }, [isAboutPage]);

  const handleLoginSuccess = (email: string) => {
    localStorage.setItem('coron_user', email);
    setUserEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem('coron_user');
    setUserEmail(null);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const filteredSessions = sessions.filter((s) => s.title.toLowerCase().includes(chatSearchQuery.toLowerCase()));

  useEffect(() => {
    setVisibleMessageCount(15);
  }, [activeSessionId]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession.messages.length, isLoading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const { scrollTop, scrollHeight } = container;

    if (scrollTop < 40 && !isLoadingMore && visibleMessageCount < activeSession.messages.length) {
      setIsLoadingMore(true);
      prevScrollHeightRef.current = scrollHeight;

      setTimeout(() => {
        setVisibleMessageCount((prev) => Math.min(prev + 15, activeSession.messages.length));
        setIsLoadingMore(false);

        requestAnimationFrame(() => {
          if (chatContainerRef.current) {
            const newScrollHeight = chatContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
            chatContainerRef.current.scrollTop = scrollDiff;
          }
        });
      }, 300);
    }
  };

  const displayedMessages = activeSession.messages.slice(
    Math.max(0, activeSession.messages.length - visibleMessageCount)
  );

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== sessionId);
    if (updated.length === 0) {
      const fresh: ChatSession = { id: Date.now().toString(), title: 'New Conversation', messages: [] };
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(updated);
      if (activeSessionId === sessionId) {
        setActiveSessionId(updated[0].id);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        type: file.type,
        url: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const handleSendMessage = async (textToSend?: string, historyOverride?: Message[]) => {
    const promptText = textToSend !== undefined ? textToSend : input.trim();
    if ((!promptText && !attachedFile) || isLoading) return;

    const lowerPrompt = promptText.toLowerCase();

    const isExplicitImageMode = selectedMode === 'image' || lowerPrompt.startsWith('/image');
    const isAutoImageIntent = selectedMode === 'auto' && (
      lowerPrompt.startsWith('draw ') ||
      lowerPrompt.startsWith('draw me ') ||
      lowerPrompt.startsWith('generate an image') ||
      lowerPrompt.startsWith('generate a picture') ||
      lowerPrompt.startsWith('create an image') ||
      lowerPrompt.startsWith('create a picture') ||
      lowerPrompt.startsWith('paint ') ||
      lowerPrompt.startsWith('illustrate ') ||
      /\b(draw a|generate an image|create an image|generate a picture|create a picture|paint a picture)\b/i.test(lowerPrompt)
    );

    const isImageMode = isExplicitImageMode || isAutoImageIntent;

    let artPrompt = promptText;
    if (isExplicitImageMode && lowerPrompt.startsWith('/image')) {
      artPrompt = promptText.replace(/^\/image\s*/i, '');
    } else if (isAutoImageIntent) {
      artPrompt = promptText
        .replace(/^(please\s+)?(can you\s+)?(draw|generate|create|paint|illustrate|render)(\s+me)?(\s+an?|\s+the)?\s+(image|picture|artwork|photo|painting|drawing)?(\s+of)?\s*/i, '')
        .trim();
      if (!artPrompt) artPrompt = promptText;
    }

    const userMsg: Message = {
      role: 'user',
      content: promptText || (attachedFile ? `Please analyze this image: ${attachedFile.name}` : ''),
      attachment: attachedFile || undefined,
    };

    if (textToSend === undefined) {
      setInput('');
    }
    setAttachedFile(null);
    setIsLoading(true);

    const baseMessages = historyOverride !== undefined ? historyOverride : activeSession.messages;
    const updatedMessages = [...baseMessages, userMsg];
    setVisibleMessageCount((prev) => prev + 1);

    if (isImageMode) {
      const generatedImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(artPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
      
      const assistantMsg: Message = {
        role: 'assistant',
        content: `🎨 Generated artwork for: **"${artPrompt}"**`,
        imageUrl: generatedImageUrl,
      };

      const finalMessages = [...updatedMessages, assistantMsg];

      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.id !== activeSessionId) return s;
          return {
            ...s,
            title: s.messages.length === 0 ? (artPrompt.slice(0, 30) + '...') : s.title,
            messages: finalMessages,
          };
        })
      );
      setIsLoading(false);
      return;
    }

    const messagesWithPlaceholder = [...updatedMessages, { role: 'assistant' as const, content: '' }];

    setSessions((prevSessions) =>
      prevSessions.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          title: s.messages.length === 0 ? (promptText ? promptText.slice(0, 30) + '...' : 'Media Analysis') : s.title,
          messages: messagesWithPlaceholder,
        };
      })
    );

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
            attachment: m.attachment,
          })),
          mode: selectedMode,
          webSearch: webSearchEnabled,
          userEmail,
        }),
      });

      if (!response.ok) throw new Error('Failed to connect to backend server');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Stream reader unavailable');

      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataText = line.replace('data: ', '').trim();
            if (dataText === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataText);
              if (parsed.text) {
                accumulated += parsed.text;
                setSessions((prevSessions) =>
                  prevSessions.map((s) => {
                    if (s.id !== activeSessionId) return s;
                    const msgs = [...s.messages];
                    if (msgs.length > 0) {
                      msgs[msgs.length - 1] = { role: 'assistant', content: accumulated };
                    }
                    return { ...s, messages: msgs };
                  })
                );
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.id !== activeSessionId) return s;
          const msgs = [...s.messages];
          if (msgs.length > 0) {
            msgs[msgs.length - 1] = {
              role: 'assistant',
              content: '⚠️ Connection Error: Could not reach the CORON neural service.',
            };
          }
          return { ...s, messages: msgs };
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = (msgIndexReal: number) => {
    if (!editText.trim()) return;
    const previousHistory = activeSession.messages.slice(0, msgIndexReal);
    setEditingIndex(null);
    handleSendMessage(editText.trim(), previousHistory);
    setEditText('');
  };

  const parseInlineFormatting = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((seg, i) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-900">{seg.slice(2, -2)}</strong>;
      }
      if (seg.startsWith('`') && seg.endsWith('`')) {
        return <code key={i} className="px-1.5 py-0.5 rounded bg-slate-200 text-blue-700 font-mono text-xs">{seg.slice(1, -1)}</code>;
      }
      return seg;
    });
  };

  const renderUnifiedTable = (tableRows: string[][], key: string) => {
    if (tableRows.length === 0) return null;

    const header = tableRows[0];
    const bodyRows = tableRows.slice(1).filter((row) => {
      const isSeparator = row.every((cell) => cell.replace(/[-:\s]/g, '') === '');
      if (isSeparator) return false;
      const isDuplicateHeader = row.every((cell, idx) => cell.trim().toLowerCase() === header[idx]?.trim().toLowerCase());
      if (isDuplicateHeader) return false;
      return true;
    });

    return (
      <div key={key} className="my-4 overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-left border-collapse text-xs md:text-sm">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
              {header.map((th, i) => (
                <th key={i} className="px-4 py-3">{parseInlineFormatting(th)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {bodyRows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50/80 transition">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-3">{parseInlineFormatting(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFormattedContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const firstLineEnd = part.indexOf('\n');
        const language = part.slice(3, firstLineEnd).trim() || 'code';
        const codeContent = part.slice(firstLineEnd + 1, -3).trim();

        return (
          <div key={index} className="my-4 rounded-xl overflow-hidden border border-slate-700 bg-[#1e1e2e] text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#181825] border-b border-slate-800 text-xs font-mono text-slate-400">
              <span className="uppercase tracking-wider font-semibold text-blue-400">{language}</span>
              <button
                onClick={() => handleCopyText(codeContent)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-sans text-xs shadow-sm cursor-pointer"
              >
                <span>📋 Copy code</span>
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-xs md:text-sm font-mono leading-relaxed text-emerald-300 bg-[#1e1e2e]">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }

      const lines = part.split('\n');
      const renderedElements: React.ReactNode[] = [];
      let currentTableRows: string[][] = [];

      const flushTable = (keyPrefix: string) => {
        if (currentTableRows.length > 0) {
          renderedElements.push(renderUnifiedTable(currentTableRows, keyPrefix));
          currentTableRows = [];
        }
      };

      lines.forEach((line, lineIdx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
          currentTableRows.push(cells);
        } else {
          flushTable(`table-${lineIdx}`);

          if (!trimmed) {
            renderedElements.push(<div key={lineIdx} className="h-2" />);
          } else if (trimmed.startsWith('### ')) {
            renderedElements.push(<h3 key={lineIdx} className="text-base md:text-lg font-bold text-slate-900 mt-4 mb-2">{parseInlineFormatting(trimmed.replace('### ', ''))}</h3>);
          } else if (trimmed.startsWith('## ')) {
            renderedElements.push(<h2 key={lineIdx} className="text-lg md:text-xl font-bold text-slate-900 mt-5 mb-2">{parseInlineFormatting(trimmed.replace('## ', ''))}</h2>);
          } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            renderedElements.push(
              <div key={lineIdx} className="flex items-start gap-2 pl-2">
                <span className="text-blue-600 font-bold mt-0.5">•</span>
                <span className="flex-1">{parseInlineFormatting(trimmed.slice(2))}</span>
              </div>
            );
          } else if (/^\d+\.\s/.test(trimmed)) {
            const match = trimmed.match(/^(\d+)\.\s(.*)$/);
            if (match) {
              renderedElements.push(
                <div key={lineIdx} className="flex items-start gap-2 pl-2">
                  <span className="text-blue-600 font-bold shrink-0">{match[1]}.</span>
                  <span className="flex-1">{parseInlineFormatting(match[2])}</span>
                </div>
              );
            }
          } else {
            renderedElements.push(<p key={lineIdx} className="text-slate-800">{parseInlineFormatting(trimmed)}</p>);
          }
        }
      });

      flushTable('table-end');

      return <div key={index} className="space-y-2 leading-relaxed">{renderedElements}</div>;
    });
  };

  if (!userEmail) {
    return <AuthModal onLoginSuccess={handleLoginSuccess} />;
  }

  if (isAboutPage) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-white font-sans selection:bg-blue-500 selection:text-white overflow-y-auto relative">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[140px] pointer-events-none" />

        <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img src="/coron-logo.png" alt="CORON Logo" className="w-9 h-9 object-contain rounded-xl shadow-lg shadow-blue-500/30 animate-pulse" />
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              CORON
            </span>
          </div>
          <button
            onClick={() => window.close()}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition cursor-pointer shadow-lg"
          >
            Close Tab ✕
          </button>
        </header>

        {/* HERO SECTION */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold mb-6 animate-bounce">
            <span>✨</span> Next-Generation Autonomous Intelligence
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
            One AI. <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">Every Task.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed mb-12">
            CORON is an elite, multi-modal neural platform engineered to seamlessly handle deep code generation, live web research, high-end creative media, and universal multilingual voice interactions.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-4">
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl shadow-2xl relative overflow-hidden group hover:border-blue-500/50 transition">
              <div className="text-4xl md:text-5xl font-extrabold text-blue-400 mb-2 font-mono">{statLanguages}+</div>
              <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Global & Regional Languages</div>
            </div>
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl shadow-2xl relative overflow-hidden group hover:border-indigo-500/50 transition">
              <div className="text-4xl md:text-5xl font-extrabold text-indigo-400 mb-2 font-mono">{statSpeed} <span className="text-xl">tok/s</span></div>
              <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Ultra-Fast Neural Response</div>
            </div>
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl shadow-2xl relative overflow-hidden group hover:border-cyan-500/50 transition">
              <div className="text-4xl md:text-5xl font-extrabold text-cyan-400 mb-2 font-mono">{statPrecision}%</div>
              <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Contextual Reasoning Accuracy</div>
            </div>
          </div>
        </section>

        {/* CORE PLATFORM CAPABILITIES SECTION */}
        <section className="max-w-6xl mx-auto px-6 py-16 relative z-10 border-t border-slate-800/80">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Engineered for Limitless Power</h2>
            <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">Built from the ground up to empower developers, researchers, and creators with unmatched neural capabilities.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 backdrop-blur-xl hover:border-blue-500/50 transition group">
              <div className="text-3xl mb-4 p-3 bg-blue-500/10 rounded-2xl w-fit group-hover:scale-110 transition">💻</div>
              <h3 className="text-lg font-bold text-white mb-2">Autonomous Code Expert</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Generate pristine code across React, Node, TypeScript, and Python complete with formatted dark code blocks and instant copy tools.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 backdrop-blur-xl hover:border-indigo-500/50 transition group">
              <div className="text-3xl mb-4 p-3 bg-indigo-500/10 rounded-2xl w-fit group-hover:scale-110 transition">🔍</div>
              <h3 className="text-lg font-bold text-white mb-2">Live Web Research</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Toggle live web search grounding powered by Tavily to retrieve real-time facts, documentation, and web data instantly.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 backdrop-blur-xl hover:border-cyan-500/50 transition group">
              <div className="text-3xl mb-4 p-3 bg-cyan-500/10 rounded-2xl w-fit group-hover:scale-110 transition">🎨</div>
              <h3 className="text-lg font-bold text-white mb-2">Neural Image Studio</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Generate 4K creative artwork, design prototypes, and visual assets seamlessly through intuitive prompt commands.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 backdrop-blur-xl hover:border-violet-500/50 transition group">
              <div className="text-3xl mb-4 p-3 bg-violet-500/10 rounded-2xl w-fit group-hover:scale-110 transition">🎙️</div>
              <h3 className="text-lg font-bold text-white mb-2">Live Voice Mode</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Experience immersive, hands-free multilingual speech interactions with synthesized neural voice feedback.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 backdrop-blur-xl hover:border-emerald-500/50 transition group">
              <div className="text-3xl mb-4 p-3 bg-emerald-500/10 rounded-2xl w-fit group-hover:scale-110 transition">⚡</div>
              <h3 className="text-lg font-bold text-white mb-2">Streaming Chat Engine</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Experience blazing fast token streaming with markdown tables, rich inline formatting, and infinite chat history.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 backdrop-blur-xl hover:border-amber-500/50 transition group">
              <div className="text-3xl mb-4 p-3 bg-amber-500/10 rounded-2xl w-fit group-hover:scale-110 transition">🔒</div>
              <h3 className="text-lg font-bold text-white mb-2">Enterprise Security</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Secured with Firebase Auth, Firestore encrypted storage, and robust CORS token validation protocols.</p>
            </div>
          </div>
        </section>

        {/* ARCHITECTURE SECTION */}
        <section className="max-w-5xl mx-auto px-6 py-16 relative z-10 border-t border-slate-800/80 mb-12">
          <div className="p-10 rounded-3xl bg-gradient-to-r from-blue-900/20 via-indigo-900/20 to-slate-900/40 border border-slate-800 backdrop-blur-xl text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold mb-4">Ready to Experience CORON?</h2>
            <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto mb-8">Jump back into your workspace and start building, researching, and creating with your personal AI assistant.</p>
            <button
              onClick={() => window.close()}
              className="px-8 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition cursor-pointer"
            >
              Return to Workspace →
            </button>
          </div>
        </section>

        <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500 font-medium relative z-10">
          CORON – One AI. Every Task • Powered by Autonomous Neural Engine
        </footer>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-gradient-to-br from-blue-100 via-white to-orange-100 text-slate-900 font-sans flex z-0 select-none">
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-orange-400/20 blur-3xl pointer-events-none" />

      {/* SIDEBAR */}
      <aside
        className={`h-full bg-white/90 backdrop-blur-xl border-r border-slate-200/80 shadow-xl flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden z-20 ${
          sidebarOpen ? 'w-72' : 'w-0 border-r-0'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-200/50 flex-shrink-0 w-72">
          <div className="flex items-center gap-3">
            <img src="/coron-logo.png" alt="CORON Logo" className="w-8 h-8 object-contain rounded-lg shadow-sm" />
            <div className="flex flex-col">
              <span className="font-extrabold text-slate-900 tracking-tight text-sm">CORON</span>
              <span className="text-[10px] text-slate-500 font-medium">One AI. Every Task</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            title="Close Sidebar"
          >
            ✕
          </button>
        </div>

        <div className="p-3 flex-shrink-0 w-72 space-y-2.5">
          <button
            onClick={handleNewChat}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>+</span> New chat
          </button>

          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-slate-100/90 text-slate-800 placeholder-slate-400 text-xs rounded-xl pl-8 pr-3 py-2 border border-slate-200 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 w-72">
          <div className="text-xs font-semibold text-slate-400 px-3 mb-2 tracking-wider uppercase">Recent Chats</div>
          {filteredSessions.length === 0 ? (
            <div className="text-xs text-slate-400 px-3 py-2">No matching chats found</div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition cursor-pointer ${
                  session.id === activeSessionId
                    ? 'bg-blue-500/10 text-blue-700 font-medium border border-blue-200'
                    : 'text-slate-600 hover:bg-white/60'
                }`}
              >
                <span className="truncate flex-1">{session.title}</span>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1 rounded transition"
                  title="Delete chat"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200/50 flex items-center justify-between bg-white/40 backdrop-blur-md flex-shrink-0 w-72">
          <div 
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-3 truncate cursor-pointer group flex-1"
            title="Open Profile"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center font-bold justify-center text-white text-xs shadow-md group-hover:scale-105 transition">
              {userEmail[0].toUpperCase()}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-xs font-semibold text-slate-800 truncate group-hover:text-blue-600 transition">{userEmail}</span>
              <span className="text-[10px] text-blue-600 font-semibold">View Profile ⚙️</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg transition text-xs font-medium cursor-pointer"
            title="Sign Out"
          >
            🚪
          </button>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden relative z-10 bg-transparent">
        
        <header className="h-14 flex-shrink-0 z-30 flex items-center justify-between px-4 md:px-6 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                title="Open Sidebar"
              >
                ☰
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <img src="/coron-logo.png" alt="CORON Logo" className="w-6 h-6 object-contain" />
              <div className="flex items-baseline gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-sm">CORON</span>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">| One AI. Every Task</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.open(window.location.origin + window.location.pathname + '?about=true', '_blank')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-md shadow-blue-500/20 transition cursor-pointer animate-pulse"
              title="Learn about CORON"
            >
              <span>✨</span>
              <span className="hidden sm:inline">What is CORON</span>
            </button>

            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              title="Open Live Voice Mode"
            >
              <span>🎙️</span>
              <span className="hidden sm:inline">Voice Mode</span>
            </button>

            <button
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer shadow-sm ${
                webSearchEnabled
                  ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20'
                  : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title="Toggle Live Web Search Grounding"
            >
              <span>🔍</span>
              <span className="hidden sm:inline">Web Search: {webSearchEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </header>

        {/* CHAT CONTAINER */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0 relative px-4 md:px-12 py-6 space-y-6"
          style={{ willChange: 'scroll-position' }}
        >
          {activeSession.messages.length === 0 ? (
            <div className="max-w-6xl mx-auto flex flex-col items-start justify-start pt-8 space-y-8 px-2">
              <div className="flex items-center gap-4">
                <img src="/coron-logo.png" alt="CORON Logo" className="w-14 h-14 object-contain drop-shadow-md" />
                <div>
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">CORON</h1>
                  <p className="text-sm md:text-base font-medium text-slate-600">One AI. Every Task.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full pt-2">
                <button
                  onClick={() => {
                    setInput('Write a clean TypeScript React component for a dashboard stats card');
                    handleSendMessage();
                  }}
                  className="p-6 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white/90 hover:border-blue-300 text-left transition shadow-lg shadow-blue-500/5 flex flex-col gap-2 group cursor-pointer"
                >
                  <span className="text-blue-600 text-lg p-2 rounded-xl bg-blue-500/10 w-fit group-hover:scale-110 transition">💻</span>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition">Write Code</span>
                  <span className="text-xs text-slate-500">Generate code with dark blocks</span>
                </button>

                <button
                  onClick={() => {
                    setInput('Draw a futuristic cyberpunk floating city at sunset in 4k resolution');
                    handleSendMessage();
                  }}
                  className="p-6 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white/90 hover:border-indigo-300 text-left transition shadow-lg shadow-blue-500/5 flex flex-col gap-2 group cursor-pointer"
                >
                  <span className="text-indigo-600 text-lg p-2 rounded-xl bg-indigo-500/10 w-fit group-hover:scale-110 transition">🎨</span>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition">Generate Artwork</span>
                  <span className="text-xs text-slate-500">Create AI images instantly</span>
                </button>

                <button
                  onClick={() => {
                    setInput('Hello! Give me a quick overview of what you can do.');
                    handleSendMessage();
                  }}
                  className="p-6 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white/90 hover:border-orange-300 text-left transition shadow-lg shadow-orange-500/5 flex flex-col gap-2 group cursor-pointer"
                >
                  <span className="text-orange-600 text-lg p-2 rounded-xl bg-orange-500/10 w-fit group-hover:scale-110 transition">⚡</span>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-orange-600 transition">Fast Chat</span>
                  <span className="text-xs text-slate-500">Lightning-fast contextual memory</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-6">
              {isLoadingMore && (
                <div className="text-center py-2">
                  <span className="inline-block px-3 py-1 bg-white/85 backdrop-blur-md rounded-full shadow-sm text-xs font-medium text-slate-500 animate-pulse">
                    Loading previous messages...
                  </span>
                </div>
              )}
              {displayedMessages.map((msg, idx) => {
                const realIndex = activeSession.messages.length - displayedMessages.length + idx;
                const isEditing = editingIndex === realIndex;

                return (
                  <div key={realIndex} className={`flex gap-3 md:gap-4 group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 mt-1 shadow-md shadow-blue-500/30">
                        C
                      </div>
                    )}
                    <div
                      className={`max-w-[92%] md:max-w-5xl px-6 py-4 rounded-2xl text-sm shadow-md relative ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none shadow-blue-500/25'
                          : 'bg-white/95 backdrop-blur-xl text-slate-800 border border-white rounded-bl-none shadow-slate-200/60 w-full'
                      }`}
                    >
                      {msg.attachment && msg.attachment.type.startsWith('image/') && (
                        <div className="mb-3">
                          <img src={msg.attachment.url} alt="Uploaded attachment" className="max-h-60 rounded-xl object-contain border border-white/20 shadow-sm" />
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-3">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-900 text-white p-3 rounded-xl text-sm focus:outline-none border border-slate-700"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(realIndex)}
                              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer"
                            >
                              Save & Submit
                            </button>
                            <button
                              onClick={() => setEditingIndex(null)}
                              className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : msg.imageUrl ? (
                        <div className="space-y-3">
                          <p className="font-medium text-slate-800">{parseInlineFormatting(msg.content)}</p>
                          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xl bg-slate-900 inline-block">
                            <img src={msg.imageUrl} alt="Generated AI Artwork" className="max-h-[450px] w-auto object-contain mx-auto" />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <a
                              href={msg.imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>📥</span> Download Image
                            </a>
                          </div>
                        </div>
                      ) : msg.content ? (
                        renderFormattedContent(msg.content)
                      ) : (
                        <span className="animate-pulse text-slate-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                          CORON is thinking...
                        </span>
                      )}

                      {!isEditing && msg.content && (
                        <div className={`absolute -bottom-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm text-xs ${msg.role === 'user' ? 'left-2' : 'right-2'}`}>
                          <button
                            onClick={() => handleCopyText(msg.content)}
                            className="text-slate-600 hover:text-blue-600 transition cursor-pointer font-medium flex items-center gap-1"
                            title="Copy message"
                          >
                            <span>📋</span> Copy
                          </button>
                          {msg.role === 'user' && (
                            <button
                              onClick={() => {
                                setEditingIndex(realIndex);
                                setEditText(msg.content);
                              }}
                              className="text-slate-600 hover:text-indigo-600 transition cursor-pointer font-medium flex items-center gap-1 border-l border-slate-200 pl-2"
                              title="Edit message"
                            >
                              <span>✏️</span> Edit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* INPUT BOX */}
        <div className="flex-shrink-0 z-30 p-4 bg-gradient-to-t from-white/95 via-white/60 to-transparent backdrop-blur-md">
          <div className="max-w-6xl mx-auto bg-white/95 backdrop-blur-2xl border border-white rounded-2xl shadow-xl shadow-blue-500/10 p-3.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200/50 transition">
            {attachedFile && (
              <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
                <div className="flex items-center gap-2 truncate">
                  {attachedFile.type.startsWith('image/') && <img src={attachedFile.url} alt="preview" className="w-6 h-6 object-cover rounded" />}
                  <span className="truncate">📎 Attached: {attachedFile.name}</span>
                </div>
                <button onClick={() => setAttachedFile(null)} className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer">✕</button>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.ts,.js,.py"
            />

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask CORON anything, upload media, or request code..."
              rows={2}
              className="w-full bg-transparent text-slate-900 placeholder-slate-400 text-sm focus:outline-none resize-none px-2"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 px-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition text-xs flex items-center gap-1.5 font-medium cursor-pointer"
                  title="Upload image or file"
                >
                  <span>📎</span> <span className="hidden sm:inline">Attach Media</span>
                </button>

                <select
                  value={selectedMode}
                  onChange={(e: any) => setSelectedMode(e.target.value)}
                  className="bg-slate-100/90 backdrop-blur-md text-slate-700 text-xs rounded-xl px-3 py-2 border border-slate-200 focus:outline-none cursor-pointer font-medium"
                >
                  <option value="auto">🤖 Auto Router</option>
                  <option value="code">💻 Code Expert</option>
                  <option value="deep">🧠 Deep Reasoning</option>
                  <option value="image">🎨 Image Generator</option>
                </select>
              </div>

              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || (!input.trim() && !attachedFile)}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white font-medium px-5 py-2.5 rounded-xl text-xs transition shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Send</span>
                <span>↑</span>
              </button>
            </div>
          </div>
          <div className="text-center text-[11px] text-slate-500 pt-2 font-medium">
            CORON – One AI. Every Task • Powered by Autonomous Neural Engine
          </div>
        </div>

      </div>

      <VoiceModeOverlay
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        webSearchEnabled={webSearchEnabled}
        userEmail={userEmail}
      />

      {isProfileModalOpen && (
        <ProfileModal email={userEmail} onClose={() => setIsProfileModalOpen(false)} />
      )}
    </div>
  );
}