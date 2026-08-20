// OPEN REVIEW FINDINGS — 2026-08-20. Nothing below is fixed.
//
//   4. `slot:` is declared `names: 'slot'`, which would break every module's
//      equipment if this were wired in. `ReferenceKind` has no `slot` member,
//      `visitSection`'s `case 'item'` deliberately does not resolve it, and
//      `sectionKind.ts` has `slot: { ids: 'global' }` — a slot id belongs to
//      nobody so that `mainhand` means the same thing everywhere, and is
//      checked against what `equipment-slots:` declares. Resolution rewrites a
//      reference into a namespaced key, so this would mint `mymodule.mainhand`.
//      The underlying hole: `FieldOptions.names` is a free string with nothing
//      tying it to the resolver's vocabulary, so a wrong one is invisible until
//      it runs.
//
//  10. `clusterEffect` here is byte-identical to the parser in `item.ts`, and
//      nothing exercises this copy's `examples` — the codec walks glob
//      `./*.ts` and never descend into this directory. The nine fields and
//      their order below are also a second spelling of `serialize.ts`'s
//      `itemSection`, which is that printer's whole content. While both
//      engines exist, that pair is hand-synced.

import { Action } from '../../grammar/action';
import { ActionResult } from '../../grammar/actionResult';
import { DslError, Parser } from '../../grammar/parser';
import { id, number } from '../../grammar/values';
import { TagClause } from '../../grammar/tagClause';
import { LineField, NestedIdField, Section, Watcher } from './section.oop';

// Everything the `# item` section is. A caller hands this file text and takes
// back an object; nothing outside knows an item has a `slot:` or that
// `max-level:` defaults to 99, so a field watched below is a field the printer,
// the reference walk and the locale keys pick up with no edit anywhere else.
export interface Item {
  id: string;
  title: string;
  examine?: string;
  slot?: string;
  tags: TagClause[];
  clusterJewel?: string;
  originCluster?: string;
  clusterEffect?: ClusterEffect;
  itemExperience?: number;
  maxLevel: number;
  onHit: ActionResult[];
  whenHit: ActionResult[];
  actions: Action[];
}

// A percentage and a stat, written `+25% max-health`. Narrower than a tag
// clause on purpose: an orb grants one scaled bonus, not an arbitrary clause.
export interface ClusterEffect {
  statId: string;
  percent: number;
}

const CLUSTER_EFFECT = /^(?<sign>[+-])(?<amount>\d+)%[ \t]+(?<stat>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/;

const clusterEffect: Parser<ClusterEffect> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = (cursor.take(/[^\n]+/) ?? '').trim();
    const groups = CLUSTER_EFFECT.exec(raw)?.groups;
    if (!groups) throw new DslError(`expected a percent stat bonus like +25% max-health, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    return { statId: groups.stat!, percent: Number(groups.amount) * (groups.sign === '-' ? -1 : 1) };
  },
  print: (value) => `${value.percent < 0 ? '-' : '+'}${Math.abs(value.percent)}% ${value.statId}`,
  examples: ['+25% max-health', '-10% max-health'],
};

// You grow what you can wear: a base is spelled `slot:` and nothing else.
export const isBase = (item: Item): boolean => item.slot !== undefined;

class ItemSection extends Section<Item> {
  readonly kind = 'item';

  protected override readonly offersActions = true;

  readonly examples = [
    // What most items are: some words and a payload.
    `# item cooked-shrimp
examine: A simple meal.
food, +3 regeneration, 30s`,
    // A base — worn, levelled, answering both moments, and offering a verb.
    `# item venomous-blade
title: Venomous Blade
examine: The edge weeps a slow green.
slot: mainhand
+4-7 attack, +2 attack per fury
item-experience: 5
max-level: 40
on hit:
  1 in 4:
    drain: 3 health from them
when hit: drain: 2 health from them
swing: say: You swing it.`,
    // A base whose plane starts at a named jewel.
    `# item bramble-crown
slot: head
origin-cluster: crown-of-briars`,
    // The two growth roles, neither of which a base may also be.
    `# item small-attack-jewel
examine: It fits a socket.
cluster-jewel: small-attack-cluster`,
    `# item orb-of-vigour
examine: It hums.
cluster-effect: +25% max-health`,
  ];

  protected declareFields(section: Watcher<Item, never>) {
    return section
      .titled()
      .described()
      .watch('slot', new LineField<string>('slot', id, { names: 'slot' }))
      .tags()
      .watch('clusterJewel', new LineField<string>('cluster-jewel', id, { names: 'cluster-jewel' }), { excludes: ['slot', 'originCluster'] })
      .watch('originCluster', new LineField<string>('origin-cluster', id, { names: 'cluster-jewel' }), { requires: ['slot'] })
      .watch('clusterEffect', new NestedIdField<ClusterEffect>('cluster-effect', clusterEffect, { names: 'stat' }, (value) => value.statId), { excludes: ['slot', 'originCluster'] })
      .watch('itemExperience', new LineField<number>('item-experience', number))
      // 99 is an unbounded sentinel a base lowers to tier itself.
      .watch('maxLevel', new LineField<number>('max-level', number), { fallback: () => 99 })
      .hooks();
  }
}

// The one door. `item.parse(source)` is an `Item`; nothing else is reachable.
export const item = new ItemSection();
