import { DslError } from '../grammar/parser';
import { RawSection } from '../grammar/structure';

// A `# locale <lang>` section: key/value pairs and nothing else. It never
// reaches a content map, so it can neither add, patch nor remove content — the
// property c6 asserts by comparing registries rather than by trusting this
// sentence.
export interface LocaleSection {
  // The language tag the section heads, which is the section's id.
  id: string;
  entries: Array<{ key: string; value: string }>;
}

// Every string the engine itself puts on screen. Closed, so a further one
// cannot be written without appearing in this list, and mistyping one is a
// compile error at the call site rather than a key on the player's screen.
export const ENGINE_KEYS = [
  'engine.travel.to',
  'engine.travel.no-way',
  'engine.craft.label',
  'engine.talk.to',
  'engine.inputs.short',
  'engine.inputs.grown',
  'engine.inputs.worn',
  'engine.combat.player.hit',
  'engine.combat.player.miss',
  'engine.combat.foe.hit',
  'engine.combat.foe.miss',
  'engine.combat.other.hit',
  'engine.combat.other.miss',
  'engine.item.examine',
  'engine.item.modified',
  'engine.carried.stack',
  'engine.carried.worn',
  'engine.modal.name',
  'engine.modal.race',
  'engine.modal.choice',
  'engine.modal.item',
  'engine.modal.confirm',
  'engine.carried.verb.grow',
  'engine.carried.verb.equip',
  'engine.carried.verb.unequip',
  'engine.carried.verb.destroy',
  'engine.carried.close',
  'engine.carried.confirmed',
  'engine.race.human',
  'engine.race.elf',
  'engine.race.dwarf',
  'engine.race.orc',
  'engine.growth.max-level',
  'engine.plane.go',
  'engine.plane.slot',
  'engine.plane.allocate.slot',
  'engine.plane.allocate.position',
  'engine.plane.feed',
  'engine.plane.back',
  'engine.plane.heading',
  'engine.plane.heading.said',
  'engine.said.elided',
  'engine.modal.opened',
  'engine.prune.record',
  'engine.prune.location',
  'engine.prune.nowhere',
  'engine.prune.buff.actor',
  'engine.prune.buff.stat',
  'engine.prune.buff.item',
  'engine.prune.buff.resource',
  'engine.prune.equipped.missing',
  'engine.prune.equipped.slot',
  'engine.prune.modal',
  'engine.prune.journey',
  'engine.prune.action',
  'engine.prune.instance.kind',
  'engine.prune.instance.template',
  'engine.prune.instance.empty',
  'engine.prune.instance.repaired',
  'engine.prune.population.location',
  'engine.prune.population.entity',
  'engine.text.untranslated',
] as const;

export type EngineKey = (typeof ENGINE_KEYS)[number];

const ENGINE_KEY_SET: ReadonlySet<string> = new Set(ENGINE_KEYS);

export const isEngineKey = (key: string): key is EngineKey => ENGINE_KEY_SET.has(key);

// The text fields each section kind authors, in the order a locale file lists
// them. A kind absent here authors no player-visible text.
export const TEXT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  entity: ['title', 'examine'],
  location: ['title', 'examine'],
  item: ['title', 'examine'],
  passive: ['title', 'examine'],
  'cluster-jewel': ['title', 'examine'],
  event: ['title'],
  // A recipe authors no title: `humanizeEn` of its id is the whole English
  // name, so the key exists to be translated rather than to be authored.
  recipe: ['title'],
  faction: ['title'],
  resource: ['title'],
  skill: ['title'],
  stat: ['title'],
};

// The one field whose absence the engine fills in, and so the one whose entry a
// module can own without having authored it — but only in English, because
// `humanizeEn` is the only generator there is.
export const GENERATED_FIELD = 'title';

