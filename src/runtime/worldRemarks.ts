import { isBase } from '../content/sections/item';
import type { Registry } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { everyDirective, type Directive } from '../content/sections/test';
import { keywordsIn, type TagClause } from '../grammar/tagClause';
import { DEFAULT_CONTEXT } from '../grammar/section';
import type { Parser } from '../grammar/parser';
import { CHURNING_ROOTS, everyCondition, printCondition } from '../grammar/condition';
import { DEBUG_MARK, isDebug, sectionFor } from '../content/sections';
import { parseModuleSource } from '../content/universe';
import { loadUniverseWithDiagnostics } from '../content/load';
import { formatModuleDiagnostic } from '../content/registry';
import { rootModules } from '../content/worlds';
import { NOT_SAID, proseWritten, publishedSurfaces, unsaidFields } from './proseSaid';
import { grantsOf, passiveTags, passiveTagsOf } from './passiveGrant';
import { ladderForStat } from './pace';
import { loadSave } from './save';
import { createGameState } from './state';
import { staleTiers } from './tierSaves';

export interface Remark {
  where: string;
  says: string;
}

const REACHES: readonly Directive['kind'][] = ['load', 'run', 'expect', 'expect-only'];

const SPELLS_IT_OUT: readonly Directive['kind'][] = ['assert', 'refuse', 'journal'];

function unkept(registry: Registry): Remark[] {
  const kept = new Set([...registry.entities.values()].flatMap((entity) => (entity.shop === undefined ? [] : [entity.shop])));
  return [...registry.shops.values()].filter((shop) => !kept.has(shop.id)).map((shop) => ({ where: `# shop ${shop.id}`, says: 'no # entity keeps this, so there is no counter anywhere to stand at and nothing in the world can open it. Write `keeps shop:` on whoever is behind it.' }));
}

function pricedCoin(registry: Registry): Remark[] {
  return [...registry.shops.values()]
    .filter((shop) => registry.items.get(shop.coin)?.value !== undefined)
    .map((shop) => ({ where: `# shop ${shop.id}`, says: `counts in ${shop.coin}, which declares a value: of its own — so this shop would put a price on the very thing it prices in. Take the value: off the coin.` }));
}

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

function restated(registry: Registry): Remark[] {
  return [...registry.saves.entries()].flatMap(([id, saved]) =>
    (saved.over ?? []).flatMap((beneath) =>
      Object.entries(saved.diff)
        .filter(([field, value]) => JSON.stringify(registry.saves.get(beneath)?.diff[field]) === JSON.stringify(value))
        .map(([field]) => ({ where: `# save ${id}`, says: `writes ${JSON.stringify(field)}, which ${beneath} — the save it is written over — already writes to the letter. Take it out: what a layer says is what this one gets.` })),
    ),
  );
}

function unspoken(registry: Registry): Remark[] {
  return [...registry.tests.values()]
    .map((each) => ({ id: each.id, lines: everyDirective(each.directives) }))
    .filter((each) => each.lines.some((directive) => !REACHES.includes(directive.kind)))
    .filter((each) => !each.lines.some((directive) => SPELLS_IT_OUT.includes(directive.kind)))
    .filter((each) => !each.lines.some((directive) => directive.kind === 'expect'))
    .map((each) => {
      const sheets = each.lines.flatMap((directive) => (directive.kind === 'expect-only' ? [directive.save] : []));
      const only = sheets.length > 0 ? `save ${sheets.join(' and ')}` : 'nowhere at all';
      return { where: `# test ${each.id}`, says: `states no claim: what it proves lives in ${only}. Write the claim as assert: lines — \`npm run oracle -- test\` lists what a condition may read — or, where nothing a condition can read names it, close on expect: and say why in a comment.` };
    });
}

