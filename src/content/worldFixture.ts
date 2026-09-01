import { readdirSync, readFileSync } from 'fs';
import { engineModules } from './engineModules';
import type { ModuleSource } from './universe';

// The furniture a test world needs before it can say anything of its own: somewhere to stand, two
// stats with a passive apiece, and one item that does nothing. A test declares what it is about
// after this. It is not under `content/`, so no shipped entry point can reach it.
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

// The suite's own world: three modules under two packs, with places, a keeper, a counter, a quest,
// two sheets and eight routes. It is here rather than under `content/` because it is the engine's
// and not an author's — editing anything an author can edit must not be able to redden a test, and
// the corpus's own verdict is `npm run oracle -- --at content`. `docs/authoring-split/` says why.
//
// A test that wants a world asks for this one. A test that wants a *small* world writes its own out
// of `FIXTURE_WORLD` above, which is the older and still the cheaper habit.
export const FIXTURE_CORPUS_DIR = 'src/content/fixture';

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

// Read off the directory rather than listed, so a module added to the fixture is in it with no edit
// here — the same way `shipped.ts` answers for the corpus.
export function fixtureFiles(): readonly string[] {
  return readdirSync(FIXTURE_CORPUS_DIR).filter((name) => name.endsWith('.dsl')).sort((a, b) => moduleId(a).localeCompare(moduleId(b)));
}

export function fixtureModule(id: string): ModuleSource {
  return { name: id, text: readFileSync(`${FIXTURE_CORPUS_DIR}/${id}.dsl`, 'utf8') };
}

// The engine's own modules come with it, the way they come with the corpus in `shipped.ts`: a world
// with no English in it is not one, and a test that had to remember to add it would be a test that
// forgot to.
export function fixtureSources(): readonly ModuleSource[] {
  return [...engineModules(), ...fixtureFiles().map((file) => fixtureModule(moduleId(file)))];
}
