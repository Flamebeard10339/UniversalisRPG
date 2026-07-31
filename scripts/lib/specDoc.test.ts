import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendAuditPass, parseSpecDoc, renderAuditPass } from './specDoc';

const DOC = `# Demo spec

## Deliverable

A short paragraph of prose about what this branch promises.

Proof:

- The first clause, on one line.
- The second clause wraps onto
  a continuation line that should join back into one sentence.
- A third clause.

## Decisions

Some decisions.

## Open questions

None.
`;

describe('parseSpecDoc', () => {
  it('extracts the whole ## Deliverable section verbatim', () => {
    const { deliverableSection } = parseSpecDoc(DOC);
    expect(deliverableSection.startsWith('## Deliverable')).toBe(true);
    expect(deliverableSection).toContain('A short paragraph of prose');
    expect(deliverableSection).not.toContain('## Decisions');
  });

  it('numbers proof clauses in document order and joins wrapped continuation lines', () => {
    const { proofClauses } = parseSpecDoc(DOC);
    expect(proofClauses).toEqual([
      { index: 1, text: 'The first clause, on one line.' },
      { index: 2, text: 'The second clause wraps onto a continuation line that should join back into one sentence.' },
      { index: 3, text: 'A third clause.' },
    ]);
  });

  it('returns no proof clauses when there is no Proof: line', () => {
    const doc = '## Deliverable\n\nJust prose, no proof list.\n\n## Decisions\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([]);
  });

  it('returns no audit passes when none are recorded', () => {
    expect(parseSpecDoc(DOC).auditPasses).toEqual([]);
  });

  it('parses the real docs/specs/task-system-v2.md deliverable into six proof clauses', () => {
    const text = readFileSync('docs/specs/task-system-v2.md', 'utf8');
    const { proofClauses } = parseSpecDoc(text);
    expect(proofClauses).toHaveLength(6);
    expect(proofClauses[0].text).toContain('under a second against a 200-task store');
    expect(proofClauses[5].text).toContain('under 40 lines');
  });
});

describe('appendAuditPass / renderAuditPass round trip', () => {
  it('creates the ## Audit passes section when absent, and parses it back identically', () => {
    const withPass = appendAuditPass(DOC, {
      pass: 1,
      date: '2026-07-31',
      base: 'abc1234',
      head: 'def5678',
      verdicts: [
        { clause: 1, status: 'met', evidence: null },
        { clause: 2, status: 'unmet', evidence: 'triage loses the queue on ^C' },
      ],
    });
    expect(withPass).toContain('## Audit passes');
    const reparsed = parseSpecDoc(withPass);
    expect(reparsed.auditPasses).toEqual([
      {
        pass: 1,
        date: '2026-07-31',
        base: 'abc1234',
        head: 'def5678',
        verdicts: [
          { clause: 1, status: 'met', evidence: null },
          { clause: 2, status: 'unmet', evidence: 'triage loses the queue on ^C' },
        ],
      },
    ]);
    // Untouched: Deliverable, Decisions and Open questions are what a human reads.
    expect(reparsed.deliverableSection).toBe(parseSpecDoc(DOC).deliverableSection);
  });

  it('appends a second pass after the first rather than replacing it', () => {
    const afterOne = appendAuditPass(DOC, { pass: 1, date: '2026-07-31', base: 'a', head: 'b', verdicts: [] });
    const afterTwo = appendAuditPass(afterOne, { pass: 2, date: '2026-08-01', base: 'c', head: 'd', verdicts: [] });
    const { auditPasses } = parseSpecDoc(afterTwo);
    expect(auditPasses.map((p) => p.pass)).toEqual([1, 2]);
  });

  it('never touches Deliverable/Decisions/Open questions text when appending', () => {
    const before = parseSpecDoc(DOC);
    const after = parseSpecDoc(appendAuditPass(DOC, { pass: 1, date: '2026-07-31', base: 'a', head: 'b', verdicts: [] }));
    expect(after.deliverableSection).toBe(before.deliverableSection);
  });

  it('renders met without evidence and unmet with it', () => {
    const rendered = renderAuditPass({
      pass: 3,
      date: '2026-08-02',
      base: 'aaa',
      head: 'bbb',
      verdicts: [
        { clause: 1, status: 'met', evidence: 'ignored for met' },
        { clause: 2, status: 'unmet', evidence: 'the reason' },
      ],
    });
    expect(rendered).toContain('- proof 1: met');
    expect(rendered).not.toContain('ignored for met');
    expect(rendered).toContain('- proof 2: unmet — the reason');
  });
});
