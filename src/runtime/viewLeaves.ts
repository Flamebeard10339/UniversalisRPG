import type { PlayView } from './session';

// A field name declared in PlayStatus and everything under it; anything else standing as a key is
// content the world put there — an item id, a flag, a grown instance — and is read as one of the
// values that object holds rather than as a place of its own. Written as the shape of a name
// because the types that say so are gone by the time a live view is walked.
const FIELD = /^[a-zA-Z][a-zA-Z0-9]*$/;

// A signature of two characters or fewer turns up everywhere by coincidence — a bare digit is in
// every rendered surface — so it proves nothing and is dropped.
const SHORTEST_SIGNATURE = 2;

export interface Leaf {
  readonly path: string;
  // Every string the view puts at this path, across every element of every array above it. A
  // renderer shows the path only by showing all of them: passing on whichever one happened to come
  // first is what let a quest's title stand in for the lines under it.
  readonly signatures: readonly string[];
}

function walk(value: unknown, path: string, into: Map<string, string[]>): void {
  const held = (signature: string): void => void into.set(path, [...(into.get(path) ?? []), signature]);
  if (value === null || value === undefined || value === '') return;
  if (typeof value === 'string') return held(value);
  if (typeof value === 'number') return held(String(value));
  // Nothing in a rendered line is the word `true`, so a flag's own value can be neither found nor
  // missed. What a renderer does with one is a claim its own test has to make.
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

// Every leaf of a live view, keyed by where it sits rather than by the top-level field holding it.
// A field a section grows next month arrives here as its own path, under whichever renderer has to
// draw it, with nothing edited.
export function leaves(view: PlayView): Leaf[] {
  const into = new Map<string, string[]>();
  walk(view, '', into);
  return [...into].map(([path, signatures]) => ({ path, signatures: [...new Set(signatures)].filter((each) => each.length > SHORTEST_SIGNATURE) }));
}
