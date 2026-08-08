import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, type Run } from './cliFixtures';

// A refused write leaves no store at all, which is the same answer as an
// empty one and must not be an ENOENT in the middle of an assertion.
function storeText(dir: string): string {
  const file = path.join(dir, 'tasks.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

// The exact bytes the store holds for one record. c3 turns on this: if
// blocking were stored, releasing a hold would have to change them.
function storedLine(dir: string, id: string): string {
  const line = storeText(dir)
    .split('\n')
    .find((candidate) => candidate.includes(`"id":${JSON.stringify(id)}`));
  if (line === undefined) throw new Error(`no stored record for ${id}`);
  return line;
}

const storedField = (dir: string, id: string, field: string): unknown => (JSON.parse(storedLine(dir, id)) as Record<string, unknown>)[field];

const findingIds = (dir: string): string[] =>
  storeText(dir)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { id: string; kind: string })
    .filter((task) => task.kind === 'finding')
    .map((task) => task.id);

const legacyAuditDoc = (dir: string): string => {
  const docPath = path.join(dir, 'runtime-2026-01-01.md');
  writeFileSync(docPath, '## H1 — an imported finding\n\nsrc/runtime/save.ts:88 is where it lives.\n', 'utf8');
  return docPath;
};

// The four write routes that can create a record, named here so the clause's
// "every route" is a list a reader can check rather than a claim. Each is
// exercised twice below: refused with no fault, and carrying the one it was
// given.
describe('c2: a record carries its fault, required where it is assembled', () => {
  it('add refuses a finding with no fault, and writes nothing', () => {
    fixture(({ tasks, dir }) => {
      const refused = tasks('add', 'an unclassified finding', '--id', 'unclassified', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a finding record needs --fault tooling|contract|nobody');
      expect(storeText(dir).trim()).toBe('');
    });
  });

  it('add records each of the three faults, and refuses anything else', () => {
    fixture(({ tasks, dir }) => {
      for (const fault of ['tooling', 'contract', 'nobody']) {
        const added = tasks('add', `a ${fault} finding`, '--id', `f-${fault}`, '--kind', 'finding', '--fault', fault, '--severity', 'low', '--deliverable', 'fix it');
        expect(added.status, fault).toBe(0);
        expect(storedField(dir, `f-${fault}`, 'fault')).toBe(fault);
      }
      const refused = tasks('add', 'a mystery finding', '--id', 'f-mystery', '--kind', 'finding', '--fault', 'the weather', '--severity', 'low', '--deliverable', 'fix it');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('--fault must be one of tooling, contract, nobody');
    });
  });

  it('add refuses a fault on a plain task, so no route can smuggle one onto planned work', () => {
    fixture(({ tasks }) => {
      const refused = tasks('add', 'ordinary work', '--id', 'ordinary', '--fault', 'tooling');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a task record carries no fault');
    });
  });

  it('question refuses with no fault, and carries the one it was given', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');

      const refused = tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a question record needs --fault tooling|contract|nobody');

      expect(tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'nobody').status).toBe(0);
      expect(storedField(dir, 'which-way', 'fault')).toBe('nobody');
    });
  });

  it('import refuses a legacy document with no fault, and stamps the one it was given onto every finding in it', () => {
    fixture(({ tasks, dir }) => {
      const docPath = legacyAuditDoc(dir);

      const refused = tasks('import', docPath);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a finding record needs --fault tooling|contract|nobody');
      expect(storeText(dir).trim()).toBe('');

      expect(tasks('import', docPath, '--fault', 'contract').status).toBe(0);
      expect(storedField(dir, 'runtime-2026-01-01-h1', 'fault')).toBe('contract');
    });
  });

  it('an audit pass refuses a finding with no fault, recording neither the finding nor the pass', async () => {
    await fixture(async ({ audit, dir }) => {
      const refused = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=checked', '--proof', '2=met', '--evidence', '2=checked', '--finding', 'an unclassified bug', '--severity', 'high', '--deliverable', 'guard it', '--evidence', 'save.ts:88 dereferences first');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a finding record needs --fault tooling|contract|nobody');
      expect(refused.stderr).toContain('an unclassified bug');
      expect(findingIds(dir)).toEqual([]);
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');

      const recorded = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=checked', '--proof', '2=met', '--evidence', '2=checked', '--finding', 'a classified bug', '--severity', 'high', '--fault', 'tooling', '--deliverable', 'guard it', '--evidence', 'save.ts:88 dereferences first');
      expect(recorded.status).toBe(0);
      expect(findingIds(dir).map((id) => storedField(dir, id, 'fault'))).toEqual(['tooling']);
    });
  });

  it('a late finding, filed with no proofs and appending no pass, is refused the same way', async () => {
    await fixture(async ({ audit, dir }) => {
      const refused = await audit('demo-spec', '--finding', 'a late bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'observed live');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a finding record needs --fault tooling|contract|nobody');
      expect(findingIds(dir)).toEqual([]);
    });
  });

  it('an undelivered record created for an unmet clause carries no fault, because a clause verdict is not a report', async () => {
    await fixture(async ({ audit, dir }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--proof', '2=met', '--evidence', '2=checked');
      expect(storedField(dir, 'demo-spec-clause-1', 'kind')).toBe('undelivered');
      expect(storedField(dir, 'demo-spec-clause-1', 'fault')).toBeNull();
    });
  });

  it('edit reclassifies a fault and still refuses one on a kind that carries none', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--fault', 'tooling', '--severity', 'low', '--deliverable', 'fix it');
      expect(tasks('edit', 'a-finding', '--fault', 'nobody').status).toBe(0);
      expect(storedField(dir, 'a-finding', 'fault')).toBe('nobody');

      tasks('add', 'ordinary work', '--id', 'ordinary');
      const refused = tasks('edit', 'ordinary', '--fault', 'tooling');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a task record carries no fault');
      expect(storedField(dir, 'ordinary', 'fault')).toBeNull();
    });
  });

  it('a record written before the channel existed reads as unclassified, which is not the same answer as nobody', () => {
    fixture(({ tasks, dir }) => {
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `${JSON.stringify({ id: 'legacy', seq: 1, title: 'a finding from before', kind: 'finding', state: 'unreviewed', severity: 'low', system: null, spec: null, clause: null, discharges: [], requires: [], files: [], writes: [], grant: null, produces: [], deliverable: 'fix it', evidence: 'x', source: null, reason: null, trigger: null, closed: null, closedCommit: null, claimed: null, claimedBy: null })}\n`, 'utf8');

      expect(tasks('show', 'legacy').status).toBe(0);
      expect(tasks('show', 'legacy').stdout).not.toContain('fault:');

      // Through a write, so the claim is about what the line parses to and
      // not about a key the file happens not to carry yet.
      expect(tasks('edit', 'legacy', '--evidence', 'still unclassified').status).toBe(0);
      expect(storedField(dir, 'legacy', 'fault')).toBeNull();
    });
  });
});

