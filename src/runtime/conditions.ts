import { Condition, type EngineRoot, isEngineRoot, Reference, visitedNode } from '../grammar/condition';
import { TextSegment } from '../grammar/segment';
import { GameState } from './state';
import { fromMilliUnits, msToSeconds } from './units';
import { heldCount } from './itemInstance';

// Exhaustive over the roots the grammar declares, so a root added there does not silently read as an undeclared flag.
const ROOTED: Readonly<Record<EngineRoot, (id: string, state: GameState) => boolean | number | string | undefined>> = {
  time: (_id, state) => msToSeconds(state.time),
  player: (id, state) => state.player[id as 'name' | 'race'],
  xp: (id, state) => state.xp[id] ?? 0,
  resource: (id, state) => fromMilliUnits(state.resources[id] ?? 0),
  inventory: (id, state) => heldCount(state, id),
};

export function resolveReference(reference: Reference, state: GameState): boolean | number | string | undefined {
  const { path } = reference;
  if (isEngineRoot(path)) return ROOTED[path[0] as EngineRoot](path.slice(1).join('.'), state);
  const node = visitedNode(path);
  if (node) return state.visits[node.join('.')] ?? 0;
  return state.flags[path.join('.')];
}

export function truthy(value: boolean | number | string | undefined): boolean {
  return value !== undefined && value !== false && value !== 0 && value !== '';
}

export function evaluateCondition(condition: Condition, state: GameState): boolean {
  switch (condition.kind) {
    case 'reference':
      return truthy(resolveReference(condition.reference, state));
    case 'comparison': {
      const left = resolveReference(condition.left, state);
      const value = typeof left === 'number' ? left : Number(left ?? 0);
      switch (condition.operator) {
        case '>':
          return value > condition.right;
        case '<':
          return value < condition.right;
        case '>=':
          return value >= condition.right;
        case '<=':
          return value <= condition.right;
        case '=':
          return value === condition.right;
        case '!=':
          return value !== condition.right;
      }
      break;
    }
    case 'not':
      return !evaluateCondition(condition.condition, state);
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state));
    case 'has':
      return heldCount(state, condition.item) >= condition.count;
    default: {
      const unreached: never = condition;
      return unreached;
    }
  }
}

export function describeCondition(condition: Condition): string {
  switch (condition.kind) {
    case 'reference':
      return condition.reference.path.join('.');
    case 'comparison':
      return `${condition.left.path.join('.')} ${condition.operator} ${condition.right}`;
    case 'not':
      return `not ${describeCondition(condition.condition)}`;
    case 'and':
      return condition.conditions.map(describeCondition).join(' and ');
    case 'or':
      return condition.conditions.map(describeCondition).join(' or ');
    case 'has':
      return condition.count === 1 ? `has ${condition.item}` : `has ${condition.count} ${condition.item}`;
    default: {
      const unreached: never = condition;
      return unreached;
    }
  }
}

export function renderSegments(segments: TextSegment[], state: GameState): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case 'literal':
          return segment.text;
        case 'interpolate':
          return String(resolveReference(segment.reference, state) ?? '');
        case 'conditional':
          return evaluateCondition(segment.condition, state) ? segment.text : '';
        default: {
          const unreached: never = segment;
          return unreached;
        }
      }
    })
    .join('');
}
