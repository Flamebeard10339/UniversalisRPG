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
    requires: [],
    files: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    closed: null,
    ...overrides,
  };
}

const cleanDoc: SpecDoc = {
  deliverableSection: '## Deliverable\n\nSome promise.\n\nProof:\n\n- clause one\n- clause two',
  proofClauses: [
    { index: 1, text: 'clause one' },
    { index: 2, text: 'clause two' },
  ],
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
    spec: 'demo',
    specExists: true,
    doc: cleanDoc,
    deliverableAtMergeBase: cleanDoc.deliverableSection,
    members: [task({ id: 'a', state: 'done' }), task({ id: 'b', state: 'declined', reason: 'x' })],
    ...overrides,
  };
}

describe('checkMergeGate', () => {
  it('passes a spec with a clean audit pass, unchanged deliverable, and only closed members', () => {
    expect(checkMergeGate(baseInput())).toEqual([]);
  });

  it('passes vacuously when there is no active spec — a branch that made no promise has nothing to check', () => {
    expect(checkMergeGate(baseInput({ spec: null }))).toEqual([]);
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

  it('refuses when the deliverable text differs from the merge-base state', () => {
    expect(checkMergeGate(baseInput({ deliverableAtMergeBase: '## Deliverable\n\nA different promise entirely.' }))).toContain("demo's ## Deliverable text differs from its state at the branch's merge-base");
  });

  it('does not refuse on deliverable drift when there is nothing to compare against (a new spec)', () => {
    expect(checkMergeGate(baseInput({ deliverableAtMergeBase: null }))).toEqual([]);
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
