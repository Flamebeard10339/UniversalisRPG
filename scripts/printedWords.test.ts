import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../src/content/hex';
import { loadInEnglish } from '../src/content/engineLocale';
import { loadUniverse } from '../src/content/registry';
import { hasWords, translationOf, TRANSLATED_LANGUAGE } from '../src/content/translation';
import { BASE_LANGUAGE, localizerFor } from '../src/runtime/localized';
import { COMMANDS, newContext, runLine, type CommandContext } from '../src/runtime/command';
import { serializeSession, startSession, view, type PlayView } from '../src/runtime/session';
import { shippedModules } from './lib/layers';
import { formatResult, printed, type ReplLine } from './play-cli';

// Every module this repository ships, tests excluded, drawn from the same
// enumeration the layer rule sweeps. The rules below used to walk `src` and
// stop, which is one of the two drivers: an `as Localized` cast and a whole
// engine sentence in `scripts/` both survived the suite.
const modules = shippedModules();

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A pattern as TypeScript would spell it: the literal parts verbatim, and a
// template hole wherever the pattern names a parameter. Anchored on the quotes,
// because an engine sentence surviving in TypeScript is a whole string —
// matching a fragment of one flags `slot: ${a} at ${b}` for a heading that
// reads `{plane} at {hex}`, and a parameterless pattern like `Item` would
// otherwise match every occurrence of the word.
const asTemplate = (pattern: string): RegExp => {
  const parts = pattern.split(/\{[a-z-]+\}/).map(escaped);
  return parts.length === 1 ? new RegExp(String.raw`(['"\`])${parts[0]}\1`, 'g') : new RegExp('`' + parts.join(String.raw`\$\{[^}]+\}`) + '`', 'g');
};

describe('no word of the engine is spelled in the source of either driver (c1, c2)', () => {
  // A sweep that found one tree, or none, leaves every assertion below green
  // over nothing — which is the state this file was written to end.
  it('sweeps every tree the layer rule knows about', () => {
    expect(modules).toContain('src/runtime/localized.ts');
    expect(modules).toContain('src/ui/App.tsx');
    expect(modules).toContain('scripts/play-cli.ts');
    expect(modules.filter((file) => /\.test\.tsx?$/.test(file))).toEqual([]);
  });

  // `asLocalized` is the one cast that makes a Localized without a localizer.
  // It is a fixture; a shipped module importing it would be a hole in the type
  // this whole branch stands on.
  it('reaches the fixture that mints a Localized from no localizer only from a test', () => {
    const importers = modules.filter((file) => !file.endsWith('localizedFixture.ts') && readFileSync(file, 'utf8').includes('localizedFixture'));

    expect(importers).toEqual([]);
  });

  it('mints the brand nowhere but the module that declares it', () => {
    const casts = modules.filter((file) => !file.endsWith('localized.ts') && !file.endsWith('localizedFixture.ts') && /as Localized\b/.test(readFileSync(file, 'utf8')));

    expect(casts).toEqual([]);
  });

  it('leaves no engine sentence behind in TypeScript', () => {
    // Only the patterns that have a word of their own. One that is nothing
    // but parameters and punctuation — `{item} ({slot})`, `{index}) {choice}` —
    // is no sentence to leave behind, and its shape is common enough in
    // TypeScript that matching it reports ordinary templates that say nothing:
    // `{resource}: {meter}` names five composed lines under src/content and
    // src/grammar that carry no engine text at all. `hasWords` is the same
    // predicate translationSurvival.test.ts asks with, so the two agree on what
    // a pattern with words is.
    const patterns = [...(loadInEnglish('').locales.declared.get(BASE_LANGUAGE)?.entries() ?? [])].filter(([, value]) => hasWords(value));
    const offenders = modules.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return patterns.flatMap(([, value]) => [...text.matchAll(asTemplate(value))].map(() => `${file}: ${value}`));
    });

    expect(offenders.sort()).toEqual([]);
  });
});

// The shipped island under a translation of itself, so the same session can be
// played twice in words that share nothing. What survives the change of
// language is what no locale produced: an id, a coordinate, or English a driver
// spelled for itself.
const sources = [{ name: 'engine-en', text: readFileSync('content/engine-en.dsl', 'utf8') }, { name: 'tutorial-island', text: readFileSync('content/tutorial-island.dsl', 'utf8') }];
const registry = loadUniverse([...sources, translationOf(loadUniverse(sources))]);

const RUN = /[A-Za-z][A-Za-z0-9._-]*/g;
const runsOf = (text: string): string[] => text.match(RUN) ?? [];

// What the engine said, and what it left standing. Built by reading one view
// twice — the same state in two languages — so which of a published value's
// fields are words and which are ids is answered by the engine's own behaviour
// rather than by a list somebody keeps.
interface Vocabulary {
  // A token the engine itself spelled inside words it produced: the `e` in a
  // published `allocate: slot e`. A driver echoing one is echoing the engine.
  readonly spelled: Set<string>;
  // An id the engine published, against the words it published beside it on
  // that same row. This is c10's sentence, read off the surface.
  readonly beside: ReadonlyMap<string, ReadonlySet<string>>;
}

