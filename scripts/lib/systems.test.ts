import { statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allConcepts,
  canonicalPath,
  checkManifest,
  conceptsClaiming,
  covers,
  coveringSystems,
  isUnowned,
  ManifestError,
  overlappingConcepts,
  ownerOf,
  owningSystem,
  parseManifest,
  pathsOverlap,
  sharedOwnership,
  loadManifest,
  orphanedFiles,
  systemNames,
  type Concept,
  type Manifest,
  type System,
} from './systems';

function system(name: string, paths: string[], concepts: Concept[] = []): System {
  return { name, paths, covers: [], lastAudit: null, lastAuditDoc: null, note: null, concepts };
}

function concept(name: string, paths: string[], note: string | null = 'seeded from a produces claim'): Concept {
  return { name, paths, note };
}

function manifestOf(systems: System[], unowned: string[] = ['docs', '*.md']): Manifest {
  return { unowned: { note: '', paths: unowned }, systems };
}

const manifest = manifestOf([system('Runtime', ['src/runtime']), system('UI', ['src/ui'])]);

describe('covers', () => {
  it('matches a directory path and its descendants, not a sibling with a shared prefix', () => {
    expect(covers('src/runtime', 'src/runtime/save.ts')).toBe(true);
    expect(covers('src/runtime', 'src/runtime')).toBe(true);
    expect(covers('src/runtime', 'src/runtime2/save.ts')).toBe(false);
  });

  it('matches an exact file path', () => {
    expect(covers('scripts/tasks.ts', 'scripts/tasks.ts')).toBe(true);
    expect(covers('scripts/tasks.ts', 'scripts/tasks.test.ts')).toBe(false);
  });

  it('matches a *.ext glob only at the repo root', () => {
    expect(covers('*.md', 'README.md')).toBe(true);
    expect(covers('*.md', 'docs/audits/systems.md')).toBe(false);
  });
});

describe('canonicalPath', () => {
  it('strips a trailing slash, which covers would otherwise never match', () => {
    expect(canonicalPath('src/runtime/')).toBe('src/runtime');
    expect(canonicalPath('src/runtime///')).toBe('src/runtime');
  });

  it('reads a windows separator and a leading ./ as the same path', () => {
    expect(canonicalPath('src\\runtime\\save.ts')).toBe('src/runtime/save.ts');
    expect(canonicalPath('./src/runtime')).toBe('src/runtime');
  });

  it('leaves case alone, because a path is compared against a real file', () => {
    expect(canonicalPath('src/Runtime/Save.ts')).toBe('src/Runtime/Save.ts');
  });
});

describe('pathsOverlap', () => {
  it('treats a directory grant as covering everything beneath it', () => {
    expect(pathsOverlap('src/runtime', 'src/runtime/combat.ts')).toBe(true);
    expect(pathsOverlap('src/runtime/', 'src/runtime/combat.ts')).toBe(true);
    expect(pathsOverlap('src/runtime/combat.ts', 'src/runtime')).toBe(true);
  });

  it('does not treat a shared name prefix as a shared directory', () => {
    expect(pathsOverlap('src/run', 'src/runtime')).toBe(false);
    expect(pathsOverlap('scripts/tasks.ts', 'scripts/tasks.test.ts')).toBe(false);
  });

  it('reads a windows separator as the same path', () => {
    expect(pathsOverlap('src\\runtime\\combat.ts', 'src/runtime/combat.ts')).toBe(true);
  });

  it('compares case-insensitively, because this repo is developed on windows', () => {
    expect(pathsOverlap('src/Runtime/Combat.ts', 'src/runtime/combat.ts')).toBe(true);
  });
});

describe('isUnowned', () => {
  it('is true for a path under an unowned directory', () => {
    expect(isUnowned(manifest, 'docs/specs/task-system.md')).toBe(true);
  });

  it('is false for a path owned by a system', () => {
    expect(isUnowned(manifest, 'src/runtime/save.ts')).toBe(false);
  });
});

