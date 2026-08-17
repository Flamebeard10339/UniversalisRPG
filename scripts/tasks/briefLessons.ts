// The one place `work-prompt`, `audit-prompt`, `plan-prompt` and
// `orchestrate-prompt` carry what a run has already paid to learn. Each
// brief owns its own list — a worker does not need the auditor's rule and an
// auditor does not need the worker's filing rule — but all four render
// through `printLessons`, so a fifth brief added later inherits the same
// carrier rather than hand-rolling its own loop, and an edit to one list
// cannot silently skip how the others are shown.

// An `id` is permanent once printed: records elsewhere cite it, and they
// cannot be made to look when it changes. Reword a `title` or `body` freely;
// to retire a lesson, delete it and let its citations resolve to nothing, and
// never rename one in place or reuse a retired id for a different lesson.
export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export function printLessons(heading: string, lessons: readonly Lesson[]): void {
  console.log(heading);
  console.log('(the bracketed id names the lesson, and keeps naming it after the sentence is reworded)');
  for (const lesson of lessons) console.log(`- [${lesson.id}] ${lesson.title} ${lesson.body}`);
}

export const WORKER_LESSONS: readonly Lesson[] = [
  {
    id: 'worker/comment-rule',
    title: "CLAUDE.md's `# Comments` section owns the comment rule — do not re-derive it here.",
    body: "Two clauses out of it repeatedly catch people: never describe another module's contract, and never write an audit finding's rationale into the source — that belongs in the commit message.",
  },
  {
    id: 'worker/mutation-proof',
    title: 'A test that cannot fail is not proof.',
    body: 'Before claiming a clause met, break the code it covers and confirm the named test fails. `npm run mutate` is the tool.',
  },
  {
    id: 'worker/record-decisions',
    title: 'Record any decision the spec was silent on, even one you are certain of.',
    body: '`tasks note --spec` or a line in the commit body.',
  },
  {
    id: 'worker/aim-at-the-clause',
    title: "Aim a fix at the clause, not at the finding's words.",
    body: 'A finding names one reproduction and the reproduction is always narrower than the property the clause promises, so a fix that satisfies the sentence and not the property is the failure mode this workflow is measurably worst at: 30% of fixes did not hold against 0.5% of certifications reversed, and every failure was aimed at a finding literally.',
  },
  {
    id: 'worker/label-from-data',
    title: 'A label computed from where the code was standing cannot be derived-proved, only enumerated.',
    body: "An exception carries the control-flow position and never the subject: catch it in a different block and the same failure is attributed to something else, with nothing in any value disagreeing. Where a producer already reports the subject by name -- the load path does, per module -- read it; where none does, make one, before writing the test that would otherwise have to be a table of inputs somebody thought of.",
  },
  {
    id: 'worker/absence-is-not-evidence',
    title: 'A signal you did not get is worth what your instrument is worth. Prove the instrument first.',
    body: "A surviving mutation says nothing is watching that line, not that nothing reaches it; read as the second, one survivor on a catch licensed a deletion that turned an untested-but-correct path into an unrecoverable one. A probe that finds no route establishes only that the routes you spelled do not reach -- seven tries at `# remove location base.camp` measured a space where the grammar takes a dot. Before concluding absence, make the probe fail for the reason you intended.",
  },
  {
    id: 'worker/file-findings',
    title: 'File what you notice outside your grant; do not merely mention it.',
    body: "`tasks add \"<title>\" --kind finding --fault tooling|contract|nobody --deliverable \"what fixing it would mean\"` — the fault and the deliverable are required and the command refuses without them. Reporting it in a final message is how it gets lost. Never cite an id you have not seen in your own store — describe it in prose instead.",
  },
];

export const AUDITOR_LESSONS: readonly Lesson[] = [
  {
    id: 'auditor/false-proof-shape',
    title: 'Ask what would have to break for a test to fail, and whether that is what the clause promises.',
    body: 'Watch for an assertion that cannot be false while the code is present at all — for example, a fixture that performs a second operation whose side effect produces the asserted state, an expectation derived from the structure under test, or a test written against the class the implementation is guaranteed to handle. Two shapes measured since: an expectation compared against what the function under test itself returned, so both sides move together and the mutation survived its own named test; and a case table that derives one axis and enumerates the other, where the hole is in the enumerated half and an expectation keyed off that half’s own labels grades the wrong answer correct, so adding the missing row does not repair it.',
  },
  {
    id: 'auditor/next-neighbour',
    title: 'Hunt the next neighbour, not confirmation of the last fix.',
    body: "A finding names one reproduction, and the reproduction is always narrower than the property the clause promises — a fix aimed only at the finding's text is systematically too small.",
  },
  {
    id: 'auditor/rule-may-be-wrong',
    title: 'When a clause has failed twice, ask whether the rule is wrong rather than whether another instance exists.',
    body: 'A stated boundary with reasoning is a better result than a longer exclusion list.',
  },
  {
    id: 'auditor/over-strictness',
    title: 'Guard over-strictness at least as hard as bypass.',
    body: 'Repeated narrowing is where a guard starts refusing legitimate input.',
  },
  {
    id: 'auditor/silent-guess',
    title: 'Ask the silent-guess question explicitly.',
    body: 'Treat "none found" as real only if you looked.',
  },
];

