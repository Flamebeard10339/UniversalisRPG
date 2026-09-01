import type { Rewriting } from '../../src/content/registryDiff';

const EDGE = '[A-Za-z0-9_-]';

export const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const occurrencesOf = (id: string): RegExp => new RegExp(`(?<!${EDGE})${escaped(id)}(?!${EDGE})`, 'g');

export const literally = (text: string): RegExp => new RegExp(escaped(text), 'g');

export interface Addressed {
  module: string;
  kind: string;
  id: string;
}

const formsOf = (before: Addressed, after: Addressed): (readonly [RegExp, string])[] => [
  [occurrencesOf(`${before.module}.${before.id}`), `${after.module}.${after.id}`],
  [literally(`"${before.module}","${before.id}"`), `"${after.module}","${after.id}"`],
  [occurrencesOf(`${before.module}.${before.kind}.${before.id}`), `${after.module}.${after.kind}.${after.id}`],
];

export const rewritingBetween = (pairs: readonly (readonly [Addressed, Addressed])[]): Rewriting => {
  const rules = pairs.flatMap(([before, after]) => formsOf(before, after));
  return (text) => rules.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
};
