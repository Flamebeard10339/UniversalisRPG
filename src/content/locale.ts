import type {LocaleSection} from './sections/locale';
import { referencesIn, unframedProblem } from '../grammar/frame';

export { referencesIn, unframedProblem };

export const ENGINE_KEYS = [
  'engine.travel.to',
  'engine.travel.no-way',
  'engine.travel.nowhere',
  'engine.travel.unknown-origin',
  'engine.travel.unknown-destination',
  'engine.craft.label',
  'engine.talk.to',
  'engine.requires.item',
  'engine.requires.unmet',
  'engine.target.absent',
  'engine.target.unoffered',
  'engine.inputs.short',
  'engine.inputs.grown',
  'engine.inputs.bare-slot',
  'engine.combat.player.hit',
  'engine.combat.player.miss',
  'engine.combat.foe.hit',
  'engine.combat.foe.miss',
  'engine.combat.other.hit',
  'engine.combat.other.miss',
  'engine.combat.started',
  'engine.combat.felled',
  'engine.examine.beside',
  'engine.entity.unexamined',
  'engine.stat.base',
  'engine.carried.stack',
  'engine.carried.worn',
  'engine.modal.name',
  'engine.modal.race',
  'engine.modal.race.carries',
  'engine.modal.race.bonus',
  'engine.modal.race.and',
  'engine.modal.choice',
  'engine.modal.read',
  'engine.modal.item',
  'engine.modal.confirm',
  'engine.carried.verb.grow',
  'engine.carried.verb.equip',
  'engine.carried.verb.unequip',
  'engine.carried.verb.destroy',
  'engine.carried.close',
  'engine.shop.label',
  'engine.shop.counter',
  'engine.shop.side.buy',
  'engine.shop.side.sell',
  'engine.shop.buy',
  'engine.shop.sell',
  'engine.shop.count.buy',
  'engine.shop.count.sell',
  'engine.shop.close',
  'engine.shop.stale',
  'engine.shop.refused.unknown-item',
  'engine.shop.refused.untradable',
  'engine.shop.refused.out-of-stock',
  'engine.shop.refused.not-carried',
  'engine.shop.refused.not-afforded',
  'engine.shop.refused.not-a-count',
  'engine.shop.refused.pack-full',
  'engine.carried.confirmed',
  'engine.growth.no-copy',
  'engine.growth.no-worn',
  'engine.growth.unknown-item',
  'engine.growth.not-a-base',
  'engine.growth.not-a-jewel',
  'engine.pack.full',
  'engine.equip.requires',
  'engine.plane.base',
  'engine.plane.go',
  'engine.plane.slot',
  'engine.plane.allocate.slot',
  'engine.plane.allocate.position',
  'engine.plane.unallocate.slot',
  'engine.plane.unallocate.position',
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
  'engine.plane.not-allocated',
  'engine.plane.socket-spent',
  'engine.plane.plane-root',
  'engine.plane.strands',
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
  'engine.prune.race',
  'engine.prune.setting',
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
  'engine.prune.population.guise',
  'engine.command.invalid-choice',
  'engine.command.speed',
  'engine.command.stopped',
  'engine.shell.map',
  'engine.skill.levelled',
  'engine.shell.recentre',
  'engine.shell.socket',
  'engine.shell.allocate',
  'engine.shell.unallocate',
  'engine.shell.insert',
  'engine.shell.empty',
  'engine.shell.experience',
  'engine.shell.to-next',
  'engine.shell.an-hour',
  'engine.shell.until-next',
  'engine.shell.edit',
  'engine.shell.home',
  'engine.shell.settings',
  'engine.shell.stats',
  'engine.shell.skills',
  'engine.shell.equipment',
  'engine.shell.inventory',
  'engine.journal.which',
  'engine.journal.reading',
  'engine.journal.close',
  'engine.stat.which',
  'engine.stat.reading',
  'engine.stat.close',
  'engine.skill.which',
  'engine.skill.reading',
  'engine.skill.close',
  'engine.shell.journal',
  'engine.shell.journal.empty',
  'engine.shell.sheet.empty',
  'engine.shell.journal.untouched',
  'engine.shell.close',
  'engine.shell.command',
  'engine.shell.run',
  'engine.shell.level',
  'engine.shell.levelled',
  'engine.shell.points',
  'engine.shell.spent',
  'engine.shell.ready',
  'engine.shell.locked',
  'engine.shell.dead',
  'engine.shell.free',
  'engine.shell.node.position',
  'engine.shell.node.slot',
  'engine.shell.local',
  'engine.shell.global',
  'engine.shell.every-kind',
  'engine.shell.section',
  'engine.shell.grammar',
  'engine.shell.colour',
  'engine.shell.starting',
  'engine.shell.undeclared',
  'engine.shell.step-in',
  'engine.shell.step-out',
  'engine.shell.new',
  'engine.shell.search',
  'engine.shell.search-hint',
  'engine.shell.command-line',
  'engine.shell.stage',
  'engine.shell.unstage',
  'engine.shell.copy',
  'engine.shell.place',
  'engine.shell.link',
  'engine.shell.region',
  'engine.shell.region-hint',
  'engine.shell.pin',
  'engine.shell.pin-hint',
  'engine.shell.dev',
  'engine.shell.speed',
  'engine.shell.clear',
  'engine.shell.mods',
  'engine.shell.mods-hint',
  'engine.shell.mods-refused',
  'engine.shell.reopen',
  'engine.playtest',
  'engine.playtest.turn',
  'engine.playtest.nothing',
  'engine.playtest.attach',
  'engine.playtest.keep',
  'engine.playtest.discard',
  'engine.playtest.copy',
  'engine.playtest.copied',
  'engine.playtest.filed',
  'engine.playtest.unfiled',
  'engine.playtest.stop',
  'engine.playtest.runs',
  'engine.playtest.none',
  'engine.playtest.drop',
  'engine.playtest.rename',
  'engine.playtest.renaming',
  'engine.playtest.replay',
  'engine.playtest.about',
  'engine.playtest.note',
  'engine.playtest.expected',
  'engine.playtest.confusion',
  'engine.playtest.blocked',
  'engine.replay',
  'engine.replay.of',
  'engine.replay.step',
  'engine.replay.play',
  'engine.replay.pause',
  'engine.replay.back',
  'engine.replay.on',
  'engine.replay.every',
  'engine.replay.parted',
  'engine.replay.done',
  'engine.replay.close',
  'engine.repl.place',
  'engine.repl.here',
  'engine.repl.grouped',
  'engine.repl.clock',
  'engine.repl.pool',
  'engine.repl.held',
  'engine.repl.held.effect',
  'engine.repl.held.stacked',
  'engine.repl.swing',
  'engine.repl.choice',
  'engine.repl.choice.owned',
  'engine.repl.modal',
  'engine.repl.modal.answered',
  'engine.repl.modal.asking',
  'engine.repl.modal.free',
  'engine.repl.modal.leaving',
  'engine.repl.journal.none',
  'engine.repl.journal.struck',
  'engine.repl.journal.unknown',
  'engine.repl.stat',
  'engine.repl.stat.unknown',
  'engine.repl.skill.unknown',
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
  'engine.span.ran',
  'engine.span.pool',
  'engine.span.gained',
  'engine.span.spent',
  'engine.span.xp',
  'engine.span.levelled',
  'engine.span.moved',
  'engine.stopped.itself',
  'engine.stopped.condition',
  'engine.stopped.counted',
  'engine.stopped.short-count',
  'engine.stopped.event',
  'engine.stopped.finished',
  'engine.stopped.unfinished',
  'engine.stopped.unavailable',
  'engine.stopped.arrived',
  'engine.stopped.no-road',
  'engine.stopped.called-off',
  'engine.stopped.forced',
  'engine.forced.holds',
  'engine.stopped.engaged',
  'engine.stopped.bound',
  'engine.stopped.still',
  'engine.stopped.unloadable',
  'engine.stopped.pack-full',
  'engine.stopped.short',
  'engine.stopped.round',
  'engine.setting.stands',
  'engine.setting.takes',
  'engine.setting.on',
  'engine.setting.off',
  'engine.setting.hardcore',
  'engine.setting.hardcore.note',
  'engine.setting.reveal',
  'engine.setting.reveal.note',
  'engine.setting.masking',
  'engine.setting.masking.note',
  'engine.setting.regions',
  'engine.setting.regions.note',
  'engine.setting.regions.blob',
  'engine.setting.regions.box',
] as const;

