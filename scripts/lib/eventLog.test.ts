import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendEvents, EVENT_OPS, eventsPathFor, filterEvents, loadEvents, noteProblem, parseEvents, reconcile, type TaskEvent, type ToleratedEvents } from './eventLog';

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

// A record leaving `docs/tasks.jsonl` was, for sixteen ops, a thing the log
// had no verb for: `saveStore` rewrites the whole file from the array it was
// given, so any caller dropping a record removed it and nothing could say
// that it had, or why.
describe('c1, c3, c4: a record cannot leave the store unrecorded', () => {
  const entry = (op: string, id: string | null, note = ''): TaskEvent => event({ op, id, note });
  // A log that read whole. The cases that matter pass their own `skipped`.
  const read = (events: TaskEvent[]): ToleratedEvents => ({ events, skipped: [] });

  it('declares `remove` as an op, so the log can name what left', () => {
    expect(EVENT_OPS).toContain('remove');
  });

  it('returns three disjoint sets over every id the log has seen created', () => {
    const events = [
      entry('add', 'still-here'),
      entry('add', 'dropped-on-purpose'),
      entry('remove', 'dropped-on-purpose', 'removed from the store: scratch'),
      entry('add', 'declined-then-dropped'),
      entry('decline', 'declined-then-dropped', 'not real work'),
      entry('add', 'simply-gone'),
    ];

    const result = reconcile(read(events), ['still-here', 'never-in-the-log']);
    expect(result.accounted).toEqual(['still-here']);
    expect(result.absentExplained).toEqual([
      { id: 'dropped-on-purpose', op: 'remove', note: 'removed from the store: scratch' },
      { id: 'declined-then-dropped', op: 'decline', note: 'not real work' },
    ]);
    expect(result.absentUnexplained).toEqual(['simply-gone']);
    // Disjoint, and exhaustive over what the log created: the first two sets
    // are the proof the third one is the whole finding.
    const created = new Set([...result.accounted, ...result.absentExplained.map((entry) => entry.id), ...result.absentUnexplained]);
    expect(created.size).toBe(4);
  });

  it('reports the coverage it does not have, on a clean run as well as a dirty one', () => {
    const clean = reconcile(read([entry('add', 'known')]), ['known', 'predates-the-log', 'also-predates']);
    expect(clean.absentUnexplained).toEqual([]);
    // The number that stops "reconciled" being a false proof: two of the
    // three store records carry no `add` event, so nothing here can say
    // whether they ever left.
    expect(clean.storeRecords).toBe(3);
    expect(clean.outsideCoverage).toBe(2);
    // The same statement about the other input, and it is why `reconcile` takes
    // the whole read: a caller holding only the events cannot make it.
    expect(clean.logLinesUnread).toBe(0);
  });

  it('states how much of the log it could not read, which is what stops one bad line hiding an absence', () => {
    // The reproduction: `simply-gone`'s `add` line is the one that did not
    // parse, so the id the store is missing is an id this comparison never
    // learns was created. The absence goes from 1 to 0 and the only thing
    // separating that from a clean store is the count of unread lines.
    const blind = reconcile({ events: [entry('add', 'known')], skipped: ['events.jsonl:2: malformed JSONL event record'] }, ['known']);
    expect(blind.absentUnexplained).toEqual([]);
    expect(blind.logLinesUnread).toBe(1);
  });

  it('reads the last explanation, so a record removed and then re-created and removed again reads as removed', () => {
    const events = [entry('add', 'twice'), entry('remove', 'twice', 'first time'), entry('add', 'twice'), entry('remove', 'twice', 'second time')];
    expect(reconcile(read(events), []).absentExplained).toEqual([{ id: 'twice', op: 'remove', note: 'second time' }]);
  });

  it('does not read an explanation from before the id was created again, so a re-filed record that vanishes is the finding', () => {
    // add, remove, add — and then gone. The old rule took the last explaining
    // event wherever it sat and reported this as accounted for under a reason
    // that had already been superseded by the re-filing.
    const refiled = [entry('add', 'twice'), entry('remove', 'twice', 'first time, on purpose'), entry('add', 'twice')];
    expect(reconcile(read(refiled), []).absentExplained).toEqual([]);
    expect(reconcile(read(refiled), []).absentUnexplained).toEqual(['twice']);

    // The same shape through the other explaining op, and past events that
    // explain nothing: a decline, a retriage, then re-filed under the same id.
    const retriaged = [entry('add', 'x'), entry('decline', 'x', 'not real work'), entry('triage', 'x', 'retriaged'), entry('add', 'x')];
    expect(reconcile(read(retriaged), []).absentUnexplained).toEqual(['x']);
  });
});

// The check every verb that writes a note owes, in one place because four of
// them applied the line half by hand and none of them applied this half.
describe('noteProblem', () => {
  it('accepts a note a reader can see', () => {
    expect(noteProblem('a reason', 'a probe, never real work')).toBeNull();
    // However ugly: one punctuation mark, one digit, one combining mark, a run
    // of dashes. The rule is "renders as something", not "reads well".
    for (const ugly of ['.', '0', '\u0301', '\u2014\u2014']) expect(noteProblem('a reason', ugly), JSON.stringify(ugly)).toBeNull();
    // The near miss that must stay legal: an escape sequence carries visible
    // characters, so it is ugly rather than empty. Guarding over-strictness
    // matters as much as guarding the bypass.
    expect(noteProblem('a reason', '\u001b[31m')).toBeNull();
  });

  it('refuses a note that renders as nothing, which truthiness cannot catch', () => {
    // Every caller tests the flag for truthiness first, and every one of these
    // is truthy. The removal reason was the reproduction: `--reason "   "`
    // filed an explanation that explained nothing, and the reconciliation then
    // counted the record as accounted for — an absence explained by blanks.
    for (const blank of [' ', '   ', '\t', '\u200b', '\ufe0f', '\u0000', '\u001b']) {
      expect(noteProblem('a reason', blank), JSON.stringify(blank)).toContain('renders as nothing');
    }
  });

  it('refuses a multi-line note and counts the lines, naming the caller\u2019s own noun', () => {
    // The article comes from the caller. Deriving it here produced
    // "a occurrence", which is what a shared message costs when it guesses.
    expect(noteProblem('an occurrence', 'first\nsecond')).toBe('an occurrence is one line \u2014 this one has 2. Say it here and leave the prose in the commit message');
    expect(noteProblem('a check', 'a\r\nb\r\nc')).toContain('a check is one line \u2014 this one has 3');
  });
});
