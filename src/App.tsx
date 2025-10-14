import { useAuth } from './hooks/useAuth.ts';
import { Login } from './components/Auth/Login.tsx';
import { SignUp } from './components/Auth/SignUp.tsx';
import './style.css';
import { useState } from 'react';
import { Header } from './components/Layout/Header.tsx';

export default function App() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

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
      <div style={{ padding: 24 }}>
        <p>You're signed in. Next, we'll add canvas and presence.</p>
      </div>
    </div>
  );
}


