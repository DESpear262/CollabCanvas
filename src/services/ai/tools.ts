/*
  File: src/services/ai/tools.ts
  Overview: Function-calling tool schemas and lightweight registry for AI executor.
  Design:
    - Strong TS types for parameters and results
    - JSON-schema-ish shapes for LLM function-calling
    - Registry helpers for lookup and validation
    - Includes rotateShape (rect/text only; circles not rotatable)
*/

export type ShapeType = 'rectangle' | 'circle';

export type ToolName =
  | 'createShape'
  | 'createText'
  | 'moveShape'
  | 'resizeShape'
  | 'deleteShape'
  | 'getCanvasState'
  | 'selectShapes'
  | 'rotateShape';

export type ToolSpec = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
};

/** Tool schema set exposed to the LLM. */
export const toolSpecs: ToolSpec[] = [
  {
    name: 'createShape',
    description: 'Create a rectangle or circle on the canvas',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['rectangle', 'circle'] },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        color: { type: 'string' },
      },
      required: ['type', 'x', 'y', 'width', 'height', 'color'],
    },
  },
  {
    name: 'createText',
    description: 'Create a text layer',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string' },
      },
      required: ['text', 'x', 'y', 'color'],
    },
  },
  {
    name: 'moveShape',
    description: 'Move an existing shape to a new position',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['id', 'x', 'y'],
    },
  },
  {
    name: 'resizeShape',
    description: 'Resize an existing shape',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['id', 'width', 'height'],
    },
  },
  {
    name: 'deleteShape',
    description: 'Delete an existing shape by id',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'getCanvasState',
    description: 'Return the current canvas state for context',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'selectShapes',
    description: '[Deprecated for planner] Select shapes by simple criteria. Prefer resolving referents using the provided canvas state and emitting absolute coordinates for move/resize.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['rectangle', 'circle', 'text', 'any'] },
        color: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'rotateShape',
    description: 'Rotate a rectangle or text node to an absolute angle in degrees (circles are not rotatable).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        rotation: { type: 'number', description: 'Absolute rotation angle in degrees' },
      },
      required: ['id', 'rotation'],
    },
  },
];

/** Retrieve a tool spec by name. */
export function getToolSpec(name: ToolName): ToolSpec | undefined {
  return toolSpecs.find((t) => t.name === name);
}

/**
 * Basic runtime validator: checks that all required fields are present.
 * More thorough validation can be layered on top later.
 */
export function validateParams(name: ToolName, params: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  const spec = getToolSpec(name);
  if (!spec) return { ok: false, error: 'Unknown tool' };
  const required = (spec.parameters as any)?.required as string[] | undefined;
  if (!required || required.length === 0) return { ok: true };
  for (const key of required) {
    if (!(key in params)) return { ok: false, error: `Missing parameter: ${key}` };
  }
  return { ok: true };
}
