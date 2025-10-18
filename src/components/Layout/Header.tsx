/*
  File: Header.tsx
  Overview: Top navigation bar containing tool controls, color palette, and session actions.
*/
import { signOut } from '../../services/auth';
import { clearCanvas } from '../../services/canvas';
import { useAuth } from '../../hooks/useAuth';
import { useTool } from '../../context/ToolContext';
import ConnectionStatus from './ConnectionStatus';
import { Hand, Square, Circle as LucideCircle, Type, Eraser, MousePointer, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HsvColorPicker } from 'react-colorful';
import type { HsvColor } from 'react-colorful';

export function Header() {
  const { user } = useAuth();
  const { tool, setTool, recentColors, setActiveColor } = useTool() as any;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempColor, setTempColor] = useState<HsvColor>(hexToHsv(recentColors?.[0] || '#3b82f6'));
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!pickerOpen) return;
      const el = popoverRef.current;
      if (el && !el.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
      <strong>CollabCanvas</strong>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', position: 'relative' }}>
        {/* Palette opener to the left of swatches */}
        <div style={{ position: 'relative' }}>
          <button title="Pick a color" onClick={() => { setTempColor(hexToHsv(recentColors?.[0] || '#3b82f6')); setPickerOpen((o) => !o); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px' }}>
            <Palette size={16} />
          </button>
          {pickerOpen && (
            <div ref={popoverRef} style={{ position: 'absolute', top: '120%', left: 0, background: '#0b1220', border: '1px solid #374151', borderRadius: 8, padding: 12, zIndex: 2000, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ width: 180 }}>
                    <HsvColorPicker color={tempColor} onChange={setTempColor} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #e5e7eb', background: hsvToHex(tempColor) }} />
                    <span style={{ color: '#e5e7eb', fontSize: 12 }}>{hsvToHex(tempColor)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <button onClick={() => setPickerOpen(false)} style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>Cancel</button>
                  <button onClick={() => { setActiveColor(hsvToHex(tempColor)); setPickerOpen(false); }} style={{ background: '#2563eb', color: 'white', border: '1px solid #1d4ed8', borderRadius: 6, padding: '6px 10px' }}>Confirm</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {recentColors.map((c: string) => (
            <button key={c} onClick={() => setActiveColor(c)} style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #e5e7eb', background: c }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', background: '#111827' }}>
          <button title="Select" onClick={() => setTool('select')} style={{ padding: '6px 8px', background: tool === 'select' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MousePointer size={16} />
            1
          </button>
          <button title="Transform (pan/rotate/resize)" onClick={() => setTool('pan')} style={{ padding: '6px 8px', background: tool === 'pan' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hand size={16} />
            2
          </button>
          <button onClick={() => setTool('rect')} style={{ padding: '6px 8px', background: tool === 'rect' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Square size={16} />
            3
          </button>
          <button onClick={() => setTool('circle')} style={{ padding: '6px 8px', background: tool === 'circle' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LucideCircle size={16} />
            4
          </button>
          <button onClick={() => setTool('text')} style={{ padding: '6px 8px', background: tool === 'text' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Type size={16} />
            5
          </button>
          <button onClick={() => setTool('erase')} style={{ padding: '6px 8px', background: tool === 'erase' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Eraser size={16} />
            6
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#555' }}>{user?.email ?? 'Signed in'}</span>
          {user ? <ConnectionStatus /> : null}
        </div>
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

// --- Color conversion helpers ---
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}
function hsvToHex(hsv: HsvColor): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(r, g, b);
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 59, g: 130, b: 246 }; // default #3b82f6
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(Math.round(r))}${to2(Math.round(g))}${to2(Math.round(b))}`;
}
function rgbToHsv(r: number, g: number, b: number): HsvColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h: h * 360, s, v } as HsvColor;
}
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360; // normalize
  s = clamp01(s); v = clamp01(v);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; bp = 0; }
  else if (h < 120) { rp = x; gp = c; bp = 0; }
  else if (h < 180) { rp = 0; gp = c; bp = x; }
  else if (h < 240) { rp = 0; gp = x; bp = c; }
  else if (h < 300) { rp = x; gp = 0; bp = c; }
  else { rp = c; gp = 0; bp = x; }
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}
