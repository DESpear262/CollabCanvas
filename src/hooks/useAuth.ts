import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChanged } from '../services/auth.ts';
import { updateCursorPresence } from '../services/presence';

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


