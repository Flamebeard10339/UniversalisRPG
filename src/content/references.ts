import { Action } from '../grammar/action';
import { ActionResult } from '../grammar/actionResult';
import { Condition } from '../grammar/condition';
import { Dialogue, TextSegment } from './dialogue';
import { DslError } from '../grammar/parser';
import { Registry } from './registry';
import { TagClause } from '../grammar/tagClause';
import { Directive } from './test';

type ReferenceKind = 'stat' | 'resource' | 'entity' | 'location' | 'item' | 'skill' | 'recipe' | 'save' | 'test' | 'capability' | 'dialogue node';

class Walk {
  private readonly known: Record<ReferenceKind, ReadonlySet<string>>;
  private readonly actionLabels: Record<string, ReadonlySet<string>>;

  constructor(private readonly registry: Registry) {
    const capabilities = new Set<string>();
    for (const entity of registry.entities.values()) for (const capability of entity.capabilities) capabilities.add(capability);

    this.known = {
      stat: new Set(registry.stats.keys()),
      resource: new Set(registry.resources.keys()),
      entity: new Set(registry.entities.keys()),
      location: new Set(registry.locations.keys()),
      item: new Set(registry.items.keys()),
      skill: new Set(registry.skills.keys()),
      recipe: new Set(registry.recipes.keys()),
      save: new Set(registry.saves.keys()),
      test: new Set(registry.tests.keys()),
      capability: capabilities,
      'dialogue node': new Set([...registry.dialogues.values()].flatMap((dialogue) => dialogue.nodes.map((node) => node.name))),
    };
    this.actionLabels = {
      entity: new Set([...registry.entities.values()].flatMap((entity) => entity.actions.map((action) => action.label))),
      location: new Set([...registry.locations.values()].flatMap((location) => location.actions.map((action) => action.label))),
      item: new Set([...registry.items.values()].flatMap((item) => item.actions.map((action) => action.label))),
    };
  }

  check(kind: ReferenceKind, id: string | undefined, where: string): void {
    if (id === undefined || this.known[kind].has(id)) return;
    throw new DslError(`${where} names an unknown ${kind}: ${id}`);
  }

  results(where: string, ...groups: (ActionResult[] | undefined)[]): void {
    for (const results of groups) {
      for (const result of results ?? []) {
        switch (result.kind) {
          case 'give':
          case 'take':
            this.check('item', result.item, `${where} ${result.kind}:`);
            break;
          case 'xp':
            this.check('skill', result.skill, `${where} xp:`);
            break;
          case 'relocate':
            this.check('location', result.location, `${where} relocate:`);
            break;
          case 'discover':
            this.check('location', result.location, `${where} discover:`);
            break;
          case 'pool':
            this.check('resource', result.resource, `${where} ${result.delta < 0 ? 'drain' : 'restore'}:`);
            break;
        }
      }
    }
  }

  condition(condition: Condition | undefined, where: string): void {
    if (!condition) return;
    switch (condition.kind) {
      case 'has':
        this.check('item', condition.item, `${where} has`);
        return;
      case 'not':
        this.condition(condition.condition, where);
        return;
      case 'and':
      case 'or':
        for (const inner of condition.conditions) this.condition(inner, where);
    }
  }

  segments(segments: TextSegment[] | undefined, where: string): void {
    for (const segment of segments ?? []) if (segment.kind === 'conditional') this.condition(segment.condition, where);
  }

  tags(where: string, tags: TagClause[] | undefined): void {
    for (const tag of tags ?? []) if (tag.kind === 'stat-bonus') this.check('stat', tag.statId, `${where} tag`);
  }

  action(action: Action, where: string): void {
    this.check('stat', action.speed, `${where} speed:`);
    this.check('stat', action.accuracy, `${where} accuracy:`);
    this.check('stat', action.evasion, `${where} evasion:`);
    this.check('stat', action.ability, `${where} ability:`);
    this.check('stat', action.dr, `${where} dr:`);
    this.check('resource', action.target, `${where} target:`);
    this.tags(where, action.tags);
    this.condition(action.requires, `${where} requires:`);
    this.condition(action.hiddenIf, `${where} hidden if:`);
    this.results(where, action.results, action.onSuccess, action.onFailure, action.onEscape);
  }

