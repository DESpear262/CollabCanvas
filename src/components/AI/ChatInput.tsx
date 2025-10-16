/*
  File: ChatInput.tsx
  Overview: Text input and submit button for sending chat messages.
*/
import { useRef, useState } from 'react';

type Props = {
  onSend: (text: string) => void;
};

export function ChatInput({ onSend }: Props) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function send() {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue('');
    if (taRef.current) {
      taRef.current.style.height = 'auto';
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          // auto-grow up to a cap for readability
          const el = taRef.current;
          if (el) {
            el.style.height = 'auto';
            const next = Math.min(120, el.scrollHeight);
            el.style.height = next + 'px';
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        placeholder="Type a message… (Shift+Enter for newline)"
        style={{
          flex: 1,
          background: '#111827',
          color: '#e5e7eb',
          border: '1px solid #374151',
          borderRadius: 6,
          padding: '8px 10px',
          resize: 'none',
          lineHeight: '1.3',
          overflowY: 'auto',
        }}
      />
      <button onClick={send} style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: '1px solid #1d4ed8', borderRadius: 6 }}>
        Send
      </button>
    </div>
  );
}


