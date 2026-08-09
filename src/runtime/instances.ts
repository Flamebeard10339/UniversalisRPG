import type { Registry } from '../content/registry';
import type { PruneWarning } from './save';
import { GameState, RuntimeError } from './state';

// One table for everything that carries state about a single copy of a
// template: an item that stopped being interchangeable with the rest of its
// stack, an entity whose skills outlive any one fight. A payload is opaque
// here — this module knows which kind owns it and hands it back to that kind,
// and never reads inside — which is what lets those two share one table, one
// prune rule and one save field.

// Readonly because this module owns every write, and with it minting, pruning
// and the payload's opacity: a template a consumer could repoint is a template
// reference that stops meaning what c2 says it means.
export interface Instance {
  readonly kind: string;
  readonly template: string;
  readonly payload: unknown;
}

// The counter lives inside the table rather than beside it, so `GameState`
// gains one field. It never rewinds, so an id names one instance for that
// instance's whole life and a reference cannot be answered by a later one.
export interface InstanceTable {
  readonly next: number;
  readonly byId: Readonly<Record<string, Instance>>;
}

// The one cast that opens the table for writing, so every write above is in
// this file and a consumer holding a table cannot reach past its kind.
function open(table: InstanceTable): { next: number; byId: Record<string, Instance> } {
  return table as { next: number; byId: Record<string, Instance> };
}

// The one extension point. A consumer registers its payload kind here and
// reaches the table through this module; nothing else in the engine may walk
// `byId` to prune it, and no second call site repairs a payload.
export interface InstanceKind<P = unknown> {
  // Whether this kind's templates are still in the registry — the map to ask
  // is the kind's own knowledge, not the substrate's.
  templateLoaded(registry: Registry, template: string): boolean;
  // What a `# save` body has to hold to be this kind's payload. Shape only:
  // a payload naming content that has gone is well-formed and is repaired.
  holds(payload: unknown): boolean;
  // Whether the payload records nothing about its copy, which is the one
  // question that decides whether an instance should exist at all.
  empty(payload: P): boolean;
  // Everything the payload names that may have gone — a declaration out of the
  // registry, another instance — repaired in place, one returned reason per
  // repair. `live` is the substrate's answer, so a kind never asks the table.
  repair(payload: P, registry: Registry, live: (id: string) => boolean): string[];
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

export function createInstanceTable(): InstanceTable {
  return { next: 1, byId: {} };
}

// Minting draws no randomness and touches no clock, so a session that makes an
// instance rolls the same numbers afterwards as one that does not.
export function createInstance(state: GameState, kind: string, template: string, payload: unknown): string {
  const definition = kindOf(kind);
  if (!definition) throw new RuntimeError(`unknown instance kind: ${kind}`);
  if (!definition.holds(payload)) throw new RuntimeError(`instance kind ${kind} does not keep ${JSON.stringify(payload)}`);
  if (definition.empty(payload as never)) throw new RuntimeError(`instance kind ${kind} was handed a payload recording nothing; a copy carrying nothing is a template`);

  const table = open(state.instances);
  const id = String(table.next);
  table.next += 1;
  table.byId[id] = { kind, template, payload };
  return id;
}

export function instance(state: GameState, id: string): Instance | undefined {
  return state.instances.byId[id];
}

// The one answer to "is this id still live". A reference site asks here while
// state is being assembled, never at each read.
export function instanceIsLive(state: GameState, id: string): boolean {
  return id in state.instances.byId;
}

export function removeInstance(state: GameState, id: string): boolean {
  if (!instanceIsLive(state, id)) return false;
  delete open(state.instances).byId[id];
  return true;
}

// Offered rather than enforced: whoever empties a payload decides when the copy
// rejoins its stack, and only its kind can say the payload is empty.
export function collapseInstance(state: GameState, id: string): boolean {
  const held = state.instances.byId[id];
  const definition = held && kindOf(held.kind);
  if (!definition || !definition.empty(held.payload as never)) return false;
  delete open(state.instances).byId[id];
  return true;
}

export function pruneInstances(state: GameState, registry: Registry): PruneWarning[] {
  const table = open(state.instances);
  const warnings: PruneWarning[] = [];
  const warn = (id: string, message: string): void => {
    warnings.push({ path: `instances.${id}`, id, message });
  };
  const drop = (id: string, because: string): void => {
    delete table.byId[id];
    warn(id, `Removed instance ${id} because ${because}.`);
  };

  for (const [id, held] of Object.entries(table.byId)) {
    const definition = kindOf(held.kind);
    if (!definition) drop(id, `${held.kind} is not an instance kind this engine knows`);
    else if (!definition.templateLoaded(registry, held.template)) drop(id, `its template ${held.template} is not loaded`);
  }

  // A repair can drop the reference that another drop in this same pass made
  // stale, and a payload a repair leaves recording nothing is a copy carrying
  // nothing, so repair and collapse run to a fixed point rather than once.
  for (let settled = false; !settled; ) {
    settled = true;
    for (const [id, held] of Object.entries(table.byId)) {
      const definition = kindOf(held.kind)!;
      for (const repaired of definition.repair(held.payload as never, registry, (ref) => instanceIsLive(state, ref))) {
        warn(id, `Repaired instance ${id}: ${repaired}.`);
      }
      if (definition.empty(held.payload as never)) {
        drop(id, 'nothing is left recorded about it');
        settled = false;
      }
    }
  }

  return warnings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// An id no counter could have minted is refused here rather than colliding with
// a real one later, which is the save-side half of an id naming one instance.
function isMintedId(id: string, next: number): boolean {
  return /^(0|[1-9][0-9]*)$/.test(id) && Number(id) < next;
}

export function isInstanceTable(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.byId)) return false;
  const next = value.next;
  if (!Number.isInteger(next)) return false;
  for (const [id, held] of Object.entries(value.byId)) {
    if (!isMintedId(id, next as number)) return false;
    if (!isRecord(held) || typeof held.kind !== 'string' || typeof held.template !== 'string' || !('payload' in held)) return false;
    // A kind nothing has registered is stale rather than malformed, and the
    // prune pass drops it the way it drops a missing template.
    const definition = kindOf(held.kind);
    if (definition && !definition.holds(held.payload)) return false;
  }
  return true;
}
