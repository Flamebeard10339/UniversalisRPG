import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendEvents, eventsPathFor, filterEvents, loadEvents, parseEvents, type TaskEvent } from './eventLog';

function event(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    t: '2026-08-02T10:00:00.000Z',
    by: 'worker',
    branch: 'demo-spec',
    head: '0123456789abcdef0123456789abcdef01234567',
    op: 'done',
    id: 'a-task',
    system: 'Runtime',
    spec: 'demo-spec',
    note: 'closed it',
    ...overrides,
  };
}

function tempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-events-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('eventsPathFor', () => {
  // The property the whole design rests on: a test given a scratch store
  // cannot append to the project's history, because there is no way to
  // configure the two apart.
  it('puts the log beside whichever store it was given', () => {
    expect(eventsPathFor(path.join('docs', 'tasks.jsonl'))).toBe(path.join('docs', 'events.jsonl'));
    expect(eventsPathFor(path.join('/tmp', 'scratch', 'tasks.jsonl'))).toBe(path.join('/tmp', 'scratch', 'events.jsonl'));
    expect(eventsPathFor(path.join('/tmp', 'scratch', 'tasks.jsonl'))).not.toBe(eventsPathFor(path.join('docs', 'tasks.jsonl')));
  });

  it('handles a store path with no directory part', () => {
    expect(eventsPathFor('tasks.jsonl')).toBe('events.jsonl');
  });
});

describe('appendEvents', () => {
  it('creates the file and appends without reading or rewriting what is there', () => {
    tempDir((dir) => {
      const file = path.join(dir, 'events.jsonl');
      appendEvents([event({ id: 'first' })], file);
      appendEvents([event({ id: 'second' }), event({ id: 'third' })], file);

      const lines = readFileSync(file, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(lines.map((line) => (JSON.parse(line) as TaskEvent).id)).toEqual(['first', 'second', 'third']);
    });
  });

  it('writes nothing at all when given no events', () => {
    tempDir((dir) => {
      const file = path.join(dir, 'events.jsonl');
      appendEvents([], file);
      expect(loadEvents(file)).toEqual({ events: [], skipped: [] });
    });
  });

  it('renders every field in one fixed order', () => {
    tempDir((dir) => {
      const file = path.join(dir, 'events.jsonl');
      appendEvents([event({ id: null, system: null, spec: null, by: null, head: null })], file);
      expect(readFileSync(file, 'utf8').trim()).toBe('{"t":"2026-08-02T10:00:00.000Z","by":null,"branch":"demo-spec","head":null,"op":"done","id":null,"system":null,"spec":null,"note":"closed it"}');
    });
  });
});

describe('parseEvents', () => {
  it('round-trips an appended event', () => {
    tempDir((dir) => {
      const file = path.join(dir, 'events.jsonl');
      const written = event();
      appendEvents([written], file);
      expect(loadEvents(file)).toEqual({ events: [written], skipped: [] });
    });
  });

  it('answers with the lines it could read and names the ones it could not', () => {
    const { events, skipped } = parseEvents(`${JSON.stringify(event({ id: 'good' }))}\nnot json at all\n${JSON.stringify({ t: '2026-08-02T10:00:00.000Z' })}\n`, 'log');
    expect(events.map((entry) => entry.id)).toEqual(['good']);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toContain('log:2');
    expect(skipped[1]).toContain('log:3: event requires branch');
  });

  it('reads a missing log as empty rather than failing', () => {
    tempDir((dir) => {
      expect(loadEvents(path.join(dir, 'events.jsonl'))).toEqual({ events: [], skipped: [] });
    });
  });

  it('keeps an event that names a system with no task', () => {
    const { events } = parseEvents(`${JSON.stringify(event({ id: null, op: 'decision', note: 'the gate is deleted, not guarded' }))}\n`, 'log');
    expect(events[0].id).toBeNull();
    expect(events[0].system).toBe('Runtime');
  });

  it('ignores a field a later version added rather than refusing the line', () => {
    const { events, skipped } = parseEvents(`${JSON.stringify({ ...event(), unheardOf: 'value' })}\n`, 'log');
    expect(skipped).toEqual([]);
    expect(events).toHaveLength(1);
  });
});

describe('filterEvents', () => {
  const events = [
    event({ id: 'a-task', op: 'add', system: 'Runtime', spec: 'demo-spec', note: 'created it' }),
    event({ id: 'a-task', op: 'decision', system: 'Runtime', spec: 'demo-spec', note: 'union merge is right for an append-only log' }),
    event({ id: 'b-task', op: 'add', system: 'UI', spec: 'other-spec', note: 'created it' }),
    event({ id: null, op: 'decision', system: 'UI', spec: null, note: 'the modal renders unconditionally' }),
  ];

  it('returns everything when nothing is asked', () => {
    expect(filterEvents(events)).toHaveLength(4);
  });

  it('filters by id, system, spec and op independently', () => {
    expect(filterEvents(events, { id: 'a-task' })).toHaveLength(2);
    expect(filterEvents(events, { system: 'UI' })).toHaveLength(2);
    expect(filterEvents(events, { spec: 'demo-spec' })).toHaveLength(2);
    expect(filterEvents(events, { op: 'decision' })).toHaveLength(2);
  });

  it('ANDs composed filters instead of widening them', () => {
    expect(filterEvents(events, { op: 'decision', system: 'UI' }).map((entry) => entry.note)).toEqual(['the modal renders unconditionally']);
    expect(filterEvents(events, { op: 'decision', system: 'Runtime', text: 'union' })).toHaveLength(1);
    expect(filterEvents(events, { op: 'add', system: 'Runtime', spec: 'other-spec' })).toEqual([]);
  });

  it('matches free text across the record, case-insensitively', () => {
    expect(filterEvents(events, { text: 'UNION' })).toHaveLength(1);
    expect(filterEvents(events, { text: 'b-task' })).toHaveLength(1);
    expect(filterEvents(events, { text: 'demo-spec' })).toHaveLength(2);
  });

  // Provenance is not a topic: a sha in the free-text index would answer
  // "what was decided about X" with every event that shares a commit.
  it('does not match free text against the head sha or the branch', () => {
    expect(filterEvents(events, { text: '0123456789abcdef' })).toEqual([]);
  });

  it('finds a project-level decision by system when the id is null', () => {
    const found = filterEvents(events, { system: 'UI', op: 'decision' });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBeNull();
  });
});

describe('the log is not derived from present-day state', () => {
  // The failure the snapshot exists to prevent: an event written while a
  // task sat in one spec keeps saying so after the task is re-pointed, which
  // happened repeatedly on this branch.
  it('keeps the spec a record carried at the time even after the record moves', () => {
    tempDir((dir) => {
      const file = path.join(dir, 'events.jsonl');
      appendEvents([event({ id: 'moved', spec: 'old-spec', note: 'opened under the old spec' })], file);
      appendEvents([event({ id: 'moved', spec: 'new-spec', op: 'spec-add', note: 'moved to the new spec' })], file);

      writeFileSync(path.join(dir, 'tasks.jsonl'), JSON.stringify({ id: 'moved', spec: 'new-spec' }), 'utf8');

      const { events } = loadEvents(file);
      expect(filterEvents(events, { spec: 'old-spec' })).toHaveLength(1);
      expect(filterEvents(events, { spec: 'new-spec' })).toHaveLength(1);
    });
  });
});