describe('systemNames', () => {
  it('lists every system name in the manifest', () => {
    expect(systemNames(manifest)).toEqual(['Runtime', 'UI']);
  });
});

describe('owningSystem', () => {
  it('returns the system name that declares the path', () => {
    expect(owningSystem(manifest, 'src/runtime/save.ts')).toBe('Runtime');
  });

  it('returns null for a path no system declares', () => {
    expect(owningSystem(manifest, 'src/content/module.ts')).toBeNull();
  });

  // The defect this rule exists for: `systems.json` gives the DSL load path
  // the whole of `src/content` and the Contribution system ten named files
  // inside it, and a first-match resolver hands all ten to whichever entry
  // is written first.
  it('gives an exactly-named file to the system that names it, not to the one that owns the directory', () => {
    const both = manifestOf([system('DSL load path', ['src/grammar', 'src/content']), system('Contribution system', ['src/content/modportal.ts'])]);
    expect(owningSystem(both, 'src/content/modportal.ts')).toBe('Contribution system');
    expect(owningSystem(both, 'src/content/registry.ts')).toBe('DSL load path');
  });

  it('answers the same however the manifest is ordered', () => {
    const [a, b] = [system('DSL load path', ['src/content']), system('Contribution system', ['src/content/modportal.ts'])];
    expect(owningSystem(manifestOf([a, b]), 'src/content/modportal.ts')).toBe('Contribution system');
    expect(owningSystem(manifestOf([b, a]), 'src/content/modportal.ts')).toBe('Contribution system');
  });

  it('resolves a directory claim by depth, so the deeper directory wins', () => {
    const nested = manifestOf([system('Outer', ['src']), system('Inner', ['src/runtime/combat'])]);
    expect(owningSystem(nested, 'src/runtime/combat/resolve.ts')).toBe('Inner');
    expect(owningSystem(nested, 'src/runtime/save.ts')).toBe('Outer');
  });

  // `bestClaim` takes the most specific of a *single* system's own paths, and
  // that only decides anything when one system declares two overlapping
  // regions. Here the broad claim would lose to the rival and the exact one
  // must win it back, so taking the least specific of the two is visible.
  it('judges a system by its most specific claim, not its broadest, when it declares both', () => {
    const m = manifestOf([system('Owner', ['src', 'src/runtime/combat.ts']), system('Rival', ['src/runtime'])]);
    expect(owningSystem(m, 'src/runtime/combat.ts')).toBe('Owner');
    expect(owningSystem(m, 'src/runtime/travel.ts')).toBe('Rival');
  });

  it('breaks an exact tie without consulting manifest order, and says who it tied with', () => {
    const [a, b] = [system('Zeta', ['src/runtime']), system('Alpha', ['src/runtime'])];
    expect(owningSystem(manifestOf([a, b]), 'src/runtime/save.ts')).toBe('Alpha');
    expect(owningSystem(manifestOf([b, a]), 'src/runtime/save.ts')).toBe('Alpha');
    expect(ownerOf(manifestOf([a, b]), 'src/runtime/save.ts')?.tiedWith.map((s) => s.name)).toEqual(['Zeta']);
  });

  it('reports no tie when specificity decides', () => {
    const both = manifestOf([system('DSL load path', ['src/content']), system('Contribution system', ['src/content/modportal.ts'])]);
    expect(ownerOf(both, 'src/content/modportal.ts')?.tiedWith).toEqual([]);
  });
});

describe('coveringSystems', () => {
  // Ownership narrowed to one answer; coverage did not. An auditor of the
  // DSL load path still sees a file the Contribution system owns.
  it('keeps every system whose window includes the file, unlike ownership', () => {
    const both = manifestOf([system('DSL load path', ['src/content']), system('Contribution system', ['src/content/modportal.ts'])]);
    expect(coveringSystems(both, 'src/content/modportal.ts')).toEqual(['DSL load path', 'Contribution system']);
    expect(owningSystem(both, 'src/content/modportal.ts')).toBe('Contribution system');
  });

  it('is empty for a file no system declares', () => {
    expect(coveringSystems(manifest, 'docs/workflow.md')).toEqual([]);
  });
});

