import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';
import type { User, Unsubscribe } from 'firebase/auth';
import { auth } from './firebase';

export type AuthStateChangeHandler = (user: User | null) => void;

export async function signUpWithEmailAndPassword(email: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  return user;
}

export async function signInWithEmailAndPasswordFn(email: string, password: string): Promise<User> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChanged(handler: AuthStateChangeHandler): Unsubscribe {
  return firebaseOnAuthStateChanged(auth, handler);
}


