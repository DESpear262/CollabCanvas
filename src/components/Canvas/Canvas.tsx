import { useCallback, useState } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';
import { Rectangle } from './Rectangle';
import { useState as useReactState } from 'react';
import { DEFAULT_RECT_FILL } from '../../utils/constants';
import { generateId } from '../../utils/helpers';
import { useTool } from '../../context/ToolContext';
import { useRef } from 'react';

const WORLD_SIZE = 5000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

export function Canvas() {
  const { containerRef, setTransform } = useCanvasTransform();
  const { tool } = useTool();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rects, setRects] = useReactState<Array<{ id: string; x: number; y: number; width: number; height: number; fill: string }>>([]);
  const isDraggingRef = useRef(false);
  const [draft, setDraft] = useReactState<null | { id: string; x0: number; y0: number; x: number; y: number }>(null);

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
          if (tool !== 'rect') return;
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const x0 = (p.x - position.x) / scale;
          const y0 = (p.y - position.y) / scale;
          setDraft({ id: generateId('rect'), x0, y0, x: x0, y: y0 });
        }}
        onMouseMove={(e) => {
          if (tool !== 'rect') return;
          if (!draft) return;
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const xw = (p.x - position.x) / scale;
          const yw = (p.y - position.y) / scale;
          setDraft({ ...draft, x: xw, y: yw });
        }}
        onMouseUp={(e) => {
          if (tool === 'rect') {
            const d = draft;
            setDraft(null);
            if (!d) return;
            const x = Math.min(d.x0, d.x);
            const y = Math.min(d.y0, d.y);
            const width = Math.max(1, Math.abs(d.x - d.x0));
            const height = Math.max(1, Math.abs(d.y - d.y0));
            setRects((prev) => [...prev, { id: d.id, x, y, width, height, fill: DEFAULT_RECT_FILL }]);
            return;
          }
          if (tool === 'erase') {
            const stage = e.target.getStage();
            const p = stage?.getPointerPosition();
            if (!p) return;
            const xw = (p.x - position.x) / scale;
            const yw = (p.y - position.y) / scale;
            setRects((prev) => prev.filter((r) => !(xw >= r.x && xw <= r.x + r.width && yw >= r.y && yw <= r.y + r.height)));
          }
        }}
      >
        <Layer>
          <Rect x={0} y={0} width={WORLD_SIZE} height={WORLD_SIZE} fill={'#111827'} />
          {rects.map((r) => (
            <Rectangle key={r.id} {...r} draggable={tool === 'pan'} onDragEnd={(pos) => {
              setRects((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...pos } : x)));
            }} />
          ))}
          {/* Draft preview */}
          {tool === 'rect' && draft && (
            (() => {
              const d = draft!;
              const x = Math.min(d.x0, d.x);
              const y = Math.min(d.y0, d.y);
              const width = Math.max(1, Math.abs(d.x - d.x0));
              const height = Math.max(1, Math.abs(d.y - d.y0));
              return <Rect x={x} y={y} width={width} height={height} fill={DEFAULT_RECT_FILL} />;
            })()
          )}
        </Layer>
      </Stage>
    </div>
  );
}


