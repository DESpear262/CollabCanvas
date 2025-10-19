/*
  File: auth.ts
  Overview: Thin wrappers around Firebase Auth for sign-up, sign-in, sign-out and auth state listener.
  Notes:
    - On sign-out, we attempt to remove presence before terminating the session.
*/
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';
import type { User, Unsubscribe } from 'firebase/auth';
import { auth, db } from './firebase';
import { removePresence } from './presence';
import { doc, setDoc } from 'firebase/firestore';
import { upsertPresenceRosterUser } from './presence';

export type AuthStateChangeHandler = (user: User | null) => void;

/** Create a new user using email/password credentials. */
export async function signUpWithEmailAndPassword(email: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  // Persist minimal user profile in Firestore for durability
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: user.email ?? email,
    displayName: user.displayName ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, { merge: true });
  // Upsert into Firestore presence roster for PresenceList
  await upsertPresenceRosterUser({
    uid: user.uid,
    email: user.email ?? email,
    displayName: user.displayName ?? null,
  });
  return user;
}

/** Sign an existing user in with email/password. */
export async function signInWithEmailAndPasswordFn(email: string, password: string): Promise<User> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
}

/**
 * Sign out the current user.
 * Best-effort: remove their presence record prior to terminating the auth session.
 */
export async function signOut(): Promise<void> {
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Best-effort: remove presence before signing out
      await removePresence(uid);
    }
  } finally {
    await firebaseSignOut(auth);
  }
}

/** Subscribe to auth state changes; returns an unsubscribe function. */
export function onAuthChanged(handler: AuthStateChangeHandler): Unsubscribe {
  return firebaseOnAuthStateChanged(auth, handler);
}


