import { ActionResult } from './actionResult';
import { Action } from './action';
import { Dialogue } from './dialogue';
import { Entity, entitySchema } from './entity';
import { Item, itemSchema } from './item';
import { Location, locationSchema, recursivelyResolveRelativeCoordinates } from './location';
import { parseModule } from './module';
import { Recipe, recipeSchema } from './recipe';
import { Resource, resourceSchema } from './resource';
import { SavedGame } from './save';
import { scopeEntity, scopeLocation } from './scope';
import { Authored, hydrateSection } from './section';
import { Skill, skillSchema } from './skill';
import { Stat, statSchema } from './stat';
import { RuntimeError } from './state';
import { TagClause } from './tagClause';
import { Test } from './test';
import { validateTuning } from './tuning';
import { humanize } from './values';
import { Variable, variableSchema } from './variable';

export interface Registry {
  entities: Map<string, Entity>;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  recipes: Map<string, Recipe>;
  // Each recipe's compiled Action form (see recipeAction), built once at load
  // and looked up by findActionOwner('recipe', ...).
  recipeActions: Map<string, Action>;
  resources: Map<string, Resource>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
  variables: Map<string, Variable>;
  saves: Map<string, SavedGame>;
}

// Compiles a recipe into an Action so a craft runs through the same
// resolve()/fight machinery as a repeating entity action: a single-attempt
// (health: 1) fight whose "target" is the input stack.
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
    // A craft is a single-attempt fight: a miss fails the whole craft to
    // `burnt` instead of retrying. The fail path consumes the SAME inputs as
    // success, so inputLimit (which reads only `results`) still bounds a
    // repeating burn-capable craft.
    action.escapeAfter = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
    action.onEscape = [...takes, ...burnt];
  }

  return action;
}

type ReferenceKind = 'stat' | 'resource' | 'entity' | 'location' | 'item' | 'skill';

// Every id one section uses to name another, resolved against the registry once,
// after everything has parsed (so forward references are fine).
//
// A typo that reaches the engine fails in one of two ways and neither names the
// author's mistake: an unknown RESOURCE surfaces from deep inside a live fight,
// many actions after the module loaded clean, and an unknown STAT never fails at
// all — statRange falls through entity.stats → # stat → point(0), so it reads 0
// forever and the resolver divides by it. Every id an authored node can hold is
// walked here so neither is reachable, rather than only the ids that happened to
// cause a past incident.
function validateReferences(registry: Registry): void {
  const known: Record<ReferenceKind, ReadonlyMap<string, unknown>> = {
    stat: registry.stats,
    resource: registry.resources,
    entity: registry.entities,
    location: registry.locations,
    item: registry.items,
    skill: registry.skills,
  };
  const check = (kind: ReferenceKind, id: string | undefined, where: string): void => {
    if (id === undefined || known[kind].has(id)) return;
    throw new RuntimeError(`${where} names an unknown ${kind}: ${id}`);
  };

  const checkResults = (where: string, ...groups: (ActionResult[] | undefined)[]): void => {
    for (const results of groups) {
      for (const result of results ?? []) {
        switch (result.kind) {
          case 'give':
          case 'take':
            check('item', result.item, `${where} ${result.kind}:`);
            break;
          case 'xp':
            check('skill', result.skill, `${where} xp:`);
            break;
          case 'relocate':
            check('location', result.location, `${where} relocate:`);
            break;
          case 'discover':
            check('location', result.location, `${where} discover:`);
            break;
          case 'pool':
            check('resource', result.resource, `${where} ${result.delta < 0 ? 'drain' : 'restore'}:`);
            break;
        }
      }
    }
  };

  const checkTags = (where: string, tags: TagClause[] | undefined): void => {
    for (const tag of tags ?? []) {
      if (tag.kind === 'stat-bonus') check('stat', tag.statId, `${where} tag`);
    }
  };

  const checkAction = (action: Action, where: string): void => {
    check('stat', action.speed, `${where} speed:`);
    check('stat', action.accuracy, `${where} accuracy:`);
    check('stat', action.evasion, `${where} evasion:`);
    check('stat', action.ability, `${where} ability:`);
    check('stat', action.dr, `${where} dr:`);
    check('resource', action.target, `${where} target:`);
    checkTags(where, action.tags);
    checkResults(where, action.results, action.onSuccess, action.onFailure, action.onEscape);
  };
  const actionsOf = (where: string, actions: Action[]): void => {
    for (const action of actions) checkAction(action, `${where} action ${JSON.stringify(action.label)}`);
  };

  for (const entity of registry.entities.values()) {
    // A sheet entry naming no # stat is not an error the runtime would ever
    // reach — it just never gets read, because the action asking for that stat
    // asks for the correctly-spelled one and falls through to its global default.
    for (const statId of Object.keys(entity.stats)) check('stat', statId, `# entity ${entity.id} stats:`);
    actionsOf(`# entity ${entity.id}`, entity.actions);
  }
  for (const item of registry.items.values()) {
    checkTags(`# item ${item.id}`, item.tags);
    actionsOf(`# item ${item.id}`, item.actions);
  }
  // Recipes are checked through their compiled Action rather than their authored
  // fields, so recipeAction's forwarding — in:/out:/burnt: into give/take, skill:
  // into xp — is covered by the same walk.
  for (const [recipeId, action] of registry.recipeActions) checkAction(action, `# recipe ${recipeId}`);
  for (const resource of registry.resources.values()) {
    check('stat', resource.max, `# resource ${resource.id} max:`);
    check('stat', resource.rate, `# resource ${resource.id} rate:`);
    checkResults(`# resource ${resource.id} on empty:`, resource.onEmpty);
    checkResults(`# resource ${resource.id} on full:`, resource.onFull);
  }
  for (const location of registry.locations.values()) {
    for (const entityId of location.entities) check('entity', entityId, `# location ${location.id} entities:`);
    for (const edge of location.adjacent) check('location', edge.target, `# location ${location.id} adjacent:`);
    actionsOf(`# location ${location.id}`, location.actions);
  }
  for (const dialogue of registry.dialogues.values()) {
    if (dialogue.owner) check('entity', dialogue.owner, `# dialogue ${dialogue.id} owner`);
    for (const node of dialogue.nodes) {
      const where = `# dialogue ${dialogue.id} node ${node.name}`;
      for (const step of node.steps) {
        if (step.kind === 'effect') checkResults(where, [step.result]);
        if (step.kind === 'menu') for (const choice of step.choices) checkResults(`${where} choice`, choice.effects);
      }
    }
  }
}

export function loadModule(source: string): Registry {
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

  for (const section of parseModule(source)) {
    switch (section.kind) {
      case 'entity': {
        const entity = scopeEntity(hydrateSection(section.value as Authored<Entity>, entitySchema));
        for (const action of entity.actions) {
          // A retaliation exists to hit the player. Without a pool to drain it
          // would fall through to the fight's own hit counter and quietly wear
          // down the player's target instead of the player.
          if (action.retaliates && !action.target) {
            throw new RuntimeError(`# entity ${entity.id}: retaliating action ${JSON.stringify(action.label)} requires a target: pool`);
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
        if (!resource.max) throw new RuntimeError(`# resource ${resource.id} requires a max: stat`);
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
        const { id, saved } = section.value as { id: string; saved: SavedGame };
        registry.saves.set(id, saved);
        break;
      }
    }
  }
  // Locations placed with `<direction> of <other>` may reference an origin that
  // parsed later, so absolute coordinates are resolved once all locations exist.
  recursivelyResolveRelativeCoordinates(registry.locations);
  validateTuning(registry.variables);
  validateReferences(registry);
  return registry;
}
