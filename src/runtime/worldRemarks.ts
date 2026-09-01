import { isDebug } from '../content/sections';
import { isBase } from '../content/sections/item';
import type { Registry } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import type { Directive } from '../content/sections/test';
import { keywordsIn, type TagClause } from '../grammar/tagClause';
import { parseModuleSource } from '../content/universe';
import { loadUniverseWithDiagnostics } from '../content/load';
import { formatModuleDiagnostic } from '../content/registry';
import { rootModules } from '../content/worlds';
import { NOT_SAID, proseWritten, publishedSurfaces, unsaidFields } from './proseSaid';
import { staleTiers } from './tierSaves';

// What is wrong with a world that the loader will still take. A refusal stops the game; these do
// not, because every one of them is a thing an author is halfway through — a quarter with no road
// into it yet, a route whose claim is not written down. They are said by `npm run oracle` and by
// nothing else, which is the whole arrangement: the corpus's verdict is the oracle's, and no test
// may read a line of `content/`. `docs/authoring-split/` says why.
//
// Each rule below derives its own subjects from the registry, so a section written next month is
// held to it with no edit here. A rule that could name its subjects instead does not belong here.

export interface Remark {
  // The section the remark is about, written `# <kind> <id>`, so an author can go straight to it.
  where: string;
  says: string;
}

// A directive that reaches a state someone else's route already reached, rather than walking one of
// its own: it has nothing to claim beyond what it re-runs or re-checks.
const REACHES: readonly Directive['kind'][] = ['load', 'run', 'expect', 'expect-only'];

// Where a test's claim is written in words. `refuse:` is one: it names the growth that must not
// take, which is as readable as an assertion and is how the growth routes state theirs.
const SPELLS_IT_OUT: readonly Directive['kind'][] = ['assert', 'refuse', 'journal'];

// Every place a player can walk to from where a new game begins. A DEBUG location ships to nobody
// and nothing a player reaches may name it, so there is no road to it by construction: it is stood
// in by a save that says so, and the walk cannot be asked for.
function stranded(registry: Registry): Remark[] {
  const start = [...registry.locations.values()].find((location) => location.starting);
  if (start === undefined) return [];
  const seen = new Set([start.id]);
  const frontier = [start.id];
  while (frontier.length > 0) {
    const here = frontier.pop()!;
    for (const edge of registry.roads.get(here) ?? []) {
      if (seen.has(edge.target)) continue;
      seen.add(edge.target);
      frontier.push(edge.target);
    }
  }
  return [...registry.locations.values()]
    .filter((location) => !isDebug(location) && !seen.has(location.id))
    .map((location) => ({ where: `# location ${location.id}`, says: `no road reaches this from ${start.id}, where a new game begins, so nobody can walk to it. A road answers from both ends: write it at either.` }));
}

// A shop is reached at the counter the entity keeping it stands behind, so a shop nobody keeps
// stands nowhere.
function unkept(registry: Registry): Remark[] {
  const kept = new Set([...registry.entities.values()].flatMap((entity) => (entity.shop === undefined ? [] : [entity.shop])));
  return [...registry.shops.values()].filter((shop) => !kept.has(shop.id)).map((shop) => ({ where: `# shop ${shop.id}`, says: 'no # entity keeps this, so there is no counter anywhere to stand at and nothing in the world can open it. Write `keeps shop:` on whoever is behind it.' }));
}

// A shop counts in a coin, and will neither buy nor sell that coin. A coin that declares a `value:`
// of its own is therefore something the shop would price and refuse in the same breath.
function pricedCoin(registry: Registry): Remark[] {
  return [...registry.shops.values()]
    .filter((shop) => registry.items.get(shop.coin)?.value !== undefined)
    .map((shop) => ({ where: `# shop ${shop.id}`, says: `counts in ${shop.coin}, which declares a value: of its own — so this shop would put a price on the very thing it prices in. Take the value: off the coin.` }));
}

