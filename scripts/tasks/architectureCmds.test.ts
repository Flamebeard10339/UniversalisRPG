import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, gitFixture } from './cliFixtures';

describe('tasks CLI', () => {
  it('grades a named dispatch set and answers at exit 0, refusing nothing', () => {
    fixture(({ tasks }) => {
      tasks('add', 'extract the policy', '--id', 's1', '--writes', 'scripts/tasks.ts', '--produces', 'policy module');
      tasks('add', 'reroute git', '--id', 's2', '--writes', 'scripts/tasks.ts');
      tasks('add', 'regression fixes', '--id', 's5', '--writes', 'scripts/tasks.test.ts');

      const result = tasks('plan', 's1', 's2', 's5');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('s2 writes scripts/tasks.ts, where s1 is producing policy module');
      expect(result.stdout).toContain('does not require s1');
      expect(result.stdout).toContain('Reported, not enforced');
    });
  });

  it('grades the active spec when given no ids, and says where the plan came from', () => {
    fixture(({ tasks }) => {
      tasks('spec', 'new', 'demo-spec');
      tasks('add', 'one', '--id', 'one', '--spec', 'demo-spec', '--writes', 'src/a.ts');
      tasks('add', 'two', '--id', 'two', '--spec', 'demo-spec', '--writes', 'src/b.ts');
      const result = tasks('plan');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('plan taken from spec demo-spec');
      expect(result.stdout).toContain('no overlap, no unstated dependency, no duplicated interface');
    });
  });

  it('answers a plan naming an id that does not exist instead of refusing it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'real', '--id', 'real', '--writes', 'src/a.ts');
      const result = tasks('plan', 'real', 'ghost');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no such task');
      expect(result.stdout).toContain('plan: 1 task(s)');
    });
  });

  it('grades a plan naming one task three times as a plan of one', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the only task', '--id', 'solo', '--writes', 'src/p.ts', '--produces', 'policy module');
      const result = tasks('plan', 'solo', 'solo', 'solo');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('plan: 1 task(s)');
      expect(result.stdout).toContain('no overlap, no unstated dependency, no duplicated interface');
    });
  });

  it('says how much of a clean answer it could not see, when nothing declares a write grant', () => {
    fixture(({ tasks }) => {
      tasks('add', 'ungranted one', '--id', 'u1');
      tasks('add', 'ungranted two', '--id', 'u2');
      const result = tasks('plan', 'u1', 'u2');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 with a write grant');
      expect(result.stdout).toContain('declares no writes');
    });
  });
});

// The architecture queries. Their logic is unit-tested over fixture trees in
// `lib/architecture.test.ts` and `lib/producers.test.ts`; what these prove is
// the wiring — that the command reaches the derived view and the manifest at
// all. They read this repository's real tree on purpose, because that seam is
// the only part a fixture cannot exercise.
describe('tasks system', () => {
  it('lists every declared system with counts derived from the tree', () =>
    fixture(({ tasks }) => {
      const result = tasks('system');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('2 system(s) declared');
      expect(result.stdout).toMatch(/Runtime\s+\d+ file\(s\)/);
    }));

  it('opens one system, naming its dependencies and its unclaimed files', () =>
    fixture(({ tasks }) => {
      const result = tasks('system', 'Runtime');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('depends on:');
      expect(result.stdout).toContain('no concept claims');
    }));

  // The names are already in `Module.exports` at the point a total was taken
  // over them, and the total is what a planner then had to go and look up by
  // hand before it could import anything.
  it('system names its exported surface instead of counting it', () =>
    fixture(({ tasks }) => {
      const result = tasks('system', 'Runtime');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('exported surface, production modules only:');
      expect(result.stdout).toMatch(/src\/runtime\/save\.ts — \w/);
      expect(result.stdout).not.toMatch(/export\(s\)/);
    }));

  it('refuses a system the manifest does not declare, and says which exist', () =>
    fixture(({ tasks }) => {
      const result = tasks('system', 'Nope');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Runtime');
    }));
});

