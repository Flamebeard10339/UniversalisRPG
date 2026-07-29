import { DslError } from '../grammar/parser';

// The kinds whose ids are objects a module owns. `capability` and `variable`
// are deliberately absent: a station is a contract between modules that never
// met, and a tuning variable is a knob the engine reads by name, so `oven` and
// `min-damage` must mean the same thing in every module that says them.
export const NAMESPACED_KINDS: readonly string[] = ['stat', 'skill', 'item', 'entity', 'location', 'recipe', 'resource', 'dialogue', 'test', 'save'];

// A namespace is a prefix of segments; a module without one contributes none,
// which is the empty case of the same rule rather than an exception to it.
export const qualify = (namespace: string | null, id: string): string => (namespace === null ? id : `${namespace}.${id}`);

// A module addresses its own namespace explicitly with `self.`, which is how a
// module says "mine" when a dependency declares the same name.
const SELF = 'self';

export class Namespace {
  private readonly declared = new Map<string, Set<string>>();
  // Every namespace loaded, which is what a name typed at runtime resolves
  // against: a player is not standing in any one module.
  readonly all = new Set<string | null>();

  declare(kind: string, namespace: string | null, id: string): string {
    const key = qualify(namespace, id);
    this.all.add(namespace);
    const forKind = this.declared.get(kind) ?? new Set<string>();
    forKind.add(key);
    this.declared.set(kind, forKind);
    return key;
  }

  undeclare(kind: string, key: string): void {
    this.declared.get(kind)?.delete(key);
  }

  has(kind: string, key: string): boolean {
    return this.declared.get(kind)?.has(key) === true;
  }

  // A reference may drop leading segments — `orc-pack.entity.goblin`, `entity.goblin`
  // and `goblin` are the same path — and resolves when exactly one visible module
  // answers to what is left. Resolution is directed by the kind the site wants, so
  // an `entity` named `rope` never shadows the `item` a `give:` is asking for.
  resolve(kind: string, raw: string, self: string | null, visible: ReadonlySet<string | null>, where: string): string {
    const segments = raw.split('.');
    if (segments[0] === kind && segments.length > 1) segments.shift();
    if (segments[0] === SELF && segments.length > 1 && self !== null) segments[0] = self;

    if (segments.length > 2) throw new DslError(`${where}: ${raw} is not a path to a ${kind}`);
    if (segments.length === 2) {
      const [moduleId, id] = segments;
      if (!visible.has(moduleId)) throw new DslError(`${where} names ${raw}, but ${moduleId} is not this module or one of its dependencies`);
      const key = qualify(moduleId, id);
      if (!this.has(kind, key)) throw new DslError(`${where} names an unknown ${kind}: ${raw}`);
      return key;
    }

    const matches = [...visible].map((moduleId) => qualify(moduleId, segments[0])).filter((key) => this.has(kind, key));
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new DslError(`${where} names an unknown ${kind}: ${raw}`);
    throw new DslError(`${where} names ${raw}, which is ambiguous between ${[...matches].sort().join(' and ')}. Name the module, or use self.`);
  }
}
