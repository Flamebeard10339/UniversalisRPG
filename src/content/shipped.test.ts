import { readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { LOCAL_CHANGES_MODULE_ID, renderLocalChangesModule } from './localChanges';
import { formatModuleDiagnostic } from './registry';
import { loadUniverseWithDiagnostics } from './load';
import { CORPUS_DIR, moduleSource, shippedFiles, standingSources } from './shipped';
import { parseModuleSource } from './universe';

const ids = (): string[] => shippedFiles().map((file) => file.replace(/\.dsl$/, ''));

const packOf = (id: string): string | undefined => parseModuleSource(moduleSource(id)).info.pack;

const inCorpus = (): string[] =>
  readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.dsl'))
    .map((name) => name.replace(/\.dsl$/, ''))
    .sort();

// Nothing the corpus holds is left out of it by hand. A fixture world that a test wants and a
// player must never reach is a `.ts` outside `content/`, which no shipped entry point can name;
// the alternative — a `.dsl` here and a second id in the filter that skips it — is the rule
// someone has to remember, and it fails below. What may legally be missing is derived rather
// than listed: a module in this directory that does not ship has to say for itself that it is
// local, which the file an author plays against does and no shipped module does.
describe('what content/ holds and what ships', () => {
  it('differ only by a module whose own # info declares it local', () => {
    const shipped = new Set(ids());
    expect(shipped.size).toBeGreaterThan(0);

    for (const id of inCorpus().filter((id) => !shipped.has(id))) expect(packOf(id)).toBe('local');
  });

  it('are told apart by a pack: the local-changes file writes about itself and no shipped module writes', () => {
    expect(parseModuleSource({ name: LOCAL_CHANGES_MODULE_ID, text: renderLocalChangesModule([]) }).info.pack).toBe('local');
    expect(ids().map(packOf)).toEqual(ids().map(() => undefined));
  });
});

function hasSomewhereToStand(subset: readonly string[]): boolean {
  const { registry, diagnostics } = loadUniverseWithDiagnostics(subset.map(moduleSource));
  return diagnostics.length === 0 && [...registry.locations.values()].some((location) => location.starting);
}

// Every subset of a set, in order of size, so the first one a search finds is provably the smallest.
function* subsetsBySize(all: readonly string[]): Generator<string[]> {
  for (let size = 1; size <= all.length; size++) {
    const combo: number[] = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      yield combo.map((index) => all[index]);
      let cursor = size - 1;
      while (cursor >= 0 && combo[cursor] === all.length - size + cursor) cursor--;
      if (cursor < 0) break;
      combo[cursor]++;
      for (let after = cursor + 1; after < size; after++) combo[after] = combo[after - 1] + 1;
    }
  }
}

// The claim `open.md` names: one thing at or below the content layer says what the standing
// (somewhere-to-stand) shipped world is, proved here by a reading of the corpus that owes
// `shipped.ts` nothing — it tries every subset, smallest first, and stops at the first that loads
// clean and has a starting location. Adding, splitting or renaming a shipped module changes what
// this search finds with no edit here.
describe('the standing world is derived, not listed', () => {
  it('standingSources is the smallest shipped subset whose registry has somewhere to stand', () => {
    let smallest: string[] | undefined;
    for (const subset of subsetsBySize(ids())) {
      if (hasSomewhereToStand(subset)) {
        smallest = subset;
        break;
      }
    }

    expect(smallest).toBeDefined();
    expect(new Set(standingSources().map((source) => source.name))).toEqual(new Set(smallest));
  });
});

// A module nothing loads before it has nothing to lean on, so it has to load alone or it cannot
// load at all. The subjects are read off the corpus's own `dependencies:` lines rather than named,
// and a shipped module that stops depending on anything is covered here the day it does.
const rootModules = (): string[] =>
  ids().filter((id) => parseModuleSource(moduleSource(id)).info.dependencies.every((dependency) => dependency.prefix === 'optional' || dependency.prefix === 'recommended' || dependency.prefix === 'incompatible'));

describe('a shipped module that depends on nothing', () => {
  it('loads clean by itself', () => {
    expect(rootModules().length).toBeGreaterThan(0);
    for (const id of rootModules()) {
      expect(loadUniverseWithDiagnostics([moduleSource(id)]).diagnostics.map(formatModuleDiagnostic)).toEqual([]);
    }
  });

  // What phase two of the station move rests on: a `# station` is a name, and the thing that opens
  // one stands somewhere. So a station standing in a module that opens none of them is not a
  // dangling reference, and a generic recipe may sit beside the name rather than beside the oven.
  it('holds station names nothing in it opens, and still loads clean', () => {
    const unopened = rootModules().flatMap((id) => {
      const { registry } = loadUniverseWithDiagnostics([moduleSource(id)]);
      const opened = new Set([...registry.entities.values()].flatMap((entity) => entity.capabilities));
      return [...registry.stations.keys()].filter((station) => !opened.has(station));
    });
    expect(unopened.length).toBeGreaterThan(0);
  });
});