describe('tasks where', () => {
  it('answers ownership, exports and cross-boundary imports for a file', () =>
    fixture(({ tasks }) => {
      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('system:   Runtime');
      expect(result.stdout).toContain('exports:');
    }));

  it('answers for a path no system owns rather than refusing', () =>
    fixture(({ tasks }) => {
      const result = tasks('where', 'docs/workflow.md');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('declared unowned');
    }));

  it('refuses with usage when given no path', () =>
    fixture(({ tasks }) => {
      expect(tasks('where').status).toBe(1);
    }));

  // The prior art that bit was in finished work: `droptables` was done and
  // merged when its batched-chance rule was re-derived from scratch. So a
  // query that stops at live records answers the easy half.
  it('where names every task that has ever claimed the path, closed and declined ones included', () =>
    fixture(({ tasks }) => {
      tasks('add', 'the save format pass', '--id', 'saves-v2', '--writes', 'src/runtime/save.ts');
      tasks('done', 'saves-v2');
      tasks('add', 'a save rewrite nobody wanted', '--id', 'save-rewrite', '--writes', 'src/runtime/save.ts');
      tasks('decline', 'save-rewrite', '--reason', 'the format is fine');

      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[done] saves-v2');
      expect(result.stdout).toContain('[declined] save-rewrite');
    }));

  it('where resolves a directory grant against a path beneath it', () =>
    fixture(({ tasks }) => {
      tasks('add', 'the travel pass', '--id', 'travel', '--writes', 'src/runtime');
      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[open] travel');
      expect(result.stdout).toContain('writes src/runtime');
    }));

  it('where answers with the owning system, the concepts on the path and the produces claims naming them', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts', '--note', 'from a produces claim');
      tasks('add', 'build the save migrator', '--id', 'migrator', '--writes', 'src/runtime/save.ts', '--produces', 'save migrator');

      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('system:   Runtime');
      expect(result.stdout).toContain('[concept] saves — registered to Runtime');
      expect(result.stdout).toContain('produces save migrator');
    }));

  it('where says outright that nothing has claimed a path, rather than printing an empty section', () =>
    fixture(({ tasks }) => {
      expect(tasks('where', 'src/runtime/save.ts').stdout).toContain('nothing has claimed src/runtime/save.ts');
    }));

  it('where answers for a directory with the files under it and the whole surface they export', () =>
    fixture(({ tasks }) => {
      const result = tasks('where', 'src/runtime');
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\d+ tracked file\(s\) under it/);
      expect(result.stdout).toMatch(/src\/runtime\/save\.ts — \w/);
    }));
});

describe('tasks produces', () => {
  it('finds a claim made by a task that has already closed', () =>
    fixture(({ tasks }) => {
      tasks('add', 'build the buff engine', '--produces', 'buff engine', '--id', 'buffs');
      tasks('done', 'buffs');
      const result = tasks('produces', 'buff engine');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[exact]');
      expect(result.stdout).toContain('claimed by buffs (done)');
    }));

  it('calls its own miss a weak one instead of asserting nothing exists', () =>
    fixture(({ tasks }) => {
      expect(tasks('produces', 'quest journal').stdout).toContain('weak "no"');
    }));
});

describe('tasks concept', () => {
  it('registers a capability, after which produces answers for it', () =>
    fixture(({ tasks }) => {
      const added = tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts', '--note', 'from a produces claim');
      expect(added.status).toBe(0);
      expect(tasks('produces', 'saves').stdout).toContain('owned by Runtime');
    }));

  it('refuses an empty --paths, since a concept nothing resolves to answers every lookup wrongly', () =>
    fixture(({ tasks }) => {
      const empty = tasks('concept', 'Runtime', 'saves', '--paths', '');
      expect(empty.status).toBe(1);
      expect(empty.stderr).toContain('usage: tasks concept');
      expect(tasks('produces', 'saves').stdout).toContain('nothing produces');
    }));

  it('refuses a missing concept name with usage, not a raw TypeError', () =>
    fixture(({ tasks }) => {
      const missing = tasks('concept', 'Runtime', '--paths', 'src/runtime/save.ts');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('usage: tasks concept');
    }));

  it('refuses a name another system already registers', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts');
      const again = tasks('concept', 'UI', 'saves', '--paths', 'src/ui');
      expect(again.status).toBe(1);
      expect(again.stderr).toContain('already registers a concept');
    }));

  it('refuses a concept reaching outside its own system, and writes nothing', () =>
    fixture(({ dir, tasks }) => {
      const before = readFileSync(path.join(dir, 'systems.json'), 'utf8');
      const result = tasks('concept', 'Runtime', 'parsing', '--paths', 'src/grammar/parser.ts');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('cannot reach outside it');
      expect(readFileSync(path.join(dir, 'systems.json'), 'utf8')).toBe(before);
    }));

  it('refuses a system that does not exist', () =>
    fixture(({ tasks }) => {
      expect(tasks('concept', 'Nope', 'thing', '--paths', 'src/runtime').status).toBe(1);
    }));

  it('keeps a manifest field it does not know about', () =>
    fixture(({ dir, tasks }) => {
      const file = path.join(dir, 'systems.json');
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { systems: Array<Record<string, unknown>> };
      raw.systems[0].futureField = 'kept';
      writeFileSync(file, JSON.stringify(raw), 'utf8');
      tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts');
      const after = JSON.parse(readFileSync(file, 'utf8')) as { systems: Array<Record<string, unknown>> };
      expect(after.systems[0].futureField).toBe('kept');
    }));
});

