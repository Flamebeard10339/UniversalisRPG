import { shut } from './corpusDoor';
import { ENGINE_MODULE_DIR, engineModules } from './engineModules';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import type { ModuleSource } from './universe';
import { moduleIdOf, worldFileName, worldFileNames, worldModule } from './worldDir';
import { standingWithin, worldWithin } from './worlds';

export const CORPUS_DIR = 'content';

export const LOCAL_CHANGES_FILE = `${CORPUS_DIR}/${worldFileName(LOCAL_CHANGES_MODULE_ID)}`;

export const SHIPPED_DIRS: readonly string[] = [ENGINE_MODULE_DIR, CORPUS_DIR];

export function shippedFiles(): readonly string[] {
  shut();
  return worldFileNames(CORPUS_DIR).filter((name) => moduleIdOf(name) !== LOCAL_CHANGES_MODULE_ID);
}

export function moduleSource(id: string): ModuleSource {
  shut();
  return worldModule(CORPUS_DIR, id);
}

export function shippedSources(): readonly ModuleSource[] {
  return [...engineModules(), ...shippedFiles().map((file) => moduleSource(moduleIdOf(file)))].sort((a, b) => a.name.localeCompare(b.name));
}

export const worldFor = (id: string): readonly ModuleSource[] => worldWithin(shippedSources(), id);

let standing: readonly ModuleSource[] | undefined;

export function standingSources(): readonly ModuleSource[] {
  return (standing ??= standingWithin(shippedSources()));
}
