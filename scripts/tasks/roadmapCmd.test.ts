import { describe, expect, it } from 'vitest';
import { roadmapView, type ReadSpec } from '../lib/roadmap';
import type { Task } from '../lib/taskStore';
import { TERMINAL_WIDTH } from './render';
import { column, renderRoadmap } from './roadmapCmd';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    clause: null,
    discharges: [],
    requires: [],
    files: [],
    writes: [],
    grant: null,
    produces: [],
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
    ...overrides,
  };
}

const noSpecFiles: ReadSpec = () => null;
const specFiles =
  (docs: Record<string, string>): ReadSpec =>
  (slug) =>
    docs[slug] ?? null;

const GRADED = `# demo

## Deliverable

Proof:

- [c1] the first promise
- [c2] the second promise

## Audit passes

### Pass 2 — 2026-08-04

- base: \`aaa\`
- head: \`bbb\`
- proof 1: met
- proof 2: unmet — the seam is still open
`;

const UNGRADED = `# demo

## Deliverable

Proof:

- [c1] the first promise
- [c2] the second promise
`;

const render = (tasks: Task[], readSpec: ReadSpec = noSpecFiles): string[] => renderRoadmap(roadmapView(tasks, readSpec));
const text = (tasks: Task[], readSpec: ReadSpec = noSpecFiles): string => render(tasks, readSpec).join('\n');
const rowFor = (lines: string[], id: string): string => lines.find((line) => line.includes(id))!;

describe('column', () => {
  it('pads a short value to the column so the next column starts where it should', () => {
    expect(column('abc', 6)).toBe('abc   ');
  });

  it('leaves an overlong value whole and keeps the gap after it', () => {
    expect(column('abcdefgh', 6)).toBe('abcdefgh ');
  });
});

const LONG = 'a-name-far-longer-than-any-column-this-view-reserves-for-one-of-them';

const pathological = (): string[] =>
  render(
    [
      task({ id: `${LONG}-head`, spec: `${LONG}-spec`, system: 'A system name that is itself much too long to fit' }),
      task({ id: `${LONG}-next`, spec: `${LONG}-later`, requires: [`${LONG}-head`] }),
      task({ id: LONG, severity: 'medium', system: 'A system name that is itself much too long to fit' }),
      task({ id: `${LONG}-waiter`, requires: [LONG, 'other'] }),
      task({ id: `${LONG}-defect`, kind: 'finding', severity: 'high', system: 'A system with a very long name indeed for a footer' }),
    ],
    specFiles({ [`${LONG}-spec`]: GRADED }),
  );