export const PLANNER_LESSONS: readonly Lesson[] = [
  {
    id: 'planner/state-the-invariant',
    title: 'State the invariant.',
    body: 'Offer instances as illustration, never as extent.',
  },
  {
    id: 'planner/guard-placement',
    title: 'When a clause requires a guard, name the point at which it must act.',
    body: 'Enforce where a value is assembled, not where it is read.',
  },
  {
    id: 'planner/who-else-computes',
    title: 'Ask who else computes this answer.',
    body: 'Scope a fix to everywhere the wrong answer is produced, not only to where the bug was reported — and ask it before a spec has anything re-derive an answer, because a hand-rolled copy of a report that already exists is two answers kept in sync by hand and the copy is where the defect lands.',
  },
  {
    id: 'planner/proof-shape-follows-design',
    title: 'When the only available proof of a clause is a table of cases, the design is the thing to change.',
    body: 'A property computed from data can be checked against the data; one a caller infers can only be checked against a list of inputs somebody thought of. If a clause says *every* and the worker can offer only instances, do not accept a longer list — ask what would have to be read rather than guessed for the proof to derive its own subjects.',
  },
  {
    id: 'planner/name-delegated-decisions',
    title: 'Name what the worker may decide.',
    body: 'A `## Open questions` section listing the delegated decisions.',
  },
];

export const ORCHESTRATOR_LESSONS: readonly Lesson[] = [
  {
    id: 'orchestrator/buffer-not-decider',
    title: 'Place a decision where it will not be re-decided; the test is durability, not who is busy.',
    body: "A mechanical decision belongs to the agent that just read the code, because routing it upward makes it both worse and slower. A decision about what the work is belongs to the planner-and-author pairing, because that pairing holds the survey and the rulings — route one there even when you could answer it, and route it with `tasks question \"<it>\" --blocks <ids> --decider planner|author --fault ...`, which halts exactly what depends on it and reaches the addressee instead of coming back to a worker as an implementation brief. A decision made in the wrong place gets re-decided, and the re-decision is the cost.",
  },
  {
    id: 'orchestrator/ruling-is-a-contract',
    title: 'A ruling is a contract too, and gets less review than a clause.',
    body: 'State the invariant it rules on, not a threshold or a single instance.',
  },
  {
    id: 'orchestrator/verify-not-grade',
    title: 'Verify what a report claims; do not grade the report.',
    body: 'Confirm a mutation actually applied before believing the test result it reports.',
  },
  {
    id: 'orchestrator/file-on-worker-branch',
    title: "File a record on the worker's branch, not the orchestrator's.",
    body: 'The store is per-branch until merge, so anything filed on the orchestrator\'s branch cannot be seen, cited or verified downstream — and never hand a worker an id it cannot resolve in its own store; describe it in prose instead.',
  },
  {
    id: 'orchestrator/scratch-prefix',
    title: 'Give every dispatched agent a scratch filename prefix.',
    body: "Concurrent agents share one directory and can overwrite each other's mutation manifests.",
  },
  {
    id: 'orchestrator/no-mid-run-tuning',
    title: 'Do not tune the brief mid-run if the rates it produces are meant to be comparable.',
    body: 'A sharper brief finds more, so a rising defect count would measure attention rather than defect density.',
  },
];

// c7 of briefs-carry-the-lessons: the four lists above are this branch's
// whole addition to the briefs, and this is the form a later editor checks
// rather than feels. The count, not a character budget, because an
// instruction is the unit a reader decides to keep or cut.
export const MAX_LESSON_COUNT = 24;

export function allLessons(): Lesson[] {
  return [...WORKER_LESSONS, ...AUDITOR_LESSONS, ...PLANNER_LESSONS, ...ORCHESTRATOR_LESSONS];
}

export function indexLessons(lessons: readonly Lesson[]): Map<string, Lesson> {
  const index = new Map<string, Lesson>();
  for (const lesson of lessons) {
    if (index.has(lesson.id)) throw new Error(`two lessons share the id ${lesson.id}, so a record citing it names both`);
    index.set(lesson.id, lesson);
  }
  return index;
}

let citationIndex: Map<string, Lesson> | undefined;

function lessonsById(): Map<string, Lesson> {
  if (citationIndex === undefined) citationIndex = indexLessons(allLessons());
  return citationIndex;
}

export function findLesson(id: string): Lesson | undefined {
  return lessonsById().get(id);
}

export function unknownLessonIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => findLesson(id) === undefined);
}

export function totalLessonCount(): number {
  return allLessons().length;
}
