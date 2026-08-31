import { readdirSync, readFileSync } from 'fs';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import { parseModuleSource, type ModuleSource } from './universe';

export const CORPUS_DIR = 'content';

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

// Every shipped module's file, excluding an author's own local-changes file — which does not
// exist in the repository and is not itself shipped, but is legal to run `npm run play` against.
// Ordered by the module id rather than by the file name, because the extension is not part of the
// id and sorting with it on puts `combat-expansion` before `combat` while every reader downstream
// puts `combat` first. Two ids where one is a prefix of the other is the only case the two orders
// disagree on, and the page and the filesystem have to answer in one order or a claim that they
// carry the same corpus reads as a claim that they do not.
export function shippedFiles(): readonly string[] {
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.dsl'))
    .filter((name) => moduleId(name) !== LOCAL_CHANGES_MODULE_ID)
    .sort((a, b) => moduleId(a).localeCompare(moduleId(b)));
}

export function moduleSource(id: string): ModuleSource {
  return { name: id, text: readFileSync(`${CORPUS_DIR}/${id}.dsl`, 'utf8') };
}

export function shippedSources(): readonly ModuleSource[] {
  return shippedFiles().map((file) => moduleSource(moduleId(file)));
}

const mustLoad = (prefix: string): boolean => prefix !== 'optional' && prefix !== 'recommended' && prefix !== 'incompatible';

// A module's world is that module plus every dependency the loader would refuse to start it
// without, and the modules that could open one are whichever mark a # location starting. Both are
// read off the corpus rather than named, so a module split again moves with no edit here.
function reading(): { closureOf: (id: string) => Set<string>; owners: readonly string[] } {
  const parsed = shippedSources().map(parseModuleSource);
  const byId = new Map(parsed.map((module) => [module.info.id, module]));
  const closureOf = (id: string): Set<string> => {
    const closure = new Set<string>();
    const visit = (each: string): void => {
      if (closure.has(each)) return;
      closure.add(each);
      for (const dependency of byId.get(each)?.info.dependencies ?? []) {
        if (mustLoad(dependency.prefix)) visit(dependency.module);
      }
    };
    visit(id);
    return closure;
  };
  const owners = parsed.filter((module) => module.sections.some((section) => section.kind === 'location' && (section.value as { starting?: boolean }).starting === true)).map((module) => module.info.id);
  return { closureOf, owners };
}

// One module and everything the loader would refuse to start it without, in the order the corpus
// ships them. What a test that wants a particular module's world asks for, by naming that module.
export function worldFor(id: string): readonly ModuleSource[] {
  const held = reading().closureOf(id);
  return shippedSources().filter((source) => held.has(source.name));
}

// The smallest world with somewhere to stand. More than one module may mark a starting # location,
// because a module loading over another may take the keyword back and put it on a place of its own
// — which is how a tutorial opens somewhere the town it is written into does not. Each such module
// carries its own world and every one of them stands, so the minimum is the smallest of them; two
// that did not nest would be two worlds rather than one world and a layer over it, and there is
// nothing here that could choose between them.
function standingClosure(): ReadonlySet<string> {
  const { closureOf, owners } = reading();
  if (owners.length === 0) throw new Error('shipped: no module declares a starting # location');

  const worlds = owners.map(closureOf);
  const smallest = worlds.reduce((least, each) => (each.size < least.size ? each : least));
  const stranded = owners.filter((_, at) => ![...smallest].every((id) => worlds[at]!.has(id)));
  if (stranded.length > 0) throw new Error(`shipped: ${stranded.join(', ')} mark a # location starting and their worlds do not nest with the smallest, so there is no one minimum world`);
  return smallest;
}

let standing: readonly ModuleSource[] | undefined;

// The minimum shipped world with somewhere to stand. `src/content/shipped.test.ts` proves this
// against an independent, brute-force reading of the same corpus.
export function standingSources(): readonly ModuleSource[] {
  if (standing === undefined) {
    const closure = standingClosure();
    standing = shippedSources().filter((source) => closure.has(source.name));
  }
  return standing;
}
