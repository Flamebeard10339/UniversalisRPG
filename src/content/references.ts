import { DslError } from '../grammar/parser';
import { Recipe } from './recipe';
import { Registry } from './registry';
import { Dialogue } from './dialogue';
import { Directive, Test } from './test';

// Resolution already threw for anything naming an unknown object: a reference
// that resolves to nothing cannot be rewritten into a key. What is left are the
// references that point at something other than a namespaced object — a
// capability, a node inside one dialogue, an action's own label.
export function registryCapabilities(registry: Registry): Set<string> {
  const capabilities = new Set<string>();
  for (const entity of registry.entities.values()) for (const capability of entity.capabilities) capabilities.add(capability);
  return capabilities;
}

export function validateRecipeReferences(recipe: Recipe, capabilities: ReadonlySet<string>): void {
  if (recipe.requiresCapability !== undefined && !capabilities.has(recipe.requiresCapability)) {
    throw new DslError(`# recipe ${recipe.id} station: names an unknown capability: ${recipe.requiresCapability}`);
  }
}

export function validateDialogueReferences(dialogue: Dialogue): void {
  const names = new Set(dialogue.nodes.map((node) => node.name));
  const goto = (target: string | undefined, where: string): void => {
    if (target !== undefined && !names.has(target)) throw new DslError(`${where} goto names an unknown node in # dialogue ${dialogue.id}: ${target}`);
  };
  for (const node of dialogue.nodes) {
    const where = `# dialogue ${dialogue.id} node ${node.name}`;
    for (const step of node.steps) {
      if (step.kind === 'goto') goto(step.target, where);
      if (step.kind === 'menu') for (const choice of step.choices) goto(choice.goto, `${where} choice`);
    }
  }
}

export function validateTestReferences(test: Test, registry: Registry): void {
  const owners: Record<string, ReadonlyMap<string, { actions: { label: string }[] }>> = {
    entity: registry.entities,
    location: registry.locations,
    item: registry.items,
  };
  const directive = (value: Directive, where: string): void => {
    if (value.kind === 'begin') return directive(value.inner, `${where} begin:`);
    if (value.kind !== 'use') return;
    const owner = owners[value.obj];
    if (!owner) throw new DslError(`${where} use: names an unknown kind: ${value.obj}`);
    const labels = owner.get(value.objId)?.actions.map((action) => action.label) ?? [];
    if (!labels.includes(value.actionId)) throw new DslError(`${where} use: names an unknown ${value.obj} action: ${value.actionId}`);
  };
  for (const each of test.directives) directive(each, `# test ${test.id}`);
}

export function validateReferences(registry: Registry): void {
  const capabilities = registryCapabilities(registry);
  for (const recipe of registry.recipes.values()) validateRecipeReferences(recipe, capabilities);
  for (const dialogue of registry.dialogues.values()) validateDialogueReferences(dialogue);
  for (const test of registry.tests.values()) validateTestReferences(test, registry);
}
