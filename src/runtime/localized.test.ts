import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { ENGINE_KEYS } from '../content/locale';
import { loadUniverse } from '../content/registry';
import { itemExamine, localizerFor, type Localized } from './localized';
import { RuntimeError } from './state';
import type { PlayChoice, PlayStatus, PlayView } from './session';
import type { ModalChoice, ModalOption } from './modals';
import type { CarriedEntry } from './carriedScreen';
import type { ClusterReport, PlaneReport } from './planeReport';
import type { EncounterFoe } from './encounter';
import { initialState, pruneStateForRegistry, type PruneWarning } from './save';

const ISLAND = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope', '', '# item apple'].join('\n');

const SPANISH = { name: 'island-es', text: ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'island.item.rope.title: Cuerda', 'engine.travel.to: Viaja a {destination}'].join('\n') };

const english = () => localizerFor(loadInEnglish(ISLAND), 'en');
const spanish = () => localizerFor(loadUniverse([engineLocale(), { name: 'island', text: ISLAND }, SPANISH]), 'es');

// c1. Every one of these lines must be an error, and `@ts-expect-error` fails
// the build if it is not — so `npx tsc --noEmit`, which CI already runs, is the
// assertion. Nothing here executes; the fixture is the compile.
function rawTextDoesNotCompile(): void {
  // @ts-expect-error a choice label is not a string
  const label: PlayChoice['label'] = 'Travel to Beach';
  // @ts-expect-error a choice detail is not a string
  const detail: PlayChoice['detail'] = `Miki`;
  // @ts-expect-error a view title is not a string
  const title: PlayStatus['location']['title'] = 'Guide House';
  // @ts-expect-error a view description is not a string
  const description: PlayStatus['location']['description'] = 'A low room.';
  // @ts-expect-error an entity title is not a string
  const entity: PlayStatus['entities'][number]['title'] = 'Giant Rat';
  // @ts-expect-error the log does not take a string
  const log: Localized[] = ['You hit the Giant Rat for 3.'];
  // @ts-expect-error a prune warning does not take a string
  const warning: PruneWarning['message'] = 'Removed inventory gem because its item is not loaded.';
  // Every field a later pass had to brand, listed here so that unbranding one
  // is a build failure rather than a fourth reopening of c3.
  // @ts-expect-error what a modal option is read as is not a string
  const option: ModalOption['label'] = 'Item';
  // @ts-expect-error what an answer is read as is not a string either
  const choice: ModalChoice['shown'] = 'Rope x1';
  // @ts-expect-error the lines a view hands back are not strings
  const said: PlayView['said'] = ['You hit the Giant Rat for 3.'];
  // @ts-expect-error a carried row's name is not a string
  const carried: CarriedEntry['name'] = 'Rope';
  // @ts-expect-error a carried row's words are not a string
  const shown: CarriedEntry['shown'] = 'Rope x1';
  // @ts-expect-error a plane's name is not a string
  const plane: PlaneReport['name'] = 'Blade';
  // @ts-expect-error a cluster's title is not a string
  const cluster: ClusterReport['title'] = 'Core';
  // @ts-expect-error an encounter foe's title is not a string
  const foe: EncounterFoe['title'] = 'Giant Rat';
  void [label, detail, title, description, entity, log, warning, option, choice, said, carried, shown, plane, cluster, foe];
}

function unkeyedEngineTextDoesNotCompile(): void {
  const localizer = english();
  // @ts-expect-error c2: an engine string with no key
  localizer.engine('You have died.');
  // @ts-expect-error c2: a key one letter out
  localizer.engine('engine.travel.too');
}

