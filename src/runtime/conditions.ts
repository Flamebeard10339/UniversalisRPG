import { Condition, type EngineRoot, isEngineRoot, Reference, visitedNode } from '../grammar/condition';
import { TextSegment } from '../grammar/segment';
import { Registry } from '../content/registry';
import { GameState, PLAYER_SHEET, type PlayerField } from './state';
import { skillLevel } from './skills';
import { statValue } from './stats';
import { fromMilliUnits, msToSeconds } from './units';
import { heldCount } from './itemInstance';
import { localizerOf } from './localized';

// Both questions a reference is asked, answered together: what it is, and — where that is an id
// rather than a figure or the player's own writing — the kind the world titles it under. A
// condition wants the first and a sentence a player reads wants the second, and a root answering
// only one of them is how a machine name reaches a page.
export interface Answered {
  value: boolean | number | string | undefined;
  names?: string;
}

// Exhaustive over the roots the grammar declares, so a root added there does not silently read as an undeclared flag.
const ROOTED: Readonly<Record<EngineRoot, (id: string, state: GameState, registry: Registry) => Answered>> = {
  time: (_id, state) => ({ value: msToSeconds(state.time) }),
  player: (id, state) => ({ value: state.player[id as PlayerField], names: PLAYER_SHEET[id as PlayerField]?.names ?? undefined }),
  xp: (id, state) => ({ value: state.xp[id] ?? 0 }),
  level: (id, state) => ({ value: skillLevel(state.xp[id] ?? 0) }),
  resource: (id, state) => ({ value: fromMilliUnits(state.resources[id] ?? 0) }),
  inventory: (id, state) => ({ value: heldCount(state, id) }),
  stat: (id, state, registry) => ({ value: statValue(id, state, registry) }),
};

export function answerReference(reference: Reference, state: GameState, registry: Registry): Answered {
  const { path } = reference;
  if (isEngineRoot(path)) return ROOTED[path[0] as EngineRoot](path.slice(1).join('.'), state, registry);
  const node = visitedNode(path);
  if (node) return { value: state.visits[node.join('.')] ?? 0 };
  return { value: state.flags[path.join('.')] };
}

export function resolveReference(reference: Reference, state: GameState, registry: Registry): boolean | number | string | undefined {
  return answerReference(reference, state, registry).value;
}

// What a reference reads as in a sentence somebody reads, which is the id only where the world has
// no word for it. An answer naming nothing — every figure, and the name the player typed — is
// already the words, and an unanswered one is silence rather than the word for nothing.
export function referenceWords(reference: Reference, state: GameState, registry: Registry): string {
  const { value, names } = answerReference(reference, state, registry);
  if (names === undefined || typeof value !== 'string' || value === '') return String(value ?? '');
  return String(localizerOf(registry, state).title(names, value));
}

export function truthy(value: boolean | number | string | undefined): boolean {
  return value !== undefined && value !== false && value !== 0 && value !== '';
}

export function evaluateCondition(condition: Condition, state: GameState, registry: Registry): boolean {
  switch (condition.kind) {
    case 'reference':
      return truthy(resolveReference(condition.reference, state, registry));
    case 'comparison': {
      const left = resolveReference(condition.left, state, registry);
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
      return !evaluateCondition(condition.condition, state, registry);
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state, registry));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state, registry));
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

export function renderSegments(segments: TextSegment[], state: GameState, registry: Registry): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case 'literal':
          return segment.text;
        case 'interpolate':
          return referenceWords(segment.reference, state, registry);
        case 'conditional':
          return evaluateCondition(segment.condition, state, registry) ? segment.text : '';
        default: {
          const unreached: never = segment;
          return unreached;
        }
      }
    })
    .join('');
}
