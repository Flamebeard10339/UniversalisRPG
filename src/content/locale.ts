import type { SchemaKind } from './module';
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
  'engine.travel.unknown-origin',
  'engine.travel.unknown-destination',
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
  'engine.growth.no-copy',
  'engine.growth.no-worn',
  'engine.growth.unknown-item',
  'engine.growth.not-a-base',
  'engine.growth.no-experience',
  'engine.growth.not-a-jewel',
  'engine.plane.base',
  'engine.plane.go',
  'engine.plane.slot',
  'engine.plane.allocate.slot',
  'engine.plane.allocate.position',
  'engine.plane.feed',
  'engine.plane.back',
  'engine.plane.heading',
  'engine.plane.heading.said',
  'engine.plane.node.slot',
  'engine.plane.node.position',
  'engine.plane.no-slot',
  'engine.plane.slot-blocked',
  'engine.plane.slot-filled',
  'engine.plane.slot-unallocated',
  'engine.plane.no-cluster',
  'engine.plane.no-position',
  'engine.plane.already-allocated',
  'engine.plane.no-points',
  'engine.plane.unreachable',
  'engine.plane.repair.origin',
  'engine.plane.repair.cluster',
  'engine.plane.repair.stranded',
  'engine.plane.repair.dropped',
  'engine.plane.repair.unreachable',
  'engine.plane.repair.effect',
  'engine.cluster.not-an-effect',
  'engine.cluster.effect-repeated',
  'engine.cluster.slots-full',
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
  'engine.modal.stale.unknown',
  'engine.modal.stale.no-option',
  'engine.modal.stale.no-value',
  'engine.modal.stale.unanswerable',
  'engine.modal.stale.answered',
  'engine.plane.stale.uncarried',
  'engine.plane.stale.slot',
  'engine.plane.stale.hex',
  'engine.dialogue.stale.unloaded',
  'engine.dialogue.stale.no-node',
  'engine.dialogue.stale.no-menu',
  'engine.action.stale.owner',
  'engine.action.stale.action',
  'engine.action.stale.actor',
  'engine.action.stale.cadence',
  'engine.action.stale.resource',
  'engine.prune.journey',
  'engine.prune.action',
  'engine.prune.instance.kind',
  'engine.prune.instance.template',
  'engine.prune.instance.empty',
  'engine.prune.instance.repaired',
  'engine.prune.population.location',
  'engine.prune.population.entity',
  'engine.command.invalid-choice',
  'engine.command.speed',
  'engine.command.stopped',
  // c3, c5: the two drivers' own vocabulary. `shell` is what a screen and a
  // terminal both name — a page, a standing, a node — and is read by whichever
  // of them is drawing; `repl` is the terminal's alone, because a screen shows
  // a clock and a resource bar as shapes rather than as lines of text.
  'engine.shell.map',
  'engine.shell.recentre',
  'engine.shell.edit',
  'engine.shell.home',
  'engine.shell.settings',
  'engine.shell.stats',
  'engine.shell.skills',
  'engine.shell.equipment',
  'engine.shell.inventory',
  'engine.shell.command',
  'engine.shell.run',
  'engine.shell.level',
  'engine.shell.points',
  'engine.shell.spent',
  'engine.shell.ready',
  'engine.shell.locked',
  'engine.shell.dead',
  'engine.shell.free',
  'engine.shell.node.position',
  'engine.shell.node.slot',
  'engine.repl.place',
  'engine.repl.here',
  'engine.repl.clock',
  'engine.repl.pool',
  'engine.repl.swing',
  'engine.repl.choice',
  'engine.repl.choice.owned',
  'engine.repl.modal',
  'engine.repl.modal.answered',
  'engine.repl.modal.asking',
  'engine.repl.modal.free',
  'engine.repl.state.location',
  'engine.repl.state.time',
  'engine.repl.state.flags',
  'engine.repl.state.inventory',
  'engine.repl.state.grown',
  'engine.repl.state.xp',
  'engine.repl.state.equipped',
  'engine.repl.live.running',
  'engine.repl.live.done',
  'engine.repl.live.pool',
  'engine.repl.live.counting',
  'engine.repl.live.stop',
  'engine.repl.opening',
  'engine.repl.plane.heading',
  'engine.repl.plane.heading.worn',
  'engine.repl.plane.points.one',
  'engine.repl.plane.points.many',
  'engine.repl.plane.cluster',
  'engine.repl.plane.origin',
  'engine.repl.plane.via',
  'engine.repl.plane.effect',
  'engine.repl.plane.empty',
  'engine.repl.plane.blocked',
  'engine.repl.plane.holds',
] as const;

export type EngineKey = (typeof ENGINE_KEYS)[number];

const ENGINE_KEY_SET: ReadonlySet<string> = new Set(ENGINE_KEYS);

export const isEngineKey = (key: string): key is EngineKey => ENGINE_KEY_SET.has(key);