describe('c3: blocking is derived, never stored', () => {
  it('a released record is byte-identical to the held one, so nothing about the hold was ever written to it', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');
      tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'nobody');

      const held = storedLine(dir, 'held-work');
      expect(tasks('show', 'held-work').stdout).toContain('BLOCKED');

      tasks('done', 'which-way');
      expect(storedLine(dir, 'held-work')).toBe(held);
      expect(tasks('show', 'held-work').stdout).not.toContain('BLOCKED');
    });
  });

  it('a declined question releases the hold exactly as an answered one does', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');
      tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'nobody');
      const held = storedLine(dir, 'held-work');

      const dismissed = tasks('decline', 'which-way', '--reason', 'the question dissolved once the region was read');
      expect(dismissed.status).toBe(0);
      expect(dismissed.stdout).toContain('released 1 record(s) that waited on it: held-work');
      expect(storedLine(dir, 'held-work')).toBe(held);
      expect(tasks('show', 'held-work').stdout).not.toContain('BLOCKED');
    });
  });

  it('the record carries no field that stores whether it is blocked, only the requirement that derives it', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');
      tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'nobody');

      const stored = JSON.parse(storedLine(dir, 'held-work')) as Record<string, unknown>;
      expect(Object.keys(stored).filter((key) => /block|halt|held|waiting/i.test(key))).toEqual([]);
      expect(stored.requires).toEqual(['which-way']);
    });
  });
});

