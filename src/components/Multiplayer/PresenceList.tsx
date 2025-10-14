import { usePresence } from '../../hooks/usePresence';

function initialsOf(name?: string | null, email?: string | null): string {
  const base = name || email || '';
  const parts = base.split(/\s|@/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return letters || 'U';
}

export function PresenceList() {
  const { others } = usePresence();
  const online = others.filter((u: any) => u.online);
  const offline = others.filter((u: any) => !u.online);

  return (
    <aside style={{ padding: 12, borderLeft: '1px solid #eee', width: 240 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Online ({online.length})</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {online.map((u) => (
          <li key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'grid', placeItems: 'center', fontSize: 12 }}>
              {initialsOf(u.displayName, u.email)}
              <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: '50%', background: '#10b981', border: '2px solid white' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14 }}>{u.displayName || u.email || u.uid}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>online</span>
            </div>
          </li>
        ))}
      </ul>
      {offline.length > 0 && (
        <>
          <div style={{ fontWeight: 600, margin: '12px 0 8px' }}>Offline ({offline.length})</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {offline.map((u) => (
              <li key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
                <div style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'grid', placeItems: 'center', fontSize: 12 }}>
                  {initialsOf(u.displayName, u.email)}
                  <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: '50%', background: '#ef4444', border: '2px solid white' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14 }}>{u.displayName || u.email || u.uid}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>offline</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}