const pinnedBy = (test: { id: string; directives: readonly Directive[] }, churning: ReadonlySet<string>): Remark[] =>
  everyDirective(test.directives).flatMap((directive) =>
    directive.kind !== 'assert'
      ? []
      : everyCondition(directive.condition).flatMap((each) =>
          each.kind === 'comparison' && each.right.value !== 0 && churning.has(each.left.path[0] ?? '')
            ? [
                {
                  where: `# test ${test.id}`,
                  says: `pins ${printCondition(each)}, a figure that moves whenever the world's numbers do, so a pass over them breaks this route while the path it walks is still perfectly walkable. A route proves that a sequence of events yields a result and reports its cost and its reward rather than asserting either. Against zero the same line asks whether the thing happened at all and is fine; against any other number, say it with \`has <item>\` instead, or take it out. A route marked ${DEBUG_MARK} may pin what it likes: nothing tunes the numbers a world written to be walked by the engine holds.`,
                },
              ]
            : [],
        ),
  );

function pinned(registry: Registry): Remark[] {
  const churning = new Set<string>(CHURNING_ROOTS);
  return [...registry.tests.values()].flatMap((test) => (isDebug(test) ? [] : pinnedBy(test, churning)));
}

function unread(sources: readonly ModuleSource[], registry: Registry): Remark[] {
  const written = proseWritten(registry);
  const excused = new Map(NOT_SAID.map((each) => [each.field, each.why]));
  const held = new Set(written.map((prose) => `${prose.kind}.${prose.field}`));
  return [
    ...unsaidFields(written, publishedSurfaces(sources, registry)).flatMap((field) =>
      excused.has(field) ? [] : [{ where: `# ${field.split('.')[0]}`, says: `writes ${field.split('.').slice(1).join('.')}: and nothing in the game ever says it, so those words reach nobody.` }],
    ),
    ...[...excused.keys()].filter((field) => !held.has(field)).map((field) => ({ where: `NOT_SAID in src/runtime/proseSaid.ts`, says: `excuses ${field}, which nothing in this world writes. Take the entry out.` })),
  ];
}

function saidAnyway(sources: readonly ModuleSource[]): Remark[] {
  return sources.flatMap((source) =>
    parseModuleSource(source).sections.flatMap((section) => {
      const schema = sectionFor(section.kind)?.schema;
      if (schema === undefined) return [];
      const authored = section.value as Record<string, unknown>;
      return Object.entries(schema.fields).flatMap(([name, spec]) => {
        if (spec.printed !== 'unless-default' || spec.default === undefined || authored[name] === undefined) return [];
        const parser = spec.parser as Parser<unknown>;
        let printed;
        try {
          printed = parser.print(authored[name]);
          if (parser.print(spec.default(authored as never, DEFAULT_CONTEXT)) !== printed) return [];
        } catch {
          return [];
        }
        const keyword = spec.keyword ?? name;
        return [
          {
            where: `# ${section.kind} ${String(authored.id ?? '')}`,
            says: `writes ${keyword}: ${printed}, which is what ${keyword}: reads when it is left out. Nothing tells that apart from a copy of the default, so move the default and this line keeps the old answer while every body that stayed quiet follows. Take the line out, or write the value you mean.`,
          },
        ];
      });
    }),
  );
}

function unpacked(sources: readonly ModuleSource[]): Remark[] {
  return sources.flatMap((source) => {
    const info = parseModuleSource(source).info;
    return info.pack === undefined ? [{ where: `# info ${info.id}`, says: 'declares no pack:, so the settings page offers it as a collection of one under its own id. Name the collection it ships in.' }] : [];
  });
}

function rootless(sources: readonly ModuleSource[]): Remark[] {
  const byId = new Map(sources.map((source) => [parseModuleSource(source).info.id, source]));
  return rootModules(sources).flatMap((id) => {
    const source = byId.get(id);
    if (source === undefined) return [];
    const said = loadUniverseWithDiagnostics([source]).diagnostics.map(formatModuleDiagnostic);
    return said.length === 0 ? [] : [{ where: `# info ${id}`, says: `leans on nothing and will not load on its own: ${said[0]!}` }];
  });
}

const stale = (registry: Registry): Remark[] => staleTiers(registry).map((each) => ({ where: `# save ${each.save}`, says: each.says }));

function rotted(registry: Registry): Remark[] {
  return [...registry.saves.entries()].flatMap(([id, saved]) => {
    const where = `# save ${id}`;
    try {
      return loadSave(createGameState(), saved, registry).map((pruned) => ({
        where,
        says: `writes ${pruned.path}, and the loader prunes it before it can stand this up: ${pruned.message} The body still reads and still loads, and no longer means what it says — \`npm run repair-saves\` looks back through history for what that id became.`,
      }));
    } catch (error) {
      return [{ where, says: `will not load at all: ${error instanceof Error ? error.message : String(error)}` }];
    }
  });
}

