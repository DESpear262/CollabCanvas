/*
  File: Header.tsx
  Overview: Top navigation bar containing tool controls, color palette, and session actions.
*/
import { signOut } from '../../services/auth';
import { clearCanvas } from '../../services/canvas';
import { useAuth } from '../../hooks/useAuth';
import { useTool } from '../../context/ToolContext';
import ConnectionStatus from './ConnectionStatus';
import { ExportDialog } from './ExportDialog';
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
  const [exportOpen, setExportOpen] = useState(false);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const clusterRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const swatchesRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [stackCenter, setStackCenter] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!pickerOpen) return;
      const el = popoverRef.current;
      if (el && !el.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  useEffect(() => {
    // Prevent thrashing near the breakpoint by introducing hysteresis
    // and throttling measurements with rAF to coalesce layout passes.
    const HYSTERESIS = 24; // px buffer required to flip states
    let rafId: number | null = null;

    function measureNow() {
      const available = centerRef.current?.getBoundingClientRect().width || 0;
      // Measure natural width of palette + swatches (avoid 100% width when stacked)
      const paletteW = paletteRef.current?.getBoundingClientRect().width || 0;
      const swatchesW = swatchesRef.current?.getBoundingClientRect().width || 0;
      const clusterW = paletteW + (paletteW && swatchesW ? 12 : 0) + swatchesW; // include gap when both exist
      const toolbarW = toolbarRef.current?.getBoundingClientRect().width || 0;
      const needed = clusterW + 12 + toolbarW; // gap ~12px

      const delta = needed - available;
      setStackCenter((prev) => {
        if (!prev) {
          // Was unstacked; require positive margin to stack
          return delta > HYSTERESIS ? true : prev;
        }
        // Was stacked; require negative margin (extra space) to unstack
        return delta < -HYSTERESIS ? false : prev;
      });
    }

    function scheduleMeasure() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measureNow();
      });
    }

    // Initial measurement
    measureNow();

    const ro = new ResizeObserver(() => scheduleMeasure());
    const elements = [leftRef.current, rightRef.current, centerRef.current, clusterRef.current, paletteRef.current, swatchesRef.current, toolbarRef.current].filter(Boolean) as Element[];
    elements.forEach((el) => ro.observe(el));
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);
  return (
    <header className="cc-header" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: 12, padding: 12, borderBottom: '1px solid #eee' }}>
      {/* Left: brand only */}
      <div ref={leftRef} className="cc-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto', minWidth: 0 }}>
        <div className="cc-brand" style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
          <strong>CollabCanvas</strong>
        </div>
      </div>
      {/* Middle: toolbar (stays on row 1; color tucks under at narrow) */}
      <div ref={centerRef} className={`cc-center${stackCenter ? ' cc-center-stacked' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', minWidth: 280 }}>
        {/* Color cluster to the left of the toolbar */}
        <div ref={clusterRef} className="cc-toolcluster" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div ref={paletteRef} className="cc-color-palette" style={{ position: 'relative' }}>
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
          <div ref={swatchesRef} className="cc-swatches" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {recentColors.map((c: string) => (
              <button key={c} onClick={() => setActiveColor(c)} style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #e5e7eb', background: c }} />
            ))}
          </div>
        </div>
        <div ref={toolbarRef} className="cc-toolbar" style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', background: '#111827' }}>
          <button title="Select" onClick={() => setTool('select')} style={{ padding: '6px 8px', background: tool === 'select' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MousePointer size={16} />
            <span className="cc-tool-label">1</span>
          </button>
          <button title="Transform (pan/rotate/resize)" onClick={() => setTool('pan')} style={{ padding: '6px 8px', background: tool === 'pan' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hand size={16} />
            <span className="cc-tool-label">2</span>
          </button>
          <button onClick={() => setTool('rect')} style={{ padding: '6px 8px', background: tool === 'rect' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Square size={16} />
            <span className="cc-tool-label">3</span>
          </button>
          <button onClick={() => setTool('circle')} style={{ padding: '6px 8px', background: tool === 'circle' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LucideCircle size={16} />
            <span className="cc-tool-label">4</span>
          </button>
          <button onClick={() => setTool('text')} style={{ padding: '6px 8px', background: tool === 'text' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Type size={16} />
            <span className="cc-tool-label">5</span>
          </button>
          <button onClick={() => setTool('erase')} style={{ padding: '6px 8px', background: tool === 'erase' ? '#1f2937' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Eraser size={16} />
            <span className="cc-tool-label">6</span>
          </button>
        </div>
      </div>
      {/* Right: user info and actions */}
      <div ref={rightRef} className="cc-right" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', minWidth: 0 }}>
        <div className="cc-user" style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="cc-email" style={{ color: '#555' }}>{user?.email ?? 'Signed in'}</span>
          {user ? <ConnectionStatus /> : null}
        </div>
        <div className="cc-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => {
            if (!confirm('Clear the canvas for all users? This cannot be undone.')) return;
            try {
              await clearCanvas();
            } catch (e) {
              console.error('Failed to clear canvas', e);
            }
          }}>Clear</button>
          <button onClick={() => setExportOpen(true)}>Export</button>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
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
  const s = max === 0 ? 0 : (d / max);
  const v = max;
  // react-colorful expects s and v in [0,100]
  return { h: h * 360, s: s * 100, v: v * 100 } as HsvColor;
}
function hsvToRgb(h: number, sPercent: number, vPercent: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360; // normalize
  // convert from percent [0,100] to [0,1]
  const s = clamp01(sPercent / 100);
  const v = clamp01(vPercent / 100);
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
