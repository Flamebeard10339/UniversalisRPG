import { readdirSync, readFileSync } from 'fs';
import { shut } from './corpusDoor';
import { ENGINE_MODULE_DIR, engineModules } from './engineModules';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import type { ModuleSource } from './universe';
import { standingWithin, worldWithin } from './worlds';

export const CORPUS_DIR = 'content';

export const SHIPPED_DIRS: readonly string[] = [ENGINE_MODULE_DIR, CORPUS_DIR];

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

export function shippedFiles(): readonly string[] {
  shut();
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.dsl'))
    .filter((name) => moduleId(name) !== LOCAL_CHANGES_MODULE_ID)
    .sort((a, b) => moduleId(a).localeCompare(moduleId(b)));
}

export function moduleSource(id: string): ModuleSource {
  shut();
  return { name: id, text: readFileSync(`${CORPUS_DIR}/${id}.dsl`, 'utf8') };
}

export function shippedSources(): readonly ModuleSource[] {
  return [...engineModules(), ...shippedFiles().map((file) => moduleSource(moduleId(file)))].sort((a, b) => a.name.localeCompare(b.name));
}

export const worldFor = (id: string): readonly ModuleSource[] => worldWithin(shippedSources(), id);

let standing: readonly ModuleSource[] | undefined;

export function standingSources(): readonly ModuleSource[] {
  return (standing ??= standingWithin(shippedSources()));
}
