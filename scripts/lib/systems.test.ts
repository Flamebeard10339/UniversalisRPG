import { describe, expect, it } from 'vitest';
import {
  allConcepts,
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
  systemNames,
  type Concept,
  type Manifest,
  type System,
} from './systems';

function system(name: string, paths: string[], concepts: Concept[] = []): System {
  return { name, paths, lastAudit: null, lastAuditDoc: null, note: null, concepts };
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
  const messages = (m: Manifest, exists = always): string[] => checkManifest(m, exists).map((issue) => issue.message);

  it('passes a manifest whose concepts sit inside their systems', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('saves', ['src/runtime/save.ts'])])]);
    expect(checkManifest(m, always)).toEqual([]);
  });

  it('refuses a concept reaching outside its own system', () => {
    const m = manifestOf([system('Runtime', ['src/runtime'], [concept('parsing', ['src/grammar/parser.ts'])])]);
    expect(checkManifest(m, always)).toContainEqual({ level: 'error', message: expect.stringContaining('does not own') as unknown as string });
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
    expect(checkManifest(m, always)).toEqual([]);
    expect(overlappingConcepts(m)).toHaveLength(1);
  });
});
