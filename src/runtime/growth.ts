import { RuntimeError } from './error';
import { Registry } from '../content/registry';
import { GrowthDirective, isGrowthDirective, parseDirectiveLine } from '../content/test';
import { applyClusterEffect } from './clusterEffect';
import { allocate, feedItem, Growth, slotJewel } from './itemInstance';
import { GameState } from './state';

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

export function growLine(state: GameState, registry: Registry, line: string): Growth {
  const directive = parseDirectiveLine(line);
  if (!directive || !isGrowthDirective(directive)) throw new RuntimeError(`not a growth directive: ${line}`);
  return grow(state, registry, directive);
}
