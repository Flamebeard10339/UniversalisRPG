import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendAmendment, appendAuditPass, appendBaseline, duplicateClauseIds, parseSpecDoc, renderAuditPass, stampClauseIds } from './specDoc';

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

  it('numbers untagged proof clauses in document order and joins wrapped continuation lines', () => {
    const { proofClauses } = parseSpecDoc(DOC);
    expect(proofClauses).toEqual([
      { id: 1, text: 'The first clause, on one line.' },
      { id: 2, text: 'The second clause wraps onto a continuation line that should join back into one sentence.' },
      { id: 3, text: 'A third clause.' },
    ]);
  });

  it('takes a clause id from its [cN] tag rather than its position, and keeps the tag out of the text', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [c3] The clause that was third.\n- [c1] The clause that was first.\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([
      { id: 3, text: 'The clause that was third.' },
      { id: 1, text: 'The clause that was first.' },
    ]);
  });

  it('parses indented proof target metadata without folding it into clause text', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The command proof runs.\n  proof: command node --version\n- [c2] The vitest proof runs.\n  proof: vitest scripts/tasks.test.ts "audit-prompt prints a ready-to-use auditor prompt for a spec"\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([
      { id: 1, text: 'The command proof runs.', proofTargets: ['command node --version'] },
      { id: 2, text: 'The vitest proof runs.', proofTargets: ['vitest scripts/tasks.test.ts "audit-prompt prints a ready-to-use auditor prompt for a spec"'] },
    ]);
  });

  it('leaves a clause that merely opens with a bracketed phrase untagged, text intact', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [see docs] a clause that opens with a link-shaped phrase.\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([{ id: 1, text: '[see docs] a clause that opens with a link-shaped phrase.' }]);
  });

  it('gives an untagged clause the lowest id no tag has claimed, so a new clause never steals an existing one', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- An inserted clause.\n- [c1] The original clause.\n- Another inserted clause.\n';
    expect(parseSpecDoc(doc).proofClauses.map((clause) => clause.id)).toEqual([2, 1, 3]);
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

  it('returns no baseline when none is recorded', () => {
    expect(parseSpecDoc(DOC).baseline).toBeNull();
  });

  // Structure, never content: a spec's clauses are amendable by design, and
  // pinning their text here would be a second freeze enforced by a unit test
  // failure rather than by the merge gate.
  it('parses the real docs/specs/task-system-v2.md into well-formed, distinctly identified clauses', () => {
    const text = readFileSync('docs/specs/task-system-v2.md', 'utf8');
    const { proofClauses } = parseSpecDoc(text);
    expect(proofClauses.length).toBeGreaterThan(0);
    expect(new Set(proofClauses.map((clause) => clause.id)).size).toBe(proofClauses.length);
    for (const clause of proofClauses) {
      expect(clause.text.trim()).not.toBe('');
      // Wrapped continuation lines are joined, not left as their own clause.
      expect(clause.text).not.toMatch(/^- /);
    }
  });
});

describe('appendBaseline / parseSpecDoc baseline round trip', () => {
  it('records a frozen opening deliverable without adding a parseable second Deliverable section', () => {
    const before = parseSpecDoc(DOC);
    const frozen = appendBaseline(DOC, before.deliverableSection);
    const parsed = parseSpecDoc(frozen);
    expect(parsed.baseline).toBe(before.deliverableSection);
    expect(parsed.deliverableSection).toBe(before.deliverableSection);
    expect(frozen.match(/^## Deliverable$/gm)).toHaveLength(1);
    expect(frozen).toContain('## Baseline');
    expect(frozen).toContain('#### Deliverable');
  });
});

describe('stampClauseIds', () => {
  it('writes the resolved id into every untagged clause line and leaves everything else alone', () => {
    const stamped = stampClauseIds(DOC);
    expect(stamped).toContain('- [c1] The first clause, on one line.');
    expect(stamped).toContain('- [c2] The second clause wraps onto');
    expect(stamped).toContain('- [c3] A third clause.');
    // The continuation line is not a clause of its own, so it stays bare.
    expect(stamped).toContain('  a continuation line that should join back into one sentence.');
    expect(stamped).toContain('## Open questions');
  });

  it('is idempotent: stamping an already-stamped document changes nothing', () => {
    const once = stampClauseIds(DOC);
    expect(stampClauseIds(once)).toBe(once);
  });

  it('preserves the ids parsed before stamping, so a stamp cannot silently rebind a recorded verdict', () => {
    const before = parseSpecDoc(DOC).proofClauses;
    expect(parseSpecDoc(stampClauseIds(DOC)).proofClauses).toEqual(before);
  });

  it('leaves a clause tagged out of order tagged as it was, and gives its untagged neighbours fresh ids', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- An inserted clause.\n- [c1] The original clause.\n';
    const stamped = stampClauseIds(doc);
    expect(stamped).toContain('- [c2] An inserted clause.');
    expect(stamped).toContain('- [c1] The original clause.');
  });

  it('does nothing to a deliverable with no Proof: list', () => {
    const doc = '## Deliverable\n\nJust prose.\n\n## Decisions\n';
    expect(stampClauseIds(doc)).toBe(doc);
  });
});

describe('duplicateClauseIds', () => {
  it('reports nothing when every clause answers to its own id', () => {
    expect(duplicateClauseIds(parseSpecDoc(DOC).proofClauses)).toEqual([]);
  });

  it('reports an id two clauses both claim, once, however many clauses claim it', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] One.\n- [c1] Two.\n- [c1] Three.\n- [c2] Four.\n';
    expect(duplicateClauseIds(parseSpecDoc(doc).proofClauses)).toEqual([1]);
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
