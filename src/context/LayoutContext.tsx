/*
  File: LayoutContext.tsx
  Overview: Provides layout state for UI chrome (presence toolbar collapsed/width) and a hotkey.
*/
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type LayoutContextValue = {
  presenceCollapsed: boolean;
  presenceWidth: number; // current effective width in px
  togglePresenceCollapsed: () => void;
};

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 280;

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [presenceCollapsed, setPresenceCollapsed] = useState<boolean>(false);

  const togglePresenceCollapsed = useCallback(() => {
    setPresenceCollapsed((v) => !v);
  }, []);

  // Global hotkey: Ctrl+P toggles presence toolbar
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        togglePresenceCollapsed();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePresenceCollapsed]);

  const presenceWidth = presenceCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const value = useMemo<LayoutContextValue>(() => ({
    presenceCollapsed,
    presenceWidth,
    togglePresenceCollapsed,
  }), [presenceCollapsed, presenceWidth, togglePresenceCollapsed]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}

export const PRESENCE_COLLAPSED_WIDTH = COLLAPSED_WIDTH;
export const PRESENCE_EXPANDED_WIDTH = EXPANDED_WIDTH;