  actions(where: string, actions: Action[]): void {
    for (const action of actions) this.action(action, `${where} action ${JSON.stringify(action.label)}`);
  }

  dialogue(dialogue: Dialogue): void {
    if (dialogue.owner) this.check('entity', dialogue.owner, `# dialogue ${dialogue.id} owner`);
    const names = new Set(dialogue.nodes.map((node) => node.name));
    const goto = (target: string, where: string): void => {
      if (!names.has(target)) throw new DslError(`${where} goto names an unknown node in # dialogue ${dialogue.id}: ${target}`);
    };

    for (const node of dialogue.nodes) {
      const where = `# dialogue ${dialogue.id} node ${node.name}`;
      this.condition(node.when, `${where} when:`);
      this.segments(node.again, `${where} again:`);
      for (const step of node.steps) {
        if (step.kind === 'effect') this.results(where, [step.result]);
        if (step.kind === 'say') this.segments(step.segments, where);
        if (step.kind === 'goto') goto(step.target, where);
        if (step.kind === 'menu') {
          for (const choice of step.choices) {
            this.segments(choice.segments, `${where} choice`);
            this.condition(choice.when, `${where} choice when`);
            this.results(`${where} choice`, choice.effects);
            if (choice.goto) goto(choice.goto, `${where} choice`);
          }
        }
      }
    }
  }

  directive(directive: Directive, where: string): void {
    switch (directive.kind) {
      case 'run':
        this.check('test', directive.test, `${where} run:`);
        return;
      case 'talk':
        this.check('entity', directive.entity, `${where} talk:`);
        return;
      case 'travel':
        this.check('location', directive.location, `${where} travel:`);
        return;
      case 'craft':
        this.check('recipe', directive.recipe, `${where} craft:`);
        return;
      case 'expect':
      case 'load':
        this.check('save', directive.save, `${where} ${directive.kind}:`);
        return;
      case 'assert':
        this.condition(directive.condition, `${where} assert:`);
        return;
      case 'begin':
        this.directive(directive.inner, `${where} begin:`);
        return;
      case 'use': {
        const labels = this.actionLabels[directive.obj];
        if (!labels) throw new DslError(`${where} use: names an unknown kind: ${directive.obj}`);
        this.check(directive.obj as ReferenceKind, directive.objId, `${where} use:`);
        if (!labels.has(directive.actionId)) throw new DslError(`${where} use: names an unknown ${directive.obj} action: ${directive.actionId}`);
      }
    }
  }
}

export function validateReferences(registry: Registry): void {
  const walk = new Walk(registry);

  for (const entity of registry.entities.values()) {
    for (const statId of Object.keys(entity.stats)) walk.check('stat', statId, `# entity ${entity.id} stats:`);
    walk.actions(`# entity ${entity.id}`, entity.actions);
  }
  for (const item of registry.items.values()) {
    walk.tags(`# item ${item.id}`, item.tags);
    walk.actions(`# item ${item.id}`, item.actions);
  }
  // Through the compiled Action, so recipeAction's forwarding is covered too.
  for (const [recipeId, action] of registry.recipeActions) walk.action(action, `# recipe ${recipeId}`);
  for (const recipe of registry.recipes.values()) walk.check('capability', recipe.requiresCapability, `# recipe ${recipe.id} station:`);
  for (const resource of registry.resources.values()) {
    walk.check('stat', resource.max, `# resource ${resource.id} max:`);
    walk.check('stat', resource.rate, `# resource ${resource.id} rate:`);
    walk.results(`# resource ${resource.id} on empty:`, resource.onEmpty);
    walk.results(`# resource ${resource.id} on full:`, resource.onFull);
  }
  for (const location of registry.locations.values()) {
    for (const entityId of location.entities) walk.check('entity', entityId, `# location ${location.id} entities:`);
    for (const edge of location.adjacent) {
      walk.check('location', edge.target, `# location ${location.id} adjacent:`);
      walk.condition(edge.condition, `# location ${location.id} adjacent: ${edge.target} while`);
    }
    walk.actions(`# location ${location.id}`, location.actions);
  }
  for (const dialogue of registry.dialogues.values()) walk.dialogue(dialogue);
  for (const test of registry.tests.values()) {
    for (const directive of test.directives) walk.directive(directive, `# test ${test.id}`);
  }
}
