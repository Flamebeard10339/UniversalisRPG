import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allLessons, AUDITOR_LESSONS, findLesson, indexLessons, ORCHESTRATOR_LESSONS, PLANNER_LESSONS, unknownLessonIds, WORKER_LESSONS, type Lesson } from './briefLessons';
import { enclosingGitFixture, fixture, repoRoot } from './cliFixtures';

// The twenty ids, written out here rather than read off the arrays, for the
// same reason workPrompt.test.ts writes out the nineteen sentences: a list
// derived from the thing under test still passes when that thing is emptied.
// These literals stand in for the records that cite them — a rename or a
// deletion reddens this file the way it would orphan a record, and an
// editor who wants a lesson gone deletes it here too and says so.
const WORKER_IDS = ['worker/comment-rule', 'worker/mutation-proof', 'worker/record-decisions', 'worker/aim-at-the-clause', 'worker/file-findings'];
const AUDITOR_IDS = ['auditor/false-proof-shape', 'auditor/next-neighbour', 'auditor/rule-may-be-wrong', 'auditor/over-strictness', 'auditor/silent-guess'];
const PLANNER_IDS = ['planner/state-the-invariant', 'planner/guard-placement', 'planner/who-else-computes', 'planner/name-delegated-decisions'];
const ORCHESTRATOR_IDS = ['orchestrator/buffer-not-decider', 'orchestrator/ruling-is-a-contract', 'orchestrator/verify-not-grade', 'orchestrator/file-on-worker-branch', 'orchestrator/scratch-prefix', 'orchestrator/no-mid-run-tuning'];

describe('every instruction in the four briefs has an id', () => {
  it("the worker's lessons carry exactly the ids a record may cite", () => {
    expect(WORKER_LESSONS.map((lesson) => lesson.id)).toEqual(WORKER_IDS);
  });

  it("the auditor's lessons carry exactly the ids a record may cite", () => {
    expect(AUDITOR_LESSONS.map((lesson) => lesson.id)).toEqual(AUDITOR_IDS);
  });

  it("the planner's lessons carry exactly the ids a record may cite", () => {
    expect(PLANNER_LESSONS.map((lesson) => lesson.id)).toEqual(PLANNER_IDS);
  });

  it("the orchestrator's lessons carry exactly the ids a record may cite", () => {
    expect(ORCHESTRATOR_LESSONS.map((lesson) => lesson.id)).toEqual(ORCHESTRATOR_IDS);
  });

  it('resolves each of the twenty ids to a live lesson', () => {
    const ids = [...WORKER_IDS, ...AUDITOR_IDS, ...PLANNER_IDS, ...ORCHESTRATOR_IDS];
    expect(ids).toHaveLength(20);
    for (const id of ids) expect(findLesson(id)?.id, id).toBe(id);
  });
});

// c6, first half. Rewording is the edit the id exists to survive, so the
// check rewords: every title and body is replaced with text sharing nothing
// with the original, and every id a record could already be citing still
// resolves. Resolution keyed on prose in any form fails this.
describe('an id survives editing the lesson it names', () => {
  const reworded: Lesson[] = allLessons().map((lesson, position) => ({
    id: lesson.id,
    title: `rewritten title ${position}`,
    body: `rewritten body ${position}`,
  }));

  it('resolves every citation after every sentence in every lesson has been rewritten', () => {
    const index = indexLessons(reworded);
    expect(index.size).toBe(20);
    for (const id of [...WORKER_IDS, ...AUDITOR_IDS, ...PLANNER_IDS, ...ORCHESTRATOR_IDS]) {
      expect(index.get(id)?.title, id).toMatch(/^rewritten title /);
    }
  });

  it('reorders without moving an id off the lesson it names', () => {
    const index = indexLessons([...allLessons()].reverse());
    for (const lesson of allLessons()) expect(index.get(lesson.id)?.title, lesson.id).toBe(lesson.title);
  });
});

