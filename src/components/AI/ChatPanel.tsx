/*
  File: ChatPanel.tsx
  Overview: Floating chat panel that lets the user send AI prompts and displays responses.
  Usage: Included in `App.tsx`. Uses `useAI` hook to route and execute prompts.
*/

import { useState } from 'react';
import { ChatInput } from './ChatInput';
import { ChatMessage, type ChatRole } from './ChatMessage';
import { useAI } from '../../hooks/useAI';

type Msg = { role: ChatRole; text: string };

export function ChatPanel() {
  const { sendPrompt, loading, error } = useAI();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);

  async function handleSend(text: string) {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    const reply = await sendPrompt(text);
    if (reply) setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
  }

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: open ? 360 : 44, pointerEvents: 'auto', zIndex: 1200 }}>
      <div style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#0b1220', borderBottom: '1px solid #1f2937' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>AI</div>
          <button onClick={() => setOpen(!open)} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>{open ? '—' : 'AI'}</button>
        </div>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: 260, overflowY: 'auto', padding: 2, background: '#0f172a', border: '1px solid #1f2937', borderRadius: 6 }}>
              {messages.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>Ask the AI to add, move, resize, delete or recolor shapes. It can also chat.</div>
              )}
              {messages.map((m, i) => (
                <ChatMessage key={i} role={m.role} text={m.text} />
              ))}
              {loading && <div style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>Working…</div>}
              {error && <div style={{ color: '#ef4444', fontSize: 12, padding: 8 }}>Error: {error}</div>}
            </div>
            <ChatInput onSend={handleSend} />
          </div>
        )}
      </div>
    </div>
  );
}


