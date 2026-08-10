import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';

// The glob is the manifest: a .dsl added to content/ ships with no edit here,
// and the browser needs no filesystem and no network to read what it returns.
const BUNDLED = import.meta.glob('../../content/*.dsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const moduleName = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]*$/, '');

// play-cli writes staged edits to content/, and they are one developer's, not
// the release's.
export const SHIPPED_SOURCES: readonly ModuleSource[] = Object.entries(BUNDLED)
  .map(([path, text]) => ({ name: moduleName(path), text }))
  .filter((source) => source.name !== LOCAL_CHANGES_MODULE_ID)
  .sort((a, b) => a.name.localeCompare(b.name));
