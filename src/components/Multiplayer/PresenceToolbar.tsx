/*
  File: PresenceToolbar.tsx
  Overview: Right-side presence toolbar with collapse, search, sort, and offline list.
  Behavior:
    - Overlays on top of canvas; default expanded; collapsed width 56px.
    - Search (Enter to apply) filters by substring of display name/email/uid.
    - Sort by alphabetical or recent activity (lastSeen desc for online; name for offline).
*/
import React, { useEffect, useMemo, useState } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { useLayout } from '../../context/LayoutContext';

function initialsOf(name?: string | null, email?: string | null): string {
  const base = name || email || '';
  const parts = base.split(/\s|@/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return letters || 'U';
}

type SortMode = 'alpha' | 'recent';

export function PresenceToolbar() {
  const { presenceWidth, presenceCollapsed, togglePresenceCollapsed } = useLayout();
  const { online, inactive, offline } = usePresence() as any;
  const [headerHeight, setHeaderHeight] = useState<number>(90);

  useEffect(() => {
    function measure() {
      // Measure the header element height to align presence top to its bottom
      const header = document.querySelector('.cc-header') as HTMLElement | null;
      const h = header ? header.getBoundingClientRect().height : 90;
      setHeaderHeight(Math.max(60, Math.min(160, Math.round(h))));
    }
    measure();
    const ro = new ResizeObserver(() => measure());
    const header = document.querySelector('.cc-header') as HTMLElement | null;
    if (header) ro.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, []);

  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');

  function applyQuery(e: React.FormEvent) {
    e.preventDefault();
    setAppliedQuery(query.trim());
  }

  const filteredOnline = useMemo(() => {
    const list = [...online];
    // apply search
    const q = appliedQuery.toLowerCase();
    const searched = q
      ? list.filter((u: any) => {
          const name = (u.displayName || u.email || u.uid || '').toLowerCase();
          return name.includes(q);
        })
      : list;
    if (sortMode === 'alpha') {
      return searched.sort((a: any, b: any) =>
        (a.displayName || a.email || a.uid || '').localeCompare(b.displayName || b.email || b.uid || '')
      );
    }
    // recent: lastSeen desc
    return searched.sort((a: any, b: any) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }, [online, appliedQuery, sortMode]);

  const filteredInactive = useMemo(() => {
    const list = [...inactive];
    const q = appliedQuery.toLowerCase();
    const searched = q
      ? list.filter((u: any) => {
          const name = (u.displayName || u.email || u.uid || '').toLowerCase();
          return name.includes(q);
        })
      : list;
    // inactive sorted by lastSeen desc (most recent first)
    return searched.sort((a: any, b: any) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }, [inactive, appliedQuery]);

  const filteredOffline = useMemo(() => {
    const list = [...offline];
    const q = appliedQuery.toLowerCase();
    const searched = q
      ? list.filter((u: any) => {
          const name = (u.displayName || u.email || u.uid || '').toLowerCase();
          return name.includes(q);
        })
      : list;
    // offline sorted alpha always
    return searched.sort((a: any, b: any) =>
      (a.displayName || a.email || a.uid || '').localeCompare(b.displayName || b.email || b.uid || '')
    );
  }, [offline, appliedQuery]);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: headerHeight,
    right: 0,
    bottom: 12,
    width: presenceWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#0b1220',
    borderLeft: '1px solid #1f2937',
    padding: 10,
    zIndex: 1000,
    transition: 'width 200ms ease',
    overflow: 'hidden',
  };

  const btn: React.CSSProperties = {
    color: '#e5e7eb',
    background: '#1f2937',
    border: '1px solid #374151',
    padding: '6px 8px',
    borderRadius: 4,
  };

  return (
    <aside style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            aria-label={presenceCollapsed ? 'Expand presence' : 'Collapse presence'}
            title={presenceCollapsed ? 'Expand (Ctrl+P)' : 'Collapse (Ctrl+P)'}
            style={btn}
            onClick={togglePresenceCollapsed}
          >
            {presenceCollapsed ? '«' : '»'}
          </button>
          {!presenceCollapsed && (
            <div style={{ color: '#9ca3af', fontSize: 12 }}>
              Online ({filteredOnline.length})
            </div>
          )}
        </div>
        {!presenceCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{ ...btn, padding: '6px 6px' }}
              title="Sort"
            >
              <option value="recent">recent</option>
              <option value="alpha">alpha</option>
            </select>
            <form onSubmit={applyQuery}>
              <input
                placeholder="search… (Enter)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  background: '#0b1220',
                  border: '1px solid #374151',
                  color: '#e5e7eb',
                  padding: '6px 8px',
                  borderRadius: 4,
                  width: 140,
                }}
              />
            </form>
          </div>
        )}
      </div>

      {!presenceCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredOnline.map((u: any) => (
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
          {filteredInactive.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, margin: '6px 0' }}>Inactive ({filteredInactive.length})</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredInactive.map((u: any) => (
                  <li key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.9 }}>
                    <div style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'grid', placeItems: 'center', fontSize: 12 }}>
                      {initialsOf(u.displayName, u.email)}
                      <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', border: '2px solid white' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14 }}>{u.displayName || u.email || u.uid}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>inactive</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filteredOffline.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, margin: '6px 0' }}>Offline ({filteredOffline.length})</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredOffline.map((u: any) => (
                  <li key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
                    <div style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'grid', placeItems: 'center', fontSize: 12 }}>
                      {initialsOf(u.displayName, u.email)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14 }}>{u.displayName || u.email || u.uid}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>offline</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}


