import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';

const BUNDLED = {
  ...(import.meta.glob('../content/engine/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  ...(import.meta.glob('../../content/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
};

const moduleName = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]*$/, '');

const shut = (): void => {
  if (process.env.VITEST !== undefined) {
    throw new Error('the shipped corpus does not open while the suite is running: stand on src/content/fixture instead (worldFixture.ts), and let `npm run oracle -- --at content` answer for content/');
  }
};

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
