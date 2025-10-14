import { useAuth } from './hooks/useAuth.ts';
import { Login } from './components/Auth/Login.tsx';
import { SignUp } from './components/Auth/SignUp.tsx';
import './style.css';
import { useEffect, useState } from 'react';
import { Header } from './components/Layout/Header.tsx';
import { CursorLayer } from './components/Multiplayer/CursorLayer.tsx';
import { clearPresence, bindOnDisconnect } from './services/presence';
import { auth } from './services/firebase';

export default function App() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

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
    <div>
      <Header />
      <CursorLayer />
    </div>
  );
}