describe('c4: a blocking question is filed, addressed, and holds only what depends on it', () => {
  it('files a question against the record it is working, addressed to the role whose decision would hold', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');
      const asked = tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'contract', '--evidence', 'the spec names a threshold where the case wants an invariant');

      expect(asked.status).toBe(0);
      expect(asked.stdout).toContain('for the planner to decide, fault contract');
      expect(asked.stdout).toContain('1 record(s) now wait on it: held-work');
      expect(storedField(dir, 'which-way', 'decider')).toBe('planner');
      expect(storedField(dir, 'which-way', 'kind')).toBe('question');
      expect(storedField(dir, 'which-way', 'spec')).toBe('demo-spec');
    });
  });

  it('refuses a question with no decider, so no route can park one with no destination', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');

      const unaddressed = tasks('question', 'Which way?', '--blocks', 'held-work', '--fault', 'contract');
      expect(unaddressed.status).toBe(1);
      expect(unaddressed.stderr).toContain('a question record needs --decider worker|planner|author');
      expect(unaddressed.stderr).toContain('a stall with extra steps');

      const misaddressed = tasks('question', 'Which way?', '--blocks', 'held-work', '--fault', 'contract', '--decider', 'somebody');
      expect(misaddressed.status).toBe(1);
      expect(misaddressed.stderr).toContain('--decider must be one of worker, planner, author');
      expect(storedField(dir, 'held-work', 'requires')).toEqual([]);
    });
  });

  it('halts exactly what depends on it while the rest of the spec proceeds', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec', '--severity', 'high');
      tasks('add', 'unrelated work', '--id', 'free-work', '--spec', 'demo-spec', '--severity', 'high');
      tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'contract');

      const next = tasks('next');
      expect(next.stdout).not.toContain('held-work');
      expect(next.stdout).toContain('free-work');

      tasks('done', 'free-work');
      const afterwards = tasks('next');
      expect(afterwards.stdout).toContain('which-way');
      expect(afterwards.stdout).toContain('for the planner');
      expect(afterwards.stdout).not.toContain('held-work  [');
    });
  });

  it('answering it releases the hold and asks for the answer where the next reader finds it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');
      tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'author', '--fault', 'nobody');

      const answered = tasks('done', 'which-way');
      expect(answered.status).toBe(0);
      expect(answered.stdout).toContain('released 1 record(s) that waited on it: held-work');
      expect(answered.stdout).toContain('this was a question for the author');
      expect(answered.stdout).toContain('tasks decision "<the answer>" --id which-way');
      expect(tasks('next').stdout).toContain('held-work');
    });
  });

  it('holds several records at once, and refuses to hold a closed one', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'first', '--id', 'first-work', '--spec', 'demo-spec');
      tasks('add', 'second', '--id', 'second-work', '--spec', 'demo-spec');
      tasks('add', 'already finished', '--id', 'finished-work', '--spec', 'demo-spec');
      tasks('done', 'finished-work');

      const refused = tasks('question', 'Which way?', '--blocks', 'first-work,finished-work', '--decider', 'planner', '--fault', 'contract');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('finished-work is done');
      expect(storedField(dir, 'first-work', 'requires')).toEqual([]);

      const asked = tasks('question', 'Which way?', '--blocks', 'first-work,second-work', '--decider', 'planner', '--fault', 'contract');
      expect(asked.status).toBe(0);
      expect(storedField(dir, 'first-work', 'requires')).toEqual(['which-way']);
      expect(storedField(dir, 'second-work', 'requires')).toEqual(['which-way']);
    });
  });

  it('is filed outside every spec when the records it holds up disagree about which spec they are in', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'member-work', '--spec', 'demo-spec');
      tasks('add', 'a deferred record', '--id', 'deferred-work');

      const asked = tasks('question', 'Which way?', '--blocks', 'member-work,deferred-work', '--decider', 'author', '--fault', 'nobody');
      expect(asked.status).toBe(0);
      expect(asked.stdout).toContain('name different specs, so the question is filed outside every spec');
      expect(storedField(dir, 'which-way', 'spec')).toBeNull();
    });
  });

  it('records the ask and the hold in the event log, so a run\'s questions are countable', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec');
      tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', 'planner', '--fault', 'contract', '--actor', 'worker-a');

      const notes = readFileSync(path.join(dir, 'events.jsonl'), 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as { id: string | null; note: string });
      expect(notes.some((event) => event.id === 'which-way' && event.note.includes('asked as a question for the planner, fault contract'))).toBe(true);
      expect(notes.some((event) => event.id === 'held-work' && event.note.includes('waits on question which-way'))).toBe(true);
    });
  });
});

