import { AuthForm } from './AuthForm.tsx';
import { signUpWithEmailAndPassword } from '../../services/auth.ts';

export function SignUp() {
  async function handleSignUp(email: string, password: string) {
    await signUpWithEmailAndPassword(email, password);
  }
  return <AuthForm mode="signup" onSubmit={handleSignUp} />;
}


