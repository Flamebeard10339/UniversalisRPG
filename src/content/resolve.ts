import { DslError } from '../grammar/parser';
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

// A bare heading names something inside this module; a dotted one edits something
// that already exists. You cannot create outside your own namespace, so adding a
// dependency can never quietly turn a module's creation into an edit of another
// module's object.
function targetKey(module: ParsedModule, kind: string, id: string, namespace: Namespace, visible: ReadonlySet<string | null>): string {
  if (!isNamespaced(kind) || !id.includes('.')) return isNamespaced(kind) ? qualify(module.namespace, id) : id;
  return namespace.resolve(kind, id, module.namespace, visible, `# ${kind} ${id}`);
}

export function resolveModule(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const visible = visibleTo(module, loaded);
  const self = module.namespace;

  // Declared before anything is resolved, so a section may reference one that
  // appears further down its own file.
  for (const section of module.sections) {
    const id = (section.value as { id?: string }).id;
    if (section.kind !== 'remove' && isNamespaced(section.kind) && id !== undefined && !id.includes('.')) namespace.declare(section.kind, self, id);
  }

  const visit = (kind: ReferenceKind, id: string, where: string): string => (isNamespaced(kind) ? namespace.resolve(kind, id, self, visible, where) : id);

  for (const section of module.sections) {
    if (section.kind === 'remove') {
      const removal = section.value as Removal;
      if (!isNamespaced(removal.kind)) throw new DslError(`# remove ${removal.id}: ${removal.kind} is not a kind a module owns`);
      removal.target = namespace.resolve(removal.kind, removal.target, self, visible, `# remove ${removal.id}`);
      namespace.undeclare(removal.kind, removal.target);
      continue;
    }
    const value = section.value as { id: string };
    value.id = targetKey(module, section.kind, value.id, namespace, visible);
    visitSection(section.kind, value, `# ${section.kind} ${value.id}`, visit);
  }
}