// The half of c4 the record-shape slice could not reach: `decider` was
// stored, displayed and read by nothing, so every route that hands out work
// handed out a question addressed to the author as work to implement.
describe('c4: a question addressed away from the worker is never handed back as work', () => {
  const askAuthor = (tasks: (...args: string[]) => Run, decider = 'author'): void => {
    tasks('add', 'the work it holds up', '--id', 'held-work', '--spec', 'demo-spec', '--severity', 'high');
    tasks('question', 'Which way?', '--blocks', 'held-work', '--decider', decider, '--fault', 'nobody');
  };

  it('briefs it as a decision to make, not as a record to implement', () => {
    fixture(({ tasks }) => {
      askAuthor(tasks);

      const brief = tasks('work-prompt', 'which-way');
      expect(brief.status).toBe(0);
      expect(brief.stdout).toContain('which-way is a question for the author to decide. It is not work');
      expect(brief.stdout).not.toContain('You are implementing');
      // The three obligations an implementation brief prints, and none of
      // them is a thing an answer involves.
      expect(brief.stdout).not.toContain('--grant commitment');
      expect(brief.stdout).not.toContain('Write grant');
      expect(brief.stdout).not.toContain('commit after each logical chunk');
    });
  });

  it('names what waits on it and the two commands that release them', () => {
    fixture(({ tasks }) => {
      askAuthor(tasks);

      const brief = tasks('work-prompt', 'which-way');
      expect(brief.stdout).toContain('1 record(s) wait on it and move the moment it closes: held-work');
      expect(brief.stdout).toContain('tasks -- decision "<the answer>" --id which-way');
      expect(brief.stdout).toContain('tasks -- done which-way');
      expect(brief.stdout).toContain('If you are not, stop here and say so');
    });
  });

  it('still briefs a worker-addressed question as work, because there the reader is the decider', () => {
    fixture(({ tasks }) => {
      askAuthor(tasks, 'worker');

      const brief = tasks('work-prompt', 'which-way');
      expect(brief.stdout).toContain('You are implementing which-way');
    });
  });

  it('does not take the head of the work queue, so the work behind it is still dispatched', () => {
    fixture(({ tasks }) => {
      askAuthor(tasks);
      // A question filed high outranks every other member in `fixNowQueue`,
      // so without the filter the spec route briefs it and the real work
      // waits behind a record nobody dispatched is going to implement.
      tasks('question', 'And which way here?', '--blocks', 'held-work', '--decider', 'author', '--fault', 'nobody', '--severity', 'high');
      tasks('add', 'work nothing holds up', '--id', 'free-work', '--spec', 'demo-spec', '--severity', 'medium');

      const brief = tasks('work-prompt', 'demo-spec');
      expect(brief.stdout).toContain('resolved the spec demo-spec -> free-work');
      expect(brief.stdout).toContain('You are implementing free-work');
      expect(brief.stdout).not.toContain('You are implementing and-which-way-here');
    });
  });

  it('is named to the dispatcher rather than hidden, so it can still be routed', () => {
    fixture(({ tasks }) => {
      askAuthor(tasks);
      // held-work is blocked by the question, so the question is the only
      // open unblocked member: filtering it leaves the spec with nothing to
      // brief, and saying only that would strand it.
      const brief = tasks('work-prompt', 'demo-spec');
      expect(brief.stdout).toContain('demo-spec also holds 1 question(s) that are not work');
      expect(brief.stdout).toContain('which-way — for the author: Which way?');
      expect(brief.stdout).toContain('demo-spec is a spec, and it has no open, unblocked member to brief');
      expect(brief.stdout).not.toContain('You are implementing which-way');
    });
  });

  it('reads the kind as well as the addressee, so a stray decider on a finding does not make it unclaimable', () => {
    fixture(({ tasks, dir }) => {
      // The store validates a decider's value and not the kind that carries
      // it, so a hand-edit or a merge can leave one on a finding. That record
      // is still work, and `start` must still take it.
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `${JSON.stringify({ id: 'stray', seq: 1, title: 'a finding carrying a decider', kind: 'finding', fault: 'tooling', decider: 'author', state: 'open', severity: 'low', system: null, spec: null, clause: null, discharges: [], requires: [], files: [], writes: [], grant: null, produces: [], deliverable: 'fix it', evidence: 'x', source: null, reason: null, trigger: null, closed: null, closedCommit: null, claimed: null, claimedBy: null })}\n`, 'utf8');

      expect(tasks('start', 'stray', '--actor', 'worker-a').status).toBe(0);
      expect(storedField(dir, 'stray', 'state')).toBe('in-progress');
    });
  });

  it('refuses to be claimed as work, so the silent start is gone', () => {
    fixture(({ tasks, dir }) => {
      askAuthor(tasks);

      const refused = tasks('start', 'which-way', '--actor', 'worker-a');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('which-way is a question for the author to decide, not work to claim');
      expect(storedField(dir, 'which-way', 'state')).toBe('open');
      expect(storedField(dir, 'which-way', 'claimedBy')).toBe(null);
    });
  });

  it('tells a decider who recorded the answer that the hold is still on', () => {
    fixture(({ tasks }) => {
      askAuthor(tasks);

      const recorded = tasks('decision', 'go left', '--id', 'which-way');
      expect(recorded.status).toBe(0);
      expect(recorded.stdout).toContain('which-way is still open, so the author\'s answer is recorded and nothing has moved — 1 record(s) still wait on it: held-work');
      expect(recorded.stdout).toContain('`tasks done which-way` releases them');

      // And says nothing once the question is closed, which is the state
      // where the advice would be wrong.
      tasks('done', 'which-way');
      expect(tasks('decision', 'and here is why', '--id', 'which-way').stdout).not.toContain('still open');
    });
  });
});

describe('the channel refuses the two shapes a second answer would take', () => {
  it('add no longer creates a question at all, so there is one route and it always wires the hold', () => {
    fixture(({ tasks, dir }) => {
      const refused: Run = tasks('add', 'Which way?', '--kind', 'question');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('tasks question');
      expect(refused.stderr).toContain('--blocks');
      expect(storeText(dir).trim()).toBe('');
    });
  });

  it('refuses a decider on a finding, so the addressee cannot drift onto a record nobody decides', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--fault', 'tooling', '--severity', 'low', '--deliverable', 'fix it');
      const refused = tasks('edit', 'a-finding', '--decider', 'planner');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('a finding record carries no decider');
    });
  });
});