describe('conceptsClaiming', () => {
  const content = system('DSL load path', ['src/content'], [concept('action parsing', ['src/content/action.ts']), concept('section field validation', ['src/content/action.ts', 'src/content/section.ts'])]);

  it('returns every concept that claims the file, because two is the answer and not an error', () => {
    expect(conceptsClaiming(content, 'src/content/action.ts').map((c) => c.name)).toEqual(['action parsing', 'section field validation']);
  });

  it('returns one concept when only one claims it', () => {
    expect(conceptsClaiming(content, 'src/content/section.ts').map((c) => c.name)).toEqual(['section field validation']);
  });

  it('returns nothing for a file inside the system that no concept claims', () => {
    expect(conceptsClaiming(content, 'src/content/registry.ts')).toEqual([]);
  });
});

describe('overlappingConcepts', () => {
  it('names the file two concepts of one system both claim', () => {
    const m = manifestOf([system('DSL load path', ['src/content'], [concept('action parsing', ['src/content/action.ts']), concept('section field validation', ['src/content/action.ts'])])]);
    expect(overlappingConcepts(m)).toEqual([{ system: 'DSL load path', path: 'src/content/action.ts', concepts: ['action parsing', 'section field validation'] }]);
  });

  it('catches a directory concept swallowing a file concept', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('combat', ['src/runtime/combat']), concept('damage', ['src/runtime/combat/damage.ts'])])]);
    expect(overlappingConcepts(m).map((entry) => entry.concepts)).toEqual([['combat', 'damage'], ['combat', 'damage']]);
  });

  it('says nothing when concepts are disjoint', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('combat', ['src/runtime/combat.ts']), concept('travel', ['src/runtime/travel.ts'])])]);
    expect(overlappingConcepts(m)).toEqual([]);
  });

  it('does not pair concepts across two systems, which are separate by construction', () => {
    const m = manifestOf([system('A', ['src/a'], [concept('x', ['src/a/f.ts'])]), system('B', ['src/b'], [concept('y', ['src/b/f.ts'])])]);
    expect(overlappingConcepts(m)).toEqual([]);
  });
});

describe('allConcepts', () => {
  it('flattens every concept with the system that owns it', () => {
    const m = manifestOf([system('A', ['src/a'], [concept('x', ['src/a/f.ts'])]), system('B', ['src/b'], [concept('y', ['src/b/g.ts'])])]);
    expect(allConcepts(m).map((ref) => [ref.system.name, ref.concept.name])).toEqual([
      ['A', 'x'],
      ['B', 'y'],
    ]);
  });
});

