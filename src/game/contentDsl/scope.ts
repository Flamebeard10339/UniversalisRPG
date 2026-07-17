import { ActionResult } from './actionResult';
import { Condition, Reference } from './condition';
import { Entity } from './entity';

// Inside an entity's own action block a bare (single-segment) reference names
// that entity's state: `unlocked` inside `front-door` means `front-door.unlocked`.
// A qualified (dotted) reference is left alone, and so is `has` — which names an
// item, not the entity's state. This is the one rule an editor enforces to make
// bare references inside a block unambiguous.
function scopeReference(reference: Reference, owner: string): Reference {
  return reference.path.length === 1 ? { path: [owner, reference.path[0]] } : reference;
}

function scopeCondition(condition: Condition, owner: string): Condition {
  switch (condition.kind) {
    case 'reference':
      return { kind: 'reference', reference: scopeReference(condition.reference, owner) };
    case 'comparison':
      return { ...condition, left: scopeReference(condition.left, owner) };
    case 'not':
      return { kind: 'not', condition: scopeCondition(condition.condition, owner) };
    case 'and':
      return { kind: 'and', conditions: condition.conditions.map((c) => scopeCondition(c, owner)) };
    case 'or':
      return { kind: 'or', conditions: condition.conditions.map((c) => scopeCondition(c, owner)) };
    case 'has':
      return condition;
  }
}

function scopeResult(result: ActionResult, owner: string): ActionResult {
  if ((result.kind === 'set' || result.kind === 'unset' || result.kind === 'add') && !result.variable.includes('.')) {
    return { ...result, variable: `${owner}.${result.variable}` };
  }
  return result;
}

export function scopeEntity(entity: Entity): Entity {
  for (const action of entity.actions) {
    if (action.requires) action.requires = scopeCondition(action.requires, entity.id);
    if (action.hiddenIf) action.hiddenIf = scopeCondition(action.hiddenIf, entity.id);
    action.results = action.results.map((result) => scopeResult(result, entity.id));
    if (action.onSuccess) action.onSuccess = action.onSuccess.map((result) => scopeResult(result, entity.id));
  }
  return entity;
}
