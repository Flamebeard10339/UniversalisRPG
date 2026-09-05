import { escaped } from './lib/idForms';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Written } from '../src/grammar/parser';
import { NOTE_MARK } from '../src/grammar/note';
import { sectionFor, sectionKinds } from '../src/content/sections';

export const SCOPE_NAME = 'source.dsl';

export const GRAMMAR_PATH = path.join('editor', 'vscode', 'syntaxes', 'dsl.tmLanguage.json');

const OPAQUE_KINDS: readonly string[] = ['save'];

const DEPTH = 8;

interface Pattern {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  captures?: Record<string, { name: string }>;
  beginCaptures?: Record<string, { name: string }>;
  patterns?: Pattern[];
  include?: string;
}


const spaced = (literal: string): string => escaped(literal).split(/\s+/).join('[ \\t]+');

export function literalOf(form: string): string | undefined {
  const held = form.indexOf('<');
  const front = (held === -1 ? form : form.slice(0, held)).trim();
  return /^[A-Za-z][A-Za-z0-9 '-]*:?$/.test(front) ? front : undefined;
}

export function sigilOf(form: string): string | undefined {
  return /^([^A-Za-z0-9\s]{1,2})(?=[<\s])/.exec(form)?.[1];
}

interface Gathered {
  literals: Set<string>;
  sigils: Set<string>;
}

function walk(lines: readonly Written[], depth: number, seen: Set<string>, into: Gathered): void {
  if (depth > DEPTH) return;
  for (const line of lines) {
    const literal = literalOf(line.form);
    if (literal !== undefined) into.literals.add(literal);
    const sigil = sigilOf(line.form);
    if (sigil !== undefined) into.sigils.add(sigil);
    if (line.block === undefined || seen.has(line.form)) continue;
    seen.add(line.form);
    walk(line.block(), depth + 1, seen, into);
  }
}

const longestFirst = (held: Set<string>): readonly string[] => [...held].sort((one, other) => other.length - one.length || one.localeCompare(other));

function gatheredFor(kind: string): Gathered {
  const held: Gathered = { literals: new Set(), sigils: new Set() };
  const section = sectionFor(kind);
  if (section !== undefined) walk(section.grammar, 0, new Set(), held);
  return held;
}

export const literalsOf = (kind: string): readonly string[] => longestFirst(gatheredFor(kind).literals);

const alternation = (literals: readonly string[]): string => literals.map(spaced).join('|');

const KEY = 'keyword.other.field.dsl';
const BARE = 'keyword.other.dsl';
const OVER = 'keyword.operator.written-again.dsl';
const SIGIL = 'keyword.operator.dsl';

function keywordPatterns(kind: string): Pattern[] {
  const held = gatheredFor(kind);
  const literals = longestFirst(held.literals);
  const keys = literals.filter((each) => each.endsWith(':')).map((each) => each.slice(0, -1));
  const bares = literals.filter((each) => !each.endsWith(':'));
  const out: Pattern[] = [];
  if (keys.length > 0) {
    out.push({
      match: `^[ \\t]*([+-]?)(${alternation(keys)})[ \\t]*(:)`,
      captures: { 1: { name: OVER }, 2: { name: KEY }, 3: { name: 'punctuation.separator.key-value.dsl' } },
    });
  }
  if (bares.length > 0) {
    out.push({
      match: `^[ \\t]*([+-]?)(${alternation(bares)})\\b`,
      captures: { 1: { name: OVER }, 2: { name: BARE } },
    });
  }
  const sigils = longestFirst(held.sigils);
  if (sigils.length > 0) out.push({ match: `^[ \\t]*(${sigils.map(escaped).join('|')})`, captures: { 1: { name: SIGIL } } });
  return out;
}

const LABEL: Pattern = {
  match: '^[ \\t]*([+-]?)([A-Za-z0-9][^:\\n]*)(:)[ \\t]*$',
  captures: { 1: { name: OVER }, 2: { name: 'entity.name.function.dsl' }, 3: { name: 'punctuation.separator.key-value.dsl' } },
};

const OPAQUE: Pattern = { match: '.+', name: 'string.unquoted.opaque.dsl' };

const HEADING = '^(#)[ \\t]+';

const headingCaptures = (kindScope: string): Record<string, { name: string }> => ({
  1: { name: 'punctuation.definition.section.dsl' },
  2: { name: kindScope },
  3: { name: 'entity.name.section.dsl' },
});

function sectionPattern(kind: string): Pattern {
  const inside = OPAQUE_KINDS.includes(kind) ? [...keywordPatterns(kind), OPAQUE] : [...keywordPatterns(kind), LABEL];
  return {
    name: `meta.section.${kind}.dsl`,
    begin: `${HEADING}(${escaped(kind)})\\b[ \\t]*(.*)$`,
    beginCaptures: headingCaptures('keyword.control.section.dsl'),
    end: '(?=^#[ \\t])',
    patterns: [{ include: '#note' }, { include: '#refused' }, ...inside],
  };
}

const UNKNOWN: Pattern = {
  match: `${HEADING}(\\S+)[ \\t]*(.*)$`,
  captures: headingCaptures('invalid.illegal.unknown-kind.dsl'),
};

export function tmGrammar(): object {
  return {
    name: 'Universalis DSL',
    scopeName: SCOPE_NAME,
    fileTypes: ['dsl'],
    patterns: [...sectionKinds().map(sectionPattern), UNKNOWN, { include: '#note' }, { include: '#refused' }],
    repository: {
      note: {
        patterns: [
          { match: `^[ \\t]*//.*${escaped(NOTE_MARK)}.*$`, name: 'comment.line.note.dsl' },
          { match: `${escaped(NOTE_MARK)}.*$`, name: 'comment.line.note.dsl' },
        ],
      },
      refused: {
        patterns: [{ match: '^[ \\t]*//.*$', name: 'invalid.illegal.comment.dsl' }],
      },
    },
  };
}

export const grammarText = (): string => `${JSON.stringify(tmGrammar(), null, 2)}\n`;

function main(): void {
  const root = path.resolve(import.meta.dirname, '..');
  const at = path.join(root, GRAMMAR_PATH);
  writeFileSync(at, grammarText());
  console.log(`wrote ${GRAMMAR_PATH} for ${sectionKinds().length} kinds`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