describe('the engine speaks in keys (c2)', () => {
  it('ships an English pattern for every key the union holds, and no other key', () => {
    const shipped = loadInEnglish('').locales.declared.get('en');

    expect([...(shipped?.keys() ?? [])].sort()).toEqual([...ENGINE_KEYS].sort());
  });

  // One entry per occurrence, not per file: an allowlist keyed to a file exempts
  // every later sentence in it that matches the same pattern, which is how a
  // second `{item} ({slot})` sat here unlisted (pass 5).
  // Five occurrences that are English and stay so, because each is an identifier
  // rather than a display. Two are action labels — what `use:<kind>.<objId>.
  // <label>` and `activeAction.actionLabel` are spelled with — and three are the
  // carried screen's answer values, what a `submit-modal:` in a `# test`
  // replays: a worn row, the suffix that tells two alike rows apart, and a
  // stack. Every one of them is shown through a pattern instead:
  // `engine.travel.to`, `engine.craft.label`, `engine.carried.stack` and
  // `engine.carried.worn`.
  const IDENTIFIERS = [
    'src/content/registry.ts: Craft {recipe}',
    'src/runtime/actions.ts: Travel to {destination}',
    'src/runtime/carriedScreen.ts: {item} ({slot})',
    'src/runtime/carriedScreen.ts: {item} ({slot})',
    'src/runtime/carriedScreen.ts: {item} x{count}',
  ];

  it('leaves no engine sentence behind in TypeScript', () => {
    // Every pattern, at any length, matched as the shape it would take in
    // TypeScript: its literal parts with a template hole where each parameter
    // is. A length filter is what let two of these hide (pass 1).
    const patterns = [...(loadInEnglish('').locales.declared.get('en')?.entries() ?? [])];
    const offenders = sourceFiles('src').flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return patterns.flatMap(([, value]) => [...text.matchAll(asTemplate(value))].map(() => `${file}: ${value}`));
    });

    expect(offenders.sort()).toEqual(IDENTIFIERS);
  });

  it('renders the key itself when the language being played has no entry', () => {
    expect(localizerFor(loadInEnglish(ISLAND), 'es').engine('engine.travel.to', { destination: 'Playa' as Localized })).toBe('engine.travel.to');
  });
});

describe('parameters are named and substituted (c4)', () => {
  it('puts a value in by name', () => {
    expect(english().engine('engine.prune.nowhere')).toBe('(nowhere)');
    expect(english().engine('engine.combat.player.hit', { target: english().title('item', 'island.rope'), damage: 3 })).toBe('You hit the Rope for 3.');
  });

  it('resolves a localized parameter in the active language before substituting it', () => {
    const es = spanish();

    expect(es.engine('engine.travel.to', { destination: es.title('item', 'island.rope') })).toBe('Viaja a Cuerda');
    expect(english().engine('engine.travel.to', { destination: english().title('item', 'island.rope') })).toBe('Travel to Rope');
  });

  it('refuses a pattern naming a parameter the call site did not supply', () => {
    expect(() => english().engine('engine.travel.to')).toThrow(RuntimeError);
    expect(() => english().engine('engine.travel.to')).toThrow(/takes a \{destination\}/);
  });

  it('allows a parameter the pattern does not name, because another language need not use it', () => {
    expect(english().engine('engine.prune.nowhere', { unused: 1 })).toBe('(nowhere)');
  });
});

describe('an item with no examine of its own', () => {
  it('gets the engine sentence, with the English article the title asks for', () => {
    const registry = loadInEnglish(ISLAND);
    const localizer = localizerFor(registry, 'en');

    expect(itemExamine(localizer, registry.items.get('island.apple')!)).toBe('This is an Apple.');
    expect(itemExamine(localizer, registry.items.get('island.rope')!)).toBe('This is a Rope.');
  });

  // Against a Spanish `engine.item.examine` that does have an entry, so the
  // pattern is reached and the article's absence is what the assertion turns
  // on. Asserting the key alone could not tell the guard from its absence.
  const withExamine = (pattern: string) =>
    loadUniverse([engineLocale(), { name: 'island', text: ISLAND }, { name: 'island-es', text: ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', `engine.item.examine: ${pattern}`].join('\n') }]);

  it('asks no other language for an English article', () => {
    const registry = withExamine('Esto es un {item}.');

    expect(itemExamine(localizerFor(registry, 'es'), registry.items.get('island.apple')!)).toBe('Esto es un island.item.apple.title.');
  });

  it('refuses a language that asks for one, rather than handing it English grammar', () => {
    const registry = withExamine('Esto es {article} {item}.');

    expect(() => itemExamine(localizerFor(registry, 'es'), registry.items.get('island.apple')!)).toThrow(/takes a \{article\}/);
  });
});

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

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx') ? [full.split(path.sep).join('/')] : [];
  });
}

