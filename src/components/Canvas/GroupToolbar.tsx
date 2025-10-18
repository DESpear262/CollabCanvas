/*
  File: GroupToolbar.tsx
  Overview: East-pinned toolbar listing groups and exposing Group/Regroup/Ungroup
  actions based on current object selection and active group.
*/
import React from 'react';
import { useLayout } from '../../context/LayoutContext';

export type GroupToolbarProps = {
  groups: Array<{ id: string; children: Array<{ id: string; kind: 'rect' | 'circle' | 'text' }>; z: number; name: string }>;
  idToGroup: Record<string, string | undefined>;
  selectionIds: string[];
  activeGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  onGroup: () => void;
  onRegroup: () => void;
  onUngroup: () => void;
  onRename: (groupId: string, nextName: string) => void;
};

export function GroupToolbar({ groups, idToGroup, selectionIds, activeGroupId, onSelectGroup, onGroup, onRegroup, onUngroup, onRename }: GroupToolbarProps) {
  const { presenceWidth } = useLayout();
  const selection = new Set(selectionIds);
  let action: 'none' | 'group' | 'regroup' | 'ungroup' = 'none';

  if (activeGroupId) {
    action = 'ungroup';
  } else if (selection.size > 0) {
    const groupIdsInSel = new Set<string>();
    let hasUngrouped = false;
    for (const id of selection) {
      const gid = idToGroup[id];
      if (gid) groupIdsInSel.add(gid);
      else hasUngrouped = true;
    }
    // Check if selection exactly matches some group's members
    let matchesExactGroup = false;
    if (groupIdsInSel.size === 1 && !hasUngrouped) {
      const gid = [...groupIdsInSel][0];
      const g = groups.find((x) => x.id === gid);
      if (g && g.children.length === selection.size && g.children.every((c) => selection.has(c.id))) {
        matchesExactGroup = true;
      }
    }
    if (matchesExactGroup) action = 'ungroup';
    else if (selection.size >= 2 && groupIdsInSel.size === 0) action = 'group';
    else action = 'regroup';
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    right: presenceWidth + 12,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#111827',
    border: '1px solid #374151',
    padding: 8,
    borderRadius: 6,
    zIndex: 1000,
    minWidth: 220,
    maxHeight: '70vh',
    overflowY: 'auto',
    transition: 'right 200ms ease',
  };

  const btn: React.CSSProperties = {
    color: '#e5e7eb',
    background: '#1f2937',
    border: '1px solid #374151',
    padding: '6px 8px',
    borderRadius: 4,
    textAlign: 'left',
  };

  function onPrimaryButton() {
    if (action === 'group') onGroup();
    else if (action === 'regroup') onRegroup();
    else if (action === 'ungroup') onUngroup();
  }

  const label = action === 'group' ? 'Group' : action === 'regroup' ? 'Regroup' : action === 'ungroup' ? 'Ungroup' : '—';
  const disabled = action === 'none';

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Groups</div>
        <button style={{ ...btn }} disabled={disabled} onClick={onPrimaryButton}>{label}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {groups.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 12 }}>No groups</div>
        ) : (
          groups
            .slice()
            .sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))
            .map((g) => (
              <div key={g.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  style={{
                    ...btn,
                    flex: 1,
                    background: activeGroupId === g.id ? '#0b2f44' : '#1f2937',
                    borderColor: activeGroupId === g.id ? '#60a5fa' : '#374151',
                  }}
                  onClick={() => onSelectGroup(activeGroupId === g.id ? null : g.id)}
                  title={g.children.map((c) => c.id).join(', ')}
                >
                  {g.name?.trim() ? g.name : g.id}
                </button>
                <button
                  style={{ ...btn, padding: '6px 6px' }}
                  onClick={() => {
                    const current = (g.name || '').trim();
                    const next = prompt('Rename group (max 20 chars):', current) || '';
                    const trimmed = next.trim().slice(0, 20);
                    if (trimmed !== current) onRename(g.id, trimmed);
                  }}
                  title="Rename group"
                >
                  Rename
                </button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}


