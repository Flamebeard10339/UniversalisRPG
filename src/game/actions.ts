import type { Condition, GameAction, NumericComparison } from './types';

type LegacyActionFields = {
  titleKey?: unknown;
  descriptionKey?: unknown;
  inventoryItemId?: unknown;
  sourceSkillId?: unknown;
  targetSkillId?: unknown;
  health?: unknown;
  rate?: unknown;
};

export const normalizeGameAction = (action: GameAction): GameAction => {
  const {
    titleKey: _titleKey,
    descriptionKey: _descriptionKey,
    inventoryItemId: _inventoryItemId,
    sourceSkillId: _sourceSkillId,
    targetSkillId: _targetSkillId,
    health: _health,
    rate: _rate,
    ...current
  } = action as GameAction & LegacyActionFields;
  const legacy = action as GameAction & { requirements?: unknown; visibleWhen?: unknown };
  return {
    ...current,
    requirements: normalizeCondition(legacy.requirements),
    visibleWhen: normalizeCondition(legacy.visibleWhen),
  };
};

const normalizeCondition = (value: unknown): Condition | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    const conditions = value.map((item) => normalizeCondition(item)).filter((item): item is Condition => Boolean(item));
    return conditions.length ? { kind: 'all', conditions } : undefined;
  }
  const condition = value as Record<string, unknown>;
  if (condition.kind === 'all' || condition.kind === 'any') {
    return { kind: condition.kind, conditions: (Array.isArray(condition.conditions) ? condition.conditions : []).map(normalizeCondition).filter((item): item is Condition => Boolean(item)) };
  }
  if (condition.kind === 'not') {
    const child = normalizeCondition(condition.condition);
    return child ? { kind: 'not', condition: child } : undefined;
  }
  const comparison = String(condition.comparison ?? 'equal');
  if (condition.kind === 'state-variable' && typeof condition.variable === 'string' && (typeof condition.value === 'boolean' || typeof condition.value === 'number')) return stateCondition(condition.variable, comparison, condition.value);
  if (condition.kind === 'death-count' && typeof condition.value === 'number') return stateCondition('flag:death-count', comparison, condition.value);
  if (condition.kind === 'flag' && typeof condition.flagId === 'string' && typeof condition.value === 'boolean') return { kind: 'state-variable', variable: `flag:${condition.flagId}`, comparison: 'equal', value: condition.value };
  if (condition.kind === 'item' && typeof condition.itemId === 'string' && typeof condition.value === 'number') return stateCondition(`item:${condition.itemId}`, comparison, condition.value);
  if (condition.kind === 'resource' && typeof condition.resourceId === 'string') return stateCondition(`resource:${condition.resourceId}`, String(condition.comparison ?? 'at-least'), Number(condition.value ?? condition.amount ?? 0));
  if ((condition.kind === 'skill-level' || condition.kind === 'skillLevel') && typeof condition.skillId === 'string') return stateCondition(`skill-level:${condition.skillId}`, String(condition.comparison ?? 'at-least'), Number(condition.value ?? condition.level ?? 1));
  if (condition.kind === 'action-completions' && typeof condition.actionId === 'string' && typeof condition.value === 'number') return stateCondition(`action-completions:${condition.actionId}`, comparison, condition.value);
  return undefined;
};

const stateCondition = (variable: string, comparison: string, value: number | boolean): Condition => {
  const atom = (kind: NumericComparison): Condition => ({ kind: 'state-variable', variable, comparison: kind, value });
  if (comparison === 'at-least') return { kind: 'not', condition: atom('less-than') };
  if (comparison === 'at-most') return { kind: 'not', condition: atom('greater-than') };
  return atom(comparison === 'greater-than' || comparison === 'less-than' ? comparison : 'equal');
};
