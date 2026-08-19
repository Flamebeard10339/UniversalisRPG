import { Action } from '../grammar/action';
import { ClusterJewel } from './clusterJewel';
import { Dialogue } from './dialogue';
import { DropTable } from './dropTable';
import { ActionDeclaration } from './action';
import { Entity } from './entity';
import { Faction } from './faction';
import { Flag } from './flag';
import { GameEvent } from './event';
import { Item } from './item';
import { Locales } from './locale';
import { Passive } from './passive';
import { Location } from './location';
import { ParsedModule } from './universe';
import { Span } from '../grammar/parser';
import { Namespace } from './namespace';
import { Recipe } from './recipe';
import { Resource } from './resource';
import { ParsedSave } from './saveSection';
import { Skill } from './skill';
import { Slot } from './slot';
import { Stat } from './stat';
import { Test } from './test';
import { Variable } from './variable';

export interface Registry {
  entities: Map<string, Entity>;
  actions: Map<string, ActionDeclaration>;
  events: Map<string, GameEvent>;
  factions: Map<string, Faction>;
  // Membership as a mask, so hostility is one `and`. Compiled from declaration
  // order, because names are authored and bits are not.
  factionBits: Map<string, number>;
  // The entity the runtime plays as, found by name rather than privileged: the
  // grammar reads nothing from it that it does not read from a rat.
  player?: Entity;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  passives: Map<string, Passive>;
  clusterJewels: Map<string, ClusterJewel>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  // Only the slots somebody declared words for. The vocabulary itself is the
  // union of every `equipment-slots:`, which `registrySlots` answers.
  slots: Map<string, Slot>;
  recipes: Map<string, Recipe>;
  recipeActions: Map<string, Action>;
  resources: Map<string, Resource>;
  dropTables: Map<string, DropTable>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
  flags: Map<string, Flag>;
  variables: Map<string, Variable>;
  saves: Map<string, ParsedSave>;
  namespace: Namespace;
  // The text side of the load: what content authored, under the language its
  // module declared, and what `# locale` sections supplied. Kept apart from
  // every content map above so that loading a locale cannot reach one (c6).
  locales: Locales;
}

// Each DSL section kind beside the registry map that holds it. `recipeActions`
// and `dialoguesByOwner` are indexes over maps already listed, and `flag`,
// `variable` and `save` carry no references to anything, so the pairs here are
// every section a reference can be authored inside.
export const CONTENT_SECTION_MAPS: readonly (readonly [string, keyof Registry])[] = [
  ['entity', 'entities'],
  ['action', 'actions'],
  ['event', 'events'],
  ['faction', 'factions'],
  ['location', 'locations'],
  ['item', 'items'],
  ['passive', 'passives'],
  ['cluster-jewel', 'clusterJewels'],
  ['stat', 'stats'],
  ['skill', 'skills'],
  ['recipe', 'recipes'],
  ['resource', 'resources'],
  ['droptable', 'dropTables'],
  ['dialogue', 'dialogues'],
  ['test', 'tests'],
];

export type ModuleLoadStage = 'parse' | 'order' | 'resolve' | 'merge' | 'build' | 'validate';

export interface ModuleDiagnostic {
  sourceName: string;
  moduleId: string;
  stage: ModuleLoadStage;
  message: string;
  span?: Span;
  line?: number;
  column?: number;
}

export interface ModuleStatus {
  sourceName: string;
  moduleId: string;
  pack?: string;
  enabled: boolean;
  loaded: boolean;
}

export interface UniverseLoadResult {
  registry: Registry;
  diagnostics: ModuleDiagnostic[];
  modules: ModuleStatus[];
  // The modules that built this registry, in the order they were applied. The
  // load already parsed them; handing them back is what stops every caller that
  // needs an id, a version or a section list from parsing the same sources again.
  parsed: ParsedModule[];
  loadedModules: string[];
  disabledModules: string[];
}

// What addresses a compiled craft, on the same terms a travel is addressed:
// an id, because the label is display text no surface draws — a craft under way
// is said by `engine.craft.label` over the recipe's own title — and a save holds
// this.
export const CRAFT_ADDRESS = 'craft';

export function formatModuleDiagnostic(value: ModuleDiagnostic): string {
  const at = value.line === undefined ? value.sourceName : `${value.sourceName}:${value.line}:${value.column}`;
  return `${at} [${value.moduleId}] ${value.stage}: ${value.message}`;
}

// A recipe is absent: its craft is shown through `engine.craft.label` over the
// recipe's own title key, so keying the compiled label as well would be one
// visible string with two keys that a translator has to fill in twice.
// Every table of actions a player can be offered one from, each beside the id
// that owns it — which is what lets a refusal name the module to blame.
export function everyActionTable(registry: Registry): Array<[string, string, readonly Action[]]> {
  return [
    ...[...registry.entities.values()].map((entity) => ['entity', entity.id, entity.actions] as [string, string, readonly Action[]]),
    ...[...registry.locations.values()].map((location) => ['location', location.id, location.actions] as [string, string, readonly Action[]]),
    ...[...registry.items.values()].map((item) => ['item', item.id, item.actions] as [string, string, readonly Action[]]),
    ...[...registry.actions].map(([id, action]) => ['action', id, [action]] as [string, string, readonly Action[]]),
  ];
}

// The well-known id the runtime plays as. It is a name, not a privilege: the
// entity it finds declares its sheet the way every other entity does.
export const PLAYER_ENTITY = 'player';

// Membership is a mask so hostility is one `and`. `world` takes the first bit
// and is what an entity naming no faction belongs to, which is why almost
// nothing needs the line: rats do not fight rats.
export const WORLD_BIT = 1;

export function factionMask(registry: Registry, entity: { faction: readonly string[] } | undefined): number {
  if (!entity || entity.faction.length === 0) return WORLD_BIT;
  return entity.faction.reduce((mask, id) => mask | (registry.factionBits.get(id) ?? 0), 0);
}

// Two entities are hostile exactly when they share no bit.
export function hostile(registry: Registry, a: { faction: readonly string[] } | undefined, b: { faction: readonly string[] } | undefined): boolean {
  return (factionMask(registry, a) & factionMask(registry, b)) === 0;
}