export type EngineKey = (typeof ENGINE_KEYS)[number];

const ENGINE_KEY_SET: ReadonlySet<string> = new Set(ENGINE_KEYS);

export const isEngineKey = (key: string): key is EngineKey => ENGINE_KEY_SET.has(key);

export const GENERATED_FIELD = 'title';

export function localeKey(namespace: string | null, kind: string, id: string, field: string): string {
  return [namespace, kind, localId(namespace, id), field].filter((segment) => segment !== null).join('.');
}

export function localId(namespace: string | null, id: string): string {
  return namespace !== null && id.startsWith(`${namespace}.`) ? id.slice(namespace.length + 1) : id;
}

export const sayField = (index: number): string => `say.${index}`;
export const dialogueSayField = (node: string, index: number): string => `${node}.say.${index}`;
export const dialogueLineField = (node: string, index: number): string => `${node}.line.${index}`;
export const dialogueChoiceField = (node: string, index: number): string => `${node}.choice.${index}`;
export const dialogueAgainField = (node: string): string => `${node}.again`;

export type ProseShape = 'verbatim' | 'segments';

export function actionSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface BaseEntry {
  text: string;
  language: string;
  generated?: true;
}

export interface Locales {
  addressable: Set<string>;
  base: Map<string, BaseEntry>;
  carried: Map<string, string>;
  prose: Map<string, ProseShape>;
  sections: LocaleDeclaration[];
  declared: Map<string, Map<string, string>>;
  english: Map<string, string>;
}