describe('parseManifest', () => {
  const base = { unowned: { note: 'n', paths: ['docs'] }, systems: [{ name: 'Runtime', paths: ['src/runtime'], lastAudit: 'abc', lastAuditDoc: null, note: null }] };

  it('fills concepts for a system written before concepts existed', () => {
    expect(parseManifest(JSON.stringify(base), 'm.json').systems[0].concepts).toEqual([]);
  });

  it('reads a concept whole', () => {
    const text = JSON.stringify({ ...base, systems: [{ ...base.systems[0], concepts: [{ name: 'saves', paths: ['src/runtime/save.ts'], note: 'from produces claim' }] }] });
    expect(parseManifest(text, 'm.json').systems[0].concepts).toEqual([{ name: 'saves', paths: ['src/runtime/save.ts'], note: 'from produces claim' }]);
  });

  it('canonicalises a concept path, so every reader sees one spelling', () => {
    const text = JSON.stringify({ ...base, systems: [{ ...base.systems[0], concepts: [{ name: 'all', paths: ['src/runtime/', 'src\\runtime\\save.ts'] }] }] });
    expect(parseManifest(text, 'm.json').systems[0].concepts[0].paths).toEqual(['src/runtime', 'src/runtime/save.ts']);
  });

  it('defaults a concept note to null rather than inventing one', () => {
    const text = JSON.stringify({ ...base, systems: [{ ...base.systems[0], concepts: [{ name: 'saves', paths: ['src/runtime/save.ts'] }] }] });
    expect(parseManifest(text, 'm.json').systems[0].concepts[0].note).toBeNull();
  });

  // Shape is the one thing refused. A typo that leaves `concepts` a string
  // must not read as "this system has no concepts".
  it('refuses a mistyped concepts field instead of reading it as empty', () => {
    const text = JSON.stringify({ ...base, systems: [{ ...base.systems[0], concepts: 'saves' }] });
    expect(() => parseManifest(text, 'm.json')).toThrow(ManifestError);
  });

  it('refuses a concept with no name, and names the system it was found in', () => {
    const text = JSON.stringify({ ...base, systems: [{ ...base.systems[0], concepts: [{ paths: [] }] }] });
    expect(() => parseManifest(text, 'm.json')).toThrow(/Runtime.*concept 1/s);
  });

  it('refuses unreadable json with the label in the message', () => {
    expect(() => parseManifest('{oops', 'm.json')).toThrow(/m\.json/);
  });

  it('refuses a manifest with no systems array', () => {
    expect(() => parseManifest(JSON.stringify({ unowned: { paths: [] } }), 'm.json')).toThrow(ManifestError);
  });
});

describe('checkManifest', () => {
  const always = (): boolean => true;
  // These fixtures name regions rather than files, and several of those
  // regions really are directories in this checkout. The path-shape check
  // has its own describe block below; here nothing is a directory, so each
  // test answers about the one thing it is asking.
  const never = (): boolean => false;
  const messages = (m: Manifest, exists = always): string[] => checkManifest(m, exists, never).map((issue) => issue.message);

  it('passes a manifest whose concepts sit inside their systems', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('saves', ['src/runtime/save.ts'])])]);
    expect(checkManifest(m, always, never)).toEqual([]);
  });

  it('refuses a concept reaching outside its own system', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('parsing', ['src/grammar/parser.ts'])])]);
    expect(messages(m).some((message) => /no system owns/.test(message))).toBe(true);
  });

  // Coverage would allow this and ownership does not: the DSL load path
  // covers all of `src/content`, but the Contribution system owns the file.
  it('refuses a concept over a file its system only covers, where another system owns it', () => {
    const m = manifestOf([
      system('DSL load path', ['src/content'], [concept('serialising', ['src/content/serialize.ts'])]),
      system('Contribution system', ['src/content/serialize.ts']),
    ]);
    expect(messages(m).some((message) => /Contribution system owns/.test(message))).toBe(true);
  });

  it('accepts a concept over a directory its system owns', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('combat', ['src/runtime/combat'])])]);
    expect(checkManifest(m, always, never)).toEqual([]);
  });

  it('reports a concept name claimed by two systems', () => {
    const m = manifestOf([system('A', ['src/a'], [concept('saves', ['src/a/f.ts'])]), system('B', ['src/b'], [concept('Saves', ['src/b/g.ts'])])]);
    expect(messages(m).some((message) => /belongs to exactly one system/.test(message))).toBe(true);
  });

  it('reports a concept path that does not exist', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('saves', ['src/runtime/gone.ts'])])]);
    expect(messages(m, () => false).some((message) => /does not exist/.test(message))).toBe(true);
  });

  it('reports a concept with no note, because an unsourced name is one nobody can check', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('saves', ['src/runtime/save.ts'], null)])]);
    expect(messages(m).some((message) => /where its name came from/.test(message))).toBe(true);
  });

  it('reports a concept naming no paths', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('saves', [])])]);
    expect(messages(m).some((message) => /names no paths/.test(message))).toBe(true);
  });

  it('reports an identical path declared by two systems exactly once', () => {
    const m = manifestOf([system('Zeta', ['src/runtime']), system('Alpha', ['src/runtime'])]);
    const tie = messages(m).filter((message) => /tie-break/.test(message));
    expect(tie).toHaveLength(1);
    expect(tie[0]).toContain('Alpha and Zeta');
  });

  it('does not report a tie when one claim is more specific than the other', () => {
    const m = manifestOf([system('DSL load path', ['src/content']), system('Contribution system', ['src/content/modportal.ts'])]);
    expect(messages(m).filter((message) => /tie-break/.test(message))).toEqual([]);
  });

  it('reports a duplicate system name', () => {
    const m = manifestOf([system('Runtime', ['src/runtime']), system('Runtime', ['src/other'])]);
    expect(messages(m).some((message) => /duplicate system name/.test(message))).toBe(true);
  });

  it('never returns an issue for the concept-overlap signal, which is about code and not the manifest', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('a', ['src/runtime/f.ts']), concept('b', ['src/runtime/f.ts'])])]);
    expect(checkManifest(m, always, never)).toEqual([]);
    expect(overlappingConcepts(m)).toHaveLength(1);
  });
});

