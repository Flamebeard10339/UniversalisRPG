import { Condition, Reference } from './condition';
import { TextSegment } from './dialogue';
import { GameState } from './state';

// Reading and rendering authored expressions against live state. Conditions are
// the engine's only question about the world; text rendering asks the same
// questions inline, which is why the two live together.

// References are flat dotted keys, not nested lookups (grammar.md "References");
// the one exception the engine maintains is `<node-name>.visits`.
export function resolveReference(reference: Reference, state: GameState): boolean | number | string | undefined {
  const { path } = reference;
  if (path.length === 1 && path[0] === 'time') return state.time;
  if (path.length === 2 && path[1] === 'visits') return state.visits[path[0]] ?? 0;
  if (path.length === 2 && path[0] === 'player') return state.player[path[1] as 'name' | 'race'];
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
      return (state.inventory[condition.item] ?? 0) >= condition.count;
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
