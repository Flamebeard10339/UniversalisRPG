import { describe, expect, it } from 'vitest';
import { loadUniverse } from '../content/load';
import { localeKey } from '../content/locale';
import type { Registry } from '../content/registry';
import { registryMapOf, sectionFor, sections } from '../content/sections';
import { actionAddress } from '../content/sections/action';
import { parseUseChoiceId } from '../content/sections/test';
import { shippedSources } from '../content/shipped';
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

// A prose field a kind declares is said to a player by a call site, not by a route: something asks
// the localizer for it or nothing ever does. So the question is asked of the field, answered by the
// corpus's own values of it, and one value turning up in something published settles the field —
// which is why a value behind a flag nobody sets costs nothing here and is not what this can see.
interface Prose {
  readonly kind: string;
  readonly field: string;
  readonly key: string;
  readonly words: string;
}

const at = (prose: { kind: string; field: string }): string => `${prose.kind}.${prose.field}`;

const mapOf = (registry: Registry, kind: string): ReadonlyMap<string, { id: string }> | undefined => {
  const name = registryMapOf(kind);
  return name === null ? undefined : (registry as unknown as Record<string, ReadonlyMap<string, { id: string }>>)[name];
};

// Every value of every field a kind declares as prose, keyed the way the loader keys it, so the set
// is the review sheet's own and a kind or a field declared next month arrives here with no edit.
function proseWritten(registry: Registry): Prose[] {
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

interface Surface {
  readonly name: string;
  readonly said: readonly string[];
}

function soak(value: unknown, into: string[]): void {
  if (typeof value === 'string') return void into.push(value);
  if (value === null || typeof value !== 'object') return;
  for (const each of Object.values(value as Record<string, unknown>)) soak(each, into);
}

// A world with the player stood in front of everything the registry declares: a base item minted for
// each cluster jewel, so a plane opens on one without a route to it, and one save per location
// carrying the lot. It is an author's sight, not a player's route — what it lets through is prose a
// player could never actually walk to, and what it settles is whether anything says the field at all.
function probedUniverse(shipped: Registry): { registry: Registry; jewelBases: readonly string[]; standings: ReadonlyMap<string, string> } {
  const jewels = [...shipped.clusterJewels.keys()];
  const locations = [...shipped.locations.keys()];
  const owners = [...new Set([...jewels.map((id) => shipped.namespace.ownerOf('cluster-jewel', id)), ...locations.map((id) => shipped.namespace.ownerOf('location', id))])].filter((owner): owner is string => owner !== null);
  const flat = (id: string): string => id.replace(/\./g, '-');
  const inventory = Object.fromEntries([...shipped.items.keys()].map((id) => [id, 1]));
  const text = [
    '# info prose-probe',
    'version: 1.0.0',
    'dependencies:',
    ...owners.map((owner) => `  ${owner}`),
    '',
    // The pack this author's sight fills is every item at once, which is more than any world would let a player carry.
    '# variable inventory-slots',
    'value: 0',
    ...jewels.flatMap((id) => ['', `# item base-${flat(id)}`, 'slot: mainhand', 'item-level: 4', `origin-cluster: ${id}`]),
    ...locations.flatMap((id) => ['', `# save at-${flat(id)}`, JSON.stringify({ version: SAVE_VERSION, location: id, inventory })]),
  ].join('\n');
  return {
    registry: loadUniverse([...shippedSources(), { name: 'prose-probe', text }]),
    jewelBases: jewels.map((id) => `prose-probe.base-${flat(id)}`),
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
// in its frame than a name publishes nothing and is answered by the two below it.
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

const journals = (registry: Registry, state: ReturnType<typeof initialState>): string[] => [...registry.quests.keys()].flatMap((quest) => {
  const said: string[] = [];
  soak(publishModal(questFrame(quest), state, registry), said);
  return said;
});

function published(shipped: Registry): Surface[] {
  const { registry, jewelBases, standings } = probedUniverse(shipped);
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

// A field counts as said when one of the corpus's values of it turns up whole in something published.
function unsaidFields(written: readonly Prose[], surfaces: readonly Surface[]): string[] {
  const haystack = surfaces.flatMap((surface) => surface.said).join(' ');
  const verdict = new Map<string, boolean>();
  for (const prose of written) verdict.set(at(prose), (verdict.get(at(prose)) ?? false) || (prose.words !== '' && haystack.includes(prose.words)));
  return [...verdict].flatMap(([field, said]) => (said ? [] : [field])).sort();
}

// A prose field the corpus writes that no player is told, and why the engine does not tell them. An
// entry is held to naming a field some kind actually declares and the corpus actually writes, so one
// left behind after the words reach a surface fails rather than quietly excusing nothing.
const NOT_SAID: ReadonlyArray<{ field: string; why: string }> = [
  {
    field: 'event.title',
    why: 'named to the player by `engine.stopped.event` alone, which needs an action to write `stops on:`, and the corpus writes none. The words are the engine\'s to say in a world that writes one',
  },
];

describe('every prose field a kind declares reaches a player', () => {
  const shipped = loadUniverse(shippedSources());
  const written = proseWritten(shipped);
  const surfaces = published(shipped);

  it('derives its subjects from the corpus, so a claim over nothing cannot pass', () => {
    expect(new Set(written.map(at)).size).toBeGreaterThan(15);
    expect(written.length).toBeGreaterThan(300);
    for (const surface of surfaces) expect(surface.said.length, surface.name).toBeGreaterThan(0);
  });

  it('says the words somewhere, or says why the engine has no surface for them', () => {
    expect(unsaidFields(written, surfaces)).toEqual(NOT_SAID.map((each) => each.field).sort());
  });

  it('excuses no field a kind does not declare or the corpus does not write, and no excuse is a placeholder', () => {
    const real = new Set(written.map(at));
    expect(NOT_SAID.filter((each) => !real.has(each.field) || each.why.length <= 20).map((each) => each.field)).toEqual([]);
  });

  // The three defects this was built out of, each found by hand one kind at a time: an entity's
  // examine reaching no surface at all, an item's read by nobody, a jewel's dropped by the screen
  // that stands the player in it. Take the surface back off and the claim names the field again.
  it('names the field again when the surface that said it is taken away', () => {
    const without = (dropped: string): string[] => unsaidFields(written, surfaces.filter((surface) => surface.name !== dropped));
    const excused = NOT_SAID.map((each) => each.field);

    expect(without('standing somewhere')).toEqual([...excused, 'entity.examine', 'group.title', 'location.examine', 'location.title', 'quest.title', 'slot.title'].sort());
    expect(without('the carried screen')).toEqual([...excused, 'item.examine'].sort());
    expect(without('a plane')).toEqual([...excused, 'cluster-jewel.examine'].sort());
  });
});
