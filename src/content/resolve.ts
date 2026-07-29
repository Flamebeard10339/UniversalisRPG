import { DISCOVERED } from './location';
import { DslError } from '../grammar/parser';
import { listMembers } from '../grammar/section';
import { NAMESPACED_KINDS, Namespace, qualify } from './namespace';
import { ParsedModule } from './universe';
import { ReferenceKind, visitSection } from './referenceSites';
import { Removal } from './removal';

// What a module may name: its own namespace, and those of the dependencies it
// declared. A module that could see its dependencies' dependencies would be
// referencing a module it never named, which is what declaring one is for.
function visibleTo(module: ParsedModule, loaded: ReadonlySet<string>): Set<string | null> {
  const visible = new Set<string | null>([module.namespace]);
  for (const dependency of module.info.dependencies) {
    if (dependency.prefix !== 'incompatible' && loaded.has(dependency.module)) visible.add(dependency.module);
  }
  return visible;
}

const isNamespaced = (kind: string): boolean => NAMESPACED_KINDS.includes(kind);

function missingOptionalDependencies(module: ParsedModule, loaded: ReadonlySet<string>): Set<string> {
  const missing = new Set<string>();
  for (const dependency of module.info.dependencies) {
    if ((dependency.prefix === 'optional' || dependency.prefix === 'recommended') && !loaded.has(dependency.module)) missing.add(dependency.module);
  }
  return missing;
}

function namesMissingOptional(kind: string, raw: string, missing: ReadonlySet<string>): boolean {
  const segments = raw.split('.');
  if (segments[0] === kind && segments.length > 1) segments.shift();
  return segments.length > 1 && missing.has(segments[0]);
}

function unorderedDependencies(module: ParsedModule): ReadonlySet<string> {
  return new Set(module.info.dependencies.filter((dependency) => dependency.prefix === 'unordered').map((dependency) => dependency.module));
}

// A bare heading names something inside this module; a dotted one edits something
// that already exists. You cannot create outside your own namespace, so adding a
// dependency can never quietly turn a module's creation into an edit of another
// module's object.
function targetKey(module: ParsedModule, kind: string, id: string, namespace: Namespace, visible: ReadonlySet<string | null>): string {
  if (!isNamespaced(kind) || !id.includes('.')) return isNamespaced(kind) ? qualify(module.namespace, id) : id;
  const resolved = namespace.resolve(kind, id, module.namespace, visible, `# ${kind} ${id}`);
  const owner = namespace.ownerOf(kind, resolved);
  if (owner !== null && owner !== undefined && unorderedDependencies(module).has(owner)) {
    throw new DslError(`# ${kind} ${id} edits ${owner}, but ~ dependencies do not load before this module. Use a load-order dependency for patches.`);
  }
  return resolved;
}

// What hangs under an object rather than beside it: the flags it owns, and the
// nodes of a dialogue, whose visits the engine counts against the node's path.
function declareMembers(namespace: Namespace, kind: string, value: { id: string; flags?: unknown; nodes?: { name: string }[] }): void {
  if (kind === 'location') namespace.declareMember('flag', kind, value.id, DISCOVERED);
  for (const flag of listMembers<string>(value.flags)) namespace.declareMember('flag', kind, value.id, flag);
  if (kind === 'dialogue') for (const node of value.nodes ?? []) namespace.declareMember('node', kind, value.id, node.name);
}

export function resolveModule(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const visible = visibleTo(module, loaded);
  const missingOptional = missingOptionalDependencies(module, loaded);
  const self = module.namespace;
  module.sections = module.sections.filter((section) => {
    if (section.kind === 'remove') return !namesMissingOptional((section.value as Removal).kind, (section.value as Removal).target, missingOptional);
    const { id } = section.value as { id?: string };
    return id === undefined || !isNamespaced(section.kind) || !id.includes('.') || !namesMissingOptional(section.kind, id, missingOptional);
  });
  const created = module.sections.filter((section) => section.kind !== 'remove') as { kind: string; value: { id: string; flags?: unknown; nodes?: { name: string }[] } }[];

  // Declared before anything is resolved, so a section may reference one that
  // appears further down its own file.
  for (const { kind, value } of created) {
    if (isNamespaced(kind) && value.id !== undefined && !value.id.includes('.')) namespace.declare(kind, self, value.id);
  }

  // Ids settle before members are declared, because a member hangs under the key
  // its object ended up with — and an edit's heading names another module's.
  for (const section of created) {
    section.value.id = targetKey(module, section.kind, section.value.id, namespace, visible);
    declareMembers(namespace, section.kind, section.value);
  }

  for (const section of module.sections) {
    if (section.kind === 'remove') {
      const removal = section.value as Removal;
      if (!isNamespaced(removal.kind)) throw new DslError(`# remove ${removal.id}: ${removal.kind} is not a kind a module owns`);
      removal.target = namespace.resolve(removal.kind, removal.target, self, visible, `# remove ${removal.id}`);
      const owner = namespace.ownerOf(removal.kind, removal.target);
      if (owner !== null && owner !== undefined && unorderedDependencies(module).has(owner)) {
        throw new DslError(`# remove ${removal.id} edits ${owner}, but ~ dependencies do not load before this module. Use a load-order dependency for patches.`);
      }
      namespace.undeclare(removal.kind, removal.target);
      continue;
    }
    const { id } = section.value as { id: string };
    // The section is the innermost context its own references are read from, so
    // a bare flag name means this object's before it means anyone else's.
    const visit = (kind: ReferenceKind, raw: string, where: string): string =>
      isNamespaced(kind) && !namesMissingOptional(kind, raw, missingOptional) ? namespace.resolve(kind, raw, self, visible, where, id) : raw;
    visitSection(section.kind, section.value, `# ${section.kind} ${id}`, visit);
  }
}