// The text fields each section kind authors, in the order a locale file lists
// them. Exhaustive over `SchemaKind` rather than keyed by `string`: a kind added
// to `SCHEMAS` and forgotten here does not compile, where before it loaded with
// its `title:` unkeyed in every language and nothing said so — measured
// 2026-08-15 by deleting `event` and `faction`, which left tsc and all 3091
// tests green. An empty list is a decision and is spelled as one.
//
// The other way to get this wrong is a text field added to a kind that IS here,
// and that is caught in src/content/locale.test.ts, which walks the schemas: a
// field a section parses with `text` is prose somebody wrote, so it is words
// unless this file says otherwise. What is hand-kept is therefore the half that
// is NOT words, which is what c1 asks of every rule on this branch.
export const TEXT_FIELDS: Readonly<Record<SchemaKind, readonly string[]>> = {
  entity: ['title', 'examine'],
  location: ['title', 'examine'],
  item: ['title', 'examine'],
  passive: ['title', 'examine'],
  'cluster-jewel': ['title', 'examine'],
  event: ['title'],
  // A recipe authors no title: `humanizeEn` of its id is the whole English
  // name, so the key exists to be translated rather than to be authored. Its
  // `say:` is words too, and is keyed by its owner and its index with every
  // other spoken line (c6) rather than as a field of the recipe.
  recipe: ['title'],
  faction: ['title'],
  resource: ['title'],
  skill: ['title'],
  stat: ['title'],
  // A slot's key is minted from the vocabulary `equipment-slots:` names rather
  // than from a section, so `# slot` is optional and supplies only the words.
  slot: ['title'],
  // A module's `language:` is a code, not words: it is the one thing a locale
  // must not be able to move, since it says which language the rest is in.
  info: [],
  // Neither declares anything a player reads. A flag is a name and a boolean; a
  // variable is a name and a number.
  flag: [],
  variable: [],
};

// The one lookup, because a kind at load time is whatever a module wrote and the
// bespoke ones — an action, a dialogue, a droptable, a test — have no schema and
// key their words themselves.
export const textFieldsOf = (kind: string): readonly string[] | undefined => (TEXT_FIELDS as Record<string, readonly string[] | undefined>)[kind];

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

// Prose the DSL carries into the log has no id of its own, so it is addressed
// by the object that authored it and its place in that object (c6). Each field
// below is spelled with the word the DSL itself uses for the line, so a
// translator reading a key can find what it names: `say:` a result, `line` a
// bare line of dialogue, `->` a choice, `again:` a node's repeat.
//
// Reordering the lines under one owner moves their keys and breaks whatever
// named them. That is accepted rather than designed around: an index is the
// only address a line with no id has.
export const sayField = (index: number): string => `say.${index}`;
export const dialogueSayField = (node: string, index: number): string => `${node}.say.${index}`;
export const dialogueLineField = (node: string, index: number): string => `${node}.line.${index}`;
export const dialogueChoiceField = (node: string, index: number): string => `${node}.choice.${index}`;
export const dialogueAgainField = (node: string): string => `${node}.again`;

// How the words under a prose key are read back. A `say:` is printed as
// written, because its braces are the author's own punctuation; a dialogue line
// is parsed by the segment grammar it was authored in, so a translation carries
// `{player.name}` where the English carried it.
export type ProseShape = 'verbatim' | 'segments';

// A label made into an id, by the rule ids already follow: `pick lock` becomes
// `pick-lock`. What an action is addressed by is `actionAddress`, which reaches
// for this only where an inline block has no id of its own.
export function actionSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FIELD_NAMES: ReadonlySet<string> = new Set(Object.values<readonly string[]>(TEXT_FIELDS).flat());

// An address the path grammar cannot spell, or that collides with a field of
// the object that owns it, is neither a key nor a member — and two actions
// reaching one address are one name with two meanings, which is the same fault
// said about a pair. A segment may begin with a digit, so `3 Card Monte`
// addresses fine; what has no address is a label with neither a letter nor a
// digit in it.
export function actionSlugProblem(slug: string, label: string, taken: ReadonlySet<string>): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return `action ${JSON.stringify(label)} has no address: it keys as ${JSON.stringify(slug)}, so give it a label with a letter or a digit in it`;
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
  // The keys whose words the DSL authored rather than the engine, and how each
  // is read back. Braces in one belong to the grammar it was written in, not to
  // the localizer's parameters, so the check that refuses an unsupplied
  // parameter has nothing to say about it.
  prose: Map<string, ProseShape>;
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

export const emptyLocales = (): Locales => ({ addressable: new Set(), base: new Map(), english: new Map(), prose: new Map(), sections: [], declared: new Map() });

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
// Authored prose supplies its own braces to its own grammar and takes no
// parameter from any call site, so there is no such thing as one nothing
// supplies: a `say:` prints them as written and a dialogue line renders them
// through the segment grammar (c6).
export function unsuppliedParameters(locales: Locales, key: string, value: string): string[] {
  if (locales.prose.has(key)) return [];
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