// What a key is written as: the same path grammar an id follows, so a locale
// file is addressable by the language the rest of the DSL already speaks.
const KEY = /^(?<key>[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*):[ \t]?(?<value>.*)$/;

export function parseLocaleSection(section: RawSection): LocaleSection {
  if (!section.id) throw new DslError('# locale requires a language, as in `# locale en`', section.span);
  const entries: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();
  for (const line of section.body) {
    if (line.children.length > 0) throw new DslError(`# locale ${section.id}: a translation is one line`, line.span);
    const groups = KEY.exec(line.text)?.groups;
    if (!groups) throw new DslError(`# locale ${section.id}: expected \`<key>: <text>\`, got ${JSON.stringify(line.text)}`, line.span);
    if (seen.has(groups.key)) throw new DslError(`# locale ${section.id}: ${groups.key} is translated more than once`, line.span);
    seen.add(groups.key);
    entries.push({ key: groups.key, value: groups.value });
  }
  return { id: section.id, entries };
}

// The path a piece of player-visible text is addressed by: the module that owns
// it, the kind, the id under that module, and the field. A module-less universe
// drops the first segment, which is the empty case of the same rule.
export function localeKey(namespace: string | null, kind: string, id: string, field: string): string {
  return [namespace, kind, localId(namespace, id), field].filter((segment) => segment !== null).join('.');
}

// The id as its own module writes it, which is the id with the namespace the
// loader prefixed taken back off.
export function localId(namespace: string | null, id: string): string {
  return namespace !== null && id.startsWith(`${namespace}.`) ? id.slice(namespace.length + 1) : id;
}

// An action's display key is a slug of its label, by the rule ids already
// follow: `pick lock` keys as `pick-lock`. The identifier stays the label —
// only the display becomes a lookup — so nothing authored moves (c8).
export function actionSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FIELD_NAMES: ReadonlySet<string> = new Set(Object.values(TEXT_FIELDS).flat());

// A slug that the path grammar cannot address, or that collides with a field of
// the object that owns it, is not a key — and two labels reaching one slug are
// one key with two meanings, which is the same fault said about a pair. A key
// segment may begin with a digit, so `3 Card Monte` addresses fine; what has no
// key is a label with neither a letter nor a digit in it.
export function actionSlugProblem(label: string, taken: ReadonlySet<string>): string | undefined {
  const slug = actionSlug(label);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return `action ${JSON.stringify(label)} has no display key: it keys as ${JSON.stringify(slug)}, so give it a label with a letter or a digit in it`;
  if (FIELD_NAMES.has(slug)) return `action ${JSON.stringify(label)} keys as ${slug}, which is already a field of the object that owns it`;
  if (taken.has(slug)) return `action ${JSON.stringify(label)} keys as ${slug}, which another action here already keys as`;
  return undefined;
}

export interface BaseEntry {
  text: string;
  // The language the module that authored it declared, which is the only
  // language this text is an entry for. There is no fallback to another.
  language: string;
  // Made from the id by `humanizeEn` rather than written by anybody, which is
  // what serialization must not print back out as if it had been.
  generated?: true;
}

// What a load hands the localizer: the text content authored, under the
// language of the module that authored it, and whatever `# locale` sections
// supplied, by language.
export interface Locales {
  // Every key the engine will ask for, whether or not any module has text for
  // it. A key with no entry is exactly the one a player is shown and a
  // translator has to fill in, so a report drawn from `base` alone would miss
  // the whole of a module writing a language nobody has translated.
  addressable: Set<string>;
  base: Map<string, BaseEntry>;
  // The language each loaded module declared. A `say:` carries no key naming
  // the module that wrote it, so this is what the one prose door asks before
  // showing authored text to a player of another language.
  moduleLanguages: string[];
  // Every `# locale` section that loaded, in load order and still attributed to
  // the module that wrote it, which is what lets a module be printed back out
  // with its own translations and no one else's.
  sections: LocaleDeclaration[];
  // The same entries flattened for lookup, later section winning.
  declared: Map<string, Map<string, string>>;
  // The first English an engine key was given, which is the one that fixes what
  // parameters every translation of it may name. Not the merged entry: a module
  // overriding the pattern would otherwise be checked against itself.
  english: Map<string, string>;
}

export interface LocaleDeclaration {
  module: string | null;
  language: string;
  entries: ReadonlyArray<{ key: string; value: string }>;
}

export const emptyLocales = (): Locales => ({ addressable: new Set(), base: new Map(), english: new Map(), moduleLanguages: [], sections: [], declared: new Map() });

const PARAM = /\{([a-z][a-z0-9-]*)\}/g;

export const parametersOf = (pattern: string): string[] => [...pattern.matchAll(PARAM)].map((match) => match[1]);

// A translation may drop a parameter — a Spanish `engine.item.examine` needs no
// `{article}` — but it cannot invent one, because nothing supplies it and the
// render throws. Enforced here, where the value is assembled, rather than on the
// screen it would have taken down.
//
// What an engine key supplies is fixed by the English pattern the engine ships,
// whatever language the translation is written in — including English, where a
// contributed `# locale en` is exactly as able to name a parameter nothing
// passes. Where that English is not loaded there is nothing to compare against
// and the check stands aside.
//
// A content key supplies nothing at all in any language: no caller passes a
// parameter to a title. So it is checked whether or not any module has text for
// it, which is every key of a module writing a language nobody has translated.
export function unsuppliedParameters(locales: Locales, key: string, value: string): string[] {
  if (!isEngineKey(key)) return parametersOf(value);
  const english = locales.english.get(key);
  if (english === undefined) return [];
  const known = new Set(parametersOf(english));
  return parametersOf(value).filter((name) => !known.has(name));
}

// The language the engine's own patterns are written in, which is what fixes
// the parameters every other language's may name.
const DEFAULT_LOCALE = 'en';

export function addLocaleSection(locales: Locales, module: string | null, section: LocaleSection): void {
  locales.sections.push({ module, language: section.id, entries: section.entries });
  const table = locales.declared.get(section.id) ?? new Map<string, string>();
  for (const { key, value } of section.entries) {
    table.set(key, value);
    if (section.id === DEFAULT_LOCALE && !locales.english.has(key)) locales.english.set(key, value);
  }
  locales.declared.set(section.id, table);
}

// What a module declared, for printing it back out.
export function moduleLocaleSections(locales: Locales, module: string | null): LocaleDeclaration[] {
  return locales.sections.filter((section) => section.module === module);
}

// Every translation a `# locale` supplied, as flat lines a diff can compare.
// Base text is left out: it is the content maps' own text, read back.
export function localeLines(locales: Locales): string[] {
  const lines: string[] = [];
  for (const [language, table] of locales.declared) for (const [key, value] of table) lines.push(`${language} ${key} = ${value}`);
  return lines.sort();
}

// c7: the keys a language does not cover, computed without a view. A base key
// counts as covered by the language it was authored in — which is what makes
// shipped English complete without an `en` file repeating every title.
export function missingTranslations(locales: Locales, language: string): string[] {
  const declared = locales.declared.get(language);
  const missing: string[] = [];
  for (const key of [...ENGINE_KEYS, ...locales.addressable]) {
    if (declared?.has(key) || locales.base.get(key)?.language === language) continue;
    missing.push(key);
  }
  return missing;
}

export interface UnmatchedKey {
  language: string;
  key: string;
}

// c7: a translation of something that is not there. Reported rather than kept,
// because a key nothing asks for is a key a translator spent time on for
// nothing — usually a typo of the one they meant.
export function unmatchedLocaleKeys(locales: Locales): UnmatchedKey[] {
  const unmatched: UnmatchedKey[] = [];
  for (const [language, table] of locales.declared) {
    for (const key of table.keys()) {
      if (isEngineKey(key) || locales.addressable.has(key)) continue;
      unmatched.push({ language, key });
    }
  }
  return unmatched;
}
