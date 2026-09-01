import type { PlayView } from './session';

const FIELD = /^[a-zA-Z][a-zA-Z0-9]*$/;

export interface Leaf {
  readonly path: string;
  readonly signatures: readonly string[];
}

function walk(value: unknown, path: string, into: Map<string, string[]>): void {
  const held = (signature: string): void => void into.set(path, [...(into.get(path) ?? []), signature]);
  if (value === null || value === undefined || value === '') return;
  if (typeof value === 'string') return held(value);
  if (typeof value === 'number') return held(String(value));
  if (typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const each of value) walk(each, `${path}[]`, into);
    return;
  }
  if (typeof value !== 'object') return held(String(value));
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (FIELD.test(key)) walk(inner, path === '' ? key : `${path}.${key}`, into);
    else {
      held(key);
      walk(inner, `${path}{}`, into);
    }
  }
}

export function leaves(view: PlayView): Leaf[] {
  const into = new Map<string, string[]>();
  walk(view, '', into);
  return [...into].map(([path, signatures]) => ({ path, signatures: [...new Set(signatures)] }));
}
