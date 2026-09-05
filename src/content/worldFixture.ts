import { engineModules } from './engineModules';
import type { ModuleSource } from './universe';
import { worldFileNames, worldModule, worldModules } from './worldDir';

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

export const fixtureFiles = (): readonly string[] => worldFileNames(FIXTURE_CORPUS_DIR);

export const fixtureModule = (id: string): ModuleSource => worldModule(FIXTURE_CORPUS_DIR, id);

export const fixtureSources = (): readonly ModuleSource[] => [...engineModules(), ...worldModules(FIXTURE_CORPUS_DIR)];
