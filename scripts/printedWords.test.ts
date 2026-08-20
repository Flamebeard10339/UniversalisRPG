import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../src/content/hex';
import { loadInEnglish } from '../src/content/engineLocale';
import { loadUniverse } from '../src/content/load';
import { hasWords, translationOf, TRANSLATED_LANGUAGE } from '../src/content/translation';
import { BASE_LANGUAGE, localizerFor } from '../src/runtime/localized';
import { COMMANDS, newContext, runLine, type CommandContext } from '../src/runtime/command';
import { serializeSession, startSession, view, type PlayView } from '../src/runtime/session';
import { shippedModules } from './lib/layers';
import { formatResult, printed, type ReplLine } from './play-cli';

const modules = shippedModules();

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asTemplate = (pattern: string): RegExp => {
  const parts = pattern.split(/\{[a-z-]+\}/).map(escaped);
  return parts.length === 1 ? new RegExp(String.raw`(['"\`])${parts[0]}\1`, 'g') : new RegExp('`' + parts.join(String.raw`\$\{[^}]+\}`) + '`', 'g');
};

describe('no word of the engine is spelled in the source of either driver (c1, c2)', () => {
  it('sweeps every tree the layer rule knows about', () => {
    expect(modules).toContain('src/runtime/localized.ts');
    expect(modules).toContain('src/ui/App.tsx');
    expect(modules).toContain('scripts/play-cli.ts');
    expect(modules.filter((file) => /\.test\.tsx?$/.test(file))).toEqual([]);
  });

  it('reaches the fixture that mints a Localized from no localizer only from a test', () => {
    const importers = modules.filter((file) => !file.endsWith('localizedFixture.ts') && readFileSync(file, 'utf8').includes('localizedFixture'));

    expect(importers).toEqual([]);
  });

  it('mints the brand nowhere but the module that declares it', () => {
    const casts = modules.filter((file) => !file.endsWith('localized.ts') && !file.endsWith('localizedFixture.ts') && /as Localized\b/.test(readFileSync(file, 'utf8')));

    expect(casts).toEqual([]);
  });

  it('leaves no engine sentence behind in TypeScript', () => {
    const patterns = [...(loadInEnglish('').locales.declared.get(BASE_LANGUAGE)?.entries() ?? [])].filter(([, value]) => hasWords(value));
    const offenders = modules.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return patterns.flatMap(([, value]) => [...text.matchAll(asTemplate(value))].map(() => `${file}: ${value}`));
    });

    expect(offenders.sort()).toEqual([]);
  });
});

const sources = [{ name: 'engine-en', text: readFileSync('content/engine-en.dsl', 'utf8') }, { name: 'tutorial-island', text: readFileSync('content/tutorial-island.dsl', 'utf8') }];
const registry = loadUniverse([...sources, translationOf(loadUniverse(sources))]);

const RUN = /[A-Za-z][A-Za-z0-9._-]*/g;
const runsOf = (text: string): string[] => text.match(RUN) ?? [];

interface Vocabulary {
  readonly spelled: Set<string>;
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

const SHAPED: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'go to the door' };

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

  it('reaches enough of the terminal for that to mean anything', () => {
    const everything = base.flatMap((drawn) => drawn.player);

    expect(everything.flatMap(runsOf).length).toBeGreaterThan(200);
    expect(everything.some((line) => line.startsWith('> '))).toBe(true);
    expect(base.some((drawn) => drawn.view.focus !== null)).toBe(true);
    expect(base.some((drawn) => drawn.view.modals.length > 0)).toBe(true);
  });

  it('grants that permission to a place drawn beside its own name', () => {
    const at = base.findIndex((drawn) => drawn.player.some((line) => line.includes('tutorial-island.guide-house')));
    const words = vocabulary(base[at].view, other[at].view);

    expect(at).toBeGreaterThan(-1);
    expect([...(words.beside.get('tutorial-island.guide-house') ?? [])]).toContain(base[at].view.location.title);
  });
});
