import { describe, expect, it } from 'vitest';
import { roadmapView } from '../lib/roadmap';
import type { Task } from '../lib/taskStore';
import { fit, packed, renderRoadmap, WIDTH } from './roadmapCmd';

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
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(WIDTH);
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
    expect(text).toContain('1 blocked topics');
    expect(text).toContain('tasks list --deferred --kind task');
    expect(text).toContain('1 open findings');
    expect(text).toContain('tasks list --deferred --kind finding');
  });

  it('says so plainly when nothing is ready rather than printing an empty body', () => {
    const text = render([task({ id: 'a', state: 'in-progress' }), task({ id: 'b', requires: ['a'] })]).join('\n');
    expect(text).toContain('NO TOPICS READY');
  });
});

describe('packed', () => {
  it('wraps to as many lines as the parts need rather than dropping any', () => {
    expect(packed(['aaaa 1', 'bbbb 2', 'cccc 3'], 15)).toEqual(['aaaa 1 · bbbb 2', 'cccc 3']);
  });

  it('keeps a single part too wide for the line rather than losing it', () => {
    expect(packed(['a-very-long-single-entry 9'], 5)).toEqual(['a-very-long-single-entry 9']);
  });
});
