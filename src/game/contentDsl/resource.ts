import { ActionResult, actionResult } from './actionResult';
import { list } from './list';
import { DslError, Parser } from './parser';
import { SectionSchema } from './section';
import { humanize, id, decimal, text } from './values';

// A pool (health, energy, a rage meter...) whose `current` level the resolver
// integrates over time. Its rate is a single stat's NET value **per minute**:
// positive regenerates, negative drains — regen and drain are the same stat with
// opposite sign, and an action drains/boosts a pool only by carrying stat-bonus
// tag clauses (`-5 regeneration`) that shift that stat while it runs, exactly
// like a food buff or a piece of equipment. Effects never touch a pool directly.
export type ResourceDisplay = 'full' | 'minimal';

export interface Resource {
  id: string;
  title: string;
  // Stat id whose live value (statValue) is the per-minute rate. Absent = a
  // static pool that never changes on its own.
  rate?: string;
  // Stat id whose live value is the pool's maximum (so a +max buff raises the
  // cap). Required — validated at load.
  max: string;
  // Where `current` begins on a fresh game; absent means start full (= max).
  start?: number;
  // How a driver renders the pool (see the play-cli readout): a full bar, or a
  // single character stepping through ~8 stages.
  display: ResourceDisplay;
  // Fires once when `current` transitions from >0 to 0 (see resolve()).
  onEmpty: ActionResult[];
  // Presence turns the pool into a rollover meter: on reaching max it resets to
  // 0 and fires these effects (batched per rollover). Empty = a plain capped pool.
  onFull: ActionResult[];
}

const RESOURCE_DISPLAYS = ['full', 'minimal'] as const;

const displayValue: Parser<ResourceDisplay> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = id.parse(cursor);
    if (!(RESOURCE_DISPLAYS as readonly string[]).includes(raw)) {
      throw new DslError(`resource display must be one of ${RESOURCE_DISPLAYS.join(', ')}, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return raw as ResourceDisplay;
  },
};

export const resourceSchema: SectionSchema<Resource> = {
  kind: 'resource',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    rate: { parser: id },
    max: { parser: id },
    start: { parser: decimal },
    display: { parser: displayValue, default: () => 'full' },
    onEmpty: { parser: list(actionResult), keyword: 'on empty', default: () => [] },
    onFull: { parser: list(actionResult), keyword: 'on full', default: () => [] },
  },
};
