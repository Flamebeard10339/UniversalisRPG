import { Registry } from '../content/registry';
import { GrowthDirective, isGrowthDirective, parseDirectiveLine } from '../content/test';
import { applyClusterEffect } from './clusterEffect';
import { allocate, feedItem, Growth, slotJewel } from './itemInstance';
import { GameState, RuntimeError } from './state';

// Every rule and every refusal is inside these four; what is here is which one
// the verb names and what it is handed, and a check appearing beside it would
// be a check the plane could not enforce for a caller that is not a directive.
export function grow(state: GameState, registry: Registry, directive: GrowthDirective): Growth {
  switch (directive.kind) {
    case 'feed':
      return feedItem(state, registry, directive.target, directive.food);
    case 'slot':
      return slotJewel(state, registry, directive.target, directive.jewel, directive.hex, directive.direction);
    case 'allocate':
      return allocate(state, registry, directive.target, directive.node);
    case 'apply':
      return applyClusterEffect(state, registry, directive.target, directive.effect, directive.hex);
    default: {
      const unreached: never = directive;
      return unreached;
    }
  }
}

// A caller holding a line rather than a parsed directive reaches the same four
// through the parser every `# test` line goes through, so a screen that fills a
// growth in from what it holds cannot become a second reading of one.
export function growLine(state: GameState, registry: Registry, line: string): Growth {
  const directive = parseDirectiveLine(line);
  if (!directive || !isGrowthDirective(directive)) throw new RuntimeError(`not a growth directive: ${line}`);
  return grow(state, registry, directive);
}
