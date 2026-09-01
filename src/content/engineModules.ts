import { readdirSync, readFileSync } from 'fs';
import type { ModuleSource } from './universe';

// The modules the engine ships on its own behalf. They are ordinary content — loaded through the
// same path, translatable by the same `# locale` mechanism — and they are not the author's: nothing
// here is a fact about any world, and editing one is editing the engine. That is why they sit under
// `src/` rather than in `content/`, which holds what an author writes and edits in the game.
//
// The split is what lets the suite stand on the engine's own words while it may not read a line of
// the corpus. `docs/authoring-split/` says why, and the rule's own proof is the guard there.
export const ENGINE_MODULE_DIR = 'src/content/engine';

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

// Read off the directory rather than listed, so a second engine module ships by being written.
export function engineFiles(): readonly string[] {
  return readdirSync(ENGINE_MODULE_DIR)
    .filter((name) => name.endsWith('.dsl'))
    .sort((a, b) => moduleId(a).localeCompare(moduleId(b)));
}

export function engineModule(id: string): ModuleSource {
  return { name: id, text: readFileSync(`${ENGINE_MODULE_DIR}/${id}.dsl`, 'utf8') };
}

export function engineModules(): readonly ModuleSource[] {
  return engineFiles().map((file) => engineModule(moduleId(file)));
}
