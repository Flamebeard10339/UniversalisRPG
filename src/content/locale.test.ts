import { describe, expect, it } from 'vitest';
import { actionSlug, actionSlugProblem, missingTranslations, unmatchedLocaleKeys } from './locale';
import { loadModule, loadUniverse, type Registry } from './registry';
import { sameValue } from './registryDiff';
import { serializeRegistryModule } from './serialize';
import type { ModuleSource } from './universe';

const ISLAND = [
  '# info island',
  'version: 1.0.0',
  '',
  '# location shore',
  'x: 0, y: 0',
  'starting',
  'examine: Shingle and a drawn-up boat.',
  'entities:',
  '  crab',
  '',
  '# entity crab',
  'title: Giant Crab',
  'pick up:',
  '  instant',
  '  say: It pinches.',
  '',
  '# item rope',
  'title: Rope',
].join('\n');

const SPANISH: ModuleSource = {
  name: 'island-es',
  text: ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'island.entity.crab.title: Cangrejo Gigante', 'island.location.shore.examine: Guijarros y una barca varada.'].join('\n'),
};

const base = (): Registry => loadUniverse([{ name: 'island', text: ISLAND }]);
const translated = (): Registry => loadUniverse([{ name: 'island', text: ISLAND }, SPANISH]);

// Every field of the registry, each said to be either content — which a locale
// must leave byte-identical — or the locale table it is loaded into. Adding a
// field to Registry stops compiling here until somebody chooses, which is what
// makes the equality below a claim about the whole registry rather than about
// the fields this test happened to list.
const FIELDS: Record<keyof Registry, 'content' | 'the locale table'> = {
  entities: 'content',
  actions: 'content',
  events: 'content',
  factions: 'content',
  factionBits: 'content',
  player: 'content',
  locations: 'content',
  items: 'content',
  passives: 'content',
  clusterJewels: 'content',
  stats: 'content',
  skills: 'content',
  recipes: 'content',
  recipeActions: 'content',
  resources: 'content',
  dropTables: 'content',
  dialogues: 'content',
  dialoguesByOwner: 'content',
  tests: 'content',
  flags: 'content',
  variables: 'content',
  saves: 'content',
  namespace: 'content',
  locales: 'the locale table',
};

const contentFields = (Object.keys(FIELDS) as (keyof Registry)[]).filter((field) => FIELDS[field] === 'content');

const readable = (registry: Registry, field: keyof Registry): unknown => {
  const held = registry[field];
  if (field === 'namespace') return registry.namespace.snapshot();
  return held instanceof Map ? [...held.entries()] : held;
};

describe('# locale is a section of key/value pairs (c6)', () => {
  it('leaves every content map identical to loading without it', () => {
    const without = base();
    const with_ = translated();
    for (const field of contentFields) {
      expect(sameValue(readable(with_, field), readable(without, field)), `${field} moved`).toBe(true);
    }
  });

  it('lands its entries in the locale table, and nowhere else', () => {
    expect(translated().locales.declared.get('es')?.get('island.entity.crab.title')).toBe('Cangrejo Gigante');
    expect(base().locales.declared.get('es')).toBeUndefined();
  });

  it('refuses a line that is not a key and a value', () => {
    expect(() => loadModule('# locale en\nnot a key\n')).toThrow(/expected `<key>: <text>`/);
  });

  it('refuses one key translated twice, which is one of the two silently winning', () => {
    expect(() => loadModule('# locale en\nengine.talk.to: A\nengine.talk.to: B\n')).toThrow(/translated more than once/);
  });

  it('refuses a language-less heading, because a translation of nothing in particular is not one', () => {
    expect(() => loadModule('# locale\n')).toThrow(/requires a language/);
  });
});

describe('what a locale covers, and what it invents (c7)', () => {
  it('names the key and the locale of a translation matching no base string', () => {
    const stray: ModuleSource = { name: 'stray', text: ['# info stray', 'version: 1.0.0', '', '# locale es', 'island.entity.crabb.title: Cangrejo'].join('\n') };
    const loaded = loadUniverse([{ name: 'island', text: ISLAND }, stray]);

    expect(unmatchedLocaleKeys(loaded.locales)).toEqual([{ language: 'es', key: 'island.entity.crabb.title' }]);
  });

  it('says nothing about a translation that does match, engine key or content key', () => {
    expect(unmatchedLocaleKeys(translated().locales)).toEqual([]);
    expect(unmatchedLocaleKeys(loadModule('# locale es\nengine.talk.to: Habla con {entity}\n').locales)).toEqual([]);
  });

  it('answers which keys a language does not cover, without a view', () => {
    const missing = missingTranslations(translated().locales, 'es');

    expect(missing).toContain('island.item.rope.title');
    expect(missing).toContain('island.entity.crab.pick-up');
    expect(missing).toContain('engine.travel.to');
    // The two the Spanish module did translate.
    expect(missing).not.toContain('island.entity.crab.title');
    expect(missing).not.toContain('island.location.shore.examine');
  });

  it('counts a base string as covered by the language its own module declared', () => {
    expect(missingTranslations(base().locales, 'en').every((key) => key.startsWith('engine.'))).toBe(true);
  });
});