describe('sharedOwnership', () => {
  const both = manifestOf([system('DSL load path', ['src/content']), system('Contribution system', ['src/content/modportal.ts'])]);

  it('names the owner and the systems that still audit it', () => {
    expect(sharedOwnership(both, ['src/content/modportal.ts'])).toEqual([{ file: 'src/content/modportal.ts', owner: 'Contribution system', alsoCovered: ['DSL load path'], tied: false }]);
  });

  it('says nothing about a file exactly one system claims', () => {
    expect(sharedOwnership(both, ['src/content/registry.ts'])).toEqual([]);
  });

  it('says nothing about a file no system claims, which the orphan check owns', () => {
    expect(sharedOwnership(both, ['docs/workflow.md'])).toEqual([]);
  });

  it('marks the case specificity did not decide', () => {
    const tie = manifestOf([system('Zeta', ['src/runtime']), system('Alpha', ['src/runtime'])]);
    expect(sharedOwnership(tie, ['src/runtime/save.ts'])).toEqual([{ file: 'src/runtime/save.ts', owner: 'Alpha', alsoCovered: ['Zeta'], tied: true }]);
  });
});

// A file cannot join a system by being created next to one. That is the whole
// of it: `orderIndependence.test.ts` was added to test Task-system ordering
// and fell through Testing procedure's `scripts/lib` grant into the wrong
// system, and a directory-wide grant also makes its decline a ruling on every
// file beneath it that nobody made.
describe('ownership is by name, and coverage is the field that takes a directory', () => {
  const always = (): boolean => true;
  const dir = (path: string) => (candidate: string): boolean => candidate === path;
  const none = (): boolean => false;

  it('refuses a directory in paths, naming the field a directory belongs in', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'])]);
    const messages = checkManifest(m, always, dir('src/runtime')).map((issue) => issue.message);
    expect(messages).toEqual(['Runtime claims the directory src/runtime — ownership is by name, so list its files. `covers` is where a directory belongs when the point is a second audit read rather than ownership']);
    expect(checkManifest(m, always, dir('src/runtime'))[0].level).toBe('error');
  });

  it('accepts the same directory under covers', () => {
    const m = manifestOf([{ ...system('DSL load path', ['src/content/registry.ts']), covers: ['src/content'] }]);
    expect(checkManifest(m, always, dir('src/content'))).toEqual([]);
  });

  it('widens the audit window without conferring ownership', () => {
    const m = manifestOf([
      { ...system('DSL load path', ['src/content/registry.ts']), covers: ['src/content'] },
      system('Contribution system', ['src/content/modportal.ts']),
    ]);
    // Read by both, owned by exactly one — and by the system that named it,
    // not by the one whose directory happens to reach it.
    expect(coveringSystems(m, 'src/content/modportal.ts').sort()).toEqual(['Contribution system', 'DSL load path']);
    expect(owningSystem(m, 'src/content/modportal.ts')).toBe('Contribution system');
    // And a file only `covers` reaches is owned by nobody, which is the
    // condition `audit-status` exits non-zero on and therefore what forces
    // the declaration.
    expect(owningSystem(m, 'src/content/undeclared.ts')).toBeNull();
    expect(coveringSystems(m, 'src/content/undeclared.ts')).toEqual(['DSL load path']);
  });

  it('counts a file only covers reaches as an orphan, which is what forces it to be declared by name', () => {
    const m = manifestOf([{ ...system('DSL load path', ['src/content/registry.ts']), covers: ['src/content'] }], []);
    expect(orphanedFiles(m, ['src/content/registry.ts', 'src/content/modportal.ts'])).toEqual(['src/content/modportal.ts']);
  });

  it('counts nothing an unowned grant reaches, which keeps its directories by ruling', () => {
    const m = manifestOf([system('Runtime', ['src/runtime/state.ts'])], ['docs', '*.md']);
    expect(orphanedFiles(m, ['src/runtime/state.ts', 'docs/workflow.md', 'README.md'])).toEqual([]);
  });

  it('reports a covers path that does not exist, and never refuses it', () => {
    const m = manifestOf([{ ...system('DSL load path', ['src/content/registry.ts']), covers: ['src/gone'] }]);
    const issues = checkManifest(m, none, none);
    expect(issues.map((issue) => issue.level)).toEqual(['warning']);
    expect(issues[0].message).toBe('DSL load path covers src/gone, which does not exist');
  });

  it('defaults covers to empty, so a manifest written before the field parses unchanged', () => {
    const parsed = parseManifest(JSON.stringify({ unowned: { note: '', paths: [] }, systems: [{ name: 'Runtime', paths: ['src/runtime/state.ts'], lastAudit: null, lastAuditDoc: null, note: null }] }), 'test');
    expect(parsed.systems[0].covers).toEqual([]);
  });
});

