import { describe, expect, it } from 'vitest';
import { roadmapView } from '../lib/roadmap';
import type { Task } from '../lib/taskStore';
import { TERMINAL_WIDTH } from './render';
import { fit, renderRoadmap } from './roadmapCmd';

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

const render = (tasks: Task[]): string[] => renderRoadmap(roadmapView(tasks));

describe('fit', () => {
  it('pads a short value to the column so the next column starts where it should', () => {
    expect(fit('abc', 6)).toBe('abc   ');
  });

  it('cuts an overlong value to exactly the column, ellipsis included', () => {
    expect(fit('abcdefgh', 6)).toBe('abcde…');
  });
});

describe('renderRoadmap', () => {
  it('keeps every line inside the fixed width, whatever the record is called', () => {
    const long = 'a-task-id-far-longer-than-any-column-this-view-reserves-for-one';
    const lines = render([
      task({ id: long, severity: 'medium', system: 'A system name that is itself much too long to fit' }),
      task({ id: 'waiter-with-an-extremely-long-identifier-of-its-own', requires: [long, 'other'] }),
      task({ id: 'a-finding', kind: 'finding', system: 'A system with a very long name indeed for a footer' }),
    ]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(TERMINAL_WIDTH);
  });

  it('leaves a gap between a truncated id and its system', () => {
    const lines = render([task({ id: 'x'.repeat(60), severity: 'low', system: 'Runtime' })]);
    const row = lines.find((line) => line.includes('Runtime'));
    expect(row).toMatch(/… Runtime$/);
  });

  it('prints the counts, the topics and the footer in one call, none behind a flag', () => {
    const text = render([task({ id: 'ready', severity: 'high', system: 'Runtime' }), task({ id: 'debt', kind: 'finding', system: 'Runtime' })]).join('\n');
    expect(text).toContain('open, deferred backlog');
    expect(text).toContain('1 TOPICS READY TO BRANCH ON');
    expect(text).toContain('ready');
    expect(text).toContain('EXCLUDED FROM THE LIST ABOVE');
    expect(text).toContain('Runtime 1');
  });

  it('gives every excluded group a count and a command that expands it', () => {
    const text = render([task({ id: 'a' }), task({ id: 'blocked-one', requires: ['a'] }), task({ id: 'debt', kind: 'finding' })]).join('\n');
    expect(text).toContain('1 blocked (2 listed)');
    expect(text).toContain('tasks list --deferred --kind task');
    expect(text).toContain('1 findings');
    expect(text).toContain('tasks list --deferred --kind finding');
  });

  it('states what its command returns alongside what the row counts', () => {
    const tasks = [task({ id: 'gate' }), task({ id: 'also-ready' }), task({ id: 'waiting', requires: ['gate'] })];
    const row = render(tasks).find((line) => line.includes('listed'));
    expect(row).toContain('1 blocked (3 listed)');
    expect(row).toContain('tasks list --deferred --kind task');
  });

  it('says how much wider than its own count every footer command reaches', () => {
    const tasks = [
      task({ id: 'gate' }),
      task({ id: 'waiting', requires: ['gate'] }),
      task({ id: 'debt', kind: 'finding' }),
      task({ id: 'asked', kind: 'question' }),
    ];
    const rows = render(tasks).filter((line) => line.includes('tasks list --deferred'));
    expect(rows).toEqual([
      expect.stringMatching(/^\s+1 blocked \(2 listed\)\s+tasks list --deferred --kind task$/),
      expect.stringMatching(/^\s+1 findings\s+tasks list --deferred --kind finding$/),
      expect.stringMatching(/^\s+1 other kinds \(4 listed\)\s+tasks list --deferred$/),
    ]);
  });

  it('shows a blocked finding in the footer instead of losing it between the rows', () => {
    const text = render([task({ id: 'gate' }), task({ id: 'held-defect', kind: 'finding', system: 'Runtime', requires: ['gate'] })]).join('\n');
    expect(text).toContain('1 findings');
    expect(text).toContain('Runtime 1');
    expect(text).toContain('0 blocked');
  });

  it('gives a kind that is neither task nor finding its own footer row', () => {
    const text = render([task({ id: 'q', kind: 'question' }), task({ id: 'u', kind: 'undelivered' })]).join('\n');
    expect(text).toContain('2 other kinds');
    expect(text).toMatch(/other kinds\s+2$/m);
  });

  it('leaves the other-kinds row out entirely when there are none', () => {
    expect(render([task({ id: 'a' })]).join('\n')).not.toContain('other kinds');
  });

  it('says so plainly when nothing is ready rather than printing an empty body', () => {
    const text = render([task({ id: 'a', state: 'in-progress' }), task({ id: 'b', requires: ['a'] })]).join('\n');
    expect(text).toContain('NO TOPICS READY');
  });
});