const events = (dir: string): Array<{ op: string; id: string | null; note: string }> =>
  readFileSync(path.join(dir, 'events.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { op: string; id: string | null; note: string })
    .map(({ op, id, note }) => ({ op, id, note }));

const fileAFriction = (tasks: (...args: string[]) => Run, id: string, where = 'scripts/tasks/audit.ts:88'): Run =>
  tasks('add', `the manifest never generates (${id})`, '--id', id, '--kind', 'finding', '--fault', 'tooling', '--severity', 'medium', '--deliverable', 'generate it', '--files', where);

describe('c10: a recurrence is a new observation, never an edit', () => {
  it('appends an occurrence naming the record, and leaves the record byte-identical', () => {
    fixture(({ tasks, dir }) => {
      fileAFriction(tasks, 'manifest-friction');
      const before = storedLine(dir, 'manifest-friction');

      const first = tasks('recur', 'manifest-friction', '--note', 'ten minutes, pass 2 of demo-spec');
      expect(first.status).toBe(0);
      expect(first.stdout).toContain('recorded occurrence 1 of manifest-friction');

      // The load-bearing assertion: if anything were incremented or
      // overwritten, this line would differ.
      expect(storedLine(dir, 'manifest-friction')).toBe(before);
      expect(events(dir).filter((event) => event.op === 'recur')).toEqual([{ op: 'recur', id: 'manifest-friction', note: 'ten minutes, pass 2 of demo-spec' }]);
    });
  });

  it('keeps what each occurrence cost, so N observations are not one description overwritten N times', () => {
    fixture(({ tasks, dir }) => {
      fileAFriction(tasks, 'manifest-friction');
      tasks('recur', 'manifest-friction', '--note', 'pass 2, ten minutes');
      const second = tasks('recur', 'manifest-friction', '--note', 'pass 3, twenty minutes and a round trip');

      expect(second.stdout).toContain('recorded occurrence 2 of manifest-friction');
      expect(events(dir).filter((event) => event.op === 'recur').map((event) => event.note)).toEqual(['pass 2, ten minutes', 'pass 3, twenty minutes and a round trip']);
    });
  });

  it('derives the count from the occurrences, so a log two branches both appended to answers with both', () => {
    fixture(({ tasks, dir }) => {
      fileAFriction(tasks, 'manifest-friction');
      tasks('recur', 'manifest-friction', '--note', 'ours');
      // What `merge=union` leaves behind: the other branch's line, appended.
      // A counter field would have needed a resolution git cannot compute.
      const log = path.join(dir, 'events.jsonl');
      const theirs = JSON.stringify({ t: '2026-08-08T00:00:00.000Z', by: 'worker-b', branch: 'other', head: null, op: 'recur', id: 'manifest-friction', system: null, spec: null, note: 'theirs' });
      writeFileSync(log, `${readFileSync(log, 'utf8')}${theirs}\n`, 'utf8');

      expect(tasks('recur', 'manifest-friction', '--note', 'ours again').stdout).toContain('recorded occurrence 3 of manifest-friction');
    });
  });

  it('is readable back through the op it was filed under, which is the route the append itself names', () => {
    fixture(({ tasks }) => {
      fileAFriction(tasks, 'manifest-friction');
      tasks('recur', 'manifest-friction', '--note', 'pass 2, ten minutes');
      tasks('recur', 'manifest-friction', '--note', 'pass 3, twenty minutes');
      tasks('note', 'unrelated prose', '--id', 'manifest-friction');

      const read = tasks('log', '--op', 'recur', '--id', 'manifest-friction');
      expect(read.status).toBe(0);
      expect(read.stdout).toContain('pass 2, ten minutes');
      expect(read.stdout).toContain('pass 3, twenty minutes');
      expect(read.stdout).not.toContain('unrelated prose');
    });
  });

  it('requires a note, because an occurrence with nothing to say is the increment this clause refuses', () => {
    fixture(({ tasks, dir }) => {
      fileAFriction(tasks, 'manifest-friction');

      const refused = tasks('recur', 'manifest-friction');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('usage: tasks recur <id> --note');
      expect(events(dir).some((event) => event.op === 'recur')).toBe(false);
    });
  });

  it('refuses a kind that reports no cost, so no count attaches where no query reads one', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'ordinary work', '--id', 'ordinary');

      const refused = tasks('recur', 'ordinary', '--note', 'it cost something');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('ordinary is a task, and only a finding or question records what the work cost');
      expect(events(dir).some((event) => event.op === 'recur')).toBe(false);
    });
  });

  it('records a recurrence after the record closed, and says that is what it is', () => {
    fixture(({ tasks }) => {
      fileAFriction(tasks, 'manifest-friction');
      tasks('promote', 'manifest-friction', '--spec', 'demo-spec');
      tasks('done', 'manifest-friction');

      const recurred = tasks('recur', 'manifest-friction', '--note', 'still happening a week later');
      expect(recurred.status).toBe(0);
      expect(recurred.stdout).toContain('is done, so this occurrence is a recurrence after the record closed');
    });
  });
});

