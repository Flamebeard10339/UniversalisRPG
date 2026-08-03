import { describe, expect, it } from 'vitest';
import { checkPlan, type PlanFinding } from './planCheck';
import type { Task } from './taskStore';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    clause: null,
    requires: [],
    files: [],
    writes: [],
    produces: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
    ...overrides,
  };
}

const kinds = (findings: PlanFinding[]): string[] => findings.map((finding) => finding.kind);

describe('checkPlan', () => {
  it('reports two unordered tasks writing the same file as one change', () => {
    const plan = [task({ id: 'a', writes: ['scripts/tasks.ts'] }), task({ id: 'b', writes: ['scripts/tasks.ts'] })];
    const { findings } = checkPlan(plan, plan);
    expect(kinds(findings)).toContain('overlapping-writes');
    expect(findings[0].message).toContain('one change, split across two workers');
  });

  it('accepts the same overlap once a requires edge orders it', () => {
    const plan = [task({ id: 'a', writes: ['scripts/tasks.ts'] }), task({ id: 'b', writes: ['scripts/tasks.ts'], requires: ['a'] })];
    expect(kinds(checkPlan(plan, plan).findings)).not.toContain('overlapping-writes');
  });

  it('accepts an ordering that runs through a chain rather than a direct edge', () => {
    const plan = [
      task({ id: 'a', writes: ['scripts/tasks.ts'] }),
      task({ id: 'b', requires: ['a'] }),
      task({ id: 'c', writes: ['scripts/tasks.ts'], requires: ['b'] }),
    ];
    expect(kinds(checkPlan(plan, plan).findings)).not.toContain('overlapping-writes');
  });

  it('terminates on a dependency cycle instead of walking it forever', () => {
    const plan = [
      task({ id: 'a', writes: ['src/one.ts'], requires: ['b'] }),
      task({ id: 'b', writes: ['src/two.ts'], requires: ['a'] }),
    ];
    expect(() => checkPlan(plan, plan)).not.toThrow();
  });

  it('names the missing edge, not the merge, when one side is producing an interface', () => {
    const plan = [
      task({ id: 'seam', writes: ['scripts/lib/policy.ts'], produces: ['policy module'] }),
      task({ id: 'caller', writes: ['scripts/lib/policy.ts'] }),
    ];
    const { findings } = checkPlan(plan, plan);
    expect(kinds(findings)).toContain('unstated-dependency');
    expect(kinds(findings)).not.toContain('overlapping-writes');
    expect(findings[0].message).toContain('caller does not require seam');
  });

  it('reports two tasks claiming the same interface even where nothing overlaps', () => {
    const plan = [
      task({ id: 'a', writes: ['src/one.ts'], produces: ['batching'] }),
      task({ id: 'b', writes: ['src/two.ts'], produces: ['Batching'] }),
    ];
    const { findings } = checkPlan(plan, plan);
    expect(kinds(findings)).toContain('duplicate-produces');
    expect(findings[0].message).toContain('one of them is the owner and the other is a duplicate');
  });

  it('finds nothing wrong with a genuinely disjoint plan', () => {
    const plan = [
      task({ id: 'a', writes: ['src/one.ts'] }),
      task({ id: 'b', writes: ['src/two.ts'] }),
      task({ id: 'c', writes: ['src/three.ts'] }),
    ];
    expect(checkPlan(plan, plan).findings).toEqual([]);
  });

  it('says how many tasks declared no write grant, because it cannot see past that', () => {
    const plan = [task({ id: 'a', writes: ['src/one.ts'] }), task({ id: 'b' })];
    const report = checkPlan(plan, plan);
    expect(report.ungranted).toBe(1);
    expect(kinds(report.findings)).toContain('no-write-grant');
  });

  // The failure this module exists to prevent, in the one place it was
  // reachable: a grant it cannot resolve matched nothing, and the guard
  // that catches "nothing to compare" only looked for an empty array. So
  // the plan came back clean precisely where the check was blindest.
  it('does not count a grant it cannot resolve as a grant', () => {
    const plan = [
      task({ id: 'globby', writes: ['src/**/*.ts'] }),
      task({ id: 'literal', writes: ['src/a.ts'] }),
    ];
    const report = checkPlan(plan, plan);
    expect(report.ungranted).toBe(1);
    expect(kinds(report.findings)).toContain('unreadable-grant');
    expect(report.findings.find((f) => f.kind === 'unreadable-grant')?.message).toContain('src/**/*.ts');
  });

  it('reads a leading ./ and a trailing slash as the same region, so a plan cannot be clean by punctuation', () => {
    const plan = [
      task({ id: 'a', writes: ['./src/runtime/'] }),
      task({ id: 'b', writes: ['src/runtime/combat.ts'] }),
    ];
    expect(kinds(checkPlan(plan, plan).findings)).toContain('overlapping-writes');
  });

  it('matches two spellings of one path on a case-insensitive filesystem', () => {
    const plan = [task({ id: 'a', writes: ['src/Runtime.ts'] }), task({ id: 'b', writes: ['src/runtime.ts'] })];
    expect(kinds(checkPlan(plan, plan).findings)).toContain('overlapping-writes');
  });

  it('does not report a task against itself when a plan names it twice', () => {
    const one = task({ id: 'solo', writes: ['src/p.ts'], produces: ['policy module'] });
    // checkPlan takes a set; cmdPlan dedupes before calling it. Pinned here
    // because the pairing is what would fabricate the self-collision.
    expect(checkPlan([one], [one]).findings).toEqual([]);
  });

  it('reports a plan concentrated in one file, ordered or not', () => {
    const plan = [
      task({ id: 'a', writes: ['scripts/tasks.ts'] }),
      task({ id: 'b', writes: ['scripts/tasks.ts'], requires: ['a'] }),
      task({ id: 'c', writes: ['scripts/tasks.ts'], requires: ['b'] }),
    ];
    const { findings } = checkPlan(plan, plan);
    // Every pair is ordered, so nothing collides — and it is still one change.
    expect(kinds(findings)).not.toContain('overlapping-writes');
    expect(kinds(findings)).toContain('cohesion');
    expect(findings.find((f) => f.kind === 'cohesion')?.message).toContain('3 of 3');
  });

  it('does not call a plan cohesive because two of five tasks share a file', () => {
    const plan = [
      task({ id: 'a', writes: ['src/one.ts'] }),
      task({ id: 'b', writes: ['src/one.ts'], requires: ['a'] }),
      task({ id: 'c', writes: ['src/three.ts'] }),
      task({ id: 'd', writes: ['src/four.ts'] }),
      task({ id: 'e', writes: ['src/five.ts'] }),
    ];
    expect(kinds(checkPlan(plan, plan).findings)).not.toContain('cohesion');
  });

  it('reports a task that would start blocked, from the whole store rather than the plan', () => {
    const plan = [task({ id: 'a', writes: ['src/one.ts'], requires: ['elsewhere'] })];
    const all = [...plan, task({ id: 'elsewhere', state: 'open' })];
    expect(kinds(checkPlan(plan, all).findings)).toContain('starts-blocked');

    const settled = [...plan, task({ id: 'elsewhere', state: 'done' })];
    expect(kinds(checkPlan(plan, settled).findings)).not.toContain('starts-blocked');
  });

  it('has nothing to say about a plan of one', () => {
    const plan = [task({ id: 'a', writes: ['src/one.ts'] })];
    expect(checkPlan(plan, plan).findings).toEqual([]);
  });
});
