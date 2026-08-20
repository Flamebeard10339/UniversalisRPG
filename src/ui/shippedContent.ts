import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';

const BUNDLED = import.meta.glob('../../content/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const moduleName = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]*$/, '');

export const SHIPPED_SOURCES: readonly ModuleSource[] = Object.entries(BUNDLED)
  .map(([path, text]) => ({ name: moduleName(path), text }))
  .filter((source) => source.name !== LOCAL_CHANGES_MODULE_ID)
  .sort((a, b) => a.name.localeCompare(b.name));
