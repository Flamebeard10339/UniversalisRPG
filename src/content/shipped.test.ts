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

  // A shipped module declares the pack it is turned on and off as, so the pack is no longer the
  // empty field it once was. What still tells the local-changes file apart is which pack it writes:
  // the one it names for itself, which is read off the file it renders rather than spelled again.
  it('are told apart by a pack: the local-changes file writes its own, and no shipped module writes that one', () => {
    const local = parseModuleSource({ name: LOCAL_CHANGES_MODULE_ID, text: renderLocalChangesModule([]) }).info.pack;
    expect(local).toBeDefined();
    expect(ids().filter((id) => packOf(id) === local)).toEqual([]);
    expect(ids().filter((id) => packOf(id) === undefined)).toEqual([]);
  });
});

// A module and everything the loader would refuse to start it without, read off the corpus's own
// `dependencies:` lines. Written here as well as in `shipped.ts` on purpose: this file's whole job
// is to check that reading against one that owes it nothing.
function leansOn(id: string): string[] {
  const required = (each: string): string[] =>
    parseModuleSource(moduleSource(each))
      .info.dependencies.filter((dependency) => dependency.prefix !== 'optional' && dependency.prefix !== 'recommended' && dependency.prefix !== 'incompatible')
      .map((dependency) => dependency.module);
  const held = new Set<string>();
  const visit = (each: string): void => {
    if (held.has(each)) return;
    held.add(each);
    for (const dependency of required(each)) visit(dependency);
  };
  visit(id);
  return [...held];
}

function hasSomewhereToStand(subset: readonly string[]): boolean {
  const { registry, diagnostics } = loadUniverseWithDiagnostics(subset.map(moduleSource));
  return diagnostics.length === 0 && [...registry.locations.values()].some((location) => location.starting);
}

// The claim `open.md` names: one thing at or below the content layer says what the standing
// (somewhere-to-stand) shipped world is, proved here by a reading of the corpus that owes
// `shipped.ts` nothing — the set it offers has to stand, and has to stop standing when any one
// module is taken out of it. Only one shipped module declares a starting # location, so every set
// that stands at all holds that module and everything it leans on; a set that is minimal in that
// sense is therefore that closure and no other. Adding, splitting or renaming a shipped module
// moves what this finds with no edit here.
//
// It reads one universe per module rather than one per subset. The exhaustive smallest-first search
// this replaced was the same claim and cost 2^n loads of the corpus, which reached five minutes of
// the suite's twenty seconds at seventeen modules.
describe('the standing world is derived, not listed', () => {
  const standing = (): string[] => standingSources().map((source) => source.name);

  it('is a subset of what ships, and every shipped module outside it is one the world can begin without', () => {
    expect(standing().length).toBeGreaterThan(0);
    expect(ids()).toEqual(expect.arrayContaining(standing()));
  });

  it('stands, and stops standing when any one of its modules is taken out', () => {
    const held = standing();
    expect(hasSomewhereToStand(held)).toBe(true);
    for (const dropped of held) {
      expect(hasSomewhereToStand(held.filter((id) => id !== dropped)), `without ${dropped}`).toBe(false);
    }
  });

  // What makes the reading above exhaustive now that a module may take the keyword back and put it
  // on a place of its own: every module that marks one stands on the standing world, so the standing
  // world is under all of them and no smaller world has anywhere to stand.
  it('is under every module that declares a starting # location, so no shipped world begins outside it', () => {
    const starters = ids().filter((id) => parseModuleSource(moduleSource(id)).sections.some((section) => section.kind === 'location' && (section.value as { starting?: boolean }).starting === true));
    expect(starters.length).toBeGreaterThan(0);
    for (const starter of starters) {
      expect(leansOn(starter), `${starter} leans on`).toEqual(expect.arrayContaining(standing()));
      expect(hasSomewhereToStand(leansOn(starter)), `${starter} alone`).toBe(true);
    }
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