// c6, second half. A citation the briefs no longer answer for has to come
// back as an answer, because the caller that cannot tell "no such lesson"
// from "nothing to say" is the caller that drops it.
describe('a citation naming no live lesson is reported', () => {
  it('resolves an id no lesson carries to nothing, rather than to whatever is nearest', () => {
    expect(findLesson('worker/retired-in-a-later-branch')).toBeUndefined();
    expect(findLesson('')).toBeUndefined();
  });

  it('resolves an id that only resembles a live one to nothing', () => {
    expect(findLesson('worker/mutation-proofs')).toBeUndefined();
    expect(findLesson('mutation-proof')).toBeUndefined();
    expect(findLesson('WORKER/MUTATION-PROOF')).toBeUndefined();
  });

  it('reports an id no lesson carries and stays silent about the ones that resolve', () => {
    expect(unknownLessonIds(['worker/mutation-proof', 'worker/retired-in-a-later-branch', 'auditor/silent-guess'])).toEqual(['worker/retired-in-a-later-branch']);
  });

  it('reports a retired lesson rather than resolving it to whatever took its place', () => {
    const retired = allLessons().filter((lesson) => lesson.id !== 'auditor/next-neighbour');
    const index = indexLessons(retired);
    expect(index.has('auditor/next-neighbour')).toBe(false);
    expect(index.size).toBe(19);
  });

  it('reports a citation that only resembles a live id, rather than counting it as resolved', () => {
    expect(unknownLessonIds(['worker/mutation-proo', 'WORKER/MUTATION-PROOF', 'mutation-proof', 'worker/'])).toEqual(['worker/mutation-proo', 'WORKER/MUTATION-PROOF', 'mutation-proof', 'worker/']);
  });

  it('reports each unknown id once however many records cite it', () => {
    expect(unknownLessonIds(['planner/gone', 'planner/gone', 'planner/gone'])).toEqual(['planner/gone']);
  });

  it('returns nothing to report when every citation resolves', () => {
    expect(unknownLessonIds(allLessons().map((lesson) => lesson.id))).toEqual([]);
  });
});

// c6 as one property rather than a list of axes it happens to have been
// checked on. Two things are claimed here and both are stated over a
// generated table rather than over hand-picked inputs, because every axis
// nobody thought of is the one a later edit reverses: a citation resolves
// only to the lesson whose id it *is*, character for character, and every
// citation that resolves to nothing comes back from the reporting function
// unchanged. Deciding that a value is not a citation at all — the empty
// string a missing store field arrives as — is the assembling caller's
// judgement and never this module's, so nothing here is exempt from being
// reported.
describe('a citation is matched exactly as given, and every one is accounted for', () => {
  const liveIds = [...WORKER_IDS, ...AUDITOR_IDS, ...PLANNER_IDS, ...ORCHESTRATOR_IDS];

  const perturbed = (id: string): string[] => [
    ` ${id}`,
    `${id} `,
    ` ${id} `,
    `\t${id}\t`,
    `${id}\n`,
    `\u00a0${id}`,
    id.toUpperCase(),
    id.slice(0, -1),
    id.slice(1),
    `${id}s`,
    `x${id}`,
    id.replace('/', ''),
    id.replace('/', '-'),
  ];

  const blank = ['', ' ', '   ', '\t', '\n', ' \n ', '\u00a0'];
  // A citation is a key in nothing but a Map: an index on a plain object
  // answers these with inherited members, which is a resolution to a lesson
  // that does not exist rather than a report that none does.
  const inherited = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
  const shaped = ['worker', 'worker/', '/', 'planner/gone'];

  const live = new Set(liveIds);
  const dead = [...new Set([...liveIds.flatMap(perturbed), ...blank, ...inherited, ...shaped])].filter((citation) => !live.has(citation));

  it('covers both inputs the survivors were found on, among the rest', () => {
    expect(dead).toContain(' worker/mutation-proof ');
    expect(dead).toContain('');
    expect(dead.length).toBeGreaterThan(150);
  });

  it('never answers with a lesson whose id is not the citation', () => {
    for (const citation of [...liveIds, ...dead]) {
      const lesson = findLesson(citation);
      if (lesson !== undefined) expect(lesson.id, JSON.stringify(citation)).toBe(citation);
    }
    expect(liveIds.filter((id) => findLesson(id) !== undefined)).toHaveLength(20);
  });

  it('resolves nothing for a citation differing from a live id by so much as one character', () => {
    for (const citation of dead) expect(findLesson(citation), JSON.stringify(citation)).toBeUndefined();
  });

  it('reports every citation it does not resolve, verbatim and in the order cited', () => {
    expect(unknownLessonIds([...liveIds, ...dead])).toEqual(dead);
  });
});


