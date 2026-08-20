import { ActionResult } from '../grammar/actionResult';
import { HookCarrier } from '../grammar/hook';
import { applyResults, Segment } from './effects';
import { modifierCarriers } from './stats';
import { GameState } from './state';
import { Registry } from '../content/registry';

export type Moment = keyof HookCarrier;

export function characterHooks(state: GameState, registry: Registry, actorId: string, moment: Moment): ActionResult[][] {
  return modifierCarriers(state, registry, actorId)
    .map((carrier) => carrier.hooks?.[moment] ?? [])
    .filter((results) => results.length > 0);
}

export function fireHooks(segment: Segment, swinger: string, struck: string): string[] {
  const reached: string[] = [];
  fireMoment(segment, 'onHit', swinger, struck, reached);
  fireMoment(segment, 'whenHit', struck, swinger, reached);
  return reached;
}

function fireMoment(segment: Segment, moment: Moment, carrier: string, other: string, reached: string[]): void {
  const hooks = characterHooks(segment.state, segment.registry, carrier, moment);
  if (hooks.length === 0) return;
  const outer = segment.parties;
  segment.parties = { me: carrier, them: other };
  for (const results of hooks) applyResults(segment, results, carrier);
  segment.parties = outer;
  for (const actorId of [carrier, other]) if (!reached.includes(actorId)) reached.push(actorId);
}
