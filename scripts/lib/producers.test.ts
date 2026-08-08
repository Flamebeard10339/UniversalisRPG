import { describe, expect, it } from 'vitest';
import type { TaskEvent } from './eventLog';
import { findProducers, matchStrength, priorArt, producerIndex, rulingsOn, type Producer } from './producers';
import type { Manifest } from './systems';
import type { Task } from './taskStore';

function task(id: string, produces: string[], state: Task['state'] = 'done', paths: { writes?: string[]; files?: string[] } = {}): Task {
  return {
    id,
    seq: null,
    title: id,
    kind: 'task',
    state,
    severity: null,
    system: null,
    spec: null,
    departure: null,
    clause: null,
    requires: [],
    files: paths.files ?? [],
    writes: paths.writes ?? [],
    discharges: [],
    grant: null,
    fault: null,
    decider: null,
    produces,
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    trigger: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
  };
}

const manifest: Manifest = {
  unowned: { note: '', paths: [] },
  systems: [
    { name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null, concepts: [{ name: 'buff engine', paths: ['src/runtime/buffs.ts'], note: 'from a produces claim' }] },
    { name: 'Grammar', paths: ['src/grammar'], lastAudit: null, lastAuditDoc: null, note: null, concepts: [] },
  ],
};

describe('matchStrength', () => {
  it('reads the same name as exact, whatever its case and spacing', () => {
    expect(matchStrength('Buff  Engine', 'buff engine')?.strength).toBe('exact');
  });

  it('reads one name inside the other as contains', () => {
    expect(matchStrength('buff', 'buff engine')?.strength).toBe('contains');
    expect(matchStrength('buff engine', 'buff')?.strength).toBe('contains');
  });

  it('reads a shared topic word as the weakest match, and says which word', () => {
    expect(matchStrength('buff stacking', 'buff engine')).toEqual({ strength: 'word', on: 'buff' });
  });

  it('does not match on a word too short or too common to carry a topic', () => {
    expect(matchStrength('the system', 'the engine')).toBeNull();
  });

  it('does not match unrelated names', () => {
    expect(matchStrength('droptable system', 'buff engine')).toBeNull();
  });

  it('does not match an empty query against everything', () => {
    expect(matchStrength('', 'buff engine')).toBeNull();
    expect(matchStrength('   ', 'buff engine')).toBeNull();
  });
});

describe('producerIndex', () => {
  it('carries registered concepts and every task claim, closed ones included', () => {
    const index = producerIndex(manifest, [task('old', ['droptable system'], 'done'), task('live', ['modal system'], 'open')]);
    expect(index.map((producer) => [producer.kind, producer.name, producer.owner, producer.state])).toEqual([
      ['concept', 'buff engine', 'Runtime', null],
      ['task', 'droptable system', 'old', 'done'],
      ['task', 'modal system', 'live', 'open'],
    ]);
  });

  it('is empty when nothing has been claimed or registered', () => {
    expect(producerIndex({ unowned: { note: '', paths: [] }, systems: [] }, [])).toEqual([]);
  });
});

describe('findProducers', () => {
  const index = producerIndex(manifest, [task('closed-one', ['buff engine']), task('other', ['droptable system'])]);

  it('finds a capability a task claimed and then closed — the half a dispatch-set check cannot see', () => {
    const found = findProducers('buff engine', index);
    expect(found.map((match) => [match.strength, match.producer.kind, match.producer.owner])).toEqual([
      ['exact', 'concept', 'Runtime'],
      ['exact', 'task', 'closed-one'],
    ]);
  });

  it('puts a registered concept ahead of a task claim of equal strength', () => {
    expect(findProducers('buff engine', index)[0].producer.kind).toBe('concept');
  });

  it('orders a stronger match ahead of a weaker one', () => {
    const found = findProducers('droptable', index);
    expect(found[0]).toMatchObject({ strength: 'contains', producer: { name: 'droptable system' } });
  });

  // Both strengths present in one answer, so a reversed rank cannot pass:
  // the exact hit must come before the word hit, whatever the index order.
  it('orders across strengths when one query matches at several', () => {
    const mixed = producerIndex(manifest, [task('stacker', ['buff stacking'])]);
    const found = findProducers('buff stacking', mixed);
    expect(found.map((match) => [match.strength, match.producer.name])).toEqual([
      ['exact', 'buff stacking'],
      ['word', 'buff engine'],
    ]);
  });

  it('answers with nothing for a capability nobody claims', () => {
    expect(findProducers('quest journal', index)).toEqual([]);
  });
});

