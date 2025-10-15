/*
  File: ChatInput.tsx
  Overview: Text input and submit button for sending chat messages.
*/
import { useState } from 'react';

type Props = {
  onSend: (text: string) => void;
};

export function ChatInput({ onSend }: Props) {
  const [value, setValue] = useState('');

  function send() {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue('');
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send();
        }}
        placeholder="Type a message..."
        style={{
          flex: 1,
          background: '#111827',
          color: '#e5e7eb',
          border: '1px solid #374151',
          borderRadius: 6,
          padding: '8px 10px',
        }}
      />
      <button onClick={send} style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: '1px solid #1d4ed8', borderRadius: 6 }}>
        Send
      </button>
    </div>
  );
}


