/*
  File: AuthForm.tsx
  Overview: Shared form component used for Login and SignUp flows.
*/
import { useState } from 'react';
import { mapFirebaseError } from './errorMap';
import { requestPasswordReset } from '../../services/auth';

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
      setError(mapFirebaseError(err?.message ?? ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email to reset your password.');
      return;
    }
    try {
      setSubmitting(true);
      await requestPasswordReset(email);
      // Show lightweight success message inline
      setError(null);
      alert('If an account exists for that email, a reset link has been sent.');
    } catch (err: any) {
      // Firebase resolves even for unknown emails; show generic success, but if
      // an error occurs (e.g., invalid email), map it.
      setError(mapFirebaseError(err?.message ?? ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 360, margin: '0 auto' }}>
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
        {mode === 'login' && (
          <button type="button" onClick={handleForgotPassword} disabled={submitting} style={{ padding: 8, background: 'transparent', textDecoration: 'underline' }}>
            Forgot password?
          </button>
        )}
        {error && (
          <div style={{ color: 'crimson', fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>
    </form>
  );
}


