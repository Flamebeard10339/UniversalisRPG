import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, repoRoot } from './cliFixtures';

// The four instructions `briefs-carry-the-lessons` exists to land: every
// recurring defect the 2026-08-06 orchestrated run found was corrected by a
// sentence typed by hand into a dispatch message, and none of it survived in
// `work-prompt` until now. Each is its own test, naming the literal text
// rather than looping over `WORKER_LESSONS` itself — a loop over the same
// array under test would still pass with the array emptied, which is the
// exact "test that cannot fail" shape the third lesson below warns against.
describe('work-prompt carries the lessons a prior run paid for', () => {
  it('points at CLAUDE.md for the comment rule rather than re-deriving it', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('work-prompt', 'a-member');
      expect(result.stdout).toContain("CLAUDE.md's `# Comments` section owns the comment rule");
      expect(result.stdout).toContain("never describe another module's contract");
      expect(result.stdout).toContain("never write an audit finding's rationale into the source");
    }));

  it('carries the mutation-proof rule', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('work-prompt', 'a-member');
      expect(result.stdout).toContain('A test that cannot fail is not proof.');
      expect(result.stdout).toContain('`npm run mutate` is the tool.');
    }));

  it('carries the silent-decision recording rule', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('work-prompt', 'a-member');
      expect(result.stdout).toContain('Record any decision the spec was silent on, even one you are certain of.');
      expect(result.stdout).toContain('`tasks note --spec`');
    }));

  it('carries the out-of-grant filing rule', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('work-prompt', 'a-member');
      expect(result.stdout).toContain('File what you notice outside your grant; do not merely mention it.');
      expect(result.stdout).toContain('`tasks add --kind finding`');
      expect(result.stdout).toContain('Never cite an id you have not seen in your own store');
    }));
});

// c5: an instruction states what to do, never merely what went wrong. The
// spec's own evidence for each lesson — "a worker wrote a four-line comment",
// "Eleven tests this run looked like proof and were not" — is what makes an
// instruction worth having, but it belongs in the spec and the event log,
// not in the printed brief: a brief that argues its case is longer, and
// length is what stops a brief being read. Checked here for work-prompt only
// — audit.test.ts, planPrompt.test.ts and orchestratePrompt.test.ts each
// carry the same check for their own brief, because a property proven for
// one member of the family is not proven for the rest of it.
describe('work-prompt prints instructions, not the incidents that motivated them', () => {
  it('never prints the narrative evidence behind a worker lesson', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('work-prompt', 'a-member');
      expect(result.stdout).not.toContain('four-line comment');
      expect(result.stdout).not.toContain('Eleven tests');
      expect(result.stdout).not.toContain('roadmap.ts');
    }));
});

// c6: the four briefs stay one family by sharing one carrier rather than
// four hand-rolled print loops. If a brief stopped calling `printLessons` in
// favour of its own `console.log` loop, this fails — proving the sharing is
// real rather than a coincidence of current wording.
describe('the four briefs share one instruction carrier', () => {
  it('work-prompt, audit-prompt, plan-prompt and orchestrate-prompt all render their lessons through the same printLessons function', () => {
    for (const file of ['scripts/tasks/workPrompt.ts', 'scripts/tasks/audit.ts', 'scripts/tasks/planPrompt.ts', 'scripts/tasks/orchestratePrompt.ts']) {
      const text = readFileSync(path.join(repoRoot, file), 'utf8');
      expect(text, file).toContain('printLessons(');
      expect(text, file).toMatch(/import \{[^}]*printLessons[^}]*\} from '\.\/briefLessons'/);
    }
  });

  it('a fifth brief would inherit the same lessons without duplicating them: the four lists are each defined exactly once', () => {
    const text = readFileSync(path.join(repoRoot, 'scripts/tasks/briefLessons.ts'), 'utf8');
    for (const list of ['WORKER_LESSONS', 'AUDITOR_LESSONS', 'PLANNER_LESSONS', 'ORCHESTRATOR_LESSONS']) {
      expect(text.match(new RegExp(`export const ${list}`, 'g'))).toHaveLength(1);
    }
  });
});
