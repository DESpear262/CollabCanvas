/*
  File: useAuth.ts
  Overview: React hook that exposes Firebase auth user and loading status.
  Behavior:
    - Subscribes to auth state changes.
    - On sign-in, initializes a presence record with a null cursor.
*/
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChanged } from '../services/auth.ts';
import { updateCursorPresence } from '../services/presence';

/**
 * useAuth
 * Returns the current Firebase user and a loading flag while the initial auth check resolves.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChanged((u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Ensure a presence document exists immediately on sign-in
        updateCursorPresence({ uid: u.uid, email: u.email, displayName: u.displayName, cursor: null }).catch((e) => {
          console.error('[presence] init failed', e);
        });
      }
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}