describe('tasks plan, against producers that already exist', () => {
  it('reports a plan member claiming what a closed task already produced', () =>
    fixture(({ tasks }) => {
      tasks('add', 'old work', '--produces', 'buff engine', '--id', 'old');
      tasks('done', 'old');
      tasks('add', 'new work', '--produces', 'buff engine', '--writes', 'src/runtime/buffs.ts', '--id', 'new', '--spec', 'demo-spec');
      const result = tasks('plan', 'new');
      expect(result.stdout).toContain('already claims it');
      expect(result.stdout).toContain('old');
    }));

  it('reports a plan member claiming a registered concept', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'buff engine', '--paths', 'src/runtime/save.ts');
      tasks('add', 'new work', '--produces', 'buff engine', '--writes', 'src/runtime/buffs.ts', '--id', 'new', '--spec', 'demo-spec');
      expect(tasks('plan', 'new').stdout).toContain('already has it as a registered concept');
    }));

  it('does not report a plan member against its own claim', () =>
    fixture(({ tasks }) => {
      tasks('add', 'only work', '--produces', 'lonely thing', '--writes', 'src/runtime/lonely.ts', '--id', 'lonely', '--spec', 'demo-spec');
      expect(tasks('plan', 'lonely').stdout).not.toContain('existing-producer');
    }));
});

// A read answers. The store is what grading a plan needs; the registry only
// widens what it can say, so losing it costs the concept half of the answer
// and must not cost the exit code — `tasks plan` is an unguarded CI step.
describe('tasks plan, when the manifest will not parse', () => {
  it('still grades the plan, and says which half of the answer it lost', () =>
    fixture(({ dir, tasks }) => {
      tasks('add', 'some work', '--writes', 'src/runtime/a.ts', '--id', 'work', '--spec', 'demo-spec');
      writeFileSync(path.join(dir, 'systems.json'), '{"unowned":{"paths":[]},"systems":', 'utf8');
      const result = tasks('plan', 'work');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded `produces` claims only');
      expect(result.stdout).toContain('plan: 1 task(s)');
    }));
});

describe('a command that cannot work without the manifest', () => {
  it('refuses it as malformed input, naming the file, rather than crashing', () =>
    fixture(({ dir, tasks }) => {
      writeFileSync(path.join(dir, 'systems.json'), '{"unowned":{"paths":[]},"systems":', 'utf8');
      const result = tasks('system');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('error: ');
      expect(result.stderr).toContain('systems.json');
    }));
});

describe('concept paths are stored in one spelling', () => {
  it('strips a trailing slash, so the concept claims files instead of nothing', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'everything', '--paths', 'src/runtime/', '--note', 'probe');
      const shown = tasks('system', 'Runtime');
      expect(shown.stdout).toMatch(/everything — [1-9]\d* file\(s\)/);
      expect(shown.stdout).not.toContain('(none matching)');
    }));

  it('reads a windows separator as the same declared region', () =>
    fixture(({ dir, tasks }) => {
      tasks('concept', 'Runtime', 'saves', '--paths', 'src\\runtime\\save.ts', '--note', 'probe');
      const raw = JSON.parse(readFileSync(path.join(dir, 'systems.json'), 'utf8')) as { systems: Array<{ concepts?: Array<{ paths: string[] }> }> };
      expect(raw.systems[0].concepts?.[0].paths).toEqual(['src/runtime/save.ts']);
    }));

  it('refuses a name that is only whitespace, which nothing could ever find', () =>
    fixture(({ tasks }) => {
      expect(tasks('concept', 'Runtime', '   ', '--paths', 'src/runtime/save.ts').status).toBe(1);
    }));
});

// A real repo, because the defect is precisely the gap between what git's
// index lists and what is on disk, and no fixture tree can hold that gap.
// This is the moment the command exists for: a worker has deleted or renamed
// a file and asks where the thing it imports now lives.
describe('the architecture queries, against a tracked file deleted from the working tree', () => {
  it('answers instead of dying on the missing file', () =>
    gitFixture(({ dir, commit, tasks }) => {
      writeFileSync(path.join(dir, 'kept.ts'), "import './gone';\nexport const kept = 1;\n", 'utf8');
      writeFileSync(path.join(dir, 'gone.ts'), 'export const gone = 1;\n', 'utf8');
      commit('Add two modules\n\nA base for the deletion below.');
      rmSync(path.join(dir, 'gone.ts'));

      const where = tasks('where', 'kept.ts');
      expect(where.status).toBe(0);
      expect(where.stdout).toContain('kept.ts');

      expect(tasks('system').status).toBe(0);
    }));
});