describe('priorArt', () => {
  const built = task('buffs', ['buff engine'], 'done', { writes: ['src/runtime/buffs.ts'] });
  const declined = task('stats-rewrite', [], 'declined', { writes: ['src/runtime/stats.ts'] });
  const live = task('per-counter', ['per expression'], 'open', { writes: ['src/runtime'] });
  const observed = task('a-finding', [], 'unreviewed', { files: ['src/runtime/stats.ts:88'] });
  const elsewhere = task('ui-work', [], 'open', { writes: ['src/ui/map.ts'] });
  const tasks = [built, declined, live, observed, elsewhere];

  it('names every task that has ever claimed the path, closed and declined ones included', () => {
    const art = priorArt(manifest, tasks, ['src/runtime/stats.ts']);
    expect(art.claims.map((claim) => [claim.task.id, claim.task.state])).toEqual([
      ['per-counter', 'open'],
      ['a-finding', 'unreviewed'],
      ['stats-rewrite', 'declined'],
    ]);
  });

  it('resolves a directory grant against a path beneath it, and a directory query against the files under it', () => {
    expect(priorArt(manifest, tasks, ['src/runtime/buffs.ts']).claims.map((claim) => claim.task.id)).toEqual(['per-counter', 'buffs']);
    expect(priorArt(manifest, tasks, ['src/runtime']).claims.map((claim) => claim.task.id)).toEqual(['per-counter', 'a-finding', 'buffs', 'stats-rewrite']);
  });

  // A grant and an observation are different evidence about the same path,
  // and the record spells its own grant — so a reader sees the directory
  // that reached them, not the file it happened to cover.
  it('says which field carried each claim, in the record spelling, against the path that was queried', () => {
    const art = priorArt(manifest, tasks, ['src/runtime/stats.ts']);
    expect(art.claims.map((claim) => claim.on)).toEqual([
      [{ field: 'writes', declared: 'src/runtime', query: 'src/runtime/stats.ts' }],
      [{ field: 'files', declared: 'src/runtime/stats.ts:88', query: 'src/runtime/stats.ts' }],
      [{ field: 'writes', declared: 'src/runtime/stats.ts', query: 'src/runtime/stats.ts' }],
    ]);
  });

  it('carries the concepts registered over the path beside the claims naming it', () => {
    const art = priorArt(manifest, tasks, ['src/runtime/buffs.ts']);
    expect(art.concepts.map((entry) => [entry.system, entry.concept.name, entry.on])).toEqual([['Runtime', 'buff engine', ['src/runtime/buffs.ts']]]);
    expect(priorArt(manifest, tasks, ['src/grammar/parser.ts']).concepts).toEqual([]);
  });

  it('answers over several paths at once, saying which one each claim reached', () => {
    const art = priorArt(manifest, tasks, ['src/runtime/buffs.ts', 'src/ui/map.ts']);
    expect(art.claims.map((claim) => [claim.task.id, claim.on.map((match) => match.query)])).toEqual([
      ['per-counter', ['src/runtime/buffs.ts']],
      ['ui-work', ['src/ui/map.ts']],
      ['buffs', ['src/runtime/buffs.ts']],
    ]);
  });

  it('reads a windows separator and a trailing slash as the same region', () => {
    expect(priorArt(manifest, tasks, ['src\\runtime\\buffs.ts']).claims.map((claim) => claim.task.id)).toEqual(['per-counter', 'buffs']);
    expect(priorArt(manifest, tasks, ['src/runtime/']).claims).toHaveLength(4);
  });

  it('answers with nothing for a path nothing has ever named', () => {
    expect(priorArt(manifest, tasks, ['src/grammar/parser.ts'])).toMatchObject({ concepts: [], claims: [] });
  });

  it('breaks a same-state tie by seq, oldest first, regardless of array order', () => {
    const second = { ...task('second', [], 'open', { writes: ['src/runtime/tied.ts'] }), seq: 2 };
    const first = { ...task('first', [], 'open', { writes: ['src/runtime/tied.ts'] }), seq: 1 };
    const art = priorArt(manifest, [second, first], ['src/runtime/tied.ts']);
    expect(art.claims.map((claim) => claim.task.id)).toEqual(['first', 'second']);
  });
});

function event(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return { t: '2026-08-05T04:32:31.000Z', by: 'claude', branch: 'main', head: 'abc123', op: 'decision', id: null, system: null, spec: 'audit-loop-costs-less', note: 'the reason lives here', ...overrides };
}

