/*
  File: ChatMessage.tsx
  Overview: Presentational bubble for a chat message with role-aware styling.
*/
import React from 'react';

export type ChatRole = 'user' | 'ai';

type Props = {
  role: ChatRole;
  text: string;
};

export function ChatMessage({ role, text }: Props) {
  const isUser = role === 'user';
  const bubbleStyle: React.CSSProperties = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '80%',
    padding: '8px 10px',
    borderRadius: 8,
    color: '#e5e7eb',
    background: isUser ? '#2563eb' : '#374151',
    border: isUser ? '1px solid #1d4ed8' : '1px solid #4b5563',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  const label = isUser ? 'You' : 'AI';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', alignSelf: isUser ? 'flex-end' : 'flex-start' }}>{label}</div>
      <div style={bubbleStyle}>{text}</div>
    </div>
  );
}


