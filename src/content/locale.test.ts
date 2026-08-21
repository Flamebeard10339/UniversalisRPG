import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { declaredId } from './sections/entity';
import { actionAddress } from './sections/action';
import { actionSlug, localeKey, missingTranslations, unmatchedLocaleKeys } from './locale';
import { actionSlugProblem, contentSectionMaps } from './sections';
import { everyActionTable, mapOf, type Registry } from './registry';
import { loadModule, loadUniverse, loadUniverseWithDiagnostics } from './load';
import { sameValue } from './registryDiff';
import { roundTripModule } from './serialize';
import type { ModuleSource } from './universe';

const ISLAND = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', 'examine: Shingle and a drawn-up boat.', 'entities:', '  crab', '', '# entity crab', 'title: Giant Crab', 'pick up:', '  instant', '  say: It pinches.', '', '# item rope', 'title: Rope'].join('\n');

const SPANISH: ModuleSource = {
  name: 'island-es',
  text: ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'island.entity.crab.title: Cangrejo Gigante', 'island.location.shore.examine: Guijarros y una barca varada.'].join('\n'),
};

const base = (): Registry => loadUniverse([{ name: 'island', text: ISLAND }]);
const translated = (): Registry => loadUniverse([{ name: 'island', text: ISLAND }, SPANISH]);

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
  slots: 'content',
  recipes: 'content',
  recipeActions: 'content',
  resources: 'content',
  dropTables: 'content',
  dialogues: 'content',
  quests: 'content',
  tests: 'content',
  flags: 'content',
  variables: 'content',
  modals: 'content',
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
    const stray: ModuleSource = {
      name: 'stray',
      text: ['# info stray', 'version: 1.0.0', '', '# locale es', 'island.entity.crabb.title: Cangrejo'].join('\n'),
    };
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

    expect(loaded.locales.base.get('island.entity.crab.pick-up')).toEqual({
      text: 'pick up',
      language: 'en',
    });
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

  it('refuses an action whose address is a field of the object that owns it', () => {
    expect(() => loadModule('# action examine\ninstant\nsay: hm\n')).toThrow(/keys as examine, which is already a field of the object that owns it/);
  });

  it('takes an address opening with a digit, and refuses one that is no key at all', () => {
    expect(actionSlugProblem('3-card-monte', '3 card monte', new Set())).toBeUndefined();
    expect(actionSlugProblem('', '...', new Set())).toMatch(/give it a label with a letter or a digit in it/);
  });
});

describe('an action declared once carries one key, however many owners perform it (c7)', () => {
  const island = loadUniverse([
    {
      name: 'tutorial-island',
      text: readFileSync('content/tutorial-island.dsl', 'utf8'),
    },
  ]);
  const performed = everyActionTable(island).flatMap(([kind, ownerId, actions]) => actions.filter((action) => kind !== 'action' && declaredId(action) !== undefined).map((action) => ({ kind, ownerId, action })));

  it('has shipped content that hands one declaration to several owners', () => {
    const perDeclaration = new Map<string, number>();
    for (const { action } of performed) perDeclaration.set(declaredId(action)!, (perDeclaration.get(declaredId(action)!) ?? 0) + 1);

    expect([...perDeclaration.values()].some((count) => count > 1)).toBe(true);
  });

  it('writes the words under the declaration, in the language the declaration was written in', () => {
    for (const { action } of performed) {
      const id = declaredId(action)!;
      const key = localeKey(island.namespace.ownerOf('action', id) ?? null, 'action', id, actionAddress(action));

      expect(island.locales.base.get(key)?.text).toBe(action.label);
      expect(island.locales.base.get(key)?.language).toBe('en');
    }
  });

  it('writes none under the performer, so no translator fills one word once per performer', () => {
    const perOwner = performed.map(({ kind, ownerId, action }) => localeKey(island.namespace.ownerOf(kind, ownerId) ?? null, kind, ownerId, actionAddress(action))).filter((key) => island.locales.base.has(key) || island.locales.addressable.has(key));

    expect(perOwner).toEqual([]);
  });
});

describe('an action crossing a language boundary keeps the language its declaration was written in (c7)', () => {
  const ENGLISH = ['# info hall', 'version: 1.0.0', '', '# action pick-lock', 'title: Pick the lock', 'instant', 'say: click'].join('\n');
  const SPANISH_USER = ['# info casa', 'version: 1.0.0', 'language: es', 'dependencies:', '  hall', '', '# entity puerta', 'title: Puerta', 'uses: hall.pick-lock'].join('\n');
  const registry = loadUniverse([
    { name: 'hall', text: ENGLISH },
    { name: 'casa', text: SPANISH_USER },
  ]);

  it('keys the words under the English declaration and calls them English', () => {
    expect(registry.locales.base.get('hall.action.pick-lock.pick-lock')).toEqual({ text: 'Pick the lock', language: 'en' });
  });

  it('leaves the Spanish performer no key of its own to disagree at', () => {
    expect(registry.locales.base.has('casa.entity.puerta.pick-lock')).toBe(false);
    expect(registry.locales.addressable.has('casa.entity.puerta.pick-lock')).toBe(false);
  });
});

