// Context-aware autocomplete candidates for the DSL editor. One shared
// "what's valid here" function feeds both the Ctrl+Space dropdown
// (@codemirror/autocomplete) and the hand-built ghost-text extension
// (dslGhostText.ts) — see docs/content-dsl-grammar.md for the field
// keywords this pattern-matches against.
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

export type DslCompletionSources = {
  itemIds: string[];
  flagIds: string[];
  dialogueIds: string[];
  moduleIds: string[];
  skillIds: string[];
};

const FIELD_PATTERNS: Array<{ pattern: RegExp; kind: keyof DslCompletionSources }> = [
  // give:/take:/requires: -> item ids
  { pattern: /\b(?:give|take|requires)\s*:\s*!?\s*[\w.-]*$/i, kind: 'itemIds' },
  // set:/unset:/hidden if:/visible if: -> flag ids
  { pattern: /\b(?:set|unset|hidden if|visible if)\s*:\s*!?\s*[\w.-]*$/i, kind: 'flagIds' },
  // xp: -> skill ids
  { pattern: /\bxp\s*:\s*[\w-]*$/i, kind: 'skillIds' },
  // dependencies: <a, +b, ?c, ...> -> module ids (one optional prefix char per entry)
  { pattern: /\bdependencies\s*:\s*(?:[\w.>=~+?!-]+\s*,\s*)*[+?~!]?[\w.-]*$/i, kind: 'moduleIds' },
  // [[dialogue x -> dialogue ids (as opposed to a bare [[nodeId in a dialogue section)
  { pattern: /\[\[\s*dialogue\s+[\w-]*$/i, kind: 'dialogueIds' },
];

export const detectCompletionKind = (textBeforeCursor: string): keyof DslCompletionSources | null => {
  for (const { pattern, kind } of FIELD_PATTERNS) {
    if (pattern.test(textBeforeCursor)) return kind;
  }
  return null;
};

// Scans the buffer's own `set:`/`unset:`/`hidden if:`/`visible if:`/
// `wall ... while`/inline-`{cond:}` occurrences for flag ids the author has
// already introduced in this file — a brand-new module invents flags that
// the wider bundle doesn't know about yet, so bundle-level flag ids alone
// aren't enough.
export const scanFlagIdsInSource = (source: string): string[] => {
  const flags = new Set<string>();
  const addIdentsFrom = (conditionText: string) => {
    for (const ident of conditionText.split(/[&|!]/).map((part) => part.trim()).filter(Boolean)) flags.add(ident);
  };

  for (const match of source.matchAll(/\b(?:set|unset)\s*:\s*([\w.-]+)/gi)) flags.add(match[1]);
  for (const match of source.matchAll(/\{([^{}:]+):/g)) addIdentsFrom(match[1]);
  for (const match of source.matchAll(/\b(?:hidden if|visible if)\s*:\s*([^\n,]+)/gi)) addIdentsFrom(match[1]);
  for (const match of source.matchAll(/\bwhile\s+([^\n]+)/gi)) addIdentsFrom(match[1]);

  return Array.from(flags);
};

// Finds the best single candidate for ghost-text (ranked by shortest-first
// so a more specific/shorter match wins ties) that starts with what's
// already typed.
export const bestGhostTextMatch = (typed: string, candidates: string[]): string | null => {
  if (typed.length === 0) return null;
  const lowerTyped = typed.toLowerCase();
  const matches = candidates
    .filter((candidate) => candidate.toLowerCase().startsWith(lowerTyped) && candidate.length > typed.length)
    .sort((a, b) => a.length - b.length);
  return matches[0] ?? null;
};

// Takes a *getter* rather than a snapshot: the source function is baked
// into the editor's `extensions` once per module (see DslModuleEditor.tsx),
// so it must read live bundle/buffer state on each invocation instead of
// closing over a value that goes stale the moment the bundle changes.
export const dslCompletionSource = (getSources: () => DslCompletionSources) => (context: CompletionContext): CompletionResult | null => {
  const line = context.state.doc.lineAt(context.pos);
  const textBeforeCursor = line.text.slice(0, context.pos - line.from);
  const kind = detectCompletionKind(textBeforeCursor);
  if (!kind) return null;

  const word = context.matchBefore(/[\w.-]*/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  return {
    from: word.from,
    options: getSources()[kind].map((label) => ({ label, type: 'variable' })),
    validFor: /^[\w.-]*$/,
  };
};