describe('an action is keyed on what addresses it, not on what it says', () => {
  it('keys an inline block on a slug of the label it is headed with', () => {
    const loaded = base();

    expect(loaded.locales.base.get('island.entity.crab.pick-up')).toEqual({ text: 'pick up', language: 'en' });
    expect(loaded.entities.get('island.crab')?.actions[0].label).toBe('pick up');
  });

  it('slugs by the rule ids already follow', () => {
    expect(actionSlug('Pick Lock')).toBe('pick-lock');
    expect(actionSlug('turn a spindle')).toBe('turn-a-spindle');
  });

  it('refuses two labels under one owner that reach the same slug', () => {
    const clashing = ['# entity door', 'pick lock:', '  instant', '  say: click', 'pick  lock:', '  instant', '  say: click'].join('\n');

    expect(() => loadModule(clashing)).toThrow(/keys as pick-lock, which another action here already keys as/);
  });

  // Reachable through a declaration, whose address is its id rather than its
  // `title:`. An entry label and a section id are two grammars, and this is
  // where their product is asked whether it can be a key at all.
  it('refuses an action whose address is a field of the object that owns it', () => {
    expect(() => loadModule('# action examine\ninstant\nsay: hm\n')).toThrow(/keys as examine, which is already a field of the object that owns it/);
  });

  // A key segment may open with a digit, so the rule takes every address the
  // two grammars can produce rather than narrowing it (pass 1, c8).
  it('takes an address opening with a digit, and refuses one that is no key at all', () => {
    expect(actionSlugProblem('3-card-monte', '3 card monte', new Set())).toBeUndefined();
    expect(actionSlugProblem('', '...', new Set())).toMatch(/give it a label with a letter or a digit in it/);
  });
});

