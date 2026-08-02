import { describe, expect, it } from 'vitest';
import { checkMergeGate, type MergeGateInput } from './mergeGate';
import type { SpecDoc } from './specDoc';
import type { Task } from './taskStore';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    kind: 'task',
    state: 'done',
    severity: null,
    system: null,
    spec: 'demo',
    clause: null,
    requires: [],
    files: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    closed: null,
    closedCommit: null,
    extra: null,
    ...overrides,
  };
}

const cleanDoc: SpecDoc = {
  deliverableSection: '## Deliverable\n\nSome promise.\n\nProof:\n\n- clause one\n- clause two',
  proofClauses: [
    { id: 1, text: 'clause one' },
    { id: 2, text: 'clause two' },
  ],
  baseline: null,
  amendments: [],
  auditPasses: [
    {
      pass: 1,
      date: '2026-07-31',
      base: 'aaa',
      head: 'bbb',
      verdicts: [
        { clause: 1, status: 'met', evidence: null },
        { clause: 2, status: 'met', evidence: null },
      ],
    },
  ],
};

function baseInput(overrides: Partial<MergeGateInput> = {}): MergeGateInput {
  return {
    specCandidates: ['demo'],
    specExists: true,
    doc: cleanDoc,
    deliverableBaseline: cleanDoc.deliverableSection,
    members: [task({ id: 'a', state: 'done' }), task({ id: 'b', state: 'declined', reason: 'x' })],
    ...overrides,
  };
}

describe('checkMergeGate', () => {
  it('passes a spec with a clean audit pass, unchanged deliverable, and only closed members', () => {
    expect(checkMergeGate(baseInput())).toEqual([]);
  });

  it('passes vacuously when the branch touches no spec file — a branch that made no promise has nothing to check', () => {
    expect(checkMergeGate(baseInput({ specCandidates: [] }))).toEqual([]);
  });

  it('refuses — naming both — when the branch touches two spec files, rather than guessing which one is "the" spec', () => {
    const issues = checkMergeGate(baseInput({ specCandidates: ['demo', 'other'] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('demo');
    expect(issues[0]).toContain('other');
  });

  it('refuses when the spec file is missing', () => {
    expect(checkMergeGate(baseInput({ specExists: false, doc: null }))).toEqual(['spec file missing: docs/specs/demo.md']);
  });

  it('refuses when there is no recorded audit pass', () => {
    const doc: SpecDoc = { ...cleanDoc, auditPasses: [] };
    expect(checkMergeGate(baseInput({ doc }))).toContain('demo has no recorded audit pass');
  });

  it('refuses when a proof clause has no verdict in the latest pass', () => {
    const doc: SpecDoc = { ...cleanDoc, auditPasses: [{ ...cleanDoc.auditPasses[0], verdicts: [{ clause: 1, status: 'met', evidence: null }] }] };
    expect(checkMergeGate(baseInput({ doc }))).toContain('proof clause 2 has no verdict in the latest audit pass (pass 1)');
  });

  it('refuses when a proof clause is unmet in the latest pass', () => {
    const doc: SpecDoc = {
      ...cleanDoc,
      auditPasses: [
        {
          ...cleanDoc.auditPasses[0],
          verdicts: [
            { clause: 1, status: 'met', evidence: null },
            { clause: 2, status: 'unmet', evidence: 'not done' },
          ],
        },
      ],
    };
    expect(checkMergeGate(baseInput({ doc }))).toContain('proof clause 2 is unmet as of pass 1');
  });

  it('only checks verdicts from the latest pass, not an earlier one that had them all met', () => {
    const doc: SpecDoc = {
      ...cleanDoc,
      auditPasses: [
        cleanDoc.auditPasses[0],
        {
          pass: 2,
          date: '2026-08-01',
          base: 'ccc',
          head: 'ddd',
          verdicts: [
            { clause: 1, status: 'met', evidence: null },
            { clause: 2, status: 'unmet', evidence: 'regressed' },
          ],
        },
      ],
    };
    expect(checkMergeGate(baseInput({ doc }))).toContain('proof clause 2 is unmet as of pass 2');
  });

  it('refuses when the deliverable text differs from its baseline', () => {
    expect(checkMergeGate(baseInput({ deliverableBaseline: '## Deliverable\n\nA different promise entirely.' }))).toContain("demo's ## Deliverable text differs from its most recent amendment (or its state at the branch's merge-base, if never amended)");
  });

  it('does not refuse on deliverable drift when there is nothing to compare against (a new, un-amended spec)', () => {
    expect(checkMergeGate(baseInput({ deliverableBaseline: null }))).toEqual([]);
  });

  it('accepts a live deliverable that differs from its baseline only by clause ids audit stamped on', () => {
    const stamped = '## Deliverable\n\nSome promise.\n\nProof:\n\n- [c1] clause one\n- [c2] clause two';
    const doc: SpecDoc = { ...cleanDoc, deliverableSection: stamped };
    expect(checkMergeGate(baseInput({ doc, deliverableBaseline: cleanDoc.deliverableSection }))).toEqual([]);
  });

  it('refuses a tag edited by hand, even though the clause prose is untouched', () => {
    const renumbered = '## Deliverable\n\nSome promise.\n\nProof:\n\n- [c9] clause one\n- [c2] clause two';
    const doc: SpecDoc = { ...cleanDoc, deliverableSection: renumbered, proofClauses: [{ id: 9, text: 'clause one' }, { id: 2, text: 'clause two' }] };
    const issues = checkMergeGate(baseInput({ doc, deliverableBaseline: cleanDoc.deliverableSection }));
    expect(issues.some((issue) => issue.includes("## Deliverable text differs"))).toBe(true);
  });

  it('refuses when the latest pass graded a clause id the deliverable no longer has — a renumbered tag orphans its verdict', () => {
    const doc: SpecDoc = { ...cleanDoc, proofClauses: [{ id: 2, text: 'clause one' }, { id: 3, text: 'clause two' }] };
    const issues = checkMergeGate(baseInput({ doc, deliverableBaseline: null }));
    expect(issues).toContain('pass 1 graded proof clause 1, which is no longer in the deliverable');
  });

  it('refuses when two clauses claim the same id, which would make every verdict against it ambiguous', () => {
    const doc: SpecDoc = { ...cleanDoc, proofClauses: [{ id: 1, text: 'clause one' }, { id: 1, text: 'clause two' }] };
    const issues = checkMergeGate(baseInput({ doc, deliverableBaseline: null }));
    expect(issues).toContain('demo tags more than one proof clause [c1] — a clause id names exactly one clause');
  });

  it('refuses when a finding on the spec is still unreviewed', () => {
    const members = [...baseInput().members, task({ id: 'c', kind: 'finding', state: 'unreviewed' })];
    const issues = checkMergeGate(baseInput({ members }));
    expect(issues.some((issue) => issue.includes('still unreviewed') && issue.includes('c'))).toBe(true);
  });

  it('refuses when a member is neither done nor declined', () => {
    const members = [...baseInput().members, task({ id: 'd', state: 'open' })];
    const issues = checkMergeGate(baseInput({ members }));
    expect(issues.some((issue) => issue.includes('neither done nor declined') && issue.includes('d'))).toBe(true);
  });

  it('reports no issues when the spec has no members at all', () => {
    expect(checkMergeGate(baseInput({ members: [] }))).toEqual([]);
  });
});
