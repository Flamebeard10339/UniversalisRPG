import { ActionResult } from '../grammar/actionResult';
import { HookCarrier } from '../grammar/hook';
import { applyResults, Segment } from './effects';
import { modifierCarriers } from './stats';
import { GameState } from './state';
import { Registry } from '../content/registry';

// Which of a carrier's two blocks a moment reads.
export type Moment = keyof HookCarrier;

// Every hook a character carries for one moment, its carriers in the order the
// modifier walk returns them, which is the order a stat bonus folds in. An
// unequipped item is not on that walk, so its hook reaches nobody.
export function characterHooks(state: GameState, registry: Registry, actorId: string, moment: Moment): ActionResult[][] {
  return modifierCarriers(state, registry, actorId)
    .map((carrier) => carrier.hooks?.[moment] ?? [])
    .filter((results) => results.length > 0);
}

// The one firing point there is. The character that swung answers `on hit:` and
// the one it landed on answers `when hit:`, and what those results do to a pool
// is not a swing, so nothing they apply can reach here again.
//
// Returns the characters the moment reached, which is who the depletion verdict
// is then taken over.
export function fireHooks(segment: Segment, swinger: string, struck: string): string[] {
  const reached: string[] = [];
  fireMoment(segment, 'onHit', swinger, struck, reached);
  fireMoment(segment, 'whenHit', struck, swinger, reached);
  return reached;
}

// `me` is the carrier and `them` the other party for as long as the carrier's
// results are applying, and neither afterwards.
function fireMoment(segment: Segment, moment: Moment, carrier: string, other: string, reached: string[]): void {
  const hooks = characterHooks(segment.state, segment.registry, carrier, moment);
  if (hooks.length === 0) return;
  const outer = segment.parties;
  segment.parties = { me: carrier, them: other };
  for (const results of hooks) applyResults(segment, results, carrier);
  segment.parties = outer;
  for (const actorId of [carrier, other]) if (!reached.includes(actorId)) reached.push(actorId);
}
