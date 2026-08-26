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

// The module a game cannot begin without, found the way the engine itself would find it rather
// than named by hand: whichever shipped module's own text marks a # location starting, plus every
// dependency it declares that the loader would refuse to start without. A module split again moves
// with no edit here, because this reads the split rather than a list of it.
function standingClosure(): ReadonlySet<string> {
  const parsed = shippedSources().map(parseModuleSource);
  const byId = new Map(parsed.map((module) => [module.info.id, module]));
  const owner = parsed.find((module) => module.sections.some((section) => section.kind === 'location' && (section.value as { starting?: boolean }).starting === true));
  if (!owner) throw new Error('shipped: no module declares a starting # location');

  const closure = new Set<string>();
  const visit = (id: string): void => {
    if (closure.has(id)) return;
    closure.add(id);
    for (const dependency of byId.get(id)?.info.dependencies ?? []) {
      if (mustLoad(dependency.prefix)) visit(dependency.module);
    }
  };
  visit(owner.info.id);
  return closure;
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
