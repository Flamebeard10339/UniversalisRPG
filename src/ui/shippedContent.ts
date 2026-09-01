import { shut } from '../content/corpusDoor';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';

const BUNDLED = {
  ...(import.meta.glob('../content/engine/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  ...(import.meta.glob('../../content/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
};

const moduleName = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]*$/, '');

const bundled = (): readonly ModuleSource[] => {
  shut();
  return Object.entries(BUNDLED)
    .map(([path, text]) => ({ name: moduleName(path), text }))
    .filter((source) => source.name !== LOCAL_CHANGES_MODULE_ID)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const SHIPPED_SOURCES: readonly ModuleSource[] = new Proxy([] as ModuleSource[], {
  get: (_target, key) => Reflect.get(bundled() as ModuleSource[], key),
  has: (_target, key) => Reflect.has(bundled() as ModuleSource[], key),
  ownKeys: () => Reflect.ownKeys(bundled() as ModuleSource[]),
  getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(bundled() as ModuleSource[], key),
});