// The motivating failure: `audit-loop-costs-less-clause-5` writes nothing —
// `writes` and `files` are both empty — so `priorArt` above is silent on it.
// The whole argument lives in `reason`, and `rulingsOn` is the index that
// reaches it.
describe('rulingsOn', () => {
  const declined = { ...task('audit-loop-costs-less-clause-5', [], 'declined'), reason: 'handoff.test.ts is 16.2s of a 25.2s wall, and shrinking it further means faking the git subprocesses that are the thing it tests.' };
  const unrelated = { ...task('other-decline', [], 'declined'), reason: 'the format is fine as it stands' };
  const noReason = task('open-task', [], 'open');

  it('finds a closed record whose reason names the queried path by its basename', () => {
    const found = rulingsOn([declined, unrelated, noReason], [], ['scripts/tasks/handoff.test.ts']);
    expect(found.reasons.map((entry) => entry.task.id)).toEqual(['audit-loop-costs-less-clause-5']);
    expect(found.decisions).toEqual([]);
  });

  it('finds a decision event that names the path, and ignores other ops that mention it', () => {
    const ruling = event({ id: null, spec: 'audit-loop-costs-less', note: 'c5 ruled on handoff.test.ts: not worth faking git over' });
    const decline = event({ op: 'decline', note: 'declined: handoff.test.ts is 16.2s of a 25.2s wall' });
    const found = rulingsOn([], [ruling, decline], ['scripts/tasks/handoff.test.ts']);
    expect(found.decisions.map((entry) => entry.event.note)).toEqual([ruling.note]);
  });

  it('answers with nothing for a path no reason or decision has ever named', () => {
    const found = rulingsOn([declined], [event({ note: 'unrelated to any path' })], ['src/runtime/save.ts']);
    expect(found).toMatchObject({ reasons: [], decisions: [] });
  });

  it('matches a reason naming the full path even without the basename in isolation', () => {
    const full = { ...task('full-path-reason', [], 'declined'), reason: 'src/runtime/save.ts was ruled out for this' };
    const found = rulingsOn([full], [], ['src/runtime/save.ts']);
    expect(found.reasons).toHaveLength(1);
  });

  it('is silent on a task carrying no reason at all', () => {
    expect(rulingsOn([noReason], [], ['scripts/tasks/handoff.test.ts']).reasons).toEqual([]);
  });

  // The other motivating failure: a reason as ordinary as "if it becomes a
  // problem we can return to it" names no path in prose, but the record's own
  // `files` already say what it was about.
  it('finds a closed record whose files name the path even when its reason names nothing', () => {
    const structural = { ...task('width-finding', [], 'declined', { files: ['scripts/tasks/render.ts:100', 'scripts/tasks/roadmapCmd.test.ts:53'] }), reason: 'If it becomes a problem we can return to it' };
    const found = rulingsOn([structural], [], ['scripts/tasks/render.ts']);
    expect(found.reasons.map((entry) => entry.task.id)).toEqual(['width-finding']);
  });

  it('resolves a directory writes grant on a closed record against a path beneath it', () => {
    const structural = { ...task('dir-grant', [], 'declined', { writes: ['src/runtime'] }), reason: 'not worth it' };
    const found = rulingsOn([structural], [], ['src/runtime/save.ts']);
    expect(found.reasons.map((entry) => entry.task.id)).toEqual(['dir-grant']);
  });

  // A record can qualify by text match and by files/writes at once — the
  // reason names the same file its `files` entry does — and must still hold
  // one entry, not two, in `reasons`.
  it('reports a record that qualifies by both text and files just once', () => {
    const both = { ...task('both-ways', [], 'declined', { files: ['scripts/tasks/handoff.test.ts:12'] }), reason: 'handoff.test.ts is not worth shrinking further' };
    const found = rulingsOn([both], [], ['scripts/tasks/handoff.test.ts']);
    expect(found.reasons).toHaveLength(1);
    expect(found.reasons[0].on).toEqual(['scripts/tasks/handoff.test.ts']);
  });

  it('does not report an open task\'s files as a ruling merely because it carries no reason', () => {
    const openWithFiles = task('open-with-files', [], 'open', { files: ['scripts/tasks/render.ts:1'] });
    expect(rulingsOn([openWithFiles], [], ['scripts/tasks/render.ts']).reasons).toEqual([]);
  });
});

describe('the index a plan check consumes', () => {
  it('keeps concept and task entries distinguishable, because the responses differ', () => {
    const index: Producer[] = producerIndex(manifest, [task('t', ['buff engine'])]);
    expect(index.filter((producer) => producer.kind === 'concept')).toHaveLength(1);
    expect(index.filter((producer) => producer.kind === 'task')).toHaveLength(1);
  });
});
