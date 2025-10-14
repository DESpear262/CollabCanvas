import { useCallback, useState, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';
import { Rectangle } from './Rectangle';
import { Circle } from './Circle';
import { TextBox } from './TextBox';
import { loadCanvas, saveCanvas, subscribeCanvas, getClientId } from '../../services/canvas';
import { useState as useReactState } from 'react';
import { DEFAULT_RECT_FILL } from '../../utils/constants';
import { generateId } from '../../utils/helpers';
import { useTool } from '../../context/ToolContext';
import { Transformer } from 'react-konva';
import { useRef } from 'react';

const WORLD_SIZE = 5000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

export function Canvas() {
  const { containerRef, setTransform } = useCanvasTransform();
  const { tool, activeColor } = useTool() as any;
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rects, setRects] = useReactState<Array<{ id: string; x: number; y: number; width: number; height: number; fill: string }>>([]);
  const [circles, setCircles] = useReactState<Array<{ id: string; cx: number; cy: number; radius: number; fill: string }>>([]);
  const [texts, setTexts] = useReactState<Array<{ id: string; x: number; y: number; width: number; text: string; fill: string }>>([]);
  const isDraggingRef = useRef(false);
  // Firestore sync guards
  const hydratedRef = useRef(false); // becomes true after first load/snapshot
  const applyingRemoteRef = useRef(false); // true while applying remote snapshot (prevent echo saves)
  const [draft, setDraft] = useReactState<null | { id: string; x0: number; y0: number; x: number; y: number }>(null);
  const [selectedId, setSelectedId] = useReactState<string | null>(null);
  const [selectedKind, setSelectedKind] = useReactState<'rect' | 'circle' | 'text' | null>(null);
  const trRef = useRef<any>(null);
  // Load and subscribe on mount
  useEffect(() => {
    (async () => {
      const initial = await loadCanvas();
      if (initial) {
        applyingRemoteRef.current = true;
        setRects(initial.rects);
        setCircles(initial.circles);
        setTexts(initial.texts);
        applyingRemoteRef.current = false;
      }
      hydratedRef.current = true;
    })();
    const unsub = subscribeCanvas(({ state, client }) => {
      // Avoid echoing our own writes
      if (client && client === getClientId()) return;
      applyingRemoteRef.current = true;
      setRects(state.rects);
      setCircles(state.circles);
      setTexts(state.texts);
      applyingRemoteRef.current = false;
      hydratedRef.current = true;
    });
    return () => unsub();
  }, []);

  // Debounce save on local changes
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!hydratedRef.current) return; // don't save before initial load
      if (applyingRemoteRef.current) return; // don't save while applying remote updates
      void saveCanvas({ rects, circles, texts });
    }, 300);
    return () => window.clearTimeout(id);
  }, [rects, circles, texts]);
  useEffect(() => {
    if (tool !== 'select' || !trRef.current) return;
    const stage = trRef.current.getStage?.();
    if (!stage) return;
    const node = selectedId ? stage.findOne((n: any) => n?.attrs?.name === selectedId) : null;
    trRef.current.nodes(node ? [node] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [tool, selectedId, rects, circles, texts]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stage.batchDraw();
    setScale(newScale);
    setPosition(newPos);
    setTransform({ scale: newScale, position: newPos });
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <Stage
        width={window.innerWidth}
        height={window.innerHeight - 60}
        draggable={tool === 'pan'}
        dragDistance={5}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onDragStart={(e) => {
          if (tool === 'pan' && e.target === e.currentTarget) {
            // only when the Stage itself begins dragging
            isDraggingRef.current = true;
          }
        }}
        onDragEnd={(e) => {
          if (tool === 'pan' && e.target === e.currentTarget) {
            isDraggingRef.current = false;
            const next = { x: e.target.x(), y: e.target.y() };
            setPosition(next);
            setTransform({ scale, position: next });
          }
        }}
        onMouseDown={(e) => {
          isDraggingRef.current = false;
          if (tool === 'select') return;
          if (tool !== 'rect' && tool !== 'circle' && tool !== 'text') return;
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const x0 = (p.x - position.x) / scale;
          const y0 = (p.y - position.y) / scale;
          setDraft({ id: generateId(tool), x0, y0, x: x0, y: y0 });
        }}
        onMouseMove={(e) => {
          if (tool !== 'rect' && tool !== 'circle' && tool !== 'text') return;
          if (!draft) return;
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const xw = (p.x - position.x) / scale;
          const yw = (p.y - position.y) / scale;
          setDraft({ ...draft, x: xw, y: yw });
        }}
        onMouseUp={(e) => {
          if (tool === 'rect' || tool === 'circle' || tool === 'text') {
            const d = draft;
            setDraft(null);
            if (!d) return;
            const x = Math.min(d.x0, d.x);
            const y = Math.min(d.y0, d.y);
            const width = Math.max(1, Math.abs(d.x - d.x0));
            const height = Math.max(1, Math.abs(d.y - d.y0));
            if (tool === 'rect') {
              setRects((prev) => [...prev, { id: d.id, x, y, width, height, fill: activeColor || DEFAULT_RECT_FILL }]);
            } else if (tool === 'circle') {
              const size = Math.max(width, height); // preserve 1:1
              const cx = x + size / 2;
              const cy = y + size / 2;
              setCircles((prev) => [...prev, { id: d.id, cx, cy, radius: size / 2, fill: activeColor || DEFAULT_RECT_FILL }]);
            } else if (tool === 'text') {
              setTexts((prev) => [...prev, { id: d.id, x, y, width, text: 'Text', fill: activeColor || '#ffffff' }]);
            }
            return;
          }
          if (tool === 'erase') {
            const stage = e.target.getStage();
            const p = stage?.getPointerPosition();
            if (!p || !stage) return;
            const shape = stage.getIntersection(p);
            if (!shape) return;
            // Walk up to a node with a name (we set name=id on shapes/groups)
            let node: any = shape;
            while (node && !node.name() && node.getParent()) node = node.getParent();
            const targetId: string | undefined = node?.name();
            if (!targetId) return;
            setRects((prev) => prev.filter((r) => r.id !== targetId));
            setCircles((prev) => prev.filter((c) => c.id !== targetId));
            setTexts((prev) => prev.filter((t) => t.id !== targetId));
          }
        }}
      >
        <Layer
          onClick={(e) => {
            if (tool !== 'select') return;
            const stage = e.target.getStage();
            const emptyClick = e.target === e.currentTarget || e.target === stage;
            if (emptyClick) {
              setSelectedId(null);
              setSelectedKind(null);
              trRef.current?.nodes([]);
              trRef.current?.getLayer()?.batchDraw();
              return;
            }
            // Walk up from clicked node to find the first ancestor with a name (our Group/shape root)
            let node: any = e.target;
            while (node && !node?.attrs?.name && node !== stage) node = node.getParent();
            const id = node?.attrs?.name as string | undefined;
            if (!id) return;
            if (rects.find((r) => r.id === id)) setSelectedKind('rect');
            else if (circles.find((c) => c.id === id)) setSelectedKind('circle');
            else if (texts.find((t) => t.id === id)) setSelectedKind('text');
            setSelectedId(id);
          }}
        >
          <Rect x={0} y={0} width={WORLD_SIZE} height={WORLD_SIZE} fill={'#111827'} />
          {rects.map((r) => (
            <Rectangle key={r.id} {...r} draggable={tool === 'pan' || tool === 'select'} onDragEnd={(pos) => {
              setRects((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...pos } : x)));
            }} />
          ))}
          {circles.map((c) => (
            <Circle key={c.id} id={c.id} x={c.cx} y={c.cy} radius={c.radius} fill={c.fill} draggable={tool === 'pan' || tool === 'select'} onDragEnd={(pos) => {
              setCircles((prev) => prev.map((x) => (x.id === c.id ? { ...x, cx: pos.x, cy: pos.y } : x)));
            }} />
          ))}
          {texts.map((t) => (
            <TextBox key={t.id} id={t.id} x={t.x} y={t.y} width={t.width} text={t.text} fill={t.fill} draggable={tool === 'pan' || tool === 'select'} onDragEnd={(pos) => {
              setTexts((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...pos } : x)));
            }} onMeasured={() => { /* no-op: child measures itself */ }} />
          ))}
          {tool === 'select' && selectedId && (
            <Transformer
              ref={trRef}
              anchorSize={8}
              rotateEnabled={false}
              enabledAnchors={selectedKind === 'circle' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : ['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right']}
              boundBoxFunc={(_, newBox) => {
                if (selectedKind === 'circle') {
                  const size = Math.max(newBox.width, newBox.height);
                  return { ...newBox, width: size, height: size };
                }
                return newBox;
              }}
              onTransform={() => {
                // Live preview for text boxes: reflow text instead of scaling glyphs
                if (selectedKind !== 'text') return;
                const stage = trRef.current?.getStage?.();
                const node = stage?.findOne((n: any) => n?.attrs?.name === selectedId);
                if (!node) return;
                const textNode = node.findOne('Text');
                const rectNode = node.findOne('Rect');
                if (!textNode || !rectNode) return;
                const newWidth = Math.max(20, textNode.width() * node.scaleX());
                textNode.width(newWidth);
                // Reset scale so text isn't stretched during drag
                node.scaleX(1);
                node.scaleY(1);
                // Update dotted rect to wrap text height
                const padding = 6;
                rectNode.width(newWidth);
                rectNode.height((textNode.height?.() || 14) + padding * 2);
                rectNode.getLayer()?.batchDraw();
              }}
              onTransformEnd={() => {
                const stage = trRef.current?.getStage?.();
                const node = stage?.findOne((n: any) => n.attrs?.name === selectedId);
                if (!node) return;
                const id = selectedId as string;
                if (selectedKind === 'rect') {
                  const current = rects.find((r) => r.id === id);
                  const w = Math.max(1, (current?.width ?? node.width()) * node.scaleX());
                  const h = Math.max(1, (current?.height ?? node.height()) * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  setRects((prev) => prev.map((r) => (r.id === id ? { ...r, x: node.x(), y: node.y(), width: w, height: h } : r)));
                } else if (selectedKind === 'circle') {
                  const current = circles.find((c) => c.id === id);
                  const radius = Math.max(1, (current?.radius ?? node.radius?.() ?? node.width() / 2) * node.scaleX());
                  node.scale({ x: 1, y: 1 });
                  setCircles((prev) => prev.map((c) => (c.id === id ? { ...c, cx: node.x(), cy: node.y(), radius } : c)));
                } else if (selectedKind === 'text') {
                  // Use transformed bounding box to derive new position/width, then reset scale to avoid glyph stretching
                  const bb = node.getClientRect();
                  node.scale({ x: 1, y: 1 });
                  setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, x: bb.x, y: bb.y, width: Math.max(20, bb.width) } : t)));
                }
              }}
            />
          )}
          {/* Draft preview */}
          {(tool === 'rect' || tool === 'circle' || tool === 'text') && draft && (
            (() => {
              const d = draft!;
              const x = Math.min(d.x0, d.x);
              const y = Math.min(d.y0, d.y);
              const width = Math.max(1, Math.abs(d.x - d.x0));
              const height = Math.max(1, Math.abs(d.y - d.y0));
              if (tool === 'rect') return <Rect x={x} y={y} width={width} height={height} fill={DEFAULT_RECT_FILL} />;
              if (tool === 'circle') {
                const size = Math.max(width, height);
                const cx = x + size / 2;
                const cy = y + size / 2;
                return <Circle id={d.id} x={cx} y={cy} radius={size / 2} fill={DEFAULT_RECT_FILL} />;
              }
              if (tool === 'text') return <TextBox id={d.id} x={x} y={y} width={width} text={'Text'} fill={'#ffffff'} />;
              return null;
            })()
          )}
        </Layer>
      </Stage>
    </div>
  );
}