function vocabulary(base: PlayView, other: PlayView): Vocabulary {
  const spelled = new Set<string>();
  const beside = new Map<string, Set<string>>();

  const visit = (left: unknown, right: unknown): void => {
    if (left === null || typeof left !== 'object' || right === null || typeof right !== 'object') return;
    const moved: string[] = [];
    const frozen: string[] = [];
    const pair = (a: unknown, b: unknown): void => {
      if (Array.isArray(a) && Array.isArray(b)) {
        a.forEach((element, at) => pair(element, b[at]));
        return;
      }
      if (typeof a === 'string' && typeof b === 'string') {
        if (!/[A-Za-z]/.test(a)) return;
        if (a === b) frozen.push(a);
        else moved.push(a);
        return;
      }
      visit(a, b);
    };
    for (const [key, value] of Object.entries(left)) pair(value, (right as Record<string, unknown>)[key]);

    for (const word of moved) for (const run of runsOf(word)) spelled.add(run);
    for (const id of frozen) {
      const words = beside.get(id) ?? new Set<string>();
      for (const word of moved) words.add(word);
      beside.set(id, words);
    }
  };

  visit(base, other);
  return { spelled, beside };
}

// A hexagon's bearing is a coordinate spelled with letters — `ne` sits beside
// `1,0` in the same report and is the same kind of thing, the token a growth
// verb takes rather than a record anybody could translate.
const BEARINGS: readonly string[] = DIRECTIONS;

interface Drawn {
  readonly line: string;
  readonly player: readonly string[];
  readonly view: PlayView;
}

function open(language: string): CommandContext {
  const session = startSession(registry, language);
  return newContext(session, view(session), { recorder: { history: [], startSave: serializeSession(session) } });
}

const playerText = (lines: readonly ReplLine[]): string[] => lines.filter((line) => line.words === 'player').map(printed);

function play(language: string, script: readonly string[]): Drawn[] {
  const ctx = open(language);
  const localizer = localizerFor(registry, language);
  return script.map((line) => ({ line, player: playerText(formatResult(runLine(ctx, line), localizer)), view: ctx.view }));
}

// The three table entries whose names are shapes rather than words, given one
// line each of that shape — the same reading `drift.test.ts` takes of the same
// table, so a command added tomorrow is drawn here on the day it exists.
const SHAPED: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'go to the door' };

// Every line the shared table takes, and then the two screens a table entry
// alone never opens: the carried screen and the plane it puts in hand, walked
// by the answers `drift.test.ts` walks it by.
const SCRIPT: readonly string[] = [
  ...COMMANDS.flatMap((spec) => {
    const bare = SHAPED[spec.name] ?? spec.name;
    return [bare, `${bare} 1`];
  }),
  'use: entity.tutorial-island.smiths-chest.open',
  '/inv tutorial-island.iron-sword',
  ...[
    ['verb', 'grow'],
    ['plane', 'allocate: slot e'],
    ['plane', 'slot: e with tutorial-island.crossroads-jewel'],
    ['plane', 'feed: with tutorial-island.masters-whetstone'],
    ['plane', 'go: 1,0'],
    ['plane', 'allocate: position 1'],
    ['plane', 'allocate: slot ne'],
  ].map(([key, value]) => `submit-modal: ${key}=${value}`),
  '/look',
  '/state',
  '/inventory',
];

describe('what the REPL puts on the terminal (c10)', () => {
  const base = play(BASE_LANGUAGE, SCRIPT);
  const other = play(TRANSLATED_LANGUAGE, SCRIPT);

  // Every run of letters a player line carries that the change of language left
  // standing, against the four things that may leave one standing: a bearing, a
  // token the engine spelled into its own words, the player's own line quoted
  // back at them, and c10's permission — an id drawn beside the words the
  // engine published on its row.
  function unaccounted(at: number): string[] {
    const words = vocabulary(base[at].view, other[at].view);
    const drawn = new Set(other[at].player.flatMap(runsOf));
    const typed = new Set(runsOf(base[at].line));
    const text = base[at].player.join('\n');
    return [...new Set(base[at].player.flatMap(runsOf))]
      .filter((run) => drawn.has(run))
      .filter((run) => !words.spelled.has(run) && !BEARINGS.includes(run) && !typed.has(run))
      .filter((run) => ![...(words.beside.get(run) ?? [])].some((word) => text.includes(word)))
      .map((run) => `${JSON.stringify(base[at].line)}: ${run}`);
  }

  it('draws no id the engine published no words for, over every line the shared table takes', () => {
    expect(base.flatMap((_, at) => unaccounted(at))).toEqual([]);
  });

  // A walk that drew nothing, or that never reached a screen, satisfies the
  // clause above by having looked at nothing.
  it('reaches enough of the terminal for that to mean anything', () => {
    const everything = base.flatMap((drawn) => drawn.player);

    expect(everything.flatMap(runsOf).length).toBeGreaterThan(200);
    expect(everything.some((line) => line.startsWith('> '))).toBe(true);
    expect(base.some((drawn) => drawn.view.focus !== null)).toBe(true);
    expect(base.some((drawn) => drawn.view.modals.length > 0)).toBe(true);
  });

  // The permission the walk grants, said out loud: an id is drawn where the
  // engine published words for it and the driver drew those too. Without this
  // the clause above could be satisfied by drawing no id at all.
  it('grants that permission to a place drawn beside its own name', () => {
    const at = base.findIndex((drawn) => drawn.player.some((line) => line.includes('tutorial-island.guide-house')));
    const words = vocabulary(base[at].view, other[at].view);

    expect(at).toBeGreaterThan(-1);
    expect([...(words.beside.get('tutorial-island.guide-house') ?? [])]).toContain(base[at].view.location.title);
  });
});
