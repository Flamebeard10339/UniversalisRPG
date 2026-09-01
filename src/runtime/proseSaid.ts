import { localeKey } from '../content/locale';
import type { Registry } from '../content/registry';
import { registryMapOf, sectionFor, sections } from '../content/sections';
import { actionAddress } from '../content/sections/action';
import { parseUseChoiceId } from '../content/sections/test';
import { loadUniverse } from '../content/load';
import type { ModuleSource } from '../content/universe';
import { withoutNote } from '../grammar/note';
import { carriedFrame } from './carried';
import { MODAL_NAMES, publishModal } from './modals';
import { planeReport } from './planeReport';
import { planeFrame } from './planeScreen';
import { questFrame } from './questScreen';
import { grownItems, receiveItem } from './itemInstance';
import { initialState, SAVE_VERSION } from './save';
import { apply, applyDirective, startSession, view } from './session';
import type { ModalFrame } from './state';

// Which prose a world writes that nothing ever says to a player. A prose field is said to a player by
// a call site, not by a route: something asks the localizer for it or nothing ever does. So the
// question is asked of the field, answered by the world's own values of it, and one value turning up
// in something published settles the field — which is why a value behind a flag nobody sets costs
// nothing here and is not what this can see.
//
// It is asked of an author's sight rather than a player's route: the player is stood in front of
// everything the registry declares, carrying the lot. What that lets through is prose a player could
// never actually walk to; what it settles is whether anything says the field at all.

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

// Every value of every field a kind declares as prose, keyed the way the loader keys it, so the set
// is the review sheet's own and a kind or a field declared next month arrives here with no edit.
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

// The world again with a base minted for each cluster jewel, so a plane opens on one without a route
// to it, and one save per location carrying everything there is to carry.
function probedUniverse(sources: readonly ModuleSource[], world: Registry): { registry: Registry; jewelBases: readonly string[]; standings: ReadonlyMap<string, string> } {
  const jewels = [...world.clusterJewels.keys()];
  const locations = [...world.locations.keys()];
  const owners = [...new Set([...jewels.map((id) => world.namespace.ownerOf('cluster-jewel', id)), ...locations.map((id) => world.namespace.ownerOf('location', id))])].filter((owner): owner is string => owner !== null);
  const flat = (id: string): string => id.replace(/\./g, '-');
  const inventory = Object.fromEntries([...world.items.keys()].map((id) => [id, 1]));
  // A slot the world declares, read off it rather than named: an item naming one no entity wears is
  // refused, and which words a world uses for its slots is the world's business.
  const slot = [...world.entities.values()].flatMap((entity) => entity.equipmentSlots ?? [])[0];
  const text = [
    '# info prose-probe',
    'version: 1.0.0',
    'dependencies:',
    ...owners.map((owner) => `  ${owner}`),
    '',
    // The pack this author's sight fills is every item at once, which is more than any world would let a player carry.
    '# variable inventory-slots',
    'value: 0',
    // Numbered rather than named after the jewel: an id built out of a module's own words is title-cased into English that lands in the haystack below, and a field would then count as said because this file invented a name for it.
    ...jewels.flatMap((id, at) => ['', `# item base-${at}`, ...(slot === undefined ? [] : [`slot: ${slot}`]), 'item-level: 4', `origin-cluster: ${id}`]),
    ...locations.flatMap((id) => ['', `# save at-${flat(id)}`, JSON.stringify({ version: SAVE_VERSION, location: id, inventory })]),
  ].join('\n');
  return {
    registry: loadUniverse([...sources, { name: 'prose-probe', text }]),
    jewelBases: jewels.map((_id, at) => `prose-probe.base-${at}`),
    standings: new Map(locations.map((id) => [id, `prose-probe.at-${flat(id)}`])),
  };
}

// Everything the player is shown while stood there: the view itself, and the view again after each
// action a kind *mints* — the shape that carries a declared prose field into a spoken line, read off
// the kind's own `mintedActions` rather than off a list of verbs kept here.
function standing(registry: Registry, standings: ReadonlyMap<string, string>): string[] {
  const said: string[] = [];
  const session = startSession(registry);
  const mints = (obj: string, objId: string, actionId: string): boolean => {
    const value = mapOf(registry, obj)?.get(objId);
    return value !== undefined && (sectionFor(obj)?.mintedActions?.(value as never) ?? []).some((one) => actionAddress(one.action) === actionId);
  };
  for (const save of standings.values()) {
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

// Every screen the modal table names, opened over a state holding everything there is to hold. A
// screen added to `MODAL_NAMES` next month is opened here with nothing edited; one that wants more
// in its frame than a name publishes nothing and is answered by the walks below it.
function screens(registry: Registry, state: ReturnType<typeof initialState>): string[] {
  const said: string[] = [];
  for (const name of MODAL_NAMES) {
    try {
      soak(publishModal({ name, answers: {} } as ModalFrame, state, registry), said);
    } catch {
      /* a frame that names more than a screen is opened by the walks that know what it points at */
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
      /* an item with no plane opens no plane screen */
    }
  }
  return said;
}

const journals = (registry: Registry, state: ReturnType<typeof initialState>): string[] =>
  [...registry.quests.keys()].flatMap((quest) => {
    const said: string[] = [];
    soak(publishModal(questFrame(quest), state, registry), said);
    return said;
  });

// The probe is a module laid over the world, and a registry cannot be added to — so the sources are
// wanted as well as the registry they made, and the world is loaded again with the probe beside it.
export function publishedSurfaces(sources: readonly ModuleSource[], world: Registry): Surface[] {
  const { registry, jewelBases, standings } = probedUniverse(sources, world);
  const state = initialState(registry);
  const held = [...registry.items.keys()];
  for (const item of [...held, ...jewelBases]) receiveItem(state, registry, item, 1);
  // A base arrives as a copy of its own, and a copy is what its plane is opened under.
  const copies = Object.keys(grownItems(state));
  return [
    { name: 'standing somewhere', said: standing(registry, standings) },
    { name: 'the screens', said: screens(registry, state) },
    { name: 'the carried screen', said: carried(registry, state, [...held, ...copies]) },
    { name: 'a plane', said: planes(registry, state, [...held, ...copies]) },
    { name: 'the journal', said: journals(registry, state) },
  ];
}

// A field counts as said when one of the world's values of it turns up whole in something published.
export function unsaidFields(written: readonly Prose[], surfaces: readonly Surface[]): string[] {
  const haystack = surfaces.flatMap((surface) => surface.said).join(' ');
  const verdict = new Map<string, boolean>();
  for (const prose of written) verdict.set(proseAt(prose), (verdict.get(proseAt(prose)) ?? false) || (prose.words !== '' && haystack.includes(prose.words)));
  return [...verdict].flatMap(([field, said]) => (said ? [] : [field])).sort();
}

// A prose field a world may write that no player is told, and why the engine does not tell them. An
// entry is held to naming a field some kind actually declares, so one left behind after the words
// reach a surface is reported rather than quietly excusing nothing.
export const NOT_SAID: ReadonlyArray<{ field: string; why: string }> = [
  {
    field: 'event.title',
    why: 'named to the player by `engine.stopped.event` alone, which needs an action to write `stops on:`, and no action here writes one. The words are the engine\'s to say in a world that writes one',
  },
];