// A base is minted as a copy of its own the moment it drops, so it never joins a stack: a save that
// writes one under `inventory` is a state no route through the world reaches.
function stackedBases(registry: Registry): Remark[] {
  const bases = new Set([...registry.items.values()].filter(isBase).map((item) => item.id));
  return [...registry.saves.entries()].flatMap(([id, save]) => {
    const inventory = save.diff.inventory;
    if (typeof inventory !== 'object' || inventory === null || Array.isArray(inventory)) return [];
    return Object.keys(inventory)
      .filter((itemId) => bases.has(itemId))
      .map((itemId) => ({ where: `# save ${id}`, says: `carries ${itemId} under "inventory", which no route through the world reaches: receiveItem mints a base as an instance, so write it under "instances" as a copy with a roll of its own.` }));
  });
}

// A save written over another takes every field the layer beneath it writes, so restating one to the
// letter says nothing — and goes stale where it stands the day the layer changes.
function restated(registry: Registry): Remark[] {
  return [...registry.saves.entries()].flatMap(([id, saved]) =>
    (saved.over ?? []).flatMap((beneath) =>
      Object.entries(saved.diff)
        .filter(([field, value]) => JSON.stringify(registry.saves.get(beneath)?.diff[field]) === JSON.stringify(value))
        .map(([field]) => ({ where: `# save ${id}`, says: `writes ${JSON.stringify(field)}, which ${beneath} — the save it is written over — already writes to the letter. Take it out: what a layer says is what this one gets.` })),
    ),
  );
}

// A route that walks somewhere states what it proved in words. `expect:` is the deliberate exception
// — it compares the whole sheet, and is the one form that can say a key the state no longer holds is
// gone, an absence no condition can name.
function unspoken(registry: Registry): Remark[] {
  return [...registry.tests.values()]
    .filter((each) => each.directives.some((directive) => !REACHES.includes(directive.kind)))
    .filter((each) => !each.directives.some((directive) => SPELLS_IT_OUT.includes(directive.kind)))
    .filter((each) => !each.directives.some((directive) => directive.kind === 'expect'))
    .map((each) => {
      const sheets = each.directives.flatMap((directive) => (directive.kind === 'expect-only' ? [directive.save] : []));
      const only = sheets.length > 0 ? `save ${sheets.join(' and ')}` : 'nowhere at all';
      return { where: `# test ${each.id}`, says: `states no claim: what it proves lives in ${only}. Write the claim as assert: lines — \`npm run oracle -- test\` lists what a condition may read — or, where nothing a condition can read names it, close on expect: and say why in a comment.` };
    });
}

// Prose a world writes that nothing in the game ever says. A field is asked about rather than one
// value of it, because whether the engine has a surface for `# entity examine:` at all is what one
// value settles — a line behind a flag nobody has set is not something this can see. What it does
// catch is words written into a kind the game has no screen for, which is writing thrown away.
function unread(sources: readonly ModuleSource[], registry: Registry): Remark[] {
  const written = proseWritten(registry);
  const excused = new Map(NOT_SAID.map((each) => [each.field, each.why]));
  const held = new Set(written.map((prose) => `${prose.kind}.${prose.field}`));
  return [
    ...unsaidFields(written, publishedSurfaces(sources, registry)).flatMap((field) =>
      excused.has(field) ? [] : [{ where: `# ${field.split('.')[0]}`, says: `writes ${field.split('.').slice(1).join('.')}: and nothing in the game ever says it, so those words reach nobody.` }],
    ),
    // An excuse for a field this world does not write is an excuse for nothing, and goes stale where
    // it stands. It is reported the same way, so the list cannot rot quietly.
    ...[...excused.keys()].filter((field) => !held.has(field)).map((field) => ({ where: `NOT_SAID in src/runtime/proseSaid.ts`, says: `excuses ${field}, which nothing in this world writes. Take the entry out.` })),
  ];
}

// A pack is what a player installs and turns on as one thing, so a module that declares none is one
// nobody can turn off — it draws a row of its own on the portal under its own id, which is a pack of
// one that its author did not mean to make.
function unpacked(sources: readonly ModuleSource[]): Remark[] {
  return sources.flatMap((source) => {
    const info = parseModuleSource(source).info;
    return info.pack === undefined ? [{ where: `# info ${info.id}`, says: 'declares no pack:, so the settings page offers it as a collection of one under its own id. Name the collection it ships in.' }] : [];
  });
}

