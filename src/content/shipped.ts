import { readdirSync, readFileSync } from 'fs';
import { ENGINE_MODULE_DIR, engineModules } from './engineModules';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import type { ModuleSource } from './universe';
import { standingWithin, worldWithin } from './worlds';

export const CORPUS_DIR = 'content';

// The corpus does not open while the suite is running. A contributor editing the world in the game
// cannot run vitest, so a test that could go red on their edit is a gate nobody can answer — and a
// rule that is only a search of the tree for ways round it is a rule that will be walked round.
// This is the rule itself. `docs/authoring-split/` says why, and the engine's own world is
// `src/content/fixture/`.
const shut = (): void => {
  if (process.env.VITEST !== undefined) {
    throw new Error('the shipped corpus does not open while the suite is running: stand on src/content/fixture instead (worldFixture.ts), and let `npm run oracle -- --at content` answer for content/');
  }
};

// Where the game's own world is written, for a tool that takes source paths rather than sources: the
// engine's modules and the author's corpus, which is what `shippedSources` below reads in TypeScript.
// A CLI whose default world is the shipped one names this rather than the corpus alone, or the game
// it opens has no English in it.
export const SHIPPED_DIRS: readonly string[] = [ENGINE_MODULE_DIR, CORPUS_DIR];

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

// Every shipped module's file, excluding an author's own local-changes file — which does not
// exist in the repository and is not itself shipped, but is legal to run `npm run play` against.
// Ordered by the module id rather than by the file name, because the extension is not part of the
// id and sorting with it on puts `combat-expansion` before `combat` while every reader downstream
// puts `combat` first. Two ids where one is a prefix of the other is the only case the two orders
// disagree on, and the page and the filesystem have to answer in one order or a claim that they
// carry the same corpus reads as a claim that they do not.
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

// Everything the game loads: the engine's own modules and the author's corpus, in one order by
// module id, which is the order the page's own reading of the same two directories comes back in.
// Two homes and one answer — `shippedFiles` stays the corpus alone, because every tool that writes
// a module back, renames one, or offers one for review is asking about what an author wrote.
export function shippedSources(): readonly ModuleSource[] {
  return [...engineModules(), ...shippedFiles().map((file) => moduleSource(moduleId(file)))].sort((a, b) => a.name.localeCompare(b.name));
}

// One module and everything the loader would refuse to start it without, in the order the corpus
// ships them. What a test that wants a particular module's world asks for, by naming that module.
export const worldFor = (id: string): readonly ModuleSource[] => worldWithin(shippedSources(), id);

let standing: readonly ModuleSource[] | undefined;

// The minimum shipped world with somewhere to stand, worked out once and kept: how it is worked out
// is `worlds.ts`, which owes the corpus nothing and is proved against sources written for it.
export function standingSources(): readonly ModuleSource[] {
  return (standing ??= standingWithin(shippedSources()));
}
