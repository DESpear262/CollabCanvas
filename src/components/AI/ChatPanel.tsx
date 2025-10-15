/*
  File: ChatPanel.tsx
  Overview: Bottom-right pinned chat window with history and input.
  Behavior:
    - Maintains in-memory message list
    - On send, adds user message and a static AI reply for testing
*/
import React, { useMemo, useState } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatRole } from './ChatMessage';
import { useAI } from '../../hooks/useAI';
import { ChatInput } from './ChatInput';

type Message = { id: string; role: ChatRole; text: string };
type ProgressEvent = { kind: 'start' | 'success' | 'error'; label: string };

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [minimized, setMinimized] = useState(false);
  const { sendPrompt, loading, error } = useAI();
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'fixed',
      right: 12,
      bottom: 12,
      width: minimized ? 180 : 340,
      height: minimized ? 48 : 320,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: 8,
      padding: minimized ? 8 : 10,
      boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
      zIndex: 1001,
    }),
    [minimized]
  );

  const listStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingRight: 4,
  };

  async function handleSend(text: string) {
    const uid = genId();
    setMessages((prev) => [...prev, { id: uid, role: 'user', text }]);
    setProgress([]);
    const originalConsole = { log: console.log };
    // Lightweight tap to capture runPlan logs and mirror into progress list
    console.log = (...args: any[]) => {
      try {
        const line = String(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
        if (line.includes('runPlan step start')) setProgress((p) => [...p, { kind: 'start', label: line }]);
        if (line.includes('runPlan step success')) setProgress((p) => [...p, { kind: 'success', label: line }]);
        if (line.includes('runPlan step error')) setProgress((p) => [...p, { kind: 'error', label: line }]);
      } catch {}
      originalConsole.log.apply(console, args as any);
    };
    const reply = await sendPrompt(text);
    console.log = originalConsole.log;
    const aid = genId();
    setMessages((prev): Message[] => [...prev, { id: aid, role: 'ai', text: reply || (error ? `Error: ${error}` : 'No response') }]);
  }

  return (
    <div style={containerStyle}>
      {!minimized && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            AI Chat (Preview)
            {loading && (
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 12, border: '2px solid #93c5fd', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            )}
          </div>
          <button
            onClick={() => {
              setMinimized(true);
            }}
            title={'Minimize chat'}
            style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
          >
            Minimize
          </button>
        </div>
      )}
      {minimized && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}>
          <button
            onClick={() => {
              setMinimized(false);
            }}
            title={'Open chat'}
            style={{ width: '100%', background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            Open Chat
            {loading && (
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 12, border: '2px solid #93c5fd', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            )}
          </button>
        </div>
      )}
      {!minimized && (
        <>
          {progress.length > 0 && (
            <div style={{ maxHeight: 80, overflowY: 'auto', fontSize: 11, color: '#9ca3af', border: '1px dashed #374151', borderRadius: 6, padding: 6 }}>
              {progress.map((p, idx) => (
                <div key={idx} style={{ color: p.kind === 'error' ? '#f87171' : p.kind === 'success' ? '#10b981' : '#93c5fd' }}>{p.label}</div>
              ))}
            </div>
          )}
          <div style={listStyle}>
            {messages.map((m) => (
              <ChatMessage key={m.id} role={m.role} text={m.text} />
            ))}
          </div>
          <div style={{ opacity: loading ? 0.7 : 1 }}>
            <ChatInput onSend={handleSend} />
          </div>
        </>
      )}
      {/* No unread badge; minimized shows spinner while awaiting reply */}
      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}


