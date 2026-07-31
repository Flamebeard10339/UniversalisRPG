import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendAmendment, appendAuditPass, parseSpecDoc, renderAuditPass } from './specDoc';

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

  it('returns no amendments when none are recorded', () => {
    expect(parseSpecDoc(DOC).amendments).toEqual([]);
  });

  // Structure, never content: a spec's clauses are amendable by design, and
  // pinning their text here would be a second freeze enforced by a unit test
  // failure rather than by the merge gate.
  it('parses the real docs/specs/task-system-v2.md into well-formed, sequentially indexed clauses', () => {
    const text = readFileSync('docs/specs/task-system-v2.md', 'utf8');
    const { proofClauses } = parseSpecDoc(text);
    expect(proofClauses.length).toBeGreaterThan(0);
    expect(proofClauses.map((clause) => clause.index)).toEqual(proofClauses.map((_, i) => i + 1));
    for (const clause of proofClauses) {
      expect(clause.text.trim()).not.toBe('');
      // Wrapped continuation lines are joined, not left as their own clause.
      expect(clause.text).not.toMatch(/^- /);
    }
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

  it('renders evidence for a met verdict just as it does for an unmet one', () => {
    const rendered = renderAuditPass({
      pass: 3,
      date: '2026-08-02',
      base: 'aaa',
      head: 'bbb',
      verdicts: [
        { clause: 1, status: 'met', evidence: 'measured 70ms' },
        { clause: 2, status: 'unmet', evidence: 'the reason' },
      ],
    });
    expect(rendered).toContain('- proof 1: met — measured 70ms');
    expect(rendered).toContain('- proof 2: unmet — the reason');
  });

  it('renders a bare verdict, met or unmet, when there is no evidence to attach', () => {
    const rendered = renderAuditPass({
      pass: 3,
      date: '2026-08-02',
      base: 'aaa',
      head: 'bbb',
      verdicts: [
        { clause: 1, status: 'met', evidence: null },
        { clause: 2, status: 'unmet', evidence: null },
      ],
    });
    const lines = rendered.split('\n');
    expect(lines).toContain('- proof 1: met');
    expect(lines).toContain('- proof 2: unmet');
  });

  it('round-trips a met-with-evidence line back into a verdict', () => {
    const withPass = appendAuditPass(DOC, {
      pass: 1,
      date: '2026-07-31',
      base: 'abc1234',
      head: 'def5678',
      verdicts: [{ clause: 1, status: 'met', evidence: 'measured 70ms' }],
    });
    const { auditPasses } = parseSpecDoc(withPass);
    expect(auditPasses[0].verdicts).toEqual([{ clause: 1, status: 'met', evidence: 'measured 70ms' }]);
  });
});

describe('appendAmendment / parseSpecDoc amendments round trip', () => {
  it('creates the ## Amendments section when absent, archiving the current deliverable text', () => {
    const before = parseSpecDoc(DOC);
    const amended = appendAmendment(DOC, { date: '2026-08-01', reason: 'understood the requirement better after implementing it', deliverableText: before.deliverableSection });
    expect(amended).toContain('## Amendments');
    const { amendments } = parseSpecDoc(amended);
    expect(amendments).toEqual([{ date: '2026-08-01', reason: 'understood the requirement better after implementing it', deliverableText: before.deliverableSection }]);
  });

  it('never touches the live ## Deliverable when archiving a copy of it', () => {
    const before = parseSpecDoc(DOC);
    const amended = appendAmendment(DOC, { date: '2026-08-01', reason: 'x', deliverableText: before.deliverableSection });
    expect(parseSpecDoc(amended).deliverableSection).toBe(before.deliverableSection);
  });

  it('appends a second amendment after the first rather than replacing it', () => {
    const before = parseSpecDoc(DOC);
    const afterOne = appendAmendment(DOC, { date: '2026-08-01', reason: 'first amendment', deliverableText: before.deliverableSection });
    const afterTwo = appendAmendment(afterOne, { date: '2026-08-02', reason: 'second amendment', deliverableText: '## Deliverable\n\nA revised promise.' });
    const { amendments } = parseSpecDoc(afterTwo);
    expect(amendments.map((a) => a.reason)).toEqual(['first amendment', 'second amendment']);
    expect(amendments[1].deliverableText).toBe('## Deliverable\n\nA revised promise.');
  });

  it('demotes the archived heading so it cannot be mistaken for a real ## section boundary', () => {
    const before = parseSpecDoc(DOC);
    const amended = appendAmendment(DOC, { date: '2026-08-01', reason: 'x', deliverableText: before.deliverableSection });
    // Only the live section's own heading may appear at "## " depth — the
    // archived copy's must not, or a second amendment's insertion point
    // (and any later ## Decisions / ## Open questions lookup) would misparse.
    expect(amended.match(/^## Deliverable$/gm)).toHaveLength(1);
    expect(amended).toContain('#### Deliverable');
  });

  it('coexists with ## Audit passes without either section corrupting the other', () => {
    const withPass = appendAuditPass(DOC, { pass: 1, date: '2026-07-31', base: 'a', head: 'b', verdicts: [] });
    const before = parseSpecDoc(withPass);
    const withBoth = appendAmendment(withPass, { date: '2026-08-01', reason: 'x', deliverableText: before.deliverableSection });
    const doc = parseSpecDoc(withBoth);
    expect(doc.auditPasses).toHaveLength(1);
    expect(doc.amendments).toHaveLength(1);
    expect(doc.deliverableSection).toBe(before.deliverableSection);
  });
});
