// Shared line-level grammar used by parser.ts: condition expressions,
// tag-lines, and inline conditional text. See docs/content-dsl-grammar.md.
import type { DslCondition, DslTag, DslText } from './types';

export class DslParseError extends Error {}

// ---------------------------------------------------------------------------
// Condition expressions: `a & b`, `a | b`, `!a`. No parens in v0.1.
// `defaultKind` decides what a bare identifier means (`requires` defaults to
// item; `hidden if`/`visible if`/`wall ... while`/inline text default to
// flag). Purely syntactic — pack-scoping of flag ids happens in compiler.ts,
// which is the only place that knows the current module's pack.
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
// `cond` is a full boolean expression (may reference multiple flags).
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

// Collects every distinct flag id referenced anywhere in the text's
// conditions (walking through not/all/any), in order of first appearance.
// Inline conditional text only supports flag conditions, not item checks.
export const collectTextFlags = (text: DslText): string[] => {
  const seen: string[] = [];
  const visit = (cond: DslCondition): void => {
    if (cond.kind === 'flag') {
      if (!seen.includes(cond.flagId)) seen.push(cond.flagId);
    } else if (cond.kind === 'not') {
      visit(cond.cond);
    } else if (cond.kind === 'all' || cond.kind === 'any') {
      cond.conds.forEach(visit);
    } else {
      throw new DslParseError('Inline conditional text only supports flag conditions, not item conditions');
    }
  };
  for (const fragment of text) {
    if (fragment.kind === 'conditional') visit(fragment.cond);
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
// Tag-lines: comma-separated tags. Every keyword that takes a value requires
// a colon before it (`give: gold 5`, not `give gold 5`) — the one exception
// is a bare valueless keyword (`once`), since there's nothing to separate.
// A trailing `say:` tag may contain literal commas because free text always
// comes last on its own line (see grammar doc) — put other tags before it,
// or on a separate line entirely.
// ---------------------------------------------------------------------------
const TEXT_KEYWORDS = ['say'];

export const splitTagLine = (line: string): string[] => {
  const segments: string[] = [];
  let rest = line;
  while (rest.length > 0) {
    const textMatch = new RegExp(`^\\s*(${TEXT_KEYWORDS.join('|')})\\s*:`, 'i').exec(rest);
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

export const parseTag = (segment: string): DslTag => {
  const trimmed = segment.trim();
  if (/^once$/i.test(trimmed)) return { keyword: 'once' };

  const dialogueGotoMatch = /^\[\[dialogue\s+([\w-]+)\]\]$/i.exec(trimmed);
  if (dialogueGotoMatch) return { keyword: 'gotoDialogue', dialogueId: dialogueGotoMatch[1] };

  const match = /^([a-zA-Z][a-zA-Z ]*?):\s*(.*)$/.exec(trimmed);
  if (!match) {
    throw new DslParseError(`Expected "<keyword>: <value>" (or a bare "once" / "[[dialogue x]]"), got: "${segment}"`);
  }
  const keyword = match[1].trim().toLowerCase();
  const value = match[2].trim();

  if (keyword === 'give' || keyword === 'take') {
    const [itemId, amountRaw] = value.split(/\s+/);
    return { keyword, itemId, amount: amountRaw ? Number(amountRaw) : 1 };
  }
  if (keyword === 'xp') {
    const [skillId, amountRaw] = value.split(/\s+/);
    return { keyword: 'xp', skillId, amount: Number(amountRaw) };
  }
  if (keyword === 'set') return { keyword: 'set', flagId: value };
  if (keyword === 'unset') return { keyword: 'unset', flagId: value };
  if (keyword === 'requires') return { keyword: 'requires', cond: parseCondition(value, 'item') };
  if (keyword === 'hidden if') return { keyword: 'hiddenIf', cond: parseCondition(value, 'flag') };
  if (keyword === 'visible if') return { keyword: 'visibleIf', cond: parseCondition(value, 'flag') };
  if (keyword === 'say') return { keyword: 'say', text: parseText(value) };
  if (keyword === 'open modal') return { keyword: 'openModal', modalId: value };
  if (keyword === 'chance') return { keyword: 'chance', percent: Number(value.replace(/%$/, '')) };
  if (keyword === 'station') return { keyword: 'station', stationId: value };
  if (keyword === 'resource') {
    const [resourceId, amountRaw] = value.split(/\s+/);
    return { keyword: 'resource', resourceId, amount: Number(amountRaw) };
  }
  throw new DslParseError(`Unknown tag keyword: "${keyword}" in "${segment}"`);
};

export const parseTagLine = (line: string): DslTag[] => splitTagLine(line).map(parseTag);

// The `enemy:` field has its own shape: `interactionTypeId, stat value, stat value, ...`
export const parseEnemyField = (value: string): { interactionTypeId: string; stats: Record<string, number> } => {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  const [interactionTypeId, ...statParts] = parts;
  const stats: Record<string, number> = {};
  for (const part of statParts) {
    const [statKey, statValue] = part.split(/\s+/);
    stats[statKey] = Number(statValue);
  }
  return { interactionTypeId, stats };
};
