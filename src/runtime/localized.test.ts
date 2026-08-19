import { RuntimeError } from './error';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { actionAddress } from '../content/action';
import { declaredId } from '../content/entity';
import { everyActionTable } from '../content/registry';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { ENGINE_KEYS } from '../content/locale';
import { loadUniverse } from '../content/registry';
import { itemExamine, localizerFor, type Localized } from './localized';
import { initialState, pruneStateForRegistry } from './save';

const ISLAND = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope', '', '# item apple'].join('\n');

const SPANISH = { name: 'island-es', text: ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'island.item.rope.title: Cuerda', 'engine.travel.to: Viaja a {destination}'].join('\n') };

const english = () => localizerFor(loadInEnglish(ISLAND), 'en');
const spanish = () => localizerFor(loadUniverse([engineLocale(), { name: 'island', text: ISLAND }, SPANISH]), 'es');

// c1's compile fixture stood here: sixteen `@ts-expect-error` lines, one per
// branded field, which is a list of what somebody remembered rather than a rule
// about the surface. It had missed seven fields. `published.test.ts` walks the
// published types from their roots instead, so a field is covered by being on
// the surface rather than by being named.

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
// c6 retires the question: a `say:` is addressed, so what a player of another
// language is shown is the key, which is what every other door already answers
// with and what a translator needs in order to fill it in.
describe('authored prose answers by its address', () => {
  const SPANISH_ISLAND = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# entity puerta', 'abrir:', '  instant', '  say: se abre la puerta'].join('\n');
  const registry = loadUniverse([engineLocale(), { name: 'isla', text: SPANISH_ISLAND }]);
  const said = (language: string): string => localizerFor(registry, language).spoken('isla.entity.puerta.say.0');

  it('says the words to a player of the language the line was authored in', () => {
    expect(said('es')).toBe('se abre la puerta');
  });

  it('says the key to a player of another one, rather than words nobody translated', () => {
    expect(said('en')).toBe('isla.entity.puerta.say.0');
  });
});

// The proof lives in the content layer, where nothing calls the localizer, so
// on two passes a mutation to the slug lookup survived that file (pass 3). The
// property is that the display is looked up under what addresses the action,
// and only a lookup can show it.
describe('an action is displayed under the address it is identified by', () => {
  const DOOR = ['# info hall', 'version: 1.0.0', '', '# location porch', 'x: 0, y: 0', 'starting', 'entities:', '  door', '', '# entity door', 'pick lock:', '  instant', '  say: click'].join('\n');
  const DOOR_ES = ['# info hall-es', 'version: 1.0.0', 'dependencies:', '  hall', '', '# locale es', 'hall.entity.door.pick-lock: Forzar la cerradura'].join('\n');

  const registry = loadUniverse([engineLocale(), { name: 'hall', text: DOOR }, { name: 'hall-es', text: DOOR_ES }]);

  it('looks the display up under the slug a use: and a # test spell', () => {
    expect(localizerFor(registry, 'es').actionLabel('entity', 'hall.door', registry.entities.get('hall.door')!.actions[0])).toBe('Forzar la cerradura');
    expect(actionAddress(registry.entities.get('hall.door')!.actions[0])).toBe('pick-lock');
  });

  it('leaves the label the display text and nothing else', () => {
    expect(registry.entities.get('hall.door')?.actions[0].label).toBe('pick lock');
  });
});

// c7, the half no content-layer test can reach: one `# locale` line under the
// declaration has to move the words for every owner that performs it, which is
// a lookup and not a table. Derived over the loader's own walk and the shipped
// island, so a declaration added to the content is covered here unedited — and
// over a translation minted from the declarations themselves rather than a
// hand-written locale that would go stale beside them.
describe('one line translates an action for every owner that performs it (c7)', () => {
  const source = readFileSync('content/tutorial-island.dsl', 'utf8');
  const english = loadUniverse([engineLocale(), { name: 'tutorial-island', text: source }]);
  const declarations = [...english.actions.keys()];
  const locale = ['# info isla-es', 'version: 1.0.0', 'dependencies:', '  tutorial-island', '', '# locale es', ...declarations.map((id) => `${english.namespace.ownerOf('action', id) ?? ''}.action.${id.split('.').pop()}.${id.split('.').pop()}: ES ${id}`)];
  const registry = loadUniverse([engineLocale(), { name: 'tutorial-island', text: source }, { name: 'isla-es', text: locale.join('\n') }]);
  const say = localizerFor(registry, 'es');
  const performed = everyActionTable(registry).flatMap(([kind, ownerId, actions]) => actions.filter((action) => declaredId(action) !== undefined).map((action) => ({ kind, ownerId, action })));

  it('has shipped declarations, performed under owners of more than one kind', () => {
    expect(declarations.length).toBeGreaterThan(0);
    expect(new Set(performed.map((each) => each.kind)).size).toBeGreaterThan(1);
  });

  it('shows every performer the translated words, and never the untranslated label', () => {
    for (const { kind, ownerId, action } of performed) {
      expect(say.actionLabel(kind, ownerId, action)).toBe(`ES ${declaredId(action)}`);
    }
  });
});
