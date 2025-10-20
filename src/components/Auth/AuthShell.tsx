/*
  File: AuthShell.tsx
  Overview: Centered auth card wrapper with simple tabs for login/signup and app title.
*/
import { useState } from 'react';
import { Login } from './Login';
import { SignUp } from './SignUp';

export function AuthShell() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>CollabCanvas</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setMode('login')} aria-pressed={mode === 'login'}>Log in</button>
          <button onClick={() => setMode('signup')} aria-pressed={mode === 'signup'}>Sign up</button>
        </div>
        {mode === 'login' ? <Login /> : <SignUp />}
      </div>
    </div>
  );
}


