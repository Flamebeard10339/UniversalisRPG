import { describe, expect, it } from 'vitest';
import { covers, isUnowned, owningSystem, systemNames, type Manifest } from './systems';

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
    expect(covers('*.md', 'docs/audits/systems.json'.replace('.json', '.md'))).toBe(false);
  });
});

const manifest: Manifest = {
  unowned: { note: '', paths: ['docs', '*.md'] },
  systems: [
    { name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null },
    { name: 'UI', paths: ['src/ui'], lastAudit: null, lastAuditDoc: null, note: null },
  ],
};

describe('isUnowned', () => {
  it('is true for a path under an unowned directory', () => {
    expect(isUnowned(manifest, 'docs/specs/task-system.md')).toBe(true);
  });

  it('is false for a path owned by a system', () => {
    expect(isUnowned(manifest, 'src/runtime/save.ts')).toBe(false);
  });
});

describe('owningSystem', () => {
  it('returns the system name that declares the path', () => {
    expect(owningSystem(manifest, 'src/runtime/save.ts')).toBe('Runtime');
  });

  it('returns null for a path no system declares', () => {
    expect(owningSystem(manifest, 'src/content/module.ts')).toBeNull();
  });
});

describe('systemNames', () => {
  it('lists every system name in the manifest', () => {
    expect(systemNames(manifest)).toEqual(['Runtime', 'UI']);
  });
});