export interface LocaleDeclaration {
  module: string | null;
  language: string;
  entries: ReadonlyArray<{ key: string; value: string }>;
}

export const emptyLocales = (): Locales => ({
  addressable: new Set(),
  base: new Map(),
  carried: new Map(),
  english: new Map(),
  prose: new Map(),
  sections: [],
  declared: new Map(),
});


export function unsuppliedParameters(locales: Locales, key: string, value: string): string[] {
  if (locales.prose.has(key)) return [];
  if (!isEngineKey(key)) return referencesIn(value);
  const english = locales.english.get(key);
  if (english === undefined) return [];
  const known = new Set(referencesIn(english));
  return referencesIn(value).filter((name) => !known.has(name));
}

const DEFAULT_LOCALE = 'en';

export function addLocaleSection(locales: Locales, module: string | null, section: LocaleSection): void {
  locales.sections.push({
    module,
    language: section.id,
    entries: section.entries,
  });
  const table = locales.declared.get(section.id) ?? new Map<string, string>();
  for (const { key, value } of section.entries) {
    table.set(key, value);
    if (section.id === DEFAULT_LOCALE && !locales.english.has(key)) locales.english.set(key, value);
  }
  locales.declared.set(section.id, table);
}

export interface Said {
  key: string;
  language: string;
  text: string;
}

export function everySaid(locales: Locales): Said[] {
  const said = [...locales.base].map(([key, entry]) => ({ key, language: entry.language, text: entry.text }));
  for (const [language, table] of locales.declared) for (const [key, text] of table) said.push({ key, language, text });
  return said;
}

export const saidWords = (locales: Locales): ReadonlySet<string> => new Set(everySaid(locales).map((each) => each.text));

export function moduleLocaleSections(locales: Locales, module: string | null): LocaleDeclaration[] {
  return locales.sections.filter((section) => section.module === module);
}

export function localeLines(locales: Locales): string[] {
  const lines: string[] = [];
  for (const [language, table] of locales.declared) for (const [key, value] of table) lines.push(`${language} ${key} = ${value}`);
  return lines.sort();
}

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
