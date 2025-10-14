import { useCallback, useState } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';

const WORLD_SIZE = 5000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

export function Canvas() {
  const { containerRef, setTransform } = useCanvasTransform();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

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
        draggable
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onDragEnd={(e) => {
          const next = { x: e.target.x(), y: e.target.y() };
          setPosition(next);
          setTransform({ scale, position: next });
        }}
      >
        <Layer>
          <Rect x={0} y={0} width={WORLD_SIZE} height={WORLD_SIZE} fill={'#111827'} />
          {/* Optional grid could go here */}
        </Layer>
      </Stage>
    </div>
  );
}


