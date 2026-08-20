import { mayBeInstanceId } from './instanceId';
import { Registry } from './registry';
import { visitDirective } from './sections/test';
import { Directive } from './sections/test';

// A directive typed at a prompt names things as short as an author does, so it
// gets the same resolution — against every namespace loaded, since a player is
// not standing inside any one module.
export function resolveDirective(directive: Directive, registry: Registry): Directive {
  visitDirective(directive, 'typed directive', (kind, id, where) => registry.namespace.resolve(kind, id, null, registry.namespace.all, where));
  return directive;
}

// What the player carries, named at a prompt rather than inside a directive. A
// bare number could only have been minted, so it goes to the runtime unresolved
// and everything else is an item id an author could have written.
export function resolveCarried(id: string, registry: Registry, where: string): string {
  if (mayBeInstanceId(id)) return id;
  return registry.namespace.resolve('item', id, null, registry.namespace.all, where);
}
