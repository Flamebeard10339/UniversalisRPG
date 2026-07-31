import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { harvestFiles, parseAuditDoc, systemForDoc } from './auditImport';
import type { Severity } from './taskStore';

describe('parseAuditDoc', () => {
  it('parses H/M/L headings, ignoring prose sections that are not findings', () => {
    const doc = `# Some audit

## What the system gets right
Prose that is not a finding.

## H1 — a real problem
Body line one.
Body line two.

## M1 — another problem
Body two.

## Verified closed
Not a finding.
`;
    const findings = parseAuditDoc(doc);
    expect(findings).toEqual([
      { code: 'H1', severity: 'high', title: 'a real problem', body: 'Body line one.\nBody line two.' },
      { code: 'M1', severity: 'medium', title: 'another problem', body: 'Body two.' },
    ]);
  });

  it('strips a leading and trailing --- divider from the body without touching interior ones', () => {
    const doc = `## H1 — title
---
Above the fold.

---

Below, with its own --- inside a table row.
---
## M1 — next
`;
    const findings = parseAuditDoc(doc);
    expect(findings[0].body).toBe('Above the fold.\n\n---\n\nBelow, with its own --- inside a table row.');
  });

  it('gives the last finding in the document everything to the end of the file', () => {
    const doc = `## L1 — last one
tail content
`;
    expect(parseAuditDoc(doc)[0].body).toBe('tail content');
  });

  it('keeps a parenthetical annotation between the code and the em-dash as part of the title', () => {
    const doc = '## L6 (informational, not actionable) — `npm audit` findings are all dev-tooling-only\nbody\n';
    expect(parseAuditDoc(doc)).toEqual([{ code: 'L6', severity: 'low', title: '(informational, not actionable) — `npm audit` findings are all dev-tooling-only', body: 'body' }]);
  });

  it('ignores non-finding heading conventions entirely (Tier N, HIGH/MEDIUM/LOW, Findings)', () => {
    const doc = `## Tier 1 — found by both passes
## HIGH
## Findings
## Non-Findings
`;
    expect(parseAuditDoc(doc)).toEqual([]);
  });

  it('parses every heading in the real runtime audit doc with the documented 17/50/58 H/M/L split repo-wide', () => {
    const text = readFileSync('docs/audits/runtime-2026-07-30.md', 'utf8');
    const findings = parseAuditDoc(text);
    expect(findings.map((f) => f.code)).toEqual(['H1', 'M1', 'M2', 'M3', 'L1', 'L2', 'L3', 'L4']);
    expect(findings.every((f) => f.body.length > 0)).toBe(true);
  });
});

describe('harvestFiles', () => {
  const exists = (path: string): boolean => path === 'src/runtime/save.ts' || path === 'capacitor.config.ts';

  it('keeps a path:line reference that resolves against the filesystem', () => {
    expect(harvestFiles('see src/runtime/save.ts:88 for the guard', exists)).toEqual(['src/runtime/save.ts:88']);
  });

  it('keeps a line range', () => {
    expect(harvestFiles('src/runtime/save.ts:38-52 gives every field a predicate', exists)).toEqual(['src/runtime/save.ts:38-52']);
  });

  it('drops a bare filename that does not resolve, e.g. shorthand reuse of a name mentioned in full earlier', () => {
    expect(harvestFiles('save.ts:28-29 states the rule', exists)).toEqual([]);
  });

  it('keeps a root-level config file that exists', () => {
    expect(harvestFiles('capacitor.config.ts:3 branches on NODE_ENV', exists)).toEqual(['capacitor.config.ts:3']);
  });

  it('dedupes repeated mentions and caps at the given limit', () => {
    const body = 'src/runtime/save.ts:1 ... src/runtime/save.ts:1 ... src/runtime/save.ts:2';
    expect(harvestFiles(body, () => true, 1)).toEqual(['src/runtime/save.ts:1']);
  });
});

describe('the real docs/audits/ corpus', () => {
  it('parses to exactly 17 high, 50 medium and 58 low findings, each mapped to a system', () => {
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    const unmapped: string[] = [];
    for (const file of readdirSync('docs/audits')) {
      if (!file.endsWith('.md')) continue;
      const basename = file.replace(/\.md$/, '');
      const findings = parseAuditDoc(readFileSync(`docs/audits/${file}`, 'utf8'));
      if (findings.length > 0 && systemForDoc(basename) === null) unmapped.push(basename);
      for (const finding of findings) counts[finding.severity]++;
    }
    expect(counts).toEqual({ high: 17, medium: 50, low: 58 });
    expect(unmapped).toEqual([]);
  });
});

describe('systemForDoc', () => {
  it('maps every doc-family prefix seen under docs/audits/ to a current system', () => {
    expect(systemForDoc('build-deployment-2026-07-30')).toBe('Build & deployment');
    expect(systemForDoc('contribution-system-2026-07-30')).toBe('Contribution system');
    expect(systemForDoc('dsl-load-path-2026-07-30-pass2')).toBe('DSL load path');
    expect(systemForDoc('dsl-modules-2026-07-29-full')).toBe('DSL load path');
    expect(systemForDoc('game-engine-2026-07-27-pass2')).toBe('Runtime');
    expect(systemForDoc('runtime-2026-07-30')).toBe('Runtime');
    expect(systemForDoc('testing-procedure-2026-07-30-pass3')).toBe('Testing procedure');
    expect(systemForDoc('user-interface-2026-07-30')).toBe('User interface');
  });

  it('returns null for an unrecognised doc name', () => {
    expect(systemForDoc('some-future-doc-2027-01-01')).toBeNull();
  });
});