// A module nothing loads before it has nothing to lean on, so it has to load alone or it cannot load
// at all — and a world is written from its roots outward, so one that will not is a module the next
// module written on top of cannot be started either.
function rootless(sources: readonly ModuleSource[]): Remark[] {
  const byId = new Map(sources.map((source) => [parseModuleSource(source).info.id, source]));
  return rootModules(sources).flatMap((id) => {
    const source = byId.get(id);
    if (source === undefined) return [];
    const said = loadUniverseWithDiagnostics([source]).diagnostics.map(formatModuleDiagnostic);
    return said.length === 0 ? [] : [{ where: `# info ${id}`, says: `leans on nothing and will not load on its own: ${said[0]!}` }];
  });
}

// A reference build that has gone stale against the curve under it, or against the gear it is
// already carrying. The file on disk reads exactly as it did, so nothing else would ever say.
const stale = (registry: Registry): Remark[] => staleTiers(registry).map((each) => ({ where: `# save ${each.save}`, says: each.says }));

// An archetype is a word of an author's own that a module's passives carry and nothing outside it
// does — one the engine acts on nowhere, which is what `keywordsIn` hands back as `beyond`. Which
// archetypes a module has is read off its passives rather than declared. Each is meant to be
// reachable two ways — a jewel that adds and a jewel that multiplies — because a player who can
// only find one of them has half a build, and nothing but this would ever say so.
function lopsided(registry: Registry): Remark[] {
  const modulesOf = new Set([...registry.clusterJewels.keys()].map((id) => id.slice(0, id.indexOf('.'))));
  return [...modulesOf].flatMap((namespace) => {
    const own = (id: string): boolean => id.startsWith(`${namespace}.`);
    const wordsOn = (tags: readonly TagClause[]): string[] => keywordsIn(tags, []).beyond;
    const shared = new Set([...registry.passives.values()].filter((passive) => !own(passive.id)).flatMap((passive) => wordsOn(passive.tags)));
    const jewels = [...registry.clusterJewels.values()].filter((jewel) => own(jewel.id));
    const carried = (jewel: { positions: Record<number, string> }): TagClause[] => Object.values(jewel.positions).flatMap((passiveId) => registry.passives.get(passiveId)?.tags ?? []);

    const by = new Map<string, string[]>();
    for (const jewel of jewels) {
      for (const word of new Set(wordsOn(carried(jewel)).filter((each) => !shared.has(each)))) by.set(word, [...(by.get(word) ?? []), jewel.id]);
    }
    return [...by].flatMap(([archetype, carriers]) => {
      // A word every one of a module's jewels carries divides nothing and is a label rather than an
      // archetype: what makes one is that it tells some of them apart from the rest.
      if (carriers.length < 2 || carriers.length === jewels.length) return [];
      const led = carriers.map((id) => {
        const bonuses = carried(registry.clusterJewels.get(id)!).flatMap((tag) => (tag.kind === 'stat-bonus' ? [tag] : []));
        return bonuses.filter((each) => each.percent).length > bonuses.filter((each) => !each.percent).length ? 'increased' : 'added';
      });
      return new Set(led).size > 1 ? [] : [{ where: `# cluster-jewel ${carriers.join(', ')}`, says: `are every jewel of the ${archetype} archetype and all of them lead with ${led[0]}. An archetype wants one that adds and one that multiplies, or half of it is unreachable.` }];
    });
  });
}

// A rule that only wants the registry, and one that has to run the world to answer. Both are asked
// of every world the oracle is pointed at, and each derives its own subjects.
const RULES: readonly ((registry: Registry) => Remark[])[] = [stranded, unkept, pricedCoin, stackedBases, restated, unspoken, stale, lopsided];
const WALKING_RULES: readonly ((sources: readonly ModuleSource[], registry: Registry) => Remark[])[] = [unread, (sources) => unpacked(sources), (sources) => rootless(sources)];

export const remarksOn = (sources: readonly ModuleSource[], registry: Registry): readonly Remark[] => [
  ...RULES.flatMap((rule) => rule(registry)),
  ...WALKING_RULES.flatMap((rule) => rule(sources, registry)),
];
