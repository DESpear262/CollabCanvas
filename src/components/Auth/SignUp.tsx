/*
  File: SignUp.tsx
  Overview: Wraps `AuthForm` to create a new user account.
*/
import { AuthForm } from './AuthForm.tsx';
import { signUpWithEmailAndPassword } from '../../services/auth.ts';

export function SignUp() {
  async function handleSignUp(email: string, password: string) {
    await signUpWithEmailAndPassword(email, password);
  }
  return <AuthForm mode="signup" onSubmit={handleSignUp} />;
}


