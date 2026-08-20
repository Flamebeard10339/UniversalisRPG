import { ActionResult } from '../../grammar/actionResult';
import { TagClause } from '../../grammar/tagClause';
import { Section, Watcher } from './section.oop';

// Everything the `# passive` section is. It shares the tag-clause body `# item`
// uses — bare words are tags, `+N stat` and `+N% stat` are payloads — and it
// carries the two hook blocks for the same reason an item does: whoever holds
// it answers the moment, and a passive is held.
export interface Passive {
  id: string;
  title: string;
  examine?: string;
  tags: TagClause[];
  onHit: ActionResult[];
  whenHit: ActionResult[];
}

class PassiveSection extends Section<Passive> {
  readonly kind = 'passive';

  readonly examples = [
    // A payload and the words for it.
    `# passive iron-skin
examine: Your hide thickens.
+3 armour`,
    // Percentages are not ranges, so they are as welcome here as anywhere.
    `# passive fleetness
title: Fleetness
+8% attack-speed, swift`,
    // A passive is held, so it answers the two moments its holder does.
    `# passive spinescale
when hit: drain: 1 health from them`,
  ];

  // A passive is a payload rather than a thing you act with, so an unclaimed
  // label is a mistake rather than a verb it offers.
  protected override readonly offersActions = false;

  // A passive is always on: there is no moment at which a range could roll, and
  // rolling once at allocation would put a per-position number in every saved
  // instance rather than nothing. So its payload is one value.
  protected declareFields(section: Watcher<Passive, never>) {
    return section.titled().described().tags('constant').hooks();
  }
}

// The one door. `passive.parse(source)` is a `Passive`; nothing else is reachable.
export const passive = new PassiveSection();
