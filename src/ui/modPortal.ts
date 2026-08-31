import type { ModuleStatus } from '../content/registry';

// One module as the portal offers it. `name` is what a toggle sends, because a source is named
// before it is parsed and the name is the only handle a stored set can hold it by; `id` is what a
// player reads, because that is what the module calls itself.
export interface PortalModule {
  readonly name: string;
  readonly id: string;
  // Whether the player has left it on. A module that is on and did not load was refused by the
  // loader — it leans on something turned off, or it is broken — and the page says so rather than
  // quietly showing it as off.
  readonly on: boolean;
  readonly loaded: boolean;
}

export type Standing = 'all' | 'none' | 'some';

// What a player installs and turns on as one thing, which is the pack a module's own `# info`
// declares. A module declaring none is a pack of itself rather than a member of some catch-all, so
// nothing here has to know which packs exist.
export interface PortalPack {
  readonly pack: string;
  readonly modules: readonly PortalModule[];
  readonly standing: Standing;
}

const standingOf = (modules: readonly PortalModule[]): Standing => {
  if (modules.every((module) => module.on)) return 'all';
  if (modules.every((module) => !module.on)) return 'none';
  return 'some';
};

// The portal's rows, read off what the load path was handed rather than off a list of its own: a
// module added, renamed, or moved to another pack next month arrives here with nothing edited.
// Packs and the modules under them are ordered by the names they are read by, which is an order the
// page can derive rather than one somebody has to keep. What a player reads is not decided here: a
// name on the screen is the engine's to give, and the page asks the localizer for it.
export function packsOf(statuses: readonly ModuleStatus[]): readonly PortalPack[] {
  const held = new Map<string, PortalModule[]>();
  for (const status of statuses) {
    const module: PortalModule = { name: status.sourceName, id: status.moduleId, on: status.enabled, loaded: status.loaded };
    const pack = status.pack ?? status.moduleId;
    held.set(pack, [...(held.get(pack) ?? []), module]);
  }
  return [...held.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pack, modules]) => {
      const sorted = [...modules].sort((left, right) => left.id.localeCompare(right.id));
      return { pack, modules: sorted, standing: standingOf(sorted) };
    });
}

// The set the page is standing on, read back off the rows it is drawing rather than kept beside
// them. There is one answer to *what is off* and this is where a caller gets it.
export const modulesOff = (packs: readonly PortalPack[]): readonly string[] => packs.flatMap((pack) => pack.modules.filter((module) => !module.on).map((module) => module.name));

// The set a click leaves behind. Turning a pack on or off is turning each of its modules on or off
// and nothing besides, so there is one answer to *what is off* and the pack row is a control over
// it rather than a second thing to keep in step with it.
export function turned(off: Iterable<string>, names: readonly string[], on: boolean): string[] {
  const next = new Set(off);
  for (const name of names) {
    if (on) next.delete(name);
    else next.add(name);
  }
  return [...next].sort();
}

// What clicking a pack row means: a pack fully on is turned off, and one that is off or half on is
// turned on the rest of the way. So the row always has somewhere to go, and a half-on pack answers
// the click the way the player who made it half-on would expect.
export const packTurnsTo = (pack: PortalPack): boolean => pack.standing !== 'all';

// A module the player left on that the loader would not take. It is not a refusal the portal can
// explain — the load path says why, in the problems the page already carries — but it is the
// difference between a row that is off and a row that is on and did nothing.
export const refused = (packs: readonly PortalPack[]): readonly PortalModule[] => packs.flatMap((pack) => pack.modules.filter((module) => module.on && !module.loaded));
