import { Action } from './action';
import { ActionResult } from './actionResult';
import { Condition, Reference } from './condition';
import { Entity } from './entity';
import { Location } from './location';

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

// Both kinds of location-scoped owner — an entity and the place itself — bind
// their actions' bare references the same way, so the rule lives once here.
// Items are deliberately not scoped: an item travels with the player and its
// bare references are global.
function scopeActions(actions: Action[], owner: string): void {
  for (const action of actions) {
    if (action.requires) action.requires = scopeCondition(action.requires, owner);
    if (action.hiddenIf) action.hiddenIf = scopeCondition(action.hiddenIf, owner);
    action.results = action.results.map((result) => scopeResult(result, owner));
    if (action.onSuccess) action.onSuccess = action.onSuccess.map((result) => scopeResult(result, owner));
    if (action.onFailure) action.onFailure = action.onFailure.map((result) => scopeResult(result, owner));
    if (action.onEscape) action.onEscape = action.onEscape.map((result) => scopeResult(result, owner));
  }
}

export function scopeEntity(entity: Entity): Entity {
  scopeActions(entity.actions, entity.id);
  return entity;
}

export function scopeLocation(location: Location): Location {
  scopeActions(location.actions, location.id);
  return location;
}
