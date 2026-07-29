import { DslError } from '../grammar/parser';

// The kinds whose ids are objects a module owns. `capability` and `variable`
// are deliberately absent: a station is a contract between modules that never
// met, and a tuning variable is a knob the engine reads by name, so `oven` and
// `min-damage` must mean the same thing in every module that says them.
export const NAMESPACED_KINDS: readonly string[] = ['stat', 'skill', 'item', 'entity', 'location', 'recipe', 'resource', 'dialogue', 'test', 'save', 'flag', 'node'];

// A namespace is a prefix of segments; a module without one contributes none,
// which is the empty case of the same rule rather than an exception to it.
export const qualify = (namespace: string | null, id: string): string => (namespace === null ? id : `${namespace}.${id}`);

// A module addresses its own namespace explicitly with `self.`, which is how a
// module says "mine" when a dependency declares the same name.
const SELF = 'self';

export class Namespace {
  // Each declared key remembers the module that owns it, which is what decides
  // whether a module referring to it is allowed to see it.
  private readonly declared = new Map<string, Map<string, string | null>>();
  private readonly modules = new Set<string>();
  // Every namespace loaded, which is what a name typed at runtime resolves
  // against: a player is not standing in any one module.
  readonly all = new Set<string | null>();

  private keys(kind: string): Map<string, string | null> {
    const existing = this.declared.get(kind);
    if (existing) return existing;
    const created = new Map<string, string | null>();
    this.declared.set(kind, created);
    return created;
  }

  // Every module in play, known up front: naming one this module cannot see is a
  // different complaint from naming something that exists nowhere, and which one
  // it is must not depend on how far down the load order the namer sits.
  declareModules(ids: Iterable<string>): void {
    for (const id of ids) this.modules.add(id);
  }

  declare(kind: string, namespace: string | null, id: string): string {
    const key = qualify(namespace, id);
    this.all.add(namespace);
    this.keys(kind).set(key, namespace);
    return key;
  }

  // A member hangs under the object that owns it and belongs to that object's
  // module, whichever module wrote the line declaring it.
  declareMember(kind: string, ownerKind: string, owner: string, name: string): string {
    const key = `${owner}.${name}`;
    this.keys(kind).set(key, this.declared.get(ownerKind)?.get(owner) ?? null);
    return key;
  }

  // Undeclaring an object takes its members with it, or a reference to one would
  // resolve to a key nothing can ever set.
  undeclare(kind: string, key: string): void {
    this.declared.get(kind)?.delete(key);
    for (const keys of this.declared.values()) {
      for (const other of keys.keys()) if (other.startsWith(`${key}.`)) keys.delete(other);
    }
  }

  has(kind: string, key: string): boolean {
    return this.declared.get(kind)?.has(key) === true;
  }

  ownerOf(kind: string, key: string): string | null | undefined {
    return this.declared.get(kind)?.get(key);
  }

  // A reference may drop leading segments — `orc-pack.entity.goblin`, `entity.goblin`
  // and `goblin` are the same path — and resolves when exactly one visible module
  // answers to what is left. Resolution is directed by the kind the site wants, so
  // an `entity` named `rope` never shadows the `item` a `give:` is asking for.
  //
  // `inner` is the object the reference was written inside, tried whole before the
  // suffix rule: that is what makes `set: unlocked` within `# entity front-door`
  // mean that door's flag even where another object declares the same name.
  resolve(kind: string, raw: string, self: string | null, visible: ReadonlySet<string | null>, where: string, inner: string | null = null): string {
    const segments = raw.split('.');
    if (segments[0] === kind && segments.length > 1) segments.shift();
    if (segments[0] === SELF && segments.length > 1 && self !== null) segments[0] = self;
    const suffix = segments.join('.');
    if (segments.length > 1 && this.modules.has(segments[0]) && !visible.has(segments[0])) {
      throw new DslError(`${where} names ${raw}, but ${segments[0]} is not this module or one of its dependencies`);
    }

    if (inner !== null && this.has(kind, `${inner}.${suffix}`)) return `${inner}.${suffix}`;

    const matches = [...this.keys(kind)].filter(([key, namespace]) => visible.has(namespace) && (key === suffix || key.endsWith(`.${suffix}`)));
    if (matches.length === 1) return matches[0][0];
    if (matches.length === 0) throw new DslError(`${where} names an unknown ${kind}: ${raw}`);
    throw new DslError(`${where} names ${raw}, which is ambiguous between ${matches.map(([key]) => key).sort().join(' and ')}. Name the module, or use self.`);
  }
}
