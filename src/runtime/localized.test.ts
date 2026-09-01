import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { actionAddress } from '../content/sections/action';
import { declaredId } from '../content/sections/entity';
import { everyActionTable } from '../content/registry';
import { engineLocale, loadInEnglish, withEngineLocale } from '../content/engineLocale';
import { ENGINE_KEYS } from '../content/locale';
import { loadUniverse } from '../content/load';
import { NOTE_MARK } from '../grammar/note';
import { everyKey, englishOf } from '../content/translation';
import { hasNote, withoutNote } from '../grammar/note';
import { itemExamine, localizerFor, type Localized } from './localized';
import { initialState, pruneStateForRegistry } from './save';
import { fixtureModule, fixtureSources } from '../content/worldFixture';

const ISLAND = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope', '', '# item apple'].join('\n');

const SPANISH = { name: 'island-es', text: ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'island.item.rope.title: Cuerda', 'engine.travel.to: Viaja a {destination}'].join('\n') };

const english = () => localizerFor(loadInEnglish(ISLAND), 'en');
const spanish = () => localizerFor(loadUniverse([engineLocale(), { name: 'island', text: ISLAND }, SPANISH]), 'es');

type EngineArgument = Parameters<ReturnType<typeof english>['engine']>[0];
type RefusedByEngine<Candidate extends string> = Candidate extends EngineArgument ? false : true;

const refusesAnEngineStringWithNoKey: RefusedByEngine<'You have died.'> = true;
const refusesAKeyOneLetterOut: RefusedByEngine<'engine.travel.too'> = true;

describe('the engine speaks in keys (c2)', () => {
  it('takes a key, and no engine string that is not one', () => {
    expect([refusesAnEngineStringWithNoKey, refusesAKeyOneLetterOut]).toEqual([true, true]);
  });

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

describe('an item’s examine words', () => {
  const ISLAND_WITH_EXAMINE = `${ISLAND}
examine: Green, and one side of it blushing.`;

  const SPANISH_EXAMINE = {
    name: 'island-es',
    text: `# info island-es
version: 1.0.0
dependencies:
  island

# locale es
island.item.apple.examine: Verde, y sonrojada por un lado.`,
  };

  it('are the words the author wrote, in the language asking for them', () => {
    const registry = loadUniverse([engineLocale(), { name: 'island', text: ISLAND_WITH_EXAMINE }, SPANISH_EXAMINE]);

    expect(itemExamine(localizerFor(registry, 'en'), 'island.apple')).toBe('Green, and one side of it blushing.');
    expect(itemExamine(localizerFor(registry, 'es'), 'island.apple')).toBe('Verde, y sonrojada por un lado.');
  });

  it('are nothing at all where the author wrote none, rather than a sentence the engine made up', () => {
    expect(itemExamine(english(), 'island.rope')).toBeUndefined();
    expect(itemExamine(spanish(), 'island.rope')).toBeUndefined();
  });

  it('are nothing at all in a language that has not been given them', () => {
    const registry = loadUniverse([engineLocale(), { name: 'island', text: ISLAND_WITH_EXAMINE }, SPANISH]);

    expect(itemExamine(localizerFor(registry, 'es'), 'island.apple')).toBeUndefined();
  });
});

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

// Over the standing world rather than over core alone: a `# action` is a verb shared by whoever
// brings it, and the two ends of that sharing — the player who swings and the thing swung at — are
// not both declared in one module, so a world small enough to hold only one of them cannot say
// anything about the other.
describe('one line translates an action for every owner that performs it (c7)', () => {
  const world = fixtureSources();
  const english = loadUniverse([...world]);
  const declarations = [...english.actions.keys()];
  const locale = ['# info isla-es', 'version: 1.0.0', 'dependencies:', ...world.map((each) => `  ${each.name}`), '', '# locale es', ...declarations.map((id) => `${english.namespace.ownerOf('action', id) ?? ''}.action.${id.split('.').pop()}.${id.split('.').pop()}: ES ${id}`)];
  const registry = loadUniverse([...world, { name: 'isla-es', text: locale.join('\n') }]);
  const say = localizerFor(registry, 'es');
  // Only the ones a `# action` declares: an action minted onto an owner — the examine every thing
  // carries — is keyed under that owner rather than under a declaration, so it is not what a line
  // shared between performers is about.
  const shared = new Set(declarations);
  const performed = everyActionTable(registry).flatMap(([kind, ownerId, actions]) =>
    actions.filter((action) => declaredId(action) !== undefined && shared.has(declaredId(action)!)).map((action) => ({ kind, ownerId, action })),
  );

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

describe('a note an author left is dropped from every line the game says', () => {
  const marked = (text: string): string => `${text} ${NOTE_MARK} the writer has not been here yet`;

  it('drops it from a field, a spoken line and a translation alike, and leaves no space where it stood', () => {
    const source = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# entity miki', `title: ${marked('Miki')}`, `examine: ${marked('A weathered guide.')}`, '', '# dialogue chat', 'owner = miki', 'node greet:', `  ${marked('A traveller, out here?')}`].join('\n');
    const localizer = localizerFor(loadInEnglish(source), 'en');

    expect(localizer.title('entity', 'island.miki')).toBe('Miki');
    expect(localizer.content('entity', 'island.miki', 'examine')).toBe('A weathered guide.');
    expect(localizer.spoken('island.dialogue.chat.greet.line.0')).toBe('A traveller, out here?');
  });

  it('leaves the line standing where the mark carries no words, which is all a rough line says', () => {
    const localizer = localizerFor(loadInEnglish(['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', `# item rope`, `title: Rope ${NOTE_MARK}`].join('\n')), 'en');

    expect(localizer.title('item', 'island.rope')).toBe('Rope');
  });

  // The subjects are every key the engine can say, taken from the registry, so a kind or a field added next month is proved here with no edit. What a key is measured against is the English with any note the author already left taken off it — a corpus that ships its own rough lines is the point of the mark, and comparing against the raw declaration would fail the moment one appeared.
  it('drops it from every key the shipped corpus can address, whatever shape that prose has', () => {
    const shipped = withEngineLocale([fixtureModule('core')]);
    const plain = loadUniverse(shipped);
    const keys = everyKey(plain.locales);
    const notes = { name: 'noted', text: ['# info noted', 'version: 1.0.0', '', '# locale en', ...keys.map((key) => `${key}: ${marked(englishOf(plain.locales, key))}`)].join('\n') };
    const spoken = localizerFor(loadUniverse([...shipped, notes]), 'en');

    const said = (key: string): string => withoutNote(englishOf(plain.locales, key));

    expect(keys.length).toBeGreaterThan(100);
    expect(keys.some((key) => hasNote(englishOf(plain.locales, key))), 'no shipped line carries a note, so this proves nothing about one that does').toBe(true);
    expect(keys.filter((key) => spoken.spoken(key) !== said(key))).toEqual([]);
  });
});
