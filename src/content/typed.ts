import { namesACopy } from './instanceId';
import { Registry } from './registry';
import { visitDirective } from './sections/test';
import { Directive } from './sections/test';

export function resolveDirective(directive: Directive, registry: Registry): Directive {
  visitDirective(directive, 'typed directive', (kind, id, where) => registry.namespace.resolve(kind, id, null, registry.namespace.all, where));
  return directive;
}

export function resolveCarried(id: string, registry: Registry, where: string): string {
  if (namesACopy(id)) return id;
  return registry.namespace.resolve('item', id, null, registry.namespace.all, where);
}