describe('the brand is closed (c1)', () => {
  // `asLocalized` is the one cast that makes a Localized without a localizer.
  // It is a fixture; a line of `src` importing it would be a hole in the type
  // this whole branch stands on.
  it('is reachable outside the localizer only from a test', () => {
    const importers = sourceFiles('src').filter((file) => !file.endsWith('localizedFixture.ts') && readFileSync(file, 'utf8').includes('localizedFixture'));

    expect(importers).toEqual([]);
  });

  it('is minted nowhere but the module that declares it', () => {
    const casts = sourceFiles('src').filter((file) => !file.endsWith('localized.ts') && !file.endsWith('localizedFixture.ts') && /as Localized\b/.test(readFileSync(file, 'utf8')));

    expect(casts).toEqual([]);
  });
});

void rawTextDoesNotCompile;
void unkeyedEngineTextDoesNotCompile;

// pass 1: `prose` was being used as the cast that turned ids into Localized, so
// a translated warning named nothing at all. An id belongs to no language.
describe('an id survives translation, and prose does not', () => {
  const ISLAND_WITH_GHOSTS = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope'].join('\n');
  const PRUNE_ES = [
    '# info island-es',
    'version: 1.0.0',
    'dependencies:',
    '  island',
    '',
    '# locale es',
    'engine.prune.record: Se eliminó {path} {id} porque su {kind} no está cargado.',
    'engine.prune.equipped.missing: Se quitó {slot} porque su objeto {item} no está cargado.',
  ].join('\n');

  const pruned = (language: string): string[] => {
    const registry = loadUniverse([engineLocale(), { name: 'island', text: ISLAND_WITH_GHOSTS }, { name: 'island-es', text: PRUNE_ES }]);
    const state = initialState(registry, language);
    state.inventory = { 'island.ghost': 1 };
    state.equipped = { hand: 'island.phantom' };
    return pruneStateForRegistry(state, registry).map((warning) => warning.message);
  };

  it('names the record it is about in the language the module was authored in', () => {
    expect(pruned('en')).toEqual(['Removed inventory island.ghost because its item is not loaded.', 'Unequipped hand because its item island.phantom is not loaded.']);
  });

  it('names the same record in a language the module was not authored in', () => {
    expect(pruned('es')).toEqual(['Se eliminó inventory island.ghost porque su item no está cargado.', 'Se quitó hand porque su objeto island.phantom no está cargado.']);
  });
});

// pass 2: the door asked every loaded module, and the shipped engine locale
// always declares `en`, so it could never open for a player of anything else.
describe('the prose door asks the modules that carry prose', () => {
  const SPANISH_ISLAND = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting'].join('\n');

  const said = (language: string): string => localizerFor(loadUniverse([engineLocale(), { name: 'isla', text: SPANISH_ISLAND }]), language).prose('se abre la puerta');

  it('opens for a player of the language every content module is written in', () => {
    expect(said('es')).toBe('se abre la puerta');
  });

  it('stays shut for a player of another one, however the locale modules are written', () => {
    expect(said('en')).toBe('(untranslated)');
  });
});

// c8's proof lives in the content layer, where nothing calls the localizer, so
// on two passes a mutation to the slug lookup survived that file (pass 3). The
// property is that the display is keyed on the slug and the label stays the
// identifier, and only a lookup can show it.
describe('an action is displayed by its slug and identified by its label (c8)', () => {
  const DOOR = ['# info hall', 'version: 1.0.0', '', '# location porch', 'x: 0, y: 0', 'starting', 'entities:', '  door', '', '# entity door', 'pick lock:', '  instant', '  say: click'].join('\n');
  const DOOR_ES = ['# info hall-es', 'version: 1.0.0', 'dependencies:', '  hall', '', '# locale es', 'hall.entity.door.pick-lock: Forzar la cerradura'].join('\n');

  const registry = loadUniverse([engineLocale(), { name: 'hall', text: DOOR }, { name: 'hall-es', text: DOOR_ES }]);

  it('looks the display up under the slug, not under the label', () => {
    expect(localizerFor(registry, 'es').actionLabel('entity', 'hall.door', 'pick lock')).toBe('Forzar la cerradura');
  });

  it('leaves the label the identifier a use: and a # test spell', () => {
    expect(registry.entities.get('hall.door')?.actions[0].label).toBe('pick lock');
  });
});
