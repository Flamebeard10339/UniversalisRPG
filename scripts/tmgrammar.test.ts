import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { sectionKinds } from '../src/content/sections';
import { GRAMMAR_PATH, MANIFEST_PATH, grammarText, literalOf, literalsOf, manifestText, sigilOf, tmGrammar } from './tmgrammar';

const root = path.resolve(import.meta.dirname, '..');

interface Pattern {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  captures?: Record<string, { name: string }>;
  patterns?: Pattern[];
}

let built: Pattern[] | undefined;

const held = (): Pattern[] => (built ??= (tmGrammar() as { patterns: Pattern[] }).patterns);

const every = (patterns: readonly Pattern[]): Pattern[] => patterns.flatMap((each) => [each, ...every(each.patterns ?? [])]);

const sectionOf = (kind: string): Pattern => {
  const found = held().find((each) => each.name === `meta.section.${kind}.dsl`);
  if (found === undefined) throw new Error(`no rule for # ${kind}`);
  return found;
};

const scopes = (pattern: Pattern): string[] => Object.values(pattern.captures ?? {}).map((each) => each.name);

const rulePainting = (kind: string, scope: string): Pattern | undefined => every([sectionOf(kind)]).find((each) => scopes(each).includes(scope));

describe('the checked-in grammar', () => {
  it('is what the declarations generate', () => {
    expect(readFileSync(path.join(root, GRAMMAR_PATH), 'utf8')).toBe(grammarText());
  });
});

describe('the checked-in extension manifest', () => {
  it('is what the declarations generate', () => {
    expect(readFileSync(path.join(root, MANIFEST_PATH), 'utf8')).toBe(manifestText());
  });

  it('points at the grammar the generator writes', () => {
    const manifest = JSON.parse(manifestText()) as { contributes: { grammars: { scopeName: string; path: string }[] } };
    const grammar = manifest.contributes.grammars[0]!;
    expect(grammar.scopeName).toBe((tmGrammar() as { scopeName: string }).scopeName);
    expect(path.resolve(root, MANIFEST_PATH, '..', grammar.path)).toBe(path.resolve(root, GRAMMAR_PATH));
  });
});

describe('every kind', () => {
  it.each(sectionKinds())('%s has a rule of its own', (kind) => {
    expect(sectionOf(kind).name).toBe(`meta.section.${kind}.dsl`);
  });

  it.each(sectionKinds())('%s opens on its own heading and closes on the next', (kind) => {
    const rule = sectionOf(kind);
    const opening = new RegExp(rule.begin!, 'm').exec(`# ${kind} some-module.some-id`);
    expect(opening?.[2]).toBe(kind);
    expect(opening?.[3]).toBe('some-module.some-id');
    expect(new RegExp(rule.begin!, 'm').test(`# ${kind}extra some-id`)).toBe(false);
    expect(new RegExp(rule.end!, 'm').test('one line\n# stat attack')).toBe(true);
  });
});

describe('every pattern', () => {
  const patterns = every(held());

  it('is a regular expression', () => {
    for (const each of patterns) for (const source of [each.match, each.begin, each.end]) if (source !== undefined) expect(() => new RegExp(source, 'm')).not.toThrow();
  });

  it('paints a keyword only at the head of a line, so prose keeps its own words', () => {
    const keywords = patterns.filter((each) => scopes(each).some((scope) => scope.startsWith('keyword.other')));
    expect(keywords.length).toBeGreaterThan(0);
    for (const each of keywords) expect(each.match!.startsWith('^')).toBe(true);
  });
});

describe('a key a kind takes', () => {
  const keyed = sectionKinds().flatMap((kind) => literalsOf(kind).filter((literal) => literal.endsWith(':')).map((literal) => [kind, literal] as const));

  it('is painted where that kind writes it', () => {
    for (const [kind, literal] of keyed) {
      const rule = rulePainting(kind, 'keyword.other.field.dsl');
      const key = literal.slice(0, -1);
      expect([kind, new RegExp(rule!.match!, 'm').exec(`  ${key}: something`)?.[2]]).toEqual([kind, key]);
    }
  });
});

describe('a form', () => {
  it('gives up its literal front', () => {
    expect(literalOf('title: <text>')).toBe('title:');
    expect(literalOf('use: <action> on <entity>')).toBe('use:');
    expect(literalOf('stage <name>:')).toBe('stage');
    expect(literalOf('never ends')).toBe('never ends');
  });

  it('gives up the mark it opens on', () => {
    expect(sigilOf('-> <choice>[ (when <condition>)]')).toBe('->');
    expect(sigilOf('+<amount> <stat>')).toBe('+');
    expect(sigilOf('? <module>')).toBe('?');
    expect(sigilOf('title: <text>')).toBeUndefined();
  });

  it('has none when it opens on a hole', () => {
    expect(literalOf('<condition>')).toBeUndefined();
    expect(literalOf('+<line>')).toBeUndefined();
    expect(literalOf('{"version": <number>}')).toBeUndefined();
  });
});
