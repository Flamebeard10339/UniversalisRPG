import { readdirSync, readFileSync } from 'fs';
import { engineModules } from './engineModules';
import type { ModuleSource } from './universe';

export const FIXTURE_WORLD = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# stat attack
base: 4

# passive hale
+10 max-health

# passive keen
+4 attack

# item rope

`;

export const FIXTURE_CORPUS_DIR = 'src/content/fixture';

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

export function fixtureFiles(): readonly string[] {
  return readdirSync(FIXTURE_CORPUS_DIR).filter((name) => name.endsWith('.dsl')).sort((a, b) => moduleId(a).localeCompare(moduleId(b)));
}

export function fixtureModule(id: string): ModuleSource {
  return { name: id, text: readFileSync(`${FIXTURE_CORPUS_DIR}/${id}.dsl`, 'utf8') };
}

export function fixtureSources(): readonly ModuleSource[] {
  return [...engineModules(), ...fixtureFiles().map((file) => fixtureModule(moduleId(file)))];
}
