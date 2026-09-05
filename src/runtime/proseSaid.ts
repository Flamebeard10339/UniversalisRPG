import { localeKey } from '../content/locale';
import type { Registry } from '../content/registry';
import { isDebug, registryMapOf, sectionFor, sections } from '../content/sections';
import { actionAddress } from '../content/sections/action';
import { guiseDrops } from '../content/sections/guise';
import { populationCount } from '../content/sections/location';
import { parseUseChoiceId } from '../content/sections/test';
import { loadUniverse } from '../content/load';
import { parseModuleSource, type ModuleSource } from '../content/universe';
import { withoutNote } from '../grammar/note';
import { carriedFrame } from './carried';
import { MODAL_NAMES, publishModal } from './modals';
import { planeReport } from './planeReport';
import { planeFrame } from './planeScreen';
import { questScreen } from './questScreen';
import { grownItems, receiveItem } from './itemInstance';
import { initialState, SAVE_VERSION } from './save';
import { apply, applyDirective, startSession, view } from './session';
import type { ModalFrame } from './state';

export interface Prose {
  readonly kind: string;
  readonly field: string;
  readonly key: string;
  readonly words: string;
}

export const proseAt = (prose: { kind: string; field: string }): string => `${prose.kind}.${prose.field}`;

const mapOf = (registry: Registry, kind: string): ReadonlyMap<string, { id: string }> | undefined => {
  const name = registryMapOf(kind);
  return name === null ? undefined : (registry as unknown as Record<string, ReadonlyMap<string, { id: string }>>)[name];
};

export function proseWritten(registry: Registry): Prose[] {
  const written: Prose[] = [];
  for (const section of sections()) {
    const held = mapOf(registry, section.kind);
    if (held === undefined) continue;
    for (const id of held.keys()) {
      for (const field of section.text) {
        const key = localeKey(registry.namespace.ownerOf(section.kind, id) ?? null, section.kind, id, field);
        const entry = registry.locales.base.get(key);
        if (entry === undefined || entry.language !== 'en') continue;
        written.push({ kind: section.kind, field, key, words: withoutNote(entry.text) });
      }
    }
  }
  return written;
}

export interface Surface {
  readonly name: string;
  readonly said: readonly string[];
}

function soak(value: unknown, into: string[]): void {
  if (typeof value === 'string') return void into.push(value);
  if (value === null || typeof value !== 'object') return;
  for (const each of Object.values(value as Record<string, unknown>)) soak(each, into);
}

const WORN_UNTIL = 1_000_000_000;

interface Worn {
  location: string;
  entity: string;
  guise: string;
  count: number;
}

function everyGuiseWorn(world: Registry): Worn[] {
  const worn: Worn[] = [];
  for (const guise of world.guises.values()) {
    for (const location of world.locations.values()) {
      if (isDebug(location)) continue;
      for (const entry of location.entities) {
        const entity = world.entities.get(entry.entity);
        if (entity === undefined || !entity.actions.some((action) => guiseDrops(guise, action))) continue;
        worn.push({ location: location.id, entity: entry.entity, guise: guise.id, count: populationCount(entry) });
      }
    }
  }
  return worn;
}

const wornSave = (each: Worn, inventory: Record<string, number>): object => ({
  version: SAVE_VERSION,
  location: each.location,
  inventory,
  populations: { [each.location]: { [each.entity]: { down: 0, due: [], wearing: each.guise, until: Array.from({ length: each.count }, () => WORN_UNTIL) } } },
});

function probedUniverse(sources: readonly ModuleSource[], world: Registry): { registry: Registry; jewelBases: readonly string[]; standings: readonly string[] } {
  const jewels = [...world.clusterJewels.keys()];
  const locations = [...world.locations.values()].filter((location) => !isDebug(location)).map((location) => location.id);
  const owners = [...new Set(sources.map((source) => parseModuleSource(source).info.id))];
  const flat = (id: string): string => id.replace(/\./g, '-');
  const inventory = Object.fromEntries([...world.items.values()].filter((item) => !isDebug(item)).map((item) => [item.id, 1]));
  const slot = [...world.entities.values()].flatMap((entity) => entity.equipmentSlots ?? [])[0];
  const worn = everyGuiseWorn(world);
  const text = [
    '# info prose-probe',
    'version: 1.0.0',
    'dependencies:',
    ...owners.map((owner) => `  ${owner}`),
    '',
    '# variable inventory-slots',
    'value: 0',
    ...jewels.flatMap((id, at) => ['', `# item base-${at}`, ...(slot === undefined ? [] : [`slot: ${slot}`]), 'item-level: 4', `origin-cluster: ${id}`]),
    ...locations.flatMap((id) => ['', `# save at-${flat(id)}`, JSON.stringify({ version: SAVE_VERSION, location: id, inventory })]),
    ...worn.flatMap((each, at) => ['', `# save worn-${at}`, JSON.stringify(wornSave(each, inventory))]),
  ].join('\n');
  return {
    registry: loadUniverse([...sources, { name: 'prose-probe', text }]),
    jewelBases: jewels.map((_id, at) => `prose-probe.base-${at}`),
    standings: [...locations.map((id) => `prose-probe.at-${flat(id)}`), ...worn.map((_each, at) => `prose-probe.worn-${at}`)],
  };
}

