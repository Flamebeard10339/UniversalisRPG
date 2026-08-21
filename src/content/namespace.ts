import { DslError } from '../grammar/parser';

export const ACTION_MEMBER = 'action-slug';

export const DIALOGUE_NODE = 'node';

export const MEMBER_KINDS: readonly string[] = [DIALOGUE_NODE, ACTION_MEMBER];

export const qualify = (namespace: string | null, id: string): string => (namespace === null ? id : `${namespace}.${id}`);

const OWNER_KINDED: ReadonlySet<string> = new Set([ACTION_MEMBER]);

export const memberOwnerPrefix = (memberKind: string, ownerKind: string, owner: string): string => (OWNER_KINDED.has(memberKind) ? `${ownerKind}.${owner}` : owner);

export const memberKey = (memberKind: string, ownerKind: string, owner: string, name: string): string => `${memberOwnerPrefix(memberKind, ownerKind, owner)}.${name}`;

const SELF = 'self';

export class Namespace {
  private readonly declared = new Map<string, Map<string, string | null>>();
  private readonly modules = new Set<string>();
  readonly all = new Set<string | null>();

  private keys(kind: string): Map<string, string | null> {
    const existing = this.declared.get(kind);
    if (existing) return existing;
    const created = new Map<string, string | null>();
    this.declared.set(kind, created);
    return created;
  }

  declareModules(ids: Iterable<string>): void {
    for (const id of ids) this.modules.add(id);
  }

  declare(kind: string, namespace: string | null, id: string): string {
    const key = qualify(namespace, id);
    this.all.add(namespace);
    this.keys(kind).set(key, namespace);
    return key;
  }

  declareMember(kind: string, ownerKind: string, owner: string, name: string): string {
    const key = memberKey(kind, ownerKind, owner, name);
    this.keys(kind).set(key, this.declared.get(ownerKind)?.get(owner) ?? null);
    return key;
  }

  undeclare(kind: string, key: string): void {
    this.declared.get(kind)?.delete(key);
    for (const [memberKind, keys] of this.declared) {
      const prefix = `${memberOwnerPrefix(memberKind, kind, key)}.`;
      for (const other of keys.keys()) if (other.startsWith(prefix)) keys.delete(other);
    }
  }

  // The same declarations under another module's name. What a key looks like is this class's to know, so renaming one is too — a caller that rewrote the registry's maps and left this behind would hold a registry whose two halves disagree about what exists.
  renamed(from: string, to: string): Namespace {
    const under = (key: string): string => (key === from ? to : key.startsWith(`${from}.`) ? `${to}${key.slice(from.length)}` : key);
    const next = new Namespace();
    next.declareModules([...this.modules].map(under));
    for (const held of this.all) next.all.add(held === from ? to : held);
    for (const [kind, keys] of this.declared) {
      const into = next.keys(kind);
      for (const [key, namespace] of keys) into.set(under(key), namespace === from ? to : namespace);
    }
    return next;
  }

  declaredKeys(kind: string): string[] {
    return [...(this.declared.get(kind)?.keys() ?? [])];
  }

  kinds(): string[] {
    return [...this.declared.keys()];
  }

  snapshot(): string[] {
    const lines: string[] = [];
    for (const [kind, keys] of this.declared) for (const [key, namespace] of keys) lines.push(`${kind} ${key} ${namespace ?? '(root)'}`);
    return lines.sort();
  }

  has(kind: string, key: string): boolean {
    return this.declared.get(kind)?.has(key) === true;
  }

  ownerOf(kind: string, key: string): string | null | undefined {
    return this.declared.get(kind)?.get(key);
  }

  resolve(kind: string, raw: string, self: string | null, visible: ReadonlySet<string | null>, where: string, inner: string | null = null): string {
    const segments = raw.split('.');
    if (segments[0] === kind && segments.length > 1) segments.shift();
    if (segments[0] === SELF && segments.length > 1 && self !== null) segments[0] = self;
    const suffix = segments.join('.');
    if (segments.length > 1 && this.modules.has(segments[0]) && !visible.has(segments[0])) {
      throw new DslError(`${where} names ${raw}, but ${segments[0]} is not this module or one of its dependencies`);
    }

    if (inner !== null && this.has(kind, `${inner}.${suffix}`)) return `${inner}.${suffix}`;

    const matches: string[] = [];
    for (const [key, namespace] of this.keys(kind)) {
      if (visible.has(namespace) && (key === suffix || key.endsWith(`.${suffix}`))) matches.push(key);
    }
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new DslError(`${where} names an unknown ${kind}: ${raw}`);
    throw new DslError(`${where} names ${raw}, which is ambiguous between ${matches.sort().join(' and ')}. Name the module, or use self.`);
  }
}
