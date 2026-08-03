import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendAuditPass, clauseStandings, duplicateClauseIds, outstandingSummary, parseSpecDoc, renderAuditPass, stampClauseIds } from './specDoc';

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

  // A clause's text is its identity: it is what an auditor is asked to
  // grade and what an `unmet` verdict titles its undelivered task with. A
  // subsection written under the last clause was being absorbed into it,
  // which produced a 900-character clause title in the live store.
  it('ends a clause at a heading rather than absorbing the section that follows it', () => {
    const doc = [
      '## Deliverable',
      '',
      'Promise.',
      '',
      'Proof:',
      '',
      '- The first clause holds.',
      '- The last clause holds.',
      '',
      '### A subsection explaining the clauses',
      '',
      'Prose that belongs to the section, not to the clause above it.',
      '',
    ].join('\n');
    expect(parseSpecDoc(doc).proofClauses).toEqual([
      { id: 1, text: 'The first clause holds.' },
      { id: 2, text: 'The last clause holds.' },
    ]);
  });

  it('parses indented proof target metadata without folding it into clause text', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The command proof runs.\n  proof: command node --version\n- [c2] The vitest proof runs.\n  proof: vitest scripts/tasks.test.ts "audit-prompt prints a ready-to-use auditor prompt for a spec"\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([
      { id: 1, text: 'The command proof runs.', proofTargets: ['command node --version'] },
      { id: 2, text: 'The vitest proof runs.', proofTargets: ['vitest scripts/tasks.test.ts "audit-prompt prints a ready-to-use auditor prompt for a spec"'] },
    ]);
  });

  it('treats only top-level Proof bullets as clauses, leaving indented sub-bullets as prose', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The real clause.\n  - supporting detail, not a clause.\n- [c2] The other real clause.\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([
      { id: 1, text: 'The real clause. - supporting detail, not a clause.' },
      { id: 2, text: 'The other real clause.' },
    ]);
    expect(stampClauseIds(doc)).toContain('  - supporting detail, not a clause.');
  });

  it('leaves a clause that merely opens with a bracketed phrase untagged, text intact', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- [see docs] a clause that opens with a link-shaped phrase.\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([{ id: 1, text: '[see docs] a clause that opens with a link-shaped phrase.' }]);
  });

  it('gives an untagged clause the lowest id no tag has claimed, so a new clause never steals an existing one', () => {
    const doc = '## Deliverable\n\nPromise.\n\nProof:\n\n- An inserted clause.\n- [c1] The original clause.\n- Another inserted clause.\n';
    expect(parseSpecDoc(doc).proofClauses.map((clause) => clause.id)).toEqual([2, 1, 3]);
  });

  it('does not reuse an audited clause id for a later untagged replacement clause', () => {
    const audited = appendAuditPass('## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The original clause.\n', {
      pass: 1,
      date: '2026-08-01',
      base: 'abc1234',
      head: 'def5678',
      verdicts: [{ clause: 1, status: 'met', evidence: null }],
    });
    const replaced = audited.replace('- [c1] The original clause.', '- A replacement clause.');
    expect(parseSpecDoc(replaced).proofClauses).toEqual([{ id: 2, text: 'A replacement clause.' }]);
    expect(stampClauseIds(replaced)).toContain('- [c2] A replacement clause.');
  });

  it('returns no proof clauses when there is no Proof: line', () => {
    const doc = '## Deliverable\n\nJust prose, no proof list.\n\n## Decisions\n';
    expect(parseSpecDoc(doc).proofClauses).toEqual([]);
  });

  it('does not treat a `- ` line inside a fenced code block as a real clause, or run its proof: target', () => {
    const doc = [
      '## Deliverable',
      '',
      'Promise.',
      '',
      'Proof:',
      '',
      '- A real clause with an example:',
      '',
      '```md',
      '- [c9] not a real clause',
      '  proof: command rm -rf /',
      '```',
      '',
      '## Decisions',
      '',
    ].join('\n');
    expect(parseSpecDoc(doc).proofClauses).toEqual([{ id: 1, text: 'A real clause with an example:' }]);
  });

  it('tracks ~~~ fences the same as ``` fences', () => {
    const doc = ['## Deliverable', '', 'Promise.', '', 'Proof:', '', '- A real clause.', '', '~~~', '- [c9] not a real clause', '~~~', '', '## Decisions', ''].join('\n');
    expect(parseSpecDoc(doc).proofClauses).toEqual([{ id: 1, text: 'A real clause.' }]);
  });

  it('returns no audit passes when none are recorded', () => {
    expect(parseSpecDoc(DOC).auditPasses).toEqual([]);
  });

  // Structure, never content: a spec's clauses are amendable by design, and
  // pinning their text here would freeze them by unit-test failure.
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

  it('round-trips an unknown verdict without turning it into unmet', () => {
    const withPass = appendAuditPass(DOC, {
      pass: 1,
      date: '2026-08-02',
      base: 'a',
      head: 'b',
      verdicts: [
        { clause: 1, status: 'unknown', evidence: null },
        { clause: 2, status: 'unknown', evidence: 'ran out of session before reaching it' },
      ],
    });
    expect(withPass).toContain('- proof 1: unknown');
    expect(parseSpecDoc(withPass).auditPasses[0].verdicts).toEqual([
      { clause: 1, status: 'unknown', evidence: null },
      { clause: 2, status: 'unknown', evidence: 'ran out of session before reaching it' },
    ]);
  });
});

