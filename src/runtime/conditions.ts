import { Condition, PLAYER, Reference, TIME, visitedNode } from '../grammar/condition';
import { TextSegment } from '../content/dialogue';
import { GameState } from './state';
import { msToSeconds } from './units';
import { heldCount } from './itemInstance';

// Rendering asks the same questions of state that conditions do, which is why
// the two live together.

// Flat dotted keys, not nested lookups. Which paths the engine answers rather
// than the flag table is the same question load-time resolution asks when it
// decides what to rewrite, so both read it off `grammar/condition`.
export function resolveReference(reference: Reference, state: GameState): boolean | number | string | undefined {
  const { path } = reference;
  if (path[0] === TIME) return msToSeconds(state.time);
  if (path[0] === PLAYER) return state.player[path[1] as 'name' | 'race'];
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
      }
    })
    .join('');
}
