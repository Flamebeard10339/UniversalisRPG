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
  id: string;
  title: string;
  body: string;
}

export function printLessons(heading: string, lessons: Lesson[]): void {
  console.log(heading);
  console.log('(the bracketed id names the lesson, and keeps naming it after the sentence is reworded)');
  for (const lesson of lessons) console.log(`- [${lesson.id}] ${lesson.title} ${lesson.body}`);
}

export const WORKER_LESSONS: Lesson[] = [
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
    id: 'worker/file-findings',
    title: 'File what you notice outside your grant; do not merely mention it.',
    body: "`tasks add --kind finding`. Reporting it in a final message is how it gets lost. Never cite an id you have not seen in your own store — describe it in prose instead.",
  },
];

export const AUDITOR_LESSONS: Lesson[] = [
  {
    id: 'auditor/false-proof-shape',
    title: 'Ask what would have to break for a test to fail, and whether that is what the clause promises.',
    body: 'Watch for an assertion that cannot be false while the code is present at all — for example, a fixture that performs a second operation whose side effect produces the asserted state, an expectation derived from the structure under test, or a test written against the class the implementation is guaranteed to handle.',
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

export const PLANNER_LESSONS: Lesson[] = [
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
    body: 'Scope a fix to everywhere the wrong answer is produced, not only to where the bug was reported.',
  },
  {
    id: 'planner/name-delegated-decisions',
    title: 'Name what the worker may decide.',
    body: 'A `## Open questions` section listing the delegated decisions.',
  },
];

export const ORCHESTRATOR_LESSONS: Lesson[] = [
  {
    id: 'orchestrator/buffer-not-decider',
    title: 'The orchestrator is a buffer, not a decision-maker.',
    body: "It absorbs everything that is not a genuine design decision and batches what is left into one review. Route a design question you could answer yourself to a planning session anyway — not to move it off the author's desk, but to move it where the survey and the rulings already are.",
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

const LESSONS_BY_ID = indexLessons(allLessons());

export function findLesson(id: string): Lesson | undefined {
  return LESSONS_BY_ID.get(id);
}

export function unknownLessonIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => !LESSONS_BY_ID.has(id));
}

export function totalLessonCount(): number {
  return allLessons().length;
}