// The live manifest, asserted against rather than described: the partition is
// the one condition `audit-status` fails on, and these are the properties
// that make it hold by name instead of by adjacency.
const REPO_ROOT = path.join(import.meta.dirname, '../..');

describe('the manifest this repository ships', () => {
  const live = loadManifest(path.join(REPO_ROOT, 'docs', 'audits', 'systems.json'));

  it('names every owned path as a file that exists, never as a directory', () => {
    for (const system of live.systems) {
      for (const declared of system.paths) {
        expect(statSync(path.join(REPO_ROOT, declared), { throwIfNoEntry: false })?.isFile() ?? false, `${system.name} → ${declared}`).toBe(true);
      }
    }
  });

  it('sorts every path list, so two branches adding a file merge line by line rather than colliding on a tail append', () => {
    for (const system of live.systems) expect([...system.paths], system.name).toEqual([...system.paths].sort());
    expect([...live.unowned.paths]).toEqual([...live.unowned.paths].sort());
  });

  it('keeps the deliberate second read that the directory grants used to supply', () => {
    const dsl = live.systems.find((system) => system.name === 'DSL load path');
    expect(dsl?.covers).toEqual(['src/content']);
    expect(coveringSystems(live, 'src/content/modportal.ts').sort()).toEqual(['Contribution system', 'DSL load path']);
  });

  it('leaves unowned its directory and glob grants, which is the ruling', () => {
    expect(live.unowned.paths).toContain('docs');
    expect(live.unowned.paths).toContain('*.md');
  });

  it('records the Task system freeze on the entry itself, where audit-status prints it', () => {
    const taskSystem = live.systems.find((system) => system.name === 'Task system');
    expect(taskSystem?.lastAudit).toMatch(/^[0-9a-f]{40}$/);
    expect(taskSystem?.note).toContain('Frozen as of the 2026-08-08 sweep');
    expect(taskSystem?.note).toContain('until the MVP is complete');
  });
});
