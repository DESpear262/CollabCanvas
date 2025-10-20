/*
  File: App.tsx
  Overview: Top-level application component that gates auth and assembles providers and layout.
*/
import { useAuth } from './hooks/useAuth.ts';
import { AuthShell } from './components/Auth/AuthShell';
import './style.css';
import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Layout/Header.tsx';
import { CursorLayer } from './components/Multiplayer/CursorLayer.tsx';
import { PresenceToolbar } from './components/Multiplayer/PresenceToolbar.tsx';
import { useHeartbeat } from './hooks/useHeartbeat';
import { Canvas } from './components/Canvas/Canvas.tsx';
import { CanvasTransformProvider } from './context/CanvasTransformContext';
import { SelectionProvider } from './context/SelectionContext';
import { ToolProvider } from './context/ToolContext';
import { HistoryProvider } from './hooks/useHistory';
import { clearPresence, bindOnDisconnect } from './services/presence';
import { auth } from './services/firebase';
import { ChatPanel } from './components/AI/ChatPanel.tsx';
import { LayoutProvider } from './context/LayoutContext';
import { CanvasExportProvider } from './context/CanvasExportContext';

export default function App() {
  const { user, loading } = useAuth();
  useHeartbeat(5000);

  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(60);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const u = auth.currentUser;
      if (u) {
        // Best-effort: mark cursor as null on unload
        void clearPresence(u.uid);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (user) {
      bindOnDisconnect(user.uid);
    }
  }, [user]);

  useEffect(() => {
    function measureHeader() {
      const h = headerRef.current?.getBoundingClientRect().height || 60;
      setHeaderHeight(h);
    }
    measureHeader();
    const ro = new ResizeObserver(() => measureHeader());
    if (headerRef.current) ro.observe(headerRef.current);
    window.addEventListener('resize', measureHeader);
    return () => {
      window.removeEventListener('resize', measureHeader);
      ro.disconnect();
    };
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!user) {
    return <AuthShell />;
  }

  return (
    <ToolProvider>
      <HistoryProvider>
        <LayoutProvider>
          <CanvasExportProvider>
            <div>
              <div ref={headerRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100 }}>
                <Header />
              </div>
              <CanvasTransformProvider>
                <SelectionProvider>
                  <div style={{ position: 'relative', height: '100vh', paddingTop: headerHeight }}>
                    <Canvas headerHeight={headerHeight} />
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      <CursorLayer />
                    </div>
                    <PresenceToolbar />
                    <ChatPanel />
                  </div>
                </SelectionProvider>
              </CanvasTransformProvider>
            </div>
          </CanvasExportProvider>
        </LayoutProvider>
      </HistoryProvider>
    </ToolProvider>
  );
}


