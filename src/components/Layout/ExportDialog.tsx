/*
  File: ExportDialog.tsx
  Overview: Modal dialog to choose PNG export options and trigger download via CanvasExportContext.
*/
import { useEffect, useMemo, useState } from 'react';
import { useCanvasExport, type ExportScope } from '../../context/CanvasExportContext';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ExportDialog({ open, onClose }: Props) {
  const { exportPNG, getEstimatedPixelSize } = useCanvasExport();
  const [scope, setScope] = useState<ExportScope>('viewport');
  const [includeOverlays, setIncludeOverlays] = useState(false);
  const [fileName, setFileName] = useState<string>(() => defaultFileName());

  useEffect(() => {
    if (open) setFileName(defaultFileName());
  }, [open]);

  const size = useMemo(() => getEstimatedPixelSize(scope), [scope, getEstimatedPixelSize]);

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, background: '#0b1220', border: '1px solid #374151', borderRadius: 10, padding: 16, color: '#e5e7eb', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Export PNG</h3>
          <button onClick={onClose} style={{ background: 'transparent', color: '#9ca3af', border: 'none' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Scope</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as ExportScope)} style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px' }}>
              <option value="viewport">Visible viewport</option>
              <option value="world">Entire world (5000×5000)</option>
              <option value="content">Tight bounds of all content</option>
              <option value="selection">Current selection only</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={includeOverlays} onChange={(e) => setIncludeOverlays(e.target.checked)} />
            <span>Include overlays (selection frames, transformer, guides)</span>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Filename</span>
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="collabcanvas-YYYYMMDD-HHMMSS.png" style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px' }} />
          </label>
          <div style={{ color: '#fbbf24', fontSize: 12 }}>
            {size ? `Estimated size: ${size.width} × ${size.height} px` : 'Size not available'}
          </div>
          <div style={{ color: '#f59e0b', fontSize: 12 }}>
            Large exports may stall slower devices. We’ll proceed without constraining size.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>Cancel</button>
          <button onClick={async () => { await exportPNG({ scope, fileName: ensurePNG(fileName), includeOverlays }); onClose(); }} style={{ background: '#2563eb', color: 'white', border: '1px solid #1d4ed8', borderRadius: 6, padding: '6px 10px' }}>Export</button>
        </div>
      </div>
    </div>
  );
}

function defaultFileName() {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `collabcanvas-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
}

function ensurePNG(name: string) {
  name = (name || '').trim();
  if (!name.toLowerCase().endsWith('.png')) return `${name}.png`;
  return name;
}


