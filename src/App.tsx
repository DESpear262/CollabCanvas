/*
  File: App.tsx
  Overview: Top-level application component that gates auth and assembles providers and layout.
*/
import { useAuth } from './hooks/useAuth.ts';
import { Login } from './components/Auth/Login.tsx';
import { SignUp } from './components/Auth/SignUp.tsx';
import './style.css';
import { useEffect, useState } from 'react';
import { Header } from './components/Layout/Header.tsx';
import { CursorLayer } from './components/Multiplayer/CursorLayer.tsx';
import { PresenceList } from './components/Multiplayer/PresenceList.tsx';
import { useHeartbeat } from './hooks/useHeartbeat';
import { Canvas } from './components/Canvas/Canvas.tsx';
import { CanvasTransformProvider } from './context/CanvasTransformContext';
import { SelectionProvider } from './context/SelectionContext';
import { ToolProvider } from './context/ToolContext';
import { clearPresence, bindOnDisconnect } from './services/presence';
import { auth } from './services/firebase';
import { ChatPanel } from './components/AI/ChatPanel.tsx';

export default function App() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  useHeartbeat(5000);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const u = auth.currentUser;
      if (u) {
        // Best-effort: mark cursor as null on unload
        void clearPresence(u.uid);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (user) {
      bindOnDisconnect(user.uid);
    }
  }, [user]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setMode('login')}>Log in</button>
          <button onClick={() => setMode('signup')}>Sign up</button>
        </div>
        {mode === 'login' ? <Login /> : <SignUp />}
      </div>
    );
  }

  return (
    <ToolProvider>
      <div>
        <Header />
        <CanvasTransformProvider>
          <SelectionProvider>
            <div style={{ position: 'relative', height: 'calc(100vh - 60px)' }}>
              <Canvas />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <CursorLayer />
              </div>
              <div style={{ position: 'fixed', top: 90, right: 12, zIndex: 1000 }}>
                <PresenceList />
              </div>
              <ChatPanel />
            </div>
          </SelectionProvider>
        </CanvasTransformProvider>
      </div>
    </ToolProvider>
  );
}


