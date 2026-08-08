import { describe, expect, it } from 'vitest';
import { priorArt } from './producers';
import { roadmapView, type ReadSpec } from './roadmap';
import type { Manifest } from './systems';
import { fixNowQueue, listQueue, nearMatches, unreviewedQueue, type Task } from './taskStore';

// The property the-task-store-survives-parallel-branches exists to
// establish, checked directly rather than by naming the sites that used to
// violate it: no function in this directory that orders a Task[] may answer
// differently depending on what order the caller happened to build (or load)
// that array in — whatever `seq` the records carry, sharing one included. A function
// that reads meaning out of array position — by any mechanism, an `.index`
// tie-break, a position-keyed Map, or something not yet invented — fails
// the moment its input is reversed, regardless of the shape the violation
// takes. That is a stronger, harder-to-dodge guarantee than grepping source
// for the one idiom this branch happened to remove, and it is what actually
// broke concurrent branches: two callers building the same records in a
// different order must still agree on the order they are read back in.
//
// This does not discover an entirely new consumer nobody wired in below —
// no test can — but it does mean a regression in any of these six, in any
// shape, is caught without this file needing to know what that shape is.
// Known consumers, as of this branch: taskStore's four queues (fixNowQueue,
// unreviewedQueue, listQueue, nearMatches), roadmap's `topics` ordering, and
// producers' `priorArt` claims ordering.

function task(overrides: Partial<Task> & { id: string; seq: number }): Task {
  return {
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    departure: null,
    clause: null,
    discharges: [],
    requires: [],
    files: [],
    writes: [],
    grant: null,
    fault: null,
    decider: null,
    breaches: [],
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

const ids = (entries: Array<{ id: string }>): string[] => entries.map((entry) => entry.id);
const noSpecFiles: ReadSpec = () => null;
const emptyManifest: Manifest = { unowned: { note: '', paths: [] }, systems: [] };

describe('order independence: every Task[] ordering function in scripts/lib', () => {
  // Five tasks with everything that could otherwise break a tie (severity,
  // score, fan-out, state) held equal, and the first three sharing one `seq`
  // — the live store's shape, where 104 of 792 records share a value with
  // another. A fixture giving every record a distinct `seq` states this
  // property over data the store does not contain: `seq` is max+1 over what
  // one branch can see, so two branches produce the same number by
  // construction and no amount of care at the point of writing one avoids it.
  const base = Array.from({ length: 5 }, (_, i) => task({ id: `t-${i}`, seq: i < 3 ? 1 : i + 1, severity: 'high' }));

  it('fixNowQueue', () => {
    const open = base.map((t) => ({ ...t, state: 'open' as const, spec: 's' }));
    expect(ids(fixNowQueue([...open].reverse(), 's'))).toEqual(ids(fixNowQueue(open, 's')));
  });

  it('unreviewedQueue', () => {
    const unreviewed = base.map((t) => ({ ...t, state: 'unreviewed' as const }));
    expect(ids(unreviewedQueue([...unreviewed].reverse()))).toEqual(ids(unreviewedQueue(unreviewed)));
  });

  it('listQueue', () => {
    const open = base.map((t) => ({ ...t, state: 'open' as const }));
    expect(ids(listQueue([...open].reverse()))).toEqual(ids(listQueue(open)));
  });

  it('nearMatches', () => {
    const named = base.map((t, i) => ({ ...t, id: `shared-${i}` }));
    expect(ids(nearMatches('shared', [...named].reverse()))).toEqual(ids(nearMatches('shared', named)));
  });

  it('roadmapView topics', () => {
    const unspecced = base.map((t) => ({ ...t, state: 'open' as const, spec: null }));
    expect(ids(roadmapView([...unspecced].reverse(), noSpecFiles).topics.map((entry) => entry.task))).toEqual(ids(roadmapView(unspecced, noSpecFiles).topics.map((entry) => entry.task)));
  });

  it('priorArt claims', () => {
    const claimants = base.map((t) => ({ ...t, writes: ['src/runtime/tied.ts'] }));
    const claimIds = (tasks: Task[]): string[] => priorArt(emptyManifest, tasks, ['src/runtime/tied.ts']).claims.map((claim) => claim.task.id);
    expect(claimIds([...claimants].reverse())).toEqual(claimIds(claimants));
  });
});
