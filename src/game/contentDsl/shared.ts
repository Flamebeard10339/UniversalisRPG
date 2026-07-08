// Shared line-level grammar used by parser.ts: condition expressions,
// tag-lines, and inline conditional text. See docs/content-dsl-grammar.md.
import type { DslCondition, DslTag, DslText } from './types';

export class DslParseError extends Error {}

// ---------------------------------------------------------------------------
// Condition expressions: `a & b`, `a | b`, `!a`. No parens in v0.1.
// `defaultKind` decides what a bare identifier means (`requires` defaults to
// item; `hidden if`/`visible if`/`wall ... while` default to flag).
// ---------------------------------------------------------------------------
export const parseCondition = (raw: string, defaultKind: 'flag' | 'item'): DslCondition => {
  const text = raw.trim();
  if (text.includes('|')) {
    const conds = text.split('|').map((part) => parseCondition(part, defaultKind));
    return { kind: 'any', conds };
  }
  if (text.includes('&')) {
    const conds = text.split('&').map((part) => parseCondition(part, defaultKind));
    return { kind: 'all', conds };
  }
  const negated = text.startsWith('!');
  const ident = (negated ? text.slice(1) : text).trim();
  if (!ident) throw new DslParseError(`Empty condition term in "${raw}"`);
  const base: DslCondition = defaultKind === 'item' ? { kind: 'item', itemId: ident } : { kind: 'flag', flagId: ident };
  return negated ? { kind: 'not', cond: base } : base;
};

// ---------------------------------------------------------------------------
// Inline conditional text: `literal {cond: fragment} literal {cond: fragment}`
// ---------------------------------------------------------------------------
export const parseText = (raw: string): DslText => {
  const fragments: DslText = [];
  const pattern = /\{([^{}:]+):([^{}]*)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    if (match.index > lastIndex) {
      fragments.push({ kind: 'literal', text: raw.slice(lastIndex, match.index) });
    }
    const cond = parseCondition(match[1], 'flag');
    fragments.push({ kind: 'conditional', cond, text: match[2] });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < raw.length) {
    fragments.push({ kind: 'literal', text: raw.slice(lastIndex) });
  }
  return fragments;
};

// Collects the distinct flag ids referenced by {flag: ...} fragments, in
// order of first appearance. Only flag conditions are supported inline
// (item/all/any inline text conditions are out of v0.1 scope).
export const collectTextFlags = (text: DslText): string[] => {
  const seen: string[] = [];
  for (const fragment of text) {
    if (fragment.kind !== 'conditional') continue;
    const cond = fragment.cond.kind === 'not' ? fragment.cond.cond : fragment.cond;
    if (cond.kind !== 'flag') throw new DslParseError('Inline conditional text only supports flag conditions in v0.1');
    if (!seen.includes(cond.flagId)) seen.push(cond.flagId);
  }
  return seen;
};

// Evaluates whether a fragment's condition holds under a given flag
// assignment (used to materialize one variant of inline conditional text).
const evalCond = (cond: DslCondition, assignment: Record<string, boolean>): boolean => {
  if (cond.kind === 'flag') return Boolean(assignment[cond.flagId]);
  if (cond.kind === 'not') return !evalCond(cond.cond, assignment);
  if (cond.kind === 'all') return cond.conds.every((c) => evalCond(c, assignment));
  if (cond.kind === 'any') return cond.conds.some((c) => evalCond(c, assignment));
  throw new DslParseError('Unsupported condition kind in inline text evaluation');
};

export const renderTextForAssignment = (text: DslText, assignment: Record<string, boolean>): string =>
  text
    .filter((fragment) => fragment.kind === 'literal' || evalCond(fragment.cond, assignment))
    .map((fragment) => fragment.text)
    .join('')
    .trim();

// ---------------------------------------------------------------------------
// Tag-lines: comma-separated tags, where a trailing `say`/`examine` tag may
// contain literal commas because free text always comes last (see grammar).
// ---------------------------------------------------------------------------
const TEXT_KEYWORDS = ['say', 'examine'];

export const splitTagLine = (line: string): string[] => {
  const segments: string[] = [];
  let rest = line;
  while (rest.length > 0) {
    const textMatch = new RegExp(`^\\s*(${TEXT_KEYWORDS.join('|')})\\b`, 'i').exec(rest);
    if (textMatch) {
      segments.push(rest.trim());
      rest = '';
      break;
    }
    const commaIndex = rest.indexOf(',');
    if (commaIndex === -1) {
      segments.push(rest.trim());
      rest = '';
    } else {
      segments.push(rest.slice(0, commaIndex).trim());
      rest = rest.slice(commaIndex + 1);
    }
  }
  return segments.filter((segment) => segment.length > 0);
};

const MULTI_WORD_KEYWORDS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /^hidden if\b:?\s*/i, keyword: 'hiddenIf' },
  { pattern: /^visible if\b:?\s*/i, keyword: 'visibleIf' },
  { pattern: /^goto dialogue\b:?\s*/i, keyword: 'gotoDialogue' },
  { pattern: /^open modal\b:?\s*/i, keyword: 'openModal' },
];

export const parseTag = (segment: string): DslTag => {
  for (const { pattern, keyword } of MULTI_WORD_KEYWORDS) {
    const match = pattern.exec(segment);
    if (!match) continue;
    const value = segment.slice(match[0].length).trim();
    if (keyword === 'hiddenIf' || keyword === 'visibleIf') {
      return { keyword, cond: parseCondition(value, 'flag') };
    }
    if (keyword === 'gotoDialogue') return { keyword: 'gotoDialogue', dialogueId: value };
    return { keyword: 'openModal', modalId: value };
  }

  const singleWordMatch = /^([a-zA-Z]+)\b:?\s*(.*)$/.exec(segment);
  if (!singleWordMatch) throw new DslParseError(`Could not parse tag: "${segment}"`);
  const [, word, rest] = singleWordMatch;
  const lower = word.toLowerCase();

  if (lower === 'give' || lower === 'take') {
    const [itemId, amountRaw] = rest.trim().split(/\s+/);
    return { keyword: lower, itemId, amount: amountRaw ? Number(amountRaw) : 1 };
  }
  if (lower === 'xp') {
    const [skillId, amountRaw] = rest.trim().split(/\s+/);
    return { keyword: 'xp', skillId, amount: Number(amountRaw) };
  }
  if (lower === 'set' || lower === 'unset') {
    return { keyword: lower, flagId: rest.trim() };
  }
  if (lower === 'requires') {
    return { keyword: 'requires', cond: parseCondition(rest, 'item') };
  }
  if (lower === 'once') {
    return { keyword: 'once' };
  }
  if (lower === 'say') {
    return { keyword: 'say', text: parseText(rest.trim()) };
  }
  throw new DslParseError(`Unknown tag keyword: "${word}" in "${segment}"`);
};

export const parseTagLine = (line: string): DslTag[] => splitTagLine(line).map(parseTag);

// The `enemy:` long-form field has its own shape: `interactionTypeId, stat value, stat value, ...`
export const parseEnemyField = (value: string): { interactionTypeId: string; stats: Record<string, number> } => {
  const parts = value.split(',').map((part) => part.trim());
  const [interactionTypeId, ...statParts] = parts;
  const stats: Record<string, number> = {};
  for (const part of statParts) {
    const [statKey, statValue] = part.split(/\s+/);
    stats[statKey] = Number(statValue);
  }
  return { interactionTypeId, stats };
};