function standing(registry: Registry, standings: readonly string[]): string[] {
  const said: string[] = [];
  const session = startSession(registry);
  const mints = (obj: string, objId: string, actionId: string): boolean => {
    const value = mapOf(registry, obj)?.get(objId);
    return value !== undefined && (sectionFor(obj)?.mintedActions?.(value as never) ?? []).some((one) => actionAddress(one.action) === actionId);
  };
  for (const save of standings) {
    const stand = (): void => void applyDirective(session, { kind: 'load', save });
    stand();
    const opening = view(session);
    soak(opening, said);
    for (const choice of opening.choices) {
      const use = parseUseChoiceId(String(choice.id));
      if (use === null || use === undefined || !mints(use.obj, use.objId, use.actionId)) continue;
      stand();
      view(session);
      soak(apply(session, String(choice.id)), said);
    }
  }
  return said;
}

function screens(registry: Registry, state: ReturnType<typeof initialState>): string[] {
  const said: string[] = [];
  for (const name of MODAL_NAMES) {
    try {
      soak(publishModal({ name, answers: {} } as ModalFrame, state, registry), said);
    } catch {
    }
  }
  return said;
}

function carried(registry: Registry, state: ReturnType<typeof initialState>, held: readonly string[]): string[] {
  const said: string[] = [];
  for (const item of held) soak(publishModal(carriedFrame({ item }), state, registry), said);
  return said;
}

function planes(registry: Registry, state: ReturnType<typeof initialState>, held: readonly string[]): string[] {
  const said: string[] = [];
  for (const item of held) {
    soak(planeReport(registry, state, item), said);
    try {
      soak(publishModal(planeFrame(item), state, registry), said);
    } catch {
    }
  }
  return said;
}

const journals = (registry: Registry, state: ReturnType<typeof initialState>): string[] =>
  [...registry.quests.keys()].flatMap((quest) => {
    const said: string[] = [];
    soak(publishModal(questScreen.frame(quest), state, registry), said);
    return said;
  });

export function publishedSurfaces(sources: readonly ModuleSource[], world: Registry): Surface[] {
  const { registry, jewelBases, standings } = probedUniverse(sources, world);
  const state = initialState(registry);
  const held = [...registry.items.keys()];
  for (const item of [...held, ...jewelBases]) receiveItem(state, registry, item, 1);
  const copies = Object.keys(grownItems(state));
  return [
    { name: 'standing somewhere', said: standing(registry, standings) },
    { name: 'the screens', said: screens(registry, state) },
    { name: 'the carried screen', said: carried(registry, state, [...held, ...copies]) },
    { name: 'a plane', said: planes(registry, state, [...held, ...copies]) },
    { name: 'the journal', said: journals(registry, state) },
  ];
}

export function unsaidFields(written: readonly Prose[], surfaces: readonly Surface[]): string[] {
  const haystack = surfaces.flatMap((surface) => surface.said).join(' ');
  const verdict = new Map<string, boolean>();
  for (const prose of written) verdict.set(proseAt(prose), (verdict.get(proseAt(prose)) ?? false) || (prose.words !== '' && haystack.includes(prose.words)));
  return [...verdict].flatMap(([field, said]) => (said ? [] : [field])).sort();
}

export const NOT_SAID: ReadonlyArray<{ field: string; why: string }> = [
  {
    field: 'event.title',
    why: 'named to the player by `engine.stopped.event` alone, which needs an action to write `stops on:`, and no action here writes one. The words are the engine\'s to say in a world that writes one',
  },
];
