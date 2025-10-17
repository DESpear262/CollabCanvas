/*
  File: Header.tsx
  Overview: Top navigation bar containing tool controls, color palette, and session actions.
*/
import { signOut } from '../../services/auth';
import { clearCanvas } from '../../services/canvas';
import { useAuth } from '../../hooks/useAuth';
import { useTool } from '../../context/ToolContext';

export function Header() {
  const { user } = useAuth();
  const { tool, setTool, recentColors, setActiveColor } = useTool() as any;
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
      <strong>CollabCanvas</strong>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {recentColors.map((c: string) => (
            <button key={c} onClick={() => setActiveColor(c)} style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #e5e7eb', background: c }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}>
          <button title="Transform (pan/rotate/resize)" onClick={() => setTool('pan')} style={{ padding: '6px 8px', background: tool === 'pan' ? '#1f2937' : '#111827', color: 'white' }}>1 Transform</button>
          <button onClick={() => setTool('rect')} style={{ padding: '6px 8px', background: tool === 'rect' ? '#1f2937' : '#111827', color: 'white' }}>2 Rect</button>
          <button onClick={() => setTool('circle')} style={{ padding: '6px 8px', background: tool === 'circle' ? '#1f2937' : '#111827', color: 'white' }}>3 Circle</button>
          <button onClick={() => setTool('text')} style={{ padding: '6px 8px', background: tool === 'text' ? '#1f2937' : '#111827', color: 'white' }}>4 Text</button>
          <button onClick={() => setTool('erase')} style={{ padding: '6px 8px', background: tool === 'erase' ? '#1f2937' : '#111827', color: 'white' }}>5 Erase</button>
          <button onClick={() => setTool('select')} style={{ padding: '6px 8px', background: tool === 'select' ? '#1f2937' : '#111827', color: 'white' }}>6 Select</button>
        </div>
        <span style={{ color: '#555' }}>{user?.email ?? 'Signed in'}</span>
        <button onClick={async () => {
          if (!confirm('Clear the canvas for all users? This cannot be undone.')) return;
          try {
            await clearCanvas();
          } catch (e) {
            console.error('Failed to clear canvas', e);
          }
        }}>Clear</button>
        <button onClick={() => signOut()}>Sign out</button>
      </div>
    </header>
  );
}
