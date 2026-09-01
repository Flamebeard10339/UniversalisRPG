import type { Rewriting } from '../../src/content/registryDiff';

// An id is a token: it stands as a `# <kind>` heading's id, as a segment of any address written whole, as a key or a value inside a `# save`, and as the stem of the file a module lives in. Nothing that keys off one is spelled any other way, so one boundary rule reaches all of them — and leaves `town-quests` and `old-town` alone.
const EDGE = '[A-Za-z0-9_-]';

export const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const occurrencesOf = (id: string): RegExp => new RegExp(`(?<!${EDGE})${escaped(id)}(?!${EDGE})`, 'g');

export const literally = (text: string): RegExp => new RegExp(escaped(text), 'g');

// A section at the address the world holds it under: which module wrote it, which kind it is, and what it is called there.
export interface Addressed {
  module: string;
  kind: string;
  id: string;
}

// The forms one address takes: written whole, which covers a DSL address, a `# save` key or value and a string literal under src; split into segments, which only a serialized condition ever shows; and keyed under its kind, which is how a line the game says is filed.
//
// A form missing from this list is a refusal rather than a silent pass — the value still reads at the old address, and a registry diff reports it changed — so the list is what lets a correct rewrite through and never what lets a wrong one through.
const formsOf = (before: Addressed, after: Addressed): (readonly [RegExp, string])[] => [
  [occurrencesOf(`${before.module}.${before.id}`), `${after.module}.${after.id}`],
  [literally(`"${before.module}","${before.id}"`), `"${after.module}","${after.id}"`],
  [occurrencesOf(`${before.module}.${before.kind}.${before.id}`), `${after.module}.${after.kind}.${after.id}`],
];

export const rewritingBetween = (pairs: readonly (readonly [Addressed, Addressed])[]): Rewriting => {
  const rules = pairs.flatMap(([before, after]) => formsOf(before, after));
  return (text) => rules.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
};