describe('text survives the trip a contribution makes', () => {
  const trip = (text: string, language: string): Registry => {
    const info = {
      id: 'isla',
      version: [1, 0, 0] as [number, number, number],
      language,
    };
    const printed = roundTripModule(loadUniverse([{ name: 'isla', text }]), { info }, (again) => loadUniverseWithDiagnostics([{ name: 'isla', text: again }])).printed;
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

describe('the report covers every key the engine asks for (c7)', () => {
  const SPANISH_MODULE = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# entity puerta', 'abrir:', '  instant', '  say: se abre'].join('\n');

  it('reports a key no module has any text for, in every language', () => {
    const loaded = loadUniverse([{ name: 'isla', text: SPANISH_MODULE }]);

    expect([...loaded.locales.base]).toEqual([
      ['isla.entity.puerta.abrir', { text: 'abrir', language: 'es' }],
      ['isla.entity.puerta.say.0', { text: 'se abre', language: 'es' }],
    ]);
    expect(missingTranslations(loaded.locales, 'es')).toContain('isla.entity.puerta.title');
    expect(missingTranslations(loaded.locales, 'en')).toContain('isla.entity.puerta.title');
  });

  it('stops reporting it once a locale supplies it', () => {
    const translated = ['# info isla-es', 'version: 1.0.0', 'dependencies:', '  isla', '', '# locale es', 'isla.entity.puerta.title: Puerta'].join('\n');
    const loaded = loadUniverse([
      { name: 'isla', text: SPANISH_MODULE },
      { name: 'isla-es', text: translated },
    ]);

    expect(missingTranslations(loaded.locales, 'es')).not.toContain('isla.entity.puerta.title');
    expect(unmatchedLocaleKeys(loaded.locales)).toEqual([]);
  });

  it('leaves an examine nobody authored out of it, because nothing renders one', () => {
    expect(missingTranslations(loadUniverse([{ name: 'isla', text: SPANISH_MODULE }]).locales, 'es')).not.toContain('isla.entity.puerta.examine');
  });
});

describe('a translation may not name a parameter nothing supplies', () => {
  const withLocale = (value: string) => () =>
    loadUniverse([
      {
        name: 'engine-en',
        text: ['# info engine-en', 'version: 1.0.0', '', '# locale en', 'engine.travel.to: Travel to {destination}'].join('\n'),
      },
      {
        name: 'es',
        text: ['# info es', 'version: 1.0.0', '', '# locale es', `engine.travel.to: ${value}`].join('\n'),
      },
    ]);

  it('refuses one that does, naming the parameter and the key', () => {
    expect(withLocale('Viaja a {destino}')).toThrow(/engine.travel.to names \{destino\}, which nothing supplies/);
  });

  it('takes one that drops a parameter, because another language need not use it', () => {
    expect(withLocale('En marcha')).not.toThrow();
  });
});

describe('no kind prints a title the loader would make for itself', () => {
  it('keeps a stat with no title of its own unentered across a round trip', () => {
    const text = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# stat ataque', 'base: 10'].join('\n');
    const info = {
      id: 'isla',
      version: [1, 0, 0] as [number, number, number],
      language: 'es',
    };
    const printed = roundTripModule(loadUniverse([{ name: 'isla', text }]), { info }, (again) => loadUniverseWithDiagnostics([{ name: 'isla', text: again }])).printed;

    expect(loadUniverse([{ name: 'isla', text: printed }]).locales.base.has('isla.stat.ataque.title')).toBe(false);
  });
});

describe('the parameter check reaches every locale, English included', () => {
  const ENGINE = ['# info engine-en', 'version: 1.0.0', '', '# locale en', 'engine.travel.to: Travel to {destination}'].join('\n');
  const ISLA = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting'].join('\n');
  const beside =
    (...lines: string[]) =>
    () =>
      loadUniverse([
        { name: 'engine-en', text: ENGINE },
        { name: 'isla', text: ISLA },
        {
          name: 'more',
          text: ['# info more', 'version: 1.0.0', 'dependencies:', '  isla', '', ...lines].join('\n'),
        },
      ]);

  it('refuses a contributed English value naming a parameter nothing supplies', () => {
    expect(beside('# locale en', 'engine.travel.to: Off to {place}')).toThrow(/engine.travel.to names \{place\}/);
  });

  it('refuses a content key translated with a parameter, in any language, because a title takes none', () => {
    expect(beside('# locale es', 'isla.location.orilla.title: La {clase} orilla')).toThrow(/isla.location.orilla.title names \{clase\}/);
  });

  it('stands aside where the English it would compare against is not loaded', () => {
    expect(() =>
      loadUniverse([
        {
          name: 'es',
          text: ['# info es', 'version: 1.0.0', '', '# locale es', 'engine.travel.to: Viaja a {destination}'].join('\n'),
        },
      ]),
    ).not.toThrow();
  });
});

describe('authored text may not name a parameter either', () => {
  const authoring =
    (...lines: string[]) =>
    () =>
      loadUniverse([
        {
          name: 'isla',
          text: ['# info isla', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', ...lines].join('\n'),
        },
      ]);

  it('refuses an authored examine that names one, naming the key and the parameter', () => {
    expect(authoring('examine: The sign reads {open} and nothing else.')).toThrow(/# location isla.camp: examine: names \{open\}, which nothing supplies/);
  });

  it('refuses an authored title that names one', () => {
    expect(authoring('', '# item rope', 'title: Rope of {maker}')).toThrow(/# item isla.rope: title: names \{maker\}/);
  });

  it('leaves text with no parameter in it alone', () => {
    expect(authoring('examine: The sign reads plainly.')).not.toThrow();
  });
});

const SPOKEN_EVERYWHERE = [
  '# info deep',
  'version: 1.0.0',
  '',
  '# flag lit',
  '',
  '# stat vigor-max',
  'base: 10',
  '',
  '# resource vigor',
  'max: vigor-max',
  '',
  '# event death',
  'resource: vigor',
  'trigger: on empty',
  '',
  '# location camp',
  'x: 0, y: 0',
  'starting',
  'entities:',
  '  guard',
  'poke:',
  '  instant',
  '  say: The fire pops.',
  '',
  '# item charm',
  'title: Charm',
  'slot: mainhand',
  'rub:',
  '  instant',
  '  say: The charm hums.',
  'on hit:',
  '  say: The charm rings.',
  'when hit:',
  '  say: The charm shudders.',
  '',
  '# droptable spoils',
  'say: Something glints.',
  '',
  '# recipe stew',
  'say: The stew thickens.',
  '',
  '# action shove',
  'title: Shove',
  'instant',
  'say: You shove.',
  'on success:',
  '  say: It staggers.',
  'on failure:',
  '  say: You slip.',
  '',
  '# entity guard',
  'title: Guard',
  'stats: vigor-max 10',
  'uses:',
  '  shove',
  'hail:',
  '  instant',
  '  say: Well met.',
  '  1 in 1:',
  '    say: And again.',
  'on death:',
  '  say: It falls.',
  'on hit:',
  '  say: The guard grunts.',
  '',
  '# dialogue guard-talk',
  'owner = guard',
  'node greet:',
  '  again: Back again?',
  '  Well met, traveller.',
  '  say: An aside.',
  '  -> Ask the way.',
  '    say: You ask.',
  '  -> Leave.',
].join('\n');

function linesIn(value: unknown, where: string, seen: Set<unknown>, found: Array<{ where: string; key: unknown }>): void {
  if (Array.isArray(value)) {
    value.forEach((each, index) => linesIn(each, `${where}[${index}]`, seen, found));
    return;
  }
  if (value instanceof Map) {
    for (const [name, held] of value) linesIn(held, `${where}.${String(name)}`, seen, found);
    return;
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  const record = value as Record<string, unknown>;
  if ((record.kind === 'say' && typeof record.text === 'string') || Array.isArray(record.segments)) found.push({ where, key: record.key });
  for (const [name, held] of Object.entries(record)) linesIn(held, `${where}.${name}`, seen, found);
}

function spokenLines(registry: Registry): Array<{ where: string; key: unknown }> {
  const found: Array<{ where: string; key: unknown }> = [];
  const seen = new Set<unknown>();
  for (const [, field] of contentSectionMaps()) linesIn(mapOf(registry, field), field, seen, found);
  linesIn(registry.recipeActions, 'recipeActions', seen, found);
  return found;
}

describe('every line the DSL speaks carries an address (c6)', () => {
  const deep = (): Registry => loadUniverse([{ name: 'deep', text: SPOKEN_EVERYWHERE }]);

  it('leaves no spoken line in the registry without one', () => {
    const lines = spokenLines(deep());

    expect(lines.length).toBe(19);
    expect(lines.filter((line) => typeof line.key !== 'string').map((line) => line.where)).toEqual([]);
  });

  it('registers exactly the keys the lines carry, and nothing no line carries', () => {
    const registry = deep();
    const carried = spokenLines(registry).map((line) => line.key as string);

    expect([...new Set(carried)].sort()).toEqual([...registry.locales.prose.keys()].sort());
    for (const key of carried) {
      expect(registry.locales.addressable.has(key)).toBe(true);
      expect(registry.locales.base.get(key)?.language).toBe('en');
    }
  });

  it('addresses each by the object that authored it and its place in that object', () => {
    expect([...deep().locales.prose].sort()).toEqual(
      [
        ['deep.action.shove.say.0', 'verbatim'],
        ['deep.action.shove.say.1', 'verbatim'],
        ['deep.action.shove.say.2', 'verbatim'],
        ['deep.dialogue.guard-talk.greet.again', 'segments'],
        ['deep.dialogue.guard-talk.greet.choice.0', 'segments'],
        ['deep.dialogue.guard-talk.greet.choice.1', 'segments'],
        ['deep.dialogue.guard-talk.greet.line.0', 'segments'],
        ['deep.dialogue.guard-talk.greet.say.0', 'verbatim'],
        ['deep.dialogue.guard-talk.greet.say.1', 'verbatim'],
        ['deep.droptable.spoils.say.0', 'verbatim'],
        ['deep.entity.guard.say.0', 'verbatim'],
        ['deep.entity.guard.say.1', 'verbatim'],
        ['deep.entity.guard.say.2', 'verbatim'],
        ['deep.entity.guard.say.3', 'verbatim'],
        ['deep.item.charm.say.0', 'verbatim'],
        ['deep.item.charm.say.1', 'verbatim'],
        ['deep.item.charm.say.2', 'verbatim'],
        ['deep.location.camp.say.0', 'verbatim'],
        ['deep.recipe.stew.say.0', 'verbatim'],
      ].sort(),
    );
  });

  it('keys an action an entity performs under the declaration that wrote it', () => {
    const performed = deep()
      .entities.get('deep.guard')!
      .actions.find((action) => action.label === 'Shove')!;

    expect(performed.results).toEqual([{ kind: 'say', text: 'You shove.', key: 'deep.action.shove.say.0' }]);
  });

  it('moves the keys when the lines under one owner are reordered', () => {
    const swapped = loadUniverse([
      {
        name: 'deep',
        text: SPOKEN_EVERYWHERE.replace('  say: The charm rings.\nwhen hit:\n  say: The charm shudders.', '  say: The charm shudders.\nwhen hit:\n  say: The charm rings.'),
      },
    ]);

    expect(deep().locales.base.get('deep.item.charm.say.1')?.text).toBe('The charm rings.');
    expect(swapped.locales.base.get('deep.item.charm.say.1')?.text).toBe('The charm shudders.');
  });
});

describe('a translation of a spoken line is read by the grammar it was authored in (c6)', () => {
  const translated =
    (...entries: string[]): (() => Registry) =>
    () =>
      loadUniverse([
        { name: 'deep', text: SPOKEN_EVERYWHERE },
        {
          name: 'deep-es',
          text: ['# info deep-es', 'version: 1.0.0', 'dependencies:', '  deep', '', '# locale es', ...entries].join('\n'),
        },
      ]);

  it('takes a line whose fragments the segment grammar can read', () => {
    const registry = translated('deep.dialogue.guard-talk.greet.line.0: Bien hallado, {player.name}.')();

    expect(registry.locales.declared.get('es')?.get('deep.dialogue.guard-talk.greet.line.0')).toBe('Bien hallado, {player.name}.');
  });

  it('refuses one it cannot, where the value is written rather than out of a running dialogue', () => {
    expect(translated('deep.dialogue.guard-talk.greet.line.0: Bien hallado, {player.name.')).toThrow(/greet\.line\.0 is a spoken line, and unterminated fragment/);
  });

  it('leaves a brace in a say: alone in both the authored text and its translation', () => {
    const registry = translated('deep.droptable.spoils.say.0: Algo brilla {aqui}.')();

    expect(registry.locales.declared.get('es')?.get('deep.droptable.spoils.say.0')).toBe('Algo brilla {aqui}.');
    expect(() =>
      loadUniverse([
        {
          name: 'deep',
          text: SPOKEN_EVERYWHERE.replace('say: Something glints.', 'say: Something glints {here}.'),
        },
      ]),
    ).not.toThrow();
  });
});
