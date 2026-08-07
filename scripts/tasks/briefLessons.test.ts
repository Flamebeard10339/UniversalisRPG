import { describe, expect, it } from 'vitest';
import { allLessons, AUDITOR_LESSONS, findLesson, indexLessons, ORCHESTRATOR_LESSONS, PLANNER_LESSONS, unknownLessonIds, WORKER_LESSONS, type Lesson } from './briefLessons';
import { fixture } from './cliFixtures';

// The nineteen ids, written out here rather than read off the arrays, for the
// same reason workPrompt.test.ts writes out the nineteen sentences: a list
// derived from the thing under test still passes when that thing is emptied.
// These literals stand in for the records that cite them — a rename or a
// deletion reddens this file the way it would orphan a record, and an
// editor who wants a lesson gone deletes it here too and says so.
const WORKER_IDS = ['worker/comment-rule', 'worker/mutation-proof', 'worker/record-decisions', 'worker/file-findings'];
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

  it('resolves each of the nineteen ids to a live lesson', () => {
    const ids = [...WORKER_IDS, ...AUDITOR_IDS, ...PLANNER_IDS, ...ORCHESTRATOR_IDS];
    expect(ids).toHaveLength(19);
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
    expect(index.size).toBe(19);
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
  it('reports an id no lesson carries and stays silent about the ones that resolve', () => {
    expect(unknownLessonIds(['worker/mutation-proof', 'worker/retired-in-a-later-branch', 'auditor/silent-guess'])).toEqual(['worker/retired-in-a-later-branch']);
  });

  it('reports a retired lesson rather than resolving it to whatever took its place', () => {
    const retired = allLessons().filter((lesson) => lesson.id !== 'auditor/next-neighbour');
    const index = indexLessons(retired);
    expect(index.has('auditor/next-neighbour')).toBe(false);
    expect(index.size).toBe(18);
  });

  it('reports each unknown id once however many records cite it', () => {
    expect(unknownLessonIds(['planner/gone', 'planner/gone', 'planner/gone'])).toEqual(['planner/gone']);
  });

  it('returns nothing to report when every citation resolves', () => {
    expect(unknownLessonIds(allLessons().map((lesson) => lesson.id))).toEqual([]);
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

  it('the nineteen shipped ids are distinct', () => {
    expect(new Set(allLessons().map((lesson) => lesson.id)).size).toBe(19);
  });
});

// An id nobody is shown is an id nobody cites. Looping over the arrays is
// right here and nowhere else in this file: the assertion is about the CLI's
// output rather than the arrays' contents, and the contents are pinned above
// by literals, so an emptied array cannot make this pass vacuously.
describe('every brief shows the ids of the lessons it prints', () => {
  const showsItsIds = (stdout: string, lessons: Lesson[]) => {
    expect(lessons.length).toBeGreaterThan(0);
    expect(stdout).toContain('the bracketed id names the lesson');
    for (const lesson of lessons) expect(stdout, lesson.id).toContain(`[${lesson.id}] ${lesson.title}`);
  };

  it('work-prompt shows the worker its ids', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      showsItsIds(tasks('work-prompt', 'a-member').stdout, WORKER_LESSONS);
    }));

  it('audit-prompt shows the auditor its ids', () =>
    fixture(({ tasks }) => {
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
