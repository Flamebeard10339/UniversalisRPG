import { DslError } from '../grammar/parser';

export const ACTION_MEMBER = 'action-slug';

export const DIALOGUE_NODE = 'node';

export const MEMBER_KINDS: readonly string[] = [DIALOGUE_NODE, ACTION_MEMBER];

export const qualify = (namespace: string | null, id: string): string => (namespace === null ? id : `${namespace}.${id}`);

// Whether an id names the section a key holds. An id may be written whole or from any segment
// boundary inward, so the shorter of the two is what the other has to end with.
export const namesSection = (key: string, written: string): boolean => key === written || key.endsWith(`.${written}`);

// Neither of two ids is known to be the fuller one: a view publishes a whole address and an author
// writes as little of it as says which section, so either may be the short way of writing the other.
export const sameSection = (one: string, other: string): boolean => namesSection(one, other) || namesSection(other, one);

const OWNER_KINDED: ReadonlySet<string> = new Set([ACTION_MEMBER]);

// Whether a key of this kind carries its module one segment in, under its owner's kind, rather than
// as its own first word. Anything reading a module off a key has to know which of the two it is
// looking at, and this is the one place that says.
export const keyedUnderOwnerKind = (kind: string): boolean => OWNER_KINDED.has(kind);

export const memberOwnerPrefix = (memberKind: string, ownerKind: string, owner: string): string => (OWNER_KINDED.has(memberKind) ? `${ownerKind}.${owner}` : owner);

export const memberKey = (memberKind: string, ownerKind: string, owner: string, name: string): string => `${memberOwnerPrefix(memberKind, ownerKind, owner)}.${name}`;

const SELF = 'self';

const SHORTEST_COMPARED = 4;

function oneTypoApart(a: string, b: string): boolean {
  if (a === b || Math.min(a.length, b.length) < SHORTEST_COMPARED || Math.abs(a.length - b.length) > 1) return false;
  const [longer, shorter] = a.length < b.length ? [b, a] : [a, b];
  let at = 0;
  while (at < shorter.length && longer[at] === shorter[at]) at += 1;
  if (longer.length !== shorter.length) return longer.slice(at + 1) === shorter.slice(at);
  if (longer.slice(at + 1) === shorter.slice(at + 1)) return true;
  return longer[at] === shorter[at + 1] && longer[at + 1] === shorter[at] && longer.slice(at + 2) === shorter.slice(at + 2);
}

export class Namespace {
  private readonly declared = new Map<string, Map<string, string | null>>();
  private readonly modules = new Set<string>();
  private readonly minted = new Map<string, string>();
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

  private put(kind: string, namespace: string | null, key: string): string {
    this.all.add(namespace);
    this.keys(kind).set(key, namespace);
    return key;
  }

  private refuseSquat(kind: string, key: string, from: string): never {
    throw new DslError(`# ${kind} ${key} is already minted by ${from}, which keys its own words under that name: give this section another id`);
  }

  declare(kind: string, namespace: string | null, id: string): string {
    const key = qualify(namespace, id);
    const from = this.minted.get(`${kind} ${key}`);
    if (from !== undefined) this.refuseSquat(kind, key, from);
    return this.put(kind, namespace, key);
  }

  // A name the engine puts in a kind's id space on an author's behalf, minted the same way by every section that mints it and so held at the root rather than under any one of them. Nothing may be authored there: the two would file their words under one key and whichever loaded last would silently win.
  mint(kind: string, id: string, from: string): string {
    if (!this.minted.has(`${kind} ${id}`) && this.has(kind, id)) this.refuseSquat(kind, id, from);
    this.minted.set(`${kind} ${id}`, from);
    return this.put(kind, null, id);
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
    // A member keyed under its owner's kind carries the module name one segment in, so the prefix a rename rewrites starts after that word.
    const beneath = (kind: string, key: string): string => {
      if (!OWNER_KINDED.has(kind)) return under(key);
      const at = key.indexOf('.');
      return at < 0 ? key : `${key.slice(0, at + 1)}${under(key.slice(at + 1))}`;
    };
    const next = new Namespace();
    next.declareModules([...this.modules].map(under));
    for (const [at, from] of this.minted) next.minted.set(at, from);
    for (const held of this.all) next.all.add(held === from ? to : held);
    for (const [kind, keys] of this.declared) {
      const into = next.keys(kind);
      for (const [key, namespace] of keys) into.set(beneath(kind, key), namespace === from ? to : namespace);
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

  nearMisses(kind: string, key: string): string[] {
    const keys = this.declared.get(kind);
    if (keys === undefined || keys.has(key)) return [];
    const under = key.slice(0, key.lastIndexOf('.') + 1);
    const local = key.slice(under.length);
    const siblings = [...keys.keys()].filter((each) => each.startsWith(under) && !each.slice(under.length).includes('.'));
    return siblings.filter((each) => oneTypoApart(each.slice(under.length), local)).sort();
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
      if (visible.has(namespace) && namesSection(key, suffix)) matches.push(key);
    }
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new DslError(`${where} names an unknown ${kind}: ${raw}`);
    throw new DslError(`${where} names ${raw}, which is ambiguous between ${matches.sort().join(' and ')}. Name the module, or use self.`);
  }
}
