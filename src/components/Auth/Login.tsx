/*
  File: Login.tsx
  Overview: Wraps `AuthForm` to sign in an existing user.
*/
import { AuthForm } from './AuthForm.tsx';
import { signInWithEmailAndPasswordFn } from '../../services/auth.ts';

export function Login() {
  async function handleLogin(email: string, password: string) {
    await signInWithEmailAndPasswordFn(email, password);
  }
  return <AuthForm mode="login" onSubmit={handleLogin} />;
}