describe('c11: filing shows what already claims the path, and never refuses', () => {
  it('shows the sibling claim on a finding that names its region in files and grants nothing', () => {
    fixture(({ tasks, dir }) => {
      fileAFriction(tasks, 'first-sighting');

      const second = fileAFriction(tasks, 'second-sighting');
      // Never refuses: the record is filed, and the prompt comes after it.
      expect(second.status).toBe(0);
      expect(storedLine(dir, 'second-sighting')).toContain('"id":"second-sighting"');
      expect(second.stdout).toContain('prior art on scripts/tasks/audit.ts');
      expect(second.stdout).toContain('first-sighting');
    });
  });

  it('matches by path and never by title, so two authors wording it differently still meet', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the mutation manifest will not generate', '--id', 'worded-one-way', '--kind', 'finding', '--fault', 'tooling', '--severity', 'medium', '--deliverable', 'fix it', '--files', 'scripts/tasks/audit.ts:88');

      const second = tasks('add', 'proof: vitest names a file with no test', '--id', 'worded-another-way', '--kind', 'finding', '--fault', 'tooling', '--severity', 'medium', '--deliverable', 'fix it', '--files', 'scripts/tasks/audit.ts:412');
      expect(second.stdout).toContain('worded-one-way');
    });
  });

  it('offers the occurrence as the deliberate path and filing as the cheap one', () => {
    fixture(({ tasks }) => {
      fileAFriction(tasks, 'first-sighting');

      const second = fileAFriction(tasks, 'second-sighting');
      expect(second.stdout).toContain('tasks recur <its id>');
      expect(second.stdout).toContain('tasks decline second-sighting');
      // Nothing was merged: both records are in the store, open, and the
      // second one's occurrence count is still zero.
      expect(second.stdout).toContain('Nothing is merged for you');
    });
  });

  it('says nothing about attaching when no record claims the path', () => {
    fixture(({ tasks }) => {
      const first = fileAFriction(tasks, 'first-sighting');
      expect(first.stdout).toContain('nothing has claimed scripts/tasks/audit.ts');
      expect(first.stdout).not.toContain('tasks recur');
    });
  });

  it('does not offer an occurrence on a plain task, which is not in the channel', () => {
    fixture(({ tasks }) => {
      fileAFriction(tasks, 'first-sighting');

      const planned = tasks('add', 'rewrite the generator', '--id', 'planned-work', '--writes', 'scripts/tasks/audit.ts');
      expect(planned.stdout).toContain('first-sighting');
      expect(planned.stdout).not.toContain('tasks recur');
    });
  });

  // The clause is a property of filing, not of one command. `add` and `edit`
  // had it and `audit` and `import` did not, which is the route the generated
  // auditor brief prescribes — 227 of 603 reporting records in the live store
  // were filed through it with a path nobody was shown the prior art for.
  it('shows the prior art to an auditor filing through a recorded pass', async () => {
    await fixture(async ({ tasks, audit }) => {
      fileAFriction(tasks, 'first-sighting');

      const pass = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=checked', '--proof', '2=met', '--evidence', '2=checked', '--finding', 'the manifest never generates, seen again', '--severity', 'medium', '--fault', 'tooling', '--deliverable', 'generate it', '--evidence', 'ten minutes again', '--file', 'scripts/tasks/audit.ts:88');
      expect(pass.status).toBe(0);
      expect(pass.stdout).toContain('1 finding(s) recorded, unreviewed');
      expect(pass.stdout).toContain('prior art on scripts/tasks/audit.ts');
      expect(pass.stdout).toContain('first-sighting');
      expect(pass.stdout).toContain('tasks recur <its id>');
    });
  });

  it('shows the prior art to a findings-only filing, which appends no pass at all', async () => {
    await fixture(async ({ tasks, audit }) => {
      fileAFriction(tasks, 'first-sighting');

      const late = await audit('demo-spec', '--finding', 'the manifest never generates, seen a third time', '--severity', 'medium', '--fault', 'tooling', '--deliverable', 'generate it', '--evidence', 'ten minutes again', '--file', 'scripts/tasks/audit.ts:88');
      expect(late.stdout).toContain('no pass appended');
      expect(late.stdout).toContain('first-sighting');
      expect(late.stdout).toContain('tasks recur <its id>');
    });
  });

  it('shows the prior art on an imported legacy document', () => {
    fixture(({ tasks, dir }) => {
      fileAFriction(tasks, 'first-sighting', 'src/runtime/save.ts:88');
      const docPath = path.join(dir, 'runtime-2026-08-01.md');
      writeFileSync(docPath, ['## H1 — the same region again', 'src/runtime/save.ts:88 is where it lives.'].join('\n'), 'utf8');

      const imported = tasks('import', docPath, '--fault', 'contract');
      expect(imported.stdout).toContain('imported 1 finding(s)');
      expect(imported.stdout).toContain('first-sighting');
      expect(imported.stdout).toContain('tasks recur <its id>');
    });
  });
});

