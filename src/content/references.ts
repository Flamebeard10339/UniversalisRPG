import { DslError } from '../grammar/parser';
import type { Addressed } from './completion';
import { Registry } from './registry';
import { Directive, Test } from './sections/test';
import { } from './namespace';
import { isCheckedKind } from './sections';
import { DEBUG_MARK, isActionOwnerKind, isDebug, registryMapOf, sectionOf, type ModuleSection } from './sections';
import { BUNDLE_SITES, INFLICT_SITE, Visit } from './refs';
import { visitSection } from './sections';
import { mapOf } from './registry';

function refuseDebugReference(kind: string, target: string, where: string, registry: Registry): void {
  const name = registryMapOf(kind);
  if (name === null || !isDebug((mapOf(registry, name) as ReadonlyMap<string, object>).get(target))) return;
  throw new DslError(`${where} names ${target}, which is ${DEBUG_MARK}: nothing a player can reach may name it, so either mark this section ${DEBUG_MARK} too or name something a player is meant to find`);
}

export function validateSectionReferences(section: ModuleSection, id: string, registry: Registry): void {
  const debug = isDebug(section.value);
  const visit: Visit = (referenced, target, where) => {
    if (isCheckedKind(referenced) && !registry.namespace.has(referenced, target)) {
      throw new DslError(`${where} names an unknown ${referenced}: ${target}`);
    }
    if (!debug) refuseDebugReference(referenced, target, where, registry);
    if (BUNDLE_SITES.some((site) => where.endsWith(site))) refuseUnbundled(target, where, registry);
    if (where.endsWith(INFLICT_SITE)) refuseUntimedPayload(target, where, registry);
    return target;
  };
  visitSection(sectionOf(section.kind, { ...section.value }), `# ${section.kind} ${id}`, visit);
}

function refuseUnbundled(target: string, where: string, registry: Registry): void {
  if (registry.flags.get(target)?.bundle === true) return;
  throw new DslError(`${where} names ${target}, which holds a number rather than a bundle — write \`bundle\` under its \`# flag\` so it can hold what a line hands it`);
}

function refuseUntimedPayload(itemId: string, where: string, registry: Registry): void {
  const source = registry.items.get(itemId);
  if (source && !source.tags.some((tag) => tag.kind === 'duration')) {
    throw new DslError(`${where} names ${itemId}, which declares no duration, so an instance of it would be over before anything could read it — write one on the item, or say \`for <duration>\` where it is inflicted`);
  }
}

export const declaredBy = (registry: Registry): Addressed[] =>
  registry.namespace.kinds().flatMap((kind) => registry.namespace.declaredKeys(kind).map((address) => ({ kind, address, module: registry.namespace.ownerOf(kind, address) ?? null })));

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

export function validateTestReferences(test: Test, registry: Registry): void {
  const slots = registrySlots(registry);
  const directive = (value: Directive, where: string): void => {
    if (value.kind === 'begin') return directive(value.inner, `${where} begin:`);
    if (value.kind === 'until') return directive(value.inner, `${where} until:`);
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
