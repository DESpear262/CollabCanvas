import { signOut } from '../../services/auth';
import { useAuth } from '../../hooks/useAuth';
import { useTool } from '../../context/ToolContext';

export function Header() {
  const { user } = useAuth();
  const { tool, setTool } = useTool();
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
      <strong>CollabCanvas</strong>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}>
          <button onClick={() => setTool('pan')} style={{ padding: '6px 8px', background: tool === 'pan' ? '#1f2937' : '#111827', color: 'white' }}>1 Pan</button>
          <button onClick={() => setTool('rect')} style={{ padding: '6px 8px', background: tool === 'rect' ? '#1f2937' : '#111827', color: 'white' }}>2 Rect</button>
          <button onClick={() => setTool('erase')} style={{ padding: '6px 8px', background: tool === 'erase' ? '#1f2937' : '#111827', color: 'white' }}>5 Erase</button>
        </div>
        <span style={{ color: '#555' }}>{user?.email ?? 'Signed in'}</span>
        <button onClick={() => signOut()}>Sign out</button>
      </div>
    </header>
  );
}
