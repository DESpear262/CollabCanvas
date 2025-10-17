/*
  File: SelectionToolbar.tsx
  Overview: West-pinned selection toolbar supporting primary mode (point/rect/lasso)
  and boolean mode (new/union/intersect/difference). Exposes imperative callbacks
  to update modes and shows a selected-count chip when >1 are selected.
*/
import React from 'react';

export type PrimarySelectMode = 'point' | 'rect' | 'lasso';
export type BooleanSelectMode = 'new' | 'union' | 'intersect' | 'difference';

type Props = {
  primary: PrimarySelectMode;
  booleanMode: BooleanSelectMode;
  onPrimaryChange: (m: PrimarySelectMode) => void;
  onBooleanChange: (m: BooleanSelectMode) => void;
  selectedCount: number;
};

const pillStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #374151',
  background: '#1f2937',
  color: '#e5e7eb',
  cursor: 'pointer',
};

function Button({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...pillStyle, background: active ? '#374151' : '#1f2937' }}>{children}</button>
  );
}

export function SelectionToolbar({ primary, booleanMode, onPrimaryChange, onBooleanChange, selectedCount }: Props) {
  return (
    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 10, background: '#111827', border: '1px solid #374151', padding: 10, borderRadius: 8, zIndex: 30, boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Select</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button active={primary === 'point'} onClick={() => onPrimaryChange('point')}>point</Button>
          <Button active={primary === 'rect'} onClick={() => onPrimaryChange('rect')}>rect</Button>
          <Button active={primary === 'lasso'} onClick={() => onPrimaryChange('lasso')}>lasso</Button>
        </div>
      </div>
      <div style={{ height: 1, background: '#374151', margin: '6px 0' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Boolean</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button active={booleanMode === 'new'} onClick={() => onBooleanChange('new')}>new</Button>
          <Button active={booleanMode === 'union'} onClick={() => onBooleanChange('union')}>union</Button>
          <Button active={booleanMode === 'intersect'} onClick={() => onBooleanChange('intersect')}>intersect</Button>
          <Button active={booleanMode === 'difference'} onClick={() => onBooleanChange('difference')}>diff</Button>
        </div>
      </div>
      {selectedCount > 1 && (
        <div style={{ alignSelf: 'flex-start', ...pillStyle, background: '#0b1220', borderColor: '#2563eb' }}>selected: {selectedCount}</div>
      )}
      <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>Shift: cycle select • Tab: cycle boolean</div>
    </div>
  );
}



