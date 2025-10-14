import { signOut } from '../../services/auth';
import { useAuth } from '../../hooks/useAuth';

export function Header() {
  const { user } = useAuth();
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
      <strong>CollabCanvas</strong>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: '#555' }}>{user?.email ?? 'Signed in'}</span>
        <button onClick={() => signOut()}>Sign out</button>
      </div>
    </header>
  );
}
