import { ActionResult } from '../grammar/actionResult';
import { Action } from '../grammar/action';
import { Dialogue } from './dialogue';
import { Entity, entitySchema } from './entity';
import { Item, itemSchema } from './item';
import { Location, locationSchema, recursivelyResolveRelativeCoordinates } from './location';
import { mergeSection } from './merge';
import { ModuleSection } from './module';
import { ModuleSource, parseUniverse } from './universe';
import { DslError } from '../grammar/parser';
import { Recipe, recipeSchema } from './recipe';
import { validateReferences } from './references';
import { Removal } from './removal';
import { Resource, resourceSchema } from './resource';
import { ParsedSave } from './saveSection';
import { scopeEntity, scopeLocation } from './scope';
import { Authored, hydrateSection } from '../grammar/section';
import { Skill, skillSchema } from './skill';
import { Stat, statSchema } from './stat';
import { Test } from './test';
import { validateTuning } from './tuningVariables';
import { humanize } from '../grammar/values';
import { Variable, variableSchema } from './variable';

export interface Registry {
  entities: Map<string, Entity>;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  recipes: Map<string, Recipe>;
  recipeActions: Map<string, Action>;
  resources: Map<string, Resource>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
  variables: Map<string, Variable>;
  saves: Map<string, ParsedSave>;
}

// Compiled to an Action so a craft runs through the same resolve() machinery
// as any other single-attempt fight.
function recipeAction(recipe: Recipe): Action {
  const takes: ActionResult[] = recipe.in.map((q) => ({ kind: 'take', item: q.item, amount: q.amount }));
  const gives: ActionResult[] = recipe.out.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
  const results: ActionResult[] = [...takes, ...gives];
  if (recipe.skill) results.push({ kind: 'xp', skill: recipe.skill.skill, amount: recipe.skill.amount });
  if (recipe.say) results.push({ kind: 'say', text: recipe.say });

  const time = recipe.time ?? 0;
  const action: Action = {
    label: `Craft ${humanize(recipe.id)}`,
    results,
    time,
    speed: recipe.speed,
    accuracy: recipe.accuracy,
    evasion: recipe.evasion,
    health: 1,
    repeating: time > 0,
  };

  if (recipe.accuracy) {
    // The fail path consumes the SAME inputs as success, so inputLimit still
    // bounds a repeating burn-capable craft.
    action.escapeAfter = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
    action.onEscape = [...takes, ...burnt];
  }

  return action;
}

function applySection(registry: Registry, section: ModuleSection): void {
  switch (section.kind) {
    case 'entity': {
      const entity = scopeEntity(hydrateSection(section.value as Authored<Entity>, entitySchema));
      for (const action of entity.actions) {
        // Without a pool to drain, a retaliation falls through to the fight's
        // own hit counter and wears down the target instead of the player.
        if (action.retaliates && !action.target) {
          throw new DslError(`# entity ${entity.id}: retaliating action ${JSON.stringify(action.label)} requires a target: pool`);
        }
      }
      registry.entities.set(entity.id, entity);
      break;
    }
    case 'location': {
      const location = scopeLocation(hydrateSection(section.value as Authored<Location>, locationSchema));
      registry.locations.set(location.id, location);
      break;
    }
    case 'item': {
      const item = hydrateSection(section.value as Authored<Item>, itemSchema);
      registry.items.set(item.id, item);
      break;
    }
    case 'stat': {
      const stat = hydrateSection(section.value as Authored<Stat>, statSchema);
      registry.stats.set(stat.id, stat);
      break;
    }
    case 'skill': {
      const skill = hydrateSection(section.value as Authored<Skill>, skillSchema);
      registry.skills.set(skill.id, skill);
      break;
    }
    case 'recipe': {
      const recipe = hydrateSection(section.value as Authored<Recipe>, recipeSchema);
      registry.recipes.set(recipe.id, recipe);
      registry.recipeActions.set(recipe.id, recipeAction(recipe));
      break;
    }
    case 'resource': {
      const resource = hydrateSection(section.value as Authored<Resource>, resourceSchema);
      if (!resource.max) throw new DslError(`# resource ${resource.id} requires a max: stat`);
      registry.resources.set(resource.id, resource);
      break;
    }
    case 'dialogue': {
      const dialogue = section.value as Dialogue;
      registry.dialogues.set(dialogue.id, dialogue);
      if (dialogue.owner) registry.dialoguesByOwner.set(dialogue.owner, dialogue);
      break;
    }
    case 'test': {
      const test = section.value as Test;
      registry.tests.set(test.id, test);
      break;
    }
    case 'variable': {
      const variable = hydrateSection(section.value as Authored<Variable>, variableSchema);
      registry.variables.set(variable.id, variable);
      break;
    }
    case 'save': {
      const { id, saved } = section.value as { id: string; saved: ParsedSave };
      registry.saves.set(id, saved);
      break;
    }
  }
}

export function loadUniverse(sources: readonly ModuleSource[]): Registry {
  const registry: Registry = {
    entities: new Map(),
    locations: new Map(),
    items: new Map(),
    stats: new Map(),
    skills: new Map(),
    recipes: new Map(),
    recipeActions: new Map(),
    resources: new Map(),
    dialogues: new Map(),
    dialoguesByOwner: new Map(),
    tests: new Map(),
    variables: new Map(),
    saves: new Map(),
  };

  // Two phases, because merging must happen on the authored form: a hydrated
  // object has every field filled in with defaults, so overlaying one would
  // silently reset everything the patch did not mention.
  const merged = new Map<string, Map<string, object>>();
  for (const module of parseUniverse(sources)) {
    for (const section of module.sections) {
      // Removal is applied where it stands, so a later module can name the id
      // again and get a fresh one rather than a hole.
      if (section.kind === 'remove') {
        const { kind, target, id } = section.value as Removal;
        if (!merged.get(kind)?.delete(target)) throw new DslError(`# remove ${id} names nothing that is loaded`);
        continue;
      }
      const byId = merged.get(section.kind) ?? new Map<string, object>();
      const id = (section.value as { id: string }).id;
      byId.set(id, mergeSection(section.kind, byId.get(id), section.value));
      merged.set(section.kind, byId);
    }
  }
  for (const [kind, byId] of merged) {
    for (const value of byId.values()) applySection(registry, { kind, value });
  }
  recursivelyResolveRelativeCoordinates(registry.locations);
  validateTuning(registry.variables);
  validateReferences(registry);
  return registry;
}

export const loadModule = (source: string): Registry => loadUniverse([{ name: 'anonymous', text: source }]);
