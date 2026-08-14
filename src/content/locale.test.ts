import { describe, expect, it } from 'vitest';
import { actionSlug, missingTranslations, unmatchedLocaleKeys } from './locale';
import { loadModule, loadUniverse, type Registry } from './registry';
import { sameValue } from './registryDiff';
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

describe("an action's display key is a slug of its label (c8)", () => {
  it('keys `pick up` as `pick-up`, and leaves the identifier the label', () => {
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

  // Reachable through `# action`, whose label is a free-text `title:` rather
  // than the section key an entity's own actions are written as.
  it('refuses a label whose slug is a field of the object that owns it', () => {
    expect(() => loadModule('# action look\ntitle: Examine\ninstant\n')).toThrow(/already a field of the object that owns it/);
  });

  it('refuses a label the path grammar cannot address', () => {
    expect(() => loadModule('# action monte\ntitle: 3 Card Monte\ninstant\n')).toThrow(/which is not a name/);
  });
});