function lopsided(registry: Registry): Remark[] {
  const modulesOf = new Set([...registry.clusterJewels.keys()].map((id) => id.slice(0, id.indexOf('.'))));
  return [...modulesOf].flatMap((namespace) => {
    const own = (id: string): boolean => id.startsWith(`${namespace}.`);
    const wordsOn = (tags: readonly TagClause[]): string[] => keywordsIn(tags, []).beyond;
    const shared = new Set([...registry.passives.values()].filter((passive) => !own(passive.id)).flatMap((passive) => wordsOn(passiveTags(registry, passive))));
    const jewels = [...registry.clusterJewels.values()].filter((jewel) => own(jewel.id));
    const carried = (jewel: { positions: Record<number, string> }): TagClause[] => Object.values(jewel.positions).flatMap((passiveId) => passiveTagsOf(registry, passiveId));

    const by = new Map<string, string[]>();
    for (const jewel of jewels) {
      for (const word of new Set(wordsOn(carried(jewel)).filter((each) => !shared.has(each)))) by.set(word, [...(by.get(word) ?? []), jewel.id]);
    }
    return [...by].flatMap(([archetype, carriers]) => {
      if (carriers.length < 2 || carriers.length === jewels.length) return [];
      const led = carriers.map((id) => {
        const bonuses = carried(registry.clusterJewels.get(id)!).flatMap((tag) => (tag.kind === 'stat-bonus' ? [tag] : []));
        return bonuses.filter((each) => each.percent).length > bonuses.filter((each) => !each.percent).length ? 'increased' : 'added';
      });
      return new Set(led).size > 1 ? [] : [{ where: `# cluster-jewel ${carriers.join(', ')}`, says: `are every jewel of the ${archetype} archetype and all of them lead with ${led[0]}. An archetype wants one that adds and one that multiplies, or half of it is unreachable.` }];
    });
  });
}

function undealt(registry: Registry): Remark[] {
  const dealt = new Set([...registry.stats.values()].flatMap((each) => (each.deals === undefined ? [] : [each.deals])));
  return [...registry.stats.values()].flatMap((each) => {
    const read = each.resists ?? each.converts?.from;
    if (read === undefined || dealt.has(read)) return [];
    const role = each.resists !== undefined ? `resists ${read}` : `converts ${read}`;
    return [{ where: `# stat ${each.id}`, says: `${role}, and no stat anywhere deals it, so nothing this reads can ever land. Declare a stat that \`deals: ${read}\`, or take the role off.` }];
  });
}

function unladdered(registry: Registry): Remark[] {
  return [...registry.passives.values()].flatMap((passive) =>
    grantsOf(passive)
      .filter((grant) => ladderForStat(registry, grant.statId) === undefined)
      .map((grant) => ({
        where: `# passive ${passive.id}`,
        says: `grants ${String(grant.times)}x ${grant.axis} ${grant.statId}, and ${grant.statId} climbs no # ladder, so there is nothing to take a multiple of and the line grants nothing at all. Declare a ladder for it, or write the amount out as an ordinary modifier`,
      })),
  );
}

type Rule = (sources: readonly ModuleSource[], registry: Registry) => Remark[];

const RULES: readonly Rule[] = [
  (_sources, registry) => unkept(registry),
  (_sources, registry) => pricedCoin(registry),
  (_sources, registry) => stackedBases(registry),
  (_sources, registry) => restated(registry),
  (_sources, registry) => unspoken(registry),
  (_sources, registry) => pinned(registry),
  (_sources, registry) => stale(registry),
  (_sources, registry) => rotted(registry),
  (_sources, registry) => lopsided(registry),
  (_sources, registry) => undealt(registry),
  (_sources, registry) => unladdered(registry),
  (sources) => saidAnyway(sources),
  (sources) => unpacked(sources),
  (sources) => rootless(sources),
  unread,
];

export const remarksOn = (sources: readonly ModuleSource[], registry: Registry): readonly Remark[] => RULES.flatMap((rule) => rule(sources, registry));