describe('c1, c5, c7, c8, c10, c12: one query over the channel', () => {
  // A channel with one of everything in it, so a single run can be asserted
  // about from several sides.
  const fillTheChannel = (tasks: (...args: string[]) => Run): void => {
    tasks('add', 'the tool lost a write', '--id', 'tooling-one', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'lock it', '--breaches', 'worker/mutation-proof');
    tasks('add', 'the brief did not say', '--id', 'contract-one', '--kind', 'finding', '--fault', 'contract', '--severity', 'medium', '--deliverable', 'say it');
    tasks('add', 'nobody could have known', '--id', 'nobody-one', '--kind', 'finding', '--fault', 'nobody', '--severity', 'low', '--deliverable', 'record it');
    tasks('add', 'planned work', '--id', 'planned-one');
  };

  it('reports nobody and unclassified, and counts neither as a defect', () => {
    fixture(({ tasks, dir }) => {
      fillTheChannel(tasks);
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `${readFileSync(store, 'utf8')}${JSON.stringify({ id: 'legacy', seq: 9, title: 'from before the channel', kind: 'finding', state: 'unreviewed', severity: 'low', system: null, spec: null, clause: null, discharges: [], requires: [], files: [], writes: [], grant: null, produces: [], deliverable: 'fix it', evidence: 'x', source: null, reason: null, trigger: null, closed: null, closedCommit: null, claimed: null, claimedBy: null })}\n`, 'utf8');

      const { stdout } = tasks('friction');
      // Reported: all four buckets, each named.
      expect(stdout).toContain('tooling          1 record(s)');
      expect(stdout).toContain('contract         1 record(s)');
      expect(stdout).toContain('nobody           1 record(s)');
      expect(stdout).toContain('unclassified     1 record(s)');
      // Counted: only the two that are a defect measure. Reporting and
      // counting are different acts and the clause turns on the difference.
      expect(stdout).toContain('2 of those are a defect measure — fault tooling or contract only, with the other 2 reported above and excluded here');
      // Unclassified is its own answer and is never folded into nobody.
      expect(stdout).toMatch(/nobody.*Reported, and counted in nothing below/);
      expect(stdout).toMatch(/unclassified.*Not backfilled/);
    });
  });

  it('counts nothing below the line that says it is counted in nothing below', () => {
    fixture(({ tasks }) => {
      fillTheChannel(tasks);
      // The bucket note promises `nobody` is counted in nothing below it, and
      // the per-lesson breach count and the recurrence total are below it. Both
      // used to count it, which is the exclusion being stated and not performed.
      tasks('edit', 'nobody-one', '--breaches', 'worker/mutation-proof');
      tasks('recur', 'nobody-one', '--note', 'it cost twenty minutes again');
      tasks('recur', 'tooling-one', '--note', 'and this one is a defect');

      const { stdout } = tasks('friction');
      expect(stdout).toContain('1 recurrence(s) recorded against 1 record(s) of defect fault');
      expect(stdout).toContain('1 further recurrence(s) against 1 record(s) are reported below and excluded from that count');
      // Reported, not silently dropped: the excluded occurrence still prints,
      // named with the bucket that excluded it.
      expect(stdout).toContain('nobody-one — 1 occurrence(s) (unreviewed, nobody — not counted above)');
      // Two records cite the lesson and one of them is `nobody`, so the count
      // is one and both are still named.
      expect(stdout).toMatch(/worker\/mutation-proof\s+1 record\(s\), 1 further occurrence\(s\) — .*nobody-one \(nobody, not counted\)/);
      expect(stdout).toMatch(/worker\/mutation-proof\s+1 record\(s\), 1 further occurrence\(s\) — .*tooling-one/);
    });
  });

  it('presents every count beside the denominator it is a rate over, drawn from the log', () => {
    fixture(({ tasks }) => {
      fillTheChannel(tasks);
      tasks('start', 'planned-one', '--actor', 'worker-a');

      const { stdout } = tasks('friction');
      expect(stdout).toContain('2 against 1 dispatches (start events)');
      expect(stdout).toContain('2 against 0 audit passes (audit events carrying no record) — no denominator yet');
      expect(stdout).toContain('2 against 0 specs closed (spec-done events)');
    });
  });

  it('counts a pass once in the audit denominator, however many findings that pass filed', () => {
    fixture(({ tasks, dir }) => {
      fillTheChannel(tasks);
      // What `tasks audit` writes: one subject-less event for the pass, then
      // one carrying a record for each finding it filed. Counting them all put
      // the numerator inside its own denominator — filing a defect-fault
      // finding incremented both sides of its own rate — and the number, not
      // merely its presence, is what says so.
      const log = path.join(dir, 'events.jsonl');
      const audit = (id: string | null): string => JSON.stringify({ t: '2026-08-08T00:00:00.000Z', by: 'auditor', branch: 'b', head: null, op: 'audit', id, system: null, spec: 'a-spec', note: 'graded' });
      writeFileSync(log, `${readFileSync(log, 'utf8')}${audit(null)}\n${audit('tooling-one')}\n${audit('contract-one')}\n`, 'utf8');

      expect(tasks('friction').stdout).toContain('2 against 1 audit passes (audit events carrying no record) — 200 per 100');
    });
  });

  it('derives the recurrence count from the occurrences and prints what each one cost', () => {
    fixture(({ tasks }) => {
      fillTheChannel(tasks);
      tasks('recur', 'tooling-one', '--note', 'pass 2, ten minutes');
      tasks('recur', 'tooling-one', '--note', 'pass 3, a round trip');

      const { stdout } = tasks('friction');
      expect(stdout).toContain('2 recurrence(s) recorded against 1 record(s)');
      expect(stdout).toContain('tooling-one — 2 occurrence(s) (unreviewed)');
      expect(stdout).toContain('pass 2, ten minutes');
      expect(stdout).toContain('pass 3, a round trip');
    });
  });

  it('distinguishes a lesson checked and found clean from one nobody looked at', () => {
    fixture(({ tasks }) => {
      fillTheChannel(tasks);
      expect(tasks('friction').stdout).toMatch(/worker\/record-decisions\s+0 record\(s\), 0 further occurrence\(s\) — nobody has looked/);

      const recorded = tasks('checked', 'worker/record-decisions', '--note', 'read every decision on this branch, all recorded', '--actor', 'auditor-b');
      expect(recorded.status).toBe(0);

      const { stdout } = tasks('friction');
      expect(stdout).toMatch(/worker\/record-decisions\s+0 record\(s\), 0 further occurrence\(s\) — checked clean .* by auditor-b: read every decision on this branch, all recorded/);
      expect(stdout).toMatch(/worker\/file-findings\s+0 record\(s\), 0 further occurrence\(s\) — nobody has looked/);
    });
  });

  it('counts a breach against the lesson it cites, and rolls that record’s occurrences up to it', () => {
    fixture(({ tasks }) => {
      fillTheChannel(tasks);
      tasks('recur', 'tooling-one', '--note', 'again');

      expect(tasks('friction').stdout).toMatch(/worker\/mutation-proof\s+1 record\(s\), 1 further occurrence\(s\) — tooling-one/);
    });
  });

  it('refuses a check against a handle no live lesson answers to, and reports a citation that names none', () => {
    fixture(({ tasks }) => {
      const refused = tasks('checked', 'worker/no-such-lesson', '--note', 'looked');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('no live lesson has the handle worker/no-such-lesson');

      // A citation, by contrast, is kept and reported: the record is still
      // the honest observation, and a handle resolving to nothing is how a
      // breach count silently goes to zero.
      const filed = tasks('add', 'a breach of something', '--id', 'orphan-cite', '--kind', 'finding', '--fault', 'contract', '--severity', 'low', '--deliverable', 'fix it', '--breaches', 'worker/no-such-lesson');
      expect(filed.status).toBe(0);
      expect(filed.stdout).toContain('1 cited lesson handle(s) name no live lesson: worker/no-such-lesson');
      expect(tasks('friction').stdout).toContain('orphan-cite cites worker/no-such-lesson');
    });
  });

  it('orders lessons by the briefs and never by the count, and compares no number to anything', () => {
    fixture(({ tasks }) => {
      fillTheChannel(tasks);
      const { stdout } = tasks('friction');
      // worker/comment-rule is first in WORKER_LESSONS and has no breach;
      // worker/mutation-proof is second and has one. Count-ordering would
      // invert them, and ordering by count is comparing it to something.
      expect(stdout.indexOf('worker/comment-rule')).toBeLessThan(stdout.indexOf('worker/mutation-proof'));
      expect(stdout).toContain('Nothing here gates. No number above is compared to anything');
      // The refusal, checked at the source rather than in the output: an
      // `if` over a count is one line away and would look like tidying.
      expect(readFileSync(path.join(__dirname, 'friction.ts'), 'utf8')).not.toMatch(/\.length\s*[<>]|count\s*[<>]|>=\s*\d/);
    });
  });

  it('exits zero over a channel with nothing in it, because a report is not a verdict', () => {
    fixture(({ tasks }) => {
      const empty = tasks('friction');
      expect(empty.status).toBe(0);
      expect(empty.stdout).toContain('by fault, over 0 record(s)');
      expect(empty.stdout).toContain('no denominator yet');
    });
  });
});

// c1's invariant, of which the deleted markdown file was one instance and not
// the extent: nothing the tooling generates may direct a report outside the
// store.
describe('c1: there is one place, and no generated brief names another', () => {
  // The directory, not a filename. Asserting `tool-friction.md` is gone left
  // its sibling `audit-tooling-friction.md` tracked in the same directory,
  // saying the same thing about the same subject, under a title that claimed
  // to have caught it — so "there is one place" was false while the guard was
  // green. Nothing may live here: a second prose channel is exactly what the
  // clause retires, whatever it is called.
  it('has no tracked file left under the retired feedback directory', () => {
    expect(existsSync(path.join(process.cwd(), '.planning', 'agent-feedback'))).toBe(false);
  });

  it('sends every generated brief to the channel', () => {
    fixture(({ tasks }) => {
      for (const brief of [['work-prompt', 'demo-spec'], ['plan-prompt', 'demo-spec'], ['orchestrate-prompt']]) {
        const { stdout } = tasks(...brief);
        expect(stdout, brief.join(' ')).not.toContain('tool-friction.md');
        expect(stdout, brief.join(' ')).not.toContain('agent-feedback');
      }
    });
  });
});