// pass 1: serialize printed every title, including the one hydration generates,
// so one trip through the contribution flow turned a Spanish module's keys into
// authored raw ids and registryDiff called it clean.
describe('text survives the trip a contribution makes', () => {
  const trip = (text: string, language: string): Registry => {
    const info = { id: 'isla', version: [1, 0, 0] as [number, number, number], language };
    const printed = serializeRegistryModule(loadUniverse([{ name: 'isla', text }]), { info });
    return loadUniverse([{ name: 'isla', text: printed }]);
  };

  const SPANISH_MODULE = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# entity rata-gigante'].join('\n');
  const ENGLISH_MODULE = ['# info isla', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# entity giant-rat', 'title: The Rat'].join('\n');

  it('leaves a module writing another language with no entry it did not author', () => {
    expect([...trip(SPANISH_MODULE, 'es').locales.base.keys()]).toEqual([]);
  });

  it('keeps every entry a module writing English has, generated or authored', () => {
    const before = loadUniverse([{ name: 'isla', text: ENGLISH_MODULE }]);

    const entries = (registry: Registry): string[] => [...registry.locales.base].map(([key, entry]) => `${key} = ${entry.language} ${entry.text}`).sort();

    expect(entries(trip(ENGLISH_MODULE, 'en'))).toEqual(entries(before));
  });
});

// pass 2: the report was drawn from the entries that have text, so a module
// writing a language nobody had translated reported nothing missing while the
// player was shown keys on every screen.
describe('the report covers every key the engine asks for (c7)', () => {
  const SPANISH_MODULE = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# entity puerta', 'abrir:', '  instant', '  say: se abre'].join('\n');

  it('reports a key no module has any text for, in every language', () => {
    const loaded = loadUniverse([{ name: 'isla', text: SPANISH_MODULE }]);

    // Its entries are what it did author — the action's label and the line it
    // speaks — in the language it declared.
    expect([...loaded.locales.base]).toEqual([
      ['isla.entity.puerta.abrir', { text: 'abrir', language: 'es' }],
      ['isla.entity.puerta.say.0', { text: 'se abre', language: 'es' }],
    ]);
    expect(missingTranslations(loaded.locales, 'es')).toContain('isla.entity.puerta.title');
    expect(missingTranslations(loaded.locales, 'en')).toContain('isla.entity.puerta.title');
  });

  it('stops reporting it once a locale supplies it', () => {
    const translated = ['# info isla-es', 'version: 1.0.0', 'dependencies:', '  isla', '', '# locale es', 'isla.entity.puerta.title: Puerta'].join('\n');
    const loaded = loadUniverse([{ name: 'isla', text: SPANISH_MODULE }, { name: 'isla-es', text: translated }]);

    expect(missingTranslations(loaded.locales, 'es')).not.toContain('isla.entity.puerta.title');
    expect(unmatchedLocaleKeys(loaded.locales)).toEqual([]);
  });

  it('leaves an examine nobody authored out of it, because nothing renders one', () => {
    expect(missingTranslations(loadUniverse([{ name: 'isla', text: SPANISH_MODULE }]).locales, 'es')).not.toContain('isla.entity.puerta.examine');
  });
});

// pass 3: a locale value may drop a parameter its English names, but naming one
// nothing supplies threw at the moment a screen was drawn rather than at the
// moment the value was written.
describe('a translation may not name a parameter nothing supplies', () => {
  const withLocale = (value: string) => () => loadUniverse([{ name: 'engine-en', text: ['# info engine-en', 'version: 1.0.0', '', '# locale en', 'engine.travel.to: Travel to {destination}'].join('\n') }, { name: 'es', text: ['# info es', 'version: 1.0.0', '', '# locale es', `engine.travel.to: ${value}`].join('\n') }]);

  it('refuses one that does, naming the parameter and the key', () => {
    expect(withLocale('Viaja a {destino}')).toThrow(/engine.travel.to names \{destino\}, which nothing supplies/);
  });

  it('takes one that drops a parameter, because another language need not use it', () => {
    expect(withLocale('En marcha')).not.toThrow();
  });
});

// pass 3: nine kinds printed their title through the gate and `# stat` printed
// it bare, so a language: es module's stat gained an authored title on the trip
// and registryDiff reported nothing.
describe('no kind prints a title the loader would make for itself', () => {
  it('keeps a stat with no title of its own unentered across a round trip', () => {
    const text = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# stat ataque', 'base: 10'].join('\n');
    const printed = serializeRegistryModule(loadUniverse([{ name: 'isla', text }]), { info: { id: 'isla', version: [1, 0, 0], language: 'es' } });

    expect(loadUniverse([{ name: 'isla', text: printed }]).locales.base.has('isla.stat.ataque.title')).toBe(false);
  });
});

// pass 4: the check covered one reproduction and neither neighbour — a
// contributed `# locale en` and a key of a module writing a language nobody has
// translated, which is every content key c5's gate leaves without English.
describe('the parameter check reaches every locale, English included', () => {
  const ENGINE = ['# info engine-en', 'version: 1.0.0', '', '# locale en', 'engine.travel.to: Travel to {destination}'].join('\n');
  const ISLA = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting'].join('\n');
  const beside = (...lines: string[]) => () => loadUniverse([{ name: 'engine-en', text: ENGINE }, { name: 'isla', text: ISLA }, { name: 'more', text: ['# info more', 'version: 1.0.0', 'dependencies:', '  isla', '', ...lines].join('\n') }]);

  it('refuses a contributed English value naming a parameter nothing supplies', () => {
    expect(beside('# locale en', 'engine.travel.to: Off to {place}')).toThrow(/engine.travel.to names \{place\}/);
  });

  it('refuses a content key translated with a parameter, in any language, because a title takes none', () => {
    expect(beside('# locale es', 'isla.location.orilla.title: La {clase} orilla')).toThrow(/isla.location.orilla.title names \{clase\}/);
  });

  it('stands aside where the English it would compare against is not loaded', () => {
    expect(() => loadUniverse([{ name: 'es', text: ['# info es', 'version: 1.0.0', '', '# locale es', 'engine.travel.to: Viaja a {destination}'].join('\n') }])).not.toThrow();
  });
});

// pass 5: the refusal covered the `# locale` half only, so the two places a
// value is written were enforced differently and it was the unchecked one that
// shipped — a legal module loaded clean and then threw out of every `view()`,
// in its own declared language, with no locale file anywhere in the universe.
describe('authored text may not name a parameter either', () => {
  const authoring = (...lines: string[]) => () => loadUniverse([{ name: 'isla', text: ['# info isla', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', ...lines].join('\n') }]);

  it('refuses an authored examine that names one, naming the key and the parameter', () => {
    expect(authoring('examine: The sign reads {open} and nothing else.')).toThrow(/isla.location.camp.examine names \{open\}, which nothing supplies/);
  });

  it('refuses an authored title that names one', () => {
    expect(authoring('', '# item rope', 'title: Rope of {maker}')).toThrow(/isla.item.rope.title names \{maker\}/);
  });

  it('leaves text with no parameter in it alone', () => {
    expect(authoring('examine: The sign reads plainly.')).not.toThrow();
  });
});