describe('clauseStandings / outstandingSummary', () => {
  const clauses = parseSpecDoc(DOC).proofClauses;

  it('grades every clause the pass never mentioned as unknown, not as absent', () => {
    const standings = clauseStandings(clauses, [{ clause: 1, status: 'met', evidence: 'measured' }]);
    expect(standings).toEqual([
      { clause: 1, status: 'met', evidence: 'measured' },
      { clause: 2, status: 'unknown', evidence: null },
      { clause: 3, status: 'unknown', evidence: null },
    ]);
  });

  it('grades every clause unknown when no pass has been recorded at all', () => {
    expect(clauseStandings(clauses, undefined).map((verdict) => verdict.status)).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('names each outstanding clause with its own status rather than counting them', () => {
    const summary = outstandingSummary([
      { clause: 1, status: 'met', evidence: 'measured' },
      { clause: 2, status: 'unmet', evidence: null },
      { clause: 3, status: 'unknown', evidence: null },
    ]);
    expect(summary).toBe('outstanding: c2 (unmet), c3 (unknown)');
    expect(summary).not.toMatch(/\d+\s*\/\s*\d+|%/);
  });

  it('says nothing is outstanding rather than reporting a full score', () => {
    expect(outstandingSummary([{ clause: 1, status: 'met', evidence: 'measured' }])).toBe('no clause outstanding');
  });

  it('reports a spec with no clauses at all as having none to grade, not as complete', () => {
    expect(outstandingSummary([])).toBe('no clause to grade');
  });
});

// A CRLF spec used to report having no recorded passes at all: every
// heading and verdict regex anchors to line end, and the carriage return
// defeated each one silently.
describe('a CRLF spec document', () => {
  it('parses clauses and audit passes the same as an LF one', () => {
    const lf = '# s\n\n## Deliverable\n\np\n\nProof:\n\n- [c1] The clause holds.\n\n## Audit passes\n\n### Pass 1 — 2026-08-03\n\n- base: `a`\n- head: `b`\n- proof 1: met — checked\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    const parsed = parseSpecDoc(crlf);
    expect(parsed.proofClauses).toEqual(parseSpecDoc(lf).proofClauses);
    expect(parsed.auditPasses).toHaveLength(1);
    expect(parsed.auditPasses[0].verdicts).toEqual([{ clause: 1, status: 'met', evidence: 'checked' }]);
  });
});
