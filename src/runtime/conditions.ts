import { Condition, type EngineRoot, holds, isEngineRoot, printCondition, Reference, visitedNode } from '../grammar/condition';
import { TextSegment } from '../grammar/segment';
import { RuntimeError } from './error';
import { Registry } from '../content/registry';
import { reachedByItself } from '../content/sections/quest';
import { GameState, PLAYER, PLAYER_SHEET, type PlayerField } from './state';
import { isSettingName, settingStands } from './settings';
import { highestSkillLevel, skillLevel } from './skills';
import { statChanged, statValue } from './stats';
import { fromMilliUnits, msToSeconds } from './units';
import { bundleCount } from './bundle';
import { heldCount } from './itemInstance';
import { localizerOf, type Weighing } from './localized';

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
  count: (id, state) => ({ value: bundleCount(state.bundles[id]) }),
  stat: (id, state, registry) => ({ value: statValue(id, state, registry) }),
  us: (id, state, registry) => ({ value: statValue(id, state, registry, PLAYER) }),
  them: (id, state, registry) => {
    const aimedAt = state.activeAction?.roster?.[PLAYER]?.target;
    if (aimedAt === undefined) throw new RuntimeError(`them.${id} reads a stat off what the action under way is aimed at, and no action is under way here — every line has us., and only one said inside an action has them.`);
    return { value: statValue(id, state, registry, aimedAt) };
  },
  changed: (id, state, registry) => ({ value: statChanged(id, state, registry) }),
};

interface Spelling {
  readonly key: string;
  readonly under: string;
  readonly owner: string;
}

const SPELLING = new WeakMap<readonly string[], Spelling>();

function spelling(path: string[]): Spelling {
  const held = SPELLING.get(path);
  if (held !== undefined) return held;
  const spelt: Spelling = { key: path.join('.'), under: path.slice(1).join('.'), owner: path.slice(0, -1).join('.') };
  SPELLING.set(path, spelt);
  return spelt;
}

function questReach(path: string[], registry: Registry): Condition | undefined {
  if (path.length < 2) return undefined;
  const quest = registry.quests.get(spelling(path).owner);
  return quest === undefined ? undefined : reachedByItself(quest, path[path.length - 1]!);
}

const deriving = new Set<string>();

const derived = new Map<string, boolean | number | string | undefined>();

const leanedOn: string[] = [];

let deriveDepth = 0;

function settled(key: string, from: number): boolean {
  for (let at = from; at < leanedOn.length; at += 1) if (leanedOn[at] !== key) return false;
  return true;
}

export function whileNothingChanges<T>(read: () => T): T {
  deriveDepth += 1;
  try {
    return read();
  } finally {
    deriveDepth -= 1;
    if (deriveDepth === 0) {
      derived.clear();
      leanedOn.length = 0;
    }
  }
}

export function answerReference(reference: Reference, state: GameState, registry: Registry): Answered {
  const { path } = reference;
  const spelt = spelling(path);
  if (isEngineRoot(path)) return ROOTED[path[0] as EngineRoot](spelt.under, state, registry);
  const node = visitedNode(path);
  if (node) return { value: state.visits[node.join('.')] ?? 0 };
  const key = spelt.key;
  const flag = state.flags[key];
  if (truthy(flag)) return { value: flag };
  if (deriving.has(key)) {
    leanedOn.push(key);
    return { value: flag };
  }
  if (derived.has(key)) return { value: derived.get(key) };
  const reach = questReach(path, registry);
  if (reach === undefined) return { value: flag };
  const before = leanedOn.length;
  deriving.add(key);
  deriveDepth += 1;
  try {
    const value = evaluateCondition(reach, state, registry) || flag;
    if (settled(key, before)) derived.set(key, value);
    return { value };
  } finally {
    deriving.delete(key);
    deriveDepth -= 1;
    if (deriveDepth === 0) {
      derived.clear();
      leanedOn.length = 0;
    }
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

export const weighing =
  (state: GameState, registry: Registry): Weighing =>
  (segments) =>
    renderSegments(segments, state, registry);

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
