import { db } from './firebase';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

export type RectData = { id: string; x: number; y: number; width: number; height: number; fill: string };
export type CircleData = { id: string; cx: number; cy: number; radius: number; fill: string };
export type TextData = { id: string; x: number; y: number; width: number; text: string; fill: string };

export type CanvasState = {
  rects: RectData[];
  circles: CircleData[];
  texts: TextData[];
};

type CanvasDoc = CanvasState & {
  updatedAt?: unknown;
  client?: string;
};

const CANVAS_DOC_ID = 'default';
const clientId = (() => Math.random().toString(36).slice(2) + Date.now().toString(36))();

function canvasRef() {
  return doc(db, 'canvas', CANVAS_DOC_ID);
}

export async function loadCanvas(): Promise<CanvasState | null> {
  const snap = await getDoc(canvasRef());
  if (!snap.exists()) return null;
  const data = snap.data() as CanvasDoc;
  return { rects: data.rects || [], circles: data.circles || [], texts: data.texts || [] };
}

export function subscribeCanvas(
  handler: (payload: { state: CanvasState; client?: string }) => void
): () => void {
  return onSnapshot(canvasRef(), (snap) => {
    const data = (snap.data() || {}) as CanvasDoc;
    handler({ state: { rects: data.rects || [], circles: data.circles || [], texts: data.texts || [] }, client: data.client });
  });
}

export async function saveCanvas(state: CanvasState): Promise<void> {
  await setDoc(
    canvasRef(),
    {
      rects: state.rects,
      circles: state.circles,
      texts: state.texts,
      updatedAt: serverTimestamp(),
      client: clientId,
    },
    { merge: true }
  );
}

export function getClientId() {
  return clientId;
}


