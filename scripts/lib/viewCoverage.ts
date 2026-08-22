import type { PlayView } from '../../src/runtime/session';

export function carries(held: unknown): boolean {
  if (held === null || held === undefined || held === '') return false;
  if (Array.isArray(held)) return held.length > 0;
  if (typeof held === 'object') return Object.values(held as Record<string, unknown>).some(carries);
  return true;
}

export interface ViewExcuse {
  readonly field: keyof PlayView;
  readonly why: string;
}

// A renderer's excuse list is content, and content drifts: this holds every excuse to the two
// facts that keep it honest — the field it names still exists, and the reason is more than a
// placeholder.
export function excusedFieldsAreReal(view: PlayView, excused: readonly ViewExcuse[]): string[] {
  const held = view as unknown as Record<string, unknown>;
  return excused.filter((each) => !(each.field in held) || each.why.length <= 20).map((each) => String(each.field));
}

// The subjects are the keys of a live view, not a list anyone maintains — a field PlayStatus
// grows next month arrives here on its own and must be answered for by whichever renderer calls
// this, or it fails.
export function unaccountedFields(view: PlayView, excused: readonly ViewExcuse[], isShown: (field: keyof PlayView, value: unknown) => boolean): string[] {
  const excusedSet = new Set(excused.map((each) => each.field as string));
  const held = view as unknown as Record<string, unknown>;
  return Object.keys(held).filter((field) => !excusedSet.has(field) && carries(held[field]) && !isShown(field as keyof PlayView, held[field]));
}

function primitiveStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return value === '' ? [] : [value];
  if (typeof value === 'number') return [String(value)];
  if (typeof value === 'boolean') return [];
  if (Array.isArray(value)) return value.flatMap(primitiveStrings);
  // A dictionary's identifying content is often its keys (a flag or an inventory id), not its
  // values — an `AnswerTable<boolean>` carries nothing but booleans by value, and every one of
  // those is dropped just above.
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => [key, ...primitiveStrings(inner)]);
  return [String(value)];
}

// Whether a rendered surface can be seen to carry a field at all, for a renderer that does not
// label its fields by name the way scripts/playbot.ts does: at least one string or number drawn
// from the field's own value shows up verbatim in what was rendered. Signatures of two
// characters or fewer are dropped — a bare digit turns up everywhere by coincidence and would
// let a renderer pass without truly showing anything.
export function signatureShown(renderedText: string, value: unknown): boolean {
  const signature = primitiveStrings(value).filter((each) => each.length > 2);
  return signature.length > 0 && signature.some((each) => renderedText.includes(each));
}
