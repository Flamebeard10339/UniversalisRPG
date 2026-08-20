import { RuntimeError } from './error';
import { mayBeInstanceId } from '../content/instanceId';
import type { Registry } from '../content/registry';
import { Localized, localizerOf } from './localized';
import { say, type Said } from './said';
import type { PruneWarning } from './pruning';
import { GameState, type Instance, type InstanceTable } from './state';

function writable(table: InstanceTable): { next: number; byId: Record<string, Instance> } {
  return table as { next: number; byId: Record<string, Instance> };
}

export interface InstanceKind<P = unknown> {
  templateLoaded(registry: Registry, template: string): boolean;
  holds(payload: unknown): boolean;
  empty(payload: P): boolean;
  repair(payload: P, registry: Registry, live: (id: string) => boolean): Said[];
}

const KINDS = new Map<string, InstanceKind<never>>();

export function defineInstanceKind<P>(name: string, kind: InstanceKind<P>): void {
  const defined = KINDS.get(name);
  if (defined && defined !== (kind as unknown as InstanceKind<never>)) {
    throw new RuntimeError(`instance kind ${name} is already defined by something else`);
  }
  KINDS.set(name, kind as unknown as InstanceKind<never>);
}

function kindOf(name: string): InstanceKind<never> | undefined {
  return KINDS.get(name);
}

export function createInstance(state: GameState, kind: string, template: string, payload: unknown): string {
  const definition = kindOf(kind);
  if (!definition) throw new RuntimeError(`unknown instance kind: ${kind}`);
  if (!definition.holds(payload)) throw new RuntimeError(`instance kind ${kind} does not keep ${JSON.stringify(payload)}`);
  if (definition.empty(payload as never)) throw new RuntimeError(`instance kind ${kind} was handed a payload recording nothing; a copy carrying nothing is a template`);

  const table = writable(state.instances);
  if (!Number.isSafeInteger(table.next + 1)) throw new RuntimeError(`the instance counter has reached ${table.next} and cannot advance without minting one id twice`);
  const id = String(table.next);
  table.next += 1;
  table.byId[id] = { kind, template, payload };
  return id;
}

export function instance(state: GameState, id: string): Instance | undefined {
  return state.instances.byId[id];
}

export function instanceIsLive(state: GameState, id: string): boolean {
  return id in state.instances.byId;
}

export function removeInstance(state: GameState, id: string): boolean {
  if (!instanceIsLive(state, id)) return false;
  delete writable(state.instances).byId[id];
  return true;
}

export function collapseInstance(state: GameState, id: string): boolean {
  const held = instance(state, id);
  const definition = held && kindOf(held.kind);
  if (!definition || !definition.empty(held.payload as never)) return false;
  delete writable(state.instances).byId[id];
  return true;
}

export function pruneInstances(state: GameState, registry: Registry): PruneWarning[] {
  const table = writable(state.instances);
  const warnings: PruneWarning[] = [];
  const localizer = localizerOf(registry, state);
  const named = localizer.identifier;
  const warn = (id: string, message: Localized): void => {
    warnings.push({ path: `instances.${id}`, id, message });
  };
  const drop = (id: string, message: Localized): void => {
    delete table.byId[id];
    warn(id, message);
  };

  for (const [id, held] of Object.entries(table.byId)) {
    const definition = kindOf(held.kind);
    if (!definition) drop(id, localizer.engine('engine.prune.instance.kind', { instance: named(id), kind: named(held.kind) }));
    else if (!definition.templateLoaded(registry, held.template)) drop(id, localizer.engine('engine.prune.instance.template', { instance: named(id), template: named(held.template) }));
  }

  for (let settled = false; !settled; ) {
    settled = true;
    for (const [id, held] of Object.entries(table.byId)) {
      const definition = kindOf(held.kind)!;
      for (const repaired of definition.repair(held.payload as never, registry, (ref) => instanceIsLive(state, ref))) {
        warn(id, localizer.engine('engine.prune.instance.repaired', { instance: named(id), repair: say(localizer, repaired) }));
      }
      if (definition.empty(held.payload as never)) {
        drop(id, localizer.engine('engine.prune.instance.empty', { instance: named(id) }));
        settled = false;
      }
    }
  }

  return warnings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMintedId(id: string, next: number): boolean {
  return mayBeInstanceId(id) && Number(id) < next;
}

export function isInstanceTable(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.byId)) return false;
  const next = value.next;
  if (typeof next !== 'number' || !isMintedId(String(next), next + 1)) return false;
  for (const [id, held] of Object.entries(value.byId)) {
    if (!isMintedId(id, next)) return false;
    if (!isRecord(held) || typeof held.kind !== 'string' || typeof held.template !== 'string' || !('payload' in held)) return false;
    const definition = kindOf(held.kind);
    if (definition && !definition.holds(held.payload)) return false;
  }
  return true;
}
