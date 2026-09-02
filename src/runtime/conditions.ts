import { Condition, type EngineRoot, holds, isEngineRoot, printCondition, Reference, visitedNode } from '../grammar/condition';
import { TextSegment } from '../grammar/segment';
import { Registry } from '../content/registry';
import { reachedByItself } from '../content/sections/quest';
import { GameState, PLAYER_SHEET, type PlayerField } from './state';
import { isSettingName, settingStands } from './settings';
import { highestSkillLevel, skillLevel } from './skills';
import { statChanged, statValue } from './stats';
import { fromMilliUnits, msToSeconds } from './units';
import { heldCount } from './itemInstance';
import { localizerOf } from './localized';

export interface Answered {
  value: boolean | number | string | undefined;
  names?: string;
}

const ROOTED: Readonly<Record<EngineRoot, (id: string, state: GameState, registry: Registry) => Answered>> = {
  time: (_id, state) => ({ value: msToSeconds(state.time) }),
  player: (id, state) => ({ value: state.player[id as PlayerField], names: PLAYER_SHEET[id as PlayerField]?.names ?? undefined }),
  setting: (id, state) => ({ value: isSettingName(id) ? settingStands(state.settings, id) : undefined }),
  xp: (id, state) => ({ value: state.xp[id] ?? 0 }),
  level: (id, state) => ({ value: skillLevel(state.xp[id] ?? 0) }),
  'highest-level': (_id, state) => ({ value: highestSkillLevel(state.xp) }),
  resource: (id, state) => ({ value: fromMilliUnits(state.resources[id] ?? 0) }),
  inventory: (id, state) => ({ value: heldCount(state, id) }),
  stat: (id, state, registry) => ({ value: statValue(id, state, registry) }),
  changed: (id, state, registry) => ({ value: statChanged(id, state, registry) }),
};

function questReach(path: string[], registry: Registry): Condition | undefined {
  if (path.length < 2) return undefined;
  const quest = registry.quests.get(path.slice(0, -1).join('.'));
  return quest === undefined ? undefined : reachedByItself(quest, path[path.length - 1]!);
}

const deriving = new Set<string>();

export function answerReference(reference: Reference, state: GameState, registry: Registry): Answered {
  const { path } = reference;
  if (isEngineRoot(path)) return ROOTED[path[0] as EngineRoot](path.slice(1).join('.'), state, registry);
  const node = visitedNode(path);
  if (node) return { value: state.visits[node.join('.')] ?? 0 };
  const key = path.join('.');
  const flag = state.flags[key];
  if (truthy(flag) || deriving.has(key)) return { value: flag };
  const reach = questReach(path, registry);
  if (reach === undefined) return { value: flag };
  deriving.add(key);
  try {
    return { value: evaluateCondition(reach, state, registry) || flag };
  } finally {
    deriving.delete(key);
  }
}

export function resolveReference(reference: Reference, state: GameState, registry: Registry): boolean | number | string | undefined {
  return answerReference(reference, state, registry).value;
}

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
      return holds(typeof left === 'number' ? left : Number(left ?? 0), condition.operator, condition.right);
    }
    case 'not':
      return !evaluateCondition(condition.condition, state, registry);
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state, registry));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state, registry));
    case 'has':
      return heldCount(state, condition.item) >= condition.count;
    case 'always':
      return true;
    default: {
      const unreached: never = condition;
      return unreached;
    }
  }
}

export const describeCondition = printCondition;

export function itemMissingFor(condition: Condition, state: GameState, registry: Registry): string | undefined {
  switch (condition.kind) {
    case 'has':
      return evaluateCondition(condition, state, registry) ? undefined : condition.item;
    case 'and':
      for (const each of condition.conditions) {
        const item = itemMissingFor(each, state, registry);
        if (item !== undefined) return item;
      }
      return undefined;
    default:
      return undefined;
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