// One id, two lessons, is a citation that names both — the failure the whole
// mechanism is for. Refused where the ids become keys, which is the only
// point at which uniqueness is a property at all, so no reader has to check.
describe('two lessons cannot share one id', () => {
  it('refuses to build an index over a duplicated id', () => {
    const lesson = WORKER_LESSONS[0];
    expect(() => indexLessons([lesson, { ...lesson, title: 'a different instruction' }])).toThrow(/worker\/comment-rule/);
  });

  it('the twenty shipped ids are distinct', () => {
    expect(new Set(allLessons().map((lesson) => lesson.id)).size).toBe(20);
  });

  // Where the refusal fires decides how much it takes with it. Every `tasks`
  // command imports this module transitively, so a refusal reached during
  // import turns `doctor`, `list` and `next` — the three an agent reaches for
  // when something is already wrong — into a stack trace. Asserted over the
  // source because import-time behaviour is not observable from inside the
  // module's own surface: this is the one call whose position is the point.
  it('refuses a duplicated id only where a citation is being resolved, never at import', () => {
    const callSites = readFileSync(path.join(repoRoot, 'scripts/tasks/briefLessons.ts'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('indexLessons(') && !line.includes('function indexLessons('));
    expect(callSites).not.toEqual([]);
    for (const line of callSites) expect(line, line).toMatch(/^\s+\S/);
  });
});

// An id nobody is shown is an id nobody cites. Looping over the arrays is
// right here and nowhere else in this file: the assertion is about the CLI's
// output rather than the arrays' contents, and the contents are pinned above
// by literals, so an emptied array cannot make this pass vacuously.
describe('every brief shows the ids of the lessons it prints', () => {
  const showsItsIds = (stdout: string, lessons: readonly Lesson[]) => {
    expect(lessons.length).toBeGreaterThan(0);
    expect(stdout).toContain('the bracketed id names the lesson');
    for (const lesson of lessons) expect(stdout, lesson.id).toContain(`[${lesson.id}] ${lesson.title}`);
  };

  it('work-prompt shows the worker its ids', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      showsItsIds(tasks('work-prompt', 'a-member').stdout, WORKER_LESSONS);
    }));

  // The auditor's brief is the one of the four that refuses to print without a
  // merge base, so it takes the declared exception the other three do not need.
  it('audit-prompt shows the auditor its ids', () =>
    enclosingGitFixture(({ tasks }) => {
      showsItsIds(tasks('audit-prompt', 'demo-spec').stdout, AUDITOR_LESSONS);
    }));

  it('plan-prompt shows the planner its ids', () =>
    fixture(({ tasks }) => {
      showsItsIds(tasks('plan-prompt', 'demo-spec').stdout, PLANNER_LESSONS);
    }));

  it('orchestrate-prompt shows the orchestrator its ids', () =>
    fixture(({ tasks }) => {
      showsItsIds(tasks('orchestrate-prompt').stdout, ORCHESTRATOR_LESSONS);
    }));
});
