import { DslError } from '../grammar/parser';
import { Recipe } from './sections/recipe';
import { Registry } from './registry';
import { Dialogue } from './sections/dialogue';
import { Directive, Test } from './sections/test';
import { } from './namespace';
import { isNamespacedKind } from './sections';
import { isActionOwnerKind, sectionOf, type ModuleSection } from './sections';
import { INFLICT_SITE, Visit } from './refs';
import { visitSection } from './sections';

export function validateSectionReferences(section: ModuleSection, id: string, registry: Registry): void {
  const visit: Visit = (referenced, target, where) => {
    if (isNamespacedKind(referenced) && !registry.namespace.has(referenced, target)) {
      throw new DslError(`${where} names an unknown ${referenced}: ${target}`);
    }
    if (where.endsWith(INFLICT_SITE)) refuseUntimedPayload(target, where, registry);
    return target;
  };
  visitSection(sectionOf(section.kind, { ...section.value }), `# ${section.kind} ${id}`, visit);
}

function refuseUntimedPayload(itemId: string, where: string, registry: Registry): void {
  const source = registry.items.get(itemId);
  if (source && !source.tags.some((tag) => tag.kind === 'duration')) {
    throw new DslError(`${where} names ${itemId}, which declares no duration, so an instance of it would be over before anything could read it`);
  }
}

export function registryCapabilities(registry: Registry): Set<string> {
  const capabilities = new Set<string>();
  for (const entity of registry.entities.values()) for (const capability of entity.capabilities) capabilities.add(capability);
  return capabilities;
}

function declaredSlots(registry: Registry): Set<string> {
  const declared = new Set<string>();
  for (const entity of registry.entities.values()) for (const slot of entity.equipmentSlots) declared.add(slot);
  return declared;
}

export function registrySlots(registry: Registry): Set<string> {
  const declared = declaredSlots(registry);
  if (declared.size > 0) return declared;
  const slots = new Set<string>();
  for (const item of registry.items.values()) if (item.slot !== undefined) slots.add(item.slot);
  return slots;
}

export function validateItemSlots(registry: Registry): void {
  const declared = declaredSlots(registry);
  if (declared.size === 0) return;
  for (const item of registry.items.values()) {
    if (item.slot !== undefined && !declared.has(item.slot)) {
      throw new DslError(`# item ${item.id} slot: names ${item.slot}, which no # entity declares among its equipment-slots:`);
    }
  }
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
  const slots = registrySlots(registry);
  const directive = (value: Directive, where: string): void => {
    if (value.kind === 'begin') return directive(value.inner, `${where} begin:`);
    if (value.kind === 'unequip') {
      if (!slots.has(value.slot)) throw new DslError(`${where} unequip: names an unknown slot: ${value.slot}`);
      return;
    }
    if (value.kind === 'use-on') {
      if (!registry.player?.uses.some((used) => used === value.action)) throw new DslError(`${where} use: names an action the player does not use:: ${value.action}`);
      return;
    }
    if (value.kind === 'use' && !isActionOwnerKind(value.obj)) throw new DslError(`${where} use: names an unknown kind: ${value.obj}`);
  };
  for (const each of test.directives) directive(each, `# test ${test.id}`);
}
