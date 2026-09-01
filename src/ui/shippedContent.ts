import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';

// Both homes the game loads from, in the browser's own way of reading them: the engine's modules
// under `src/content/engine`, and the author's corpus under `content/`. `src/content/shipped.ts`
// is the filesystem's answer to the same question, and `shippedContent.test.ts` holds them to
// naming the same two directories.
const BUNDLED = {
  ...(import.meta.glob('../content/engine/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  ...(import.meta.glob('../../content/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
};

const moduleName = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]*$/, '');

// The corpus does not open while the suite is running, here either. This is the second reading of
// the same two directories — the browser's — and a test standing on it would go red for an author's
// edit exactly as one standing on `shipped.ts` would. The rule is the same rule; see there.
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
