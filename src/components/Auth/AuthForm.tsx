/*
  File: AuthForm.tsx
  Overview: Shared form component used for Login and SignUp flows.
*/
import { useState } from 'react';

type Props = {
  mode: 'login' | 'signup';
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function AuthForm({ mode, onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 360, margin: '40px auto' }}>
      <h2 style={{ marginBottom: 16 }}>{mode === 'login' ? 'Log in' : 'Sign up'}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <div>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          <div>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        {error && (
          <div style={{ color: 'crimson', fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>
    </form>
  );
}