describe('renderRoadmap', () => {
  it('never cuts a value to fit, whatever the records are called', () => {
    const body = pathological().join('\n');
    for (const id of [`${LONG}-head`, `${LONG}-spec`, `${LONG}-next`, LONG, `${LONG}-waiter`, `${LONG}-defect`]) expect(body).toContain(id);
    expect(body).toContain('A system name that is itself much too long to fit');
  });

  it('leaves an ellipsis only where a cap says how many records it left out', () => {
    const topics = Array.from({ length: 9 }, (_, index) => task({ id: `topic-${index}` }));
    for (const line of [...pathological(), ...render(topics)]) {
      if (line.includes('…')) expect(line).toMatch(/^\s+… \d+ more — /);
    }
  });

  it('continues a long note under its own branch instead of beside the next one', () => {
    const lines = render([task({ id: 'gate', spec: 'a-branch' }), task({ id: 'a-waiter-with-a-name-of-its-own', requires: ['gate', 'a-second-prerequisite', 'a-third-prerequisite'] }), task({ id: 'a-second-prerequisite' }), task({ id: 'a-third-prerequisite' })]);
    const start = lines.findIndex((line) => line.includes('unblocks'));
    const branchIndent = lines[start].indexOf('└');
    expect(lines[start + 1]).toMatch(new RegExp(`^ {${branchIndent + 3}}\\S`));
    expect(`${lines[start]}${lines[start + 1].trimStart()}`).toContain('a-third-prerequisite)');
  });

  it('fits the report width whenever the words in it can be broken at a space', () => {
    const lines = render(
      [
        task({ id: 'a-decided-branch-with-a-long-name', spec: 'a-spec-slug-of-realistic-length', system: 'Contribution system' }),
        task({ id: 'a-topic-with-a-fairly-long-name', severity: 'medium', system: 'Testing procedure' }),
        task({ id: 'a-waiter', requires: ['a-topic-with-a-fairly-long-name', 'a-decided-branch-with-a-long-name'] }),
        task({ id: 'a-defect-filed-on-2026-08-04-h1', kind: 'finding', severity: 'high', system: 'Build & deployment', title: 'the pipeline has no gate against publishing a non-functional placeholder, and today’s build is exactly that' }),
      ],
      specFiles({ 'a-spec-slug-of-realistic-length': GRADED }),
    );
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(TERMINAL_WIDTH);
  });

  it('shows the work that has been decided instead of collapsing it to a header count', () => {
    const lines = render([task({ id: 'implement-the-seam', spec: 'a-decided-branch' })], specFiles({ 'a-decided-branch': UNGRADED }));
    expect(lines.join('\n')).toContain('DECIDED — 1 spec(s)');
    expect(rowFor(lines, 'a-decided-branch')).toMatch(/^ {2}ready\s+a-decided-branch\s+2 clauses, no pass$/);
  });

  it('carries the clause standing spec show would print, once a pass has graded them apart', () => {
    const lines = render([task({ id: 'a', spec: 'demo' })], specFiles({ demo: GRADED }));
    expect(rowFor(lines, 'demo')).toContain('2 clauses, pass 2');
    expect(lines.join('\n')).toContain('outstanding: c2 (unmet)');
  });

  it('says a decided branch has no readable spec rather than leaving the column blank', () => {
    expect(text([task({ id: 'a', spec: 'vanished' })])).toContain('spec file not found');
  });

  it('indents a chain by its depth, so six decided branches read as a sequence', () => {
    const lines = render([task({ id: 'a', spec: 'first' }), task({ id: 'b', spec: 'second', requires: ['a'] }), task({ id: 'c', spec: 'third', requires: ['b'] })]);
    const indent = (id: string): number => rowFor(lines, id).indexOf(id);
    expect(indent('first')).toBeLessThan(indent('second'));
    expect(indent('second')).toBeLessThan(indent('third'));
  });

  it('states what every decided spec is waiting on, or that nothing blocks it', () => {
    const body = text([task({ id: 'free', spec: 'earlier' }), task({ id: 'held', spec: 'later', requires: ['free', 'never-filed'] })]);
    expect(body).toContain('─ nothing blocks it');
    expect(body).toContain('waits on free (spec earlier), never-filed (no record)');
  });

  it('marks the edge that leaves the decided set for work nobody has specced', () => {
    const body = text([task({ id: 'undecided' }), task({ id: 'held', spec: 'a-branch', requires: ['undecided'] })]);
    expect(body).toContain('waits on undecided (unspecced)');
  });

  it('names the other members when a spec holds more than the one record', () => {
    const body = text([task({ id: 'head', spec: 'a-branch' }), task({ id: 'a-defect', kind: 'finding', spec: 'a-branch' })]);
    expect(body).toContain('holds 2: head, a-defect');
  });

  it('opens with the counts of work still to do and gives the archive one number', () => {
    const lines = render([task({ id: 'ready', spec: 'a-branch' }), task({ id: 'a-topic' }), task({ id: 'shipped', state: 'done' }), task({ id: 'dropped', state: 'declined' })]);
    expect(lines[0]).toContain('2 live records');
    expect(lines.indexOf(rowFor(lines, 'ready '))).toBeLessThan(lines.indexOf(rowFor(lines, 'archived')));
    expect(rowFor(lines, 'archived')).toMatch(/archived\s+2\s+done or declined/);
  });

  it('calls undecided work unspecced, because it needs a planning session and not an implementer', () => {
    const body = text([task({ id: 'a-topic' })]);
    expect(body).toContain('UNSPECCED — 1 topic(s) no spec has decided; each wants a planner');
    expect(body).not.toContain('READY TO BRANCH ON');
  });

  it('states the blocking status of every record it lists, in every section that lists one', () => {
    const lines = render(
      [task({ id: 'gate' }), task({ id: 'decided', spec: 'a-branch' }), task({ id: 'held', requires: ['gate'] }), task({ id: 'a-defect', kind: 'finding', severity: 'high' })],
      specFiles({ 'a-branch': UNGRADED }),
    );
    const sectionOf = (heading: string): string => {
      const rest = lines.slice(lines.findIndex((line) => line.startsWith(heading)) + 1);
      const end = rest.findIndex((line) => /^[A-Z]/.test(line));
      return rest.slice(0, end === -1 ? rest.length : end).join('\n');
    };
    const stated = (body: string): number => (body.match(/nothing blocks it|waits on /g) ?? []).length;
    // One record listed under each heading, so one statement under each.
    expect(['DECIDED', 'UNSPECCED', 'BLOCKED', 'FINDINGS'].map((heading) => stated(sectionOf(heading)))).toEqual([1, 1, 1, 1]);
  });

  it('prints every section in one call, none of them behind a flag', () => {
    const body = text(
      [task({ id: 'decided-work', spec: 'a-branch' }), task({ id: 'a-topic' }), task({ id: 'held', requires: ['a-topic'] }), task({ id: 'a-defect', kind: 'finding', severity: 'high', system: 'Runtime' })],
      specFiles({ 'a-branch': UNGRADED }),
    );
    for (const section of ['ROADMAP', 'DECIDED —', 'UNSPECCED —', 'BLOCKED —', 'FINDINGS —']) expect(body).toContain(section);
  });

  it('names a high finding and states whether anything blocks it', () => {
    const body = text([task({ id: 'gate' }), task({ id: 'urgent', kind: 'finding', severity: 'high', system: 'Runtime', title: 'the pipeline publishes a placeholder' })]);
    expect(body).toContain('urgent');
    expect(body).toContain('nothing blocks it · the pipeline publishes a placeholder');
  });

  it('aggregates only the findings it did not name, so nothing is counted in both places', () => {
    const body = text([
      task({ id: 'urgent', kind: 'finding', severity: 'high', system: 'Runtime' }),
      task({ id: 'minor', kind: 'finding', severity: 'low', system: 'Runtime' }),
      task({ id: 'middling', kind: 'finding', severity: 'medium', system: 'Runtime' }),
    ]);
    expect(body).toContain('FINDINGS — 3 open, 1 could redden an audit');
    expect(body).toContain('the other 2, by system:');
    expect(body).toContain('Runtime 2');
  });

  it('says how many blocked tasks a spec above already accounts for', () => {
    const body = text([task({ id: 'gate' }), task({ id: 'unspecced-waiter', requires: ['gate'] }), task({ id: 'specced-waiter', spec: 'a-branch', requires: ['gate'] })]);
    expect(body).toContain('BLOCKED — 1 unspecced task(s); the other 1 sit in a spec above');
    expect(body).toContain('waits on gate (unspecced)');
  });

  it('states what each cap left out and the command that shows the rest', () => {
    const topics = Array.from({ length: 9 }, (_, index) => task({ id: `topic-${index}` }));
    const body = text(topics);
    expect(body).toContain('… 3 more — `tasks list --deferred --kind task`');
  });

  it('caps how many records one spec claims to unblock rather than printing them all', () => {
    const waiters = Array.from({ length: 5 }, (_, index) => task({ id: `waiter-${index}`, requires: ['gate'] }));
    const body = text([task({ id: 'gate', spec: 'a-branch' }), ...waiters]);
    expect(body).toContain('unblocks 2 more');
  });

  // The record caps bound how many rows the view prints; these bound how tall
  // one row can be. Measured before the fix: a spec of forty members, each
  // waiting on the same forty unspecced records, rendered a 62-line DECIDED
  // section and 476 lines in total from a store one sixth the size of the
  // real one.
  // A note wider than the report continues on the next line, broken at a
  // space, so rejoining the trimmed lines with one space puts every note back
  // the way it was written. The phrases asserted below cannot span two notes.
  const unwrapped = (lines: string[]): string => lines.map((line) => line.trimStart()).join(' ');

  it('caps the members a spec row names, the blockers it waits on, and what a waiter also waits on', () => {
    const gates = Array.from({ length: 8 }, (_, index) => task({ id: `gate-${index}` }));
    const members = Array.from({ length: 8 }, (_, index) => task({ id: `member-${index}`, spec: 'a-branch', requires: gates.map((gate) => gate.id) }));
    const body = unwrapped(render([...members, ...gates]));

    expect(body).toContain('holds 8: member-0, member-1, member-2, and 5 more');
    expect(body).toContain('waits on gate-0 (unspecced), gate-1 (unspecced), gate-2 (unspecced), and 5 more');
    // Every member waits on all eight gates, so each gate's one named waiter
    // carries the other seven under `also waits on`.
    expect(body).toContain('(also waits on gate-1, gate-2, gate-3, and 4 more)');
  });

  it('leaves a list the cap does not reach spelled out in full', () => {
    const body = unwrapped(render([task({ id: 'gate-0' }), task({ id: 'gate-1' }), task({ id: 'held', spec: 'a-branch', requires: ['gate-0', 'gate-1'] })]));
    expect(body).toContain('waits on gate-0 (unspecced), gate-1 (unspecced)');
    expect(body).not.toContain('more');
  });

  it('keeps a single row inside a handful of lines however many ids it carries', () => {
    const gates = Array.from({ length: 40 }, (_, index) => task({ id: `a-prerequisite-record-number-${index}` }));
    const members = Array.from({ length: 40 }, (_, index) => task({ id: `a-member-record-number-${index}`, spec: 'a-branch', requires: gates.map((gate) => gate.id) }));
    const lines = render([...members, ...gates]);
    const decided = lines.indexOf('DECIDED — 1 spec(s), each printed under the decided work it waits on');
    const next = lines.findIndex((line, index) => index > decided && line.startsWith('UNSPECCED'));
    expect(next - decided).toBeLessThan(12);
  });

  it('says so plainly when nothing has been decided and nothing is unspecced', () => {
    const body = text([task({ id: 'gate', state: 'in-progress' }), task({ id: 'waiting', requires: ['gate'] })]);
    expect(body).toContain('DECIDED — nothing: no live record names a spec');
    expect(body).toContain('UNSPECCED — none: every unspecced task is blocked, or the backlog is empty');
  });

  it('answers on an empty store rather than printing an empty page', () => {
    const body = text([]);
    expect(body).toContain('0 live records');
    expect(body).toContain('FINDINGS — 0 open, 0 could redden an audit');
  });
});
