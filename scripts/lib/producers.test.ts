import { describe, expect, it } from 'vitest';
import { findProducers, matchStrength, producerIndex, type Producer } from './producers';
import type { Manifest } from './systems';
import type { Task } from './taskStore';

function task(id: string, produces: string[], state: Task['state'] = 'done'): Task {
  return {
    id,
    title: id,
    kind: 'task',
    state,
    severity: null,
    system: null,
    spec: null,
    clause: null,
    requires: [],
    files: [],
    writes: [],
    produces,
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
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

  it('answers with nothing for a capability nobody claims', () => {
    expect(findProducers('quest journal', index)).toEqual([]);
  });
});

describe('the index a plan check consumes', () => {
  it('keeps concept and task entries distinguishable, because the responses differ', () => {
    const index: Producer[] = producerIndex(manifest, [task('t', ['buff engine'])]);
    expect(index.filter((producer) => producer.kind === 'concept')).toHaveLength(1);
    expect(index.filter((producer) => producer.kind === 'task')).toHaveLength(1);
  });
});
