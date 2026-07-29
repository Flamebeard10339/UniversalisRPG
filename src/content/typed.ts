import { Registry } from './registry';
import { visitDirective } from './referenceSites';
import { Directive } from './test';

// A directive typed at a prompt names things as short as an author does, so it
// gets the same resolution — against every namespace loaded, since a player is
// not standing inside any one module.
export function resolveDirective(directive: Directive, registry: Registry): Directive {
  visitDirective(directive, 'typed directive', (kind, id, where) => registry.namespace.resolve(kind, id, null, registry.namespace.all, where));
  return directive;
}
