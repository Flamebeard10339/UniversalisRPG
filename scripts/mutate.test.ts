import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyTo, escapesRoot, findMissRefusal, formatReport, journalVerdict, outputTail, parseManifest, parseVitestTally, journalPathFor, pidIsAlive, readJournal, scopeOf, type BaselineFor, type RunTests, recoverFrom, refusalsFor, resolveVitest, runMutations, tallyOf, visibleWhitespace, type FileStore, type Mutation, type TestRun } from './mutate';

const ORIGINAL = 'const base = entityTypeBase(merged, section);\nconst other = 1;\n';

function store(files: Record<string, string>): FileStore & { writes: { file: string; text: string }[] } {
  const content = { ...files };
  return {
    writes: [],
    read(file: string): string {
      const text = content[file];
      if (text === undefined) throw new Error(`no such file: ${file}`);
      return text;
    },
    write(file: string, text: string): void {
      content[file] = text;
      this.writes.push({ file, text });
    },
    now: () => content,
  } as FileStore & { writes: { file: string; text: string }[]; now: () => Record<string, string> };
}

const mutation = (over: Partial<Mutation> = {}): Mutation => ({ name: 'c1', file: 'a.ts', find: 'entityTypeBase(merged, section)', replace: 'undefined', ...over });

const tally = (failed: number, total: number, filesFailed = 0): TestRun => ({ failed, total, filesFailed, raw: `Tests ${failed} failed | ${total - failed} passed (${total})` });
const noTests: TestRun = { failed: 0, total: 0, filesFailed: 1, raw: 'Tests  no tests' };

const baseline = (totals: Record<string, number>, failed = 0): BaselineFor => (tests) => {
  const total = totals[scopeOf({ tests: tests === undefined ? undefined : [...tests] })];
  return total === undefined ? undefined : { failed, total };
};

const killing = () => tally(3, 20);
const surviving = () => tally(0, 20);

describe('mutate: restoring the file', () => {
  it('puts back exactly what it captured, and the run leaves no trace', () => {
    const files = store({ 'a.ts': ORIGINAL });
    runMutations([mutation()], files, killing);
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('restores work that is not in git, because it never asks git for the original', () => {
    // The technique this replaces used `git checkout --`, which restores HEAD
    // rather than the file: uncommitted edits in the mutated file were lost.
    const uncommitted = `${ORIGINAL}// an edit no commit holds\n`;
    const files = store({ 'a.ts': uncommitted });
    runMutations([mutation()], files, killing);
    expect(files.read('a.ts')).toBe(uncommitted);
  });

  it('restores when the test command reports failures', () => {
    const files = store({ 'a.ts': ORIGINAL });
    runMutations([mutation()], files, () => tally(19, 20));
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('restores when the test command throws, and reports the mutation as errored', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = runMutations(
      [mutation()],
      files,
      () => {
        throw new Error('spawn failed');
      },
      );
    expect(files.read('a.ts')).toBe(ORIGINAL);
    expect(report.results[0].verdict).toBe('ERROR');
    expect(report.results[0].detail).toContain('spawn failed');
  });

  it('restores between mutations, so the second never sees the first', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const seen: string[] = [];
    runMutations([mutation({ name: 'c1' }), mutation({ name: 'c2', find: 'const other = 1', replace: 'const other = 2' })], files, () => {
      seen.push(files.read('a.ts'));
      return killing();
    });
    expect(seen[0]).toContain('const other = 1');
    expect(seen[1]).toContain('entityTypeBase(merged, section)');
  });

  it('writes the mutant before the tests run, not after', () => {
    const files = store({ 'a.ts': ORIGINAL });
    let duringRun = '';
    runMutations([mutation()], files, () => {
      duringRun = files.read('a.ts');
      return killing();
    });
    expect(duringRun).toContain('const base = undefined;');
    expect(duringRun).not.toContain('entityTypeBase');
  });
});

describe('mutate: refusing before it writes', () => {
  it('refuses a find text the file does not contain, by name', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = runMutations([mutation({ find: 'nothing like this' })], files, killing);
    expect(report.refusals.join('\n')).toContain('c1');
    expect(files.writes).toEqual([]);
  });

  it('refuses an ambiguous find rather than guessing which one was meant', () => {
    const files = store({ 'a.ts': 'x = 1;\nx = 1;\n' });
    const report = runMutations([mutation({ find: 'x = 1', replace: 'x = 2' })], files, killing);
    expect(report.refusals.join('\n')).toMatch(/2 times/);
    expect(files.writes).toEqual([]);
  });

  it('takes an ambiguous find when the mutation says all', () => {
    const files = store({ 'a.ts': 'x = 1;\nx = 1;\n' });
    let duringRun = '';
    const report = runMutations([mutation({ find: 'x = 1', replace: 'x = 2', all: true })], files, () => {
      duringRun = files.read('a.ts');
      return killing();
    });
    expect(report.refusals).toEqual([]);
    expect(duringRun).toBe('x = 2;\nx = 2;\n');
  });

  it('refuses a file it cannot read', () => {
    const report = runMutations([mutation({ file: 'gone.ts' })], store({}), killing);
    expect(report.refusals.join('\n')).toContain('gone.ts');
  });

  it('applies nothing at all when one mutation of several is bad', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = runMutations([mutation({ name: 'good' }), mutation({ name: 'bad', find: 'absent' })], files, killing);
    expect(report.results).toEqual([]);
    expect(files.writes).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it('names every bad mutation, not only the first', () => {
    const report = runMutations([mutation({ name: 'bad1', find: 'absent' }), mutation({ name: 'bad2', find: 'also absent' })], store({ 'a.ts': ORIGINAL }), killing);
    expect(report.refusals).toHaveLength(2);
  });

  it('refuses a replacement identical to what it finds, which would measure nothing', () => {
    const report = runMutations([mutation({ find: 'const other = 1', replace: 'const other = 1' })], store({ 'a.ts': ORIGINAL }), killing);
    expect(report.refusals.join('\n')).toContain('c1');
  });
});

describe('mutate: the verdict', () => {
  it('calls a mutation the suite noticed KILLED, with the count', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 20));
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].failed).toBe(3);
    expect(report.results[0].total).toBe(20);
  });

  it('calls a mutation nothing noticed SURVIVED', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].verdict).toBe('SURVIVED');
  });

  it('records the scope every verdict was measured against', () => {
    const scoped = runMutations([mutation({ tests: ['src/content/entityType.test.ts'] })], store({ 'a.ts': ORIGINAL }), killing);
    expect(scoped.results[0].scope).toBe('src/content/entityType.test.ts');
  });

  it('measures a mutation that names no scope against the whole suite, and says so', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].scope).toBe('whole suite');
  });

  it('hands the runner exactly the tests the mutation named', () => {
    const asked: (readonly string[] | undefined)[] = [];
    runMutations([mutation({ tests: ['a.test.ts', 'b.test.ts'] }), mutation({ name: 'c2' })], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return killing();
    });
    expect(asked).toEqual([['a.test.ts', 'b.test.ts'], undefined]);
  });

  it('will not call a suite that never ran either killed or survived', () => {
    // A mutation that does not build makes vitest collect nothing. Reading that
    // as KILLED would credit the suite for a failure it never produced.
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => noTests);
    expect(report.results[0].verdict).toBe('ERROR');
    expect(report.results[0].detail).toMatch(/no tests/i);
  });

  it('keeps the run output on an errored mutation, which is where the reason is', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => ({ failed: 0, total: 0, filesFailed: 1, raw: 'Transform failed\nUnexpected token (14:8)\nTests  no tests' }));
    expect(report.results[0].output).toContain('Unexpected token');
    expect(formatReport(report)).toContain('Unexpected token');
  });

  it('is not satisfied by a run that produced a survivor', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving).ok).toBe(false);
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), killing).ok).toBe(true);
  });
});

describe('mutate: proving the restore', () => {
  it('reports a file it could not put back as a failure of the run, not a result', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const readOnly: FileStore = { read: files.read, write: (file, text) => files.write(file, file === 'a.ts' ? `${text}corrupted` : text) };
    const report = runMutations([mutation()], readOnly, killing);
    expect(report.ok).toBe(false);
    expect(report.unrestored).toEqual(['a.ts']);
  });

  it('says nothing about restoration when every file came back byte-identical', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), killing).unrestored).toEqual([]);
  });

  // The byte-compare alone cannot see this: the content is correct, and only the
  // failure of the write says the file may not be settled on disk.
  it('reports a restore that threw even though the bytes did land', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const flushedThenFailed: FileStore = {
      read: files.read,
      write(file, text) {
        files.write(file, text);
        if (text === ORIGINAL) throw new Error('EIO: bytes written, close failed');
      },
    };
    const report = runMutations([mutation()], flushedThenFailed, killing);
    expect(files.read('a.ts')).toBe(ORIGINAL);
    expect(report.unrestored).toEqual(['a.ts']);
    expect(report.ok).toBe(false);
  });

  // A restore that throws must not become the exception that escapes the loop:
  // that would abandon the remaining mutations and skip this proof entirely.
  it('survives a restore write that throws, still runs the rest, and still reports', () => {
    const files = store({ 'a.ts': ORIGINAL, 'b.ts': 'other' });
    let restores = 0;
    const flaky: FileStore = {
      read: files.read,
      write(file, text) {
        if (file === 'a.ts' && text === ORIGINAL && restores++ === 0) throw new Error('EPERM: operation not permitted');
        files.write(file, text);
      },
    };
    const report = runMutations([mutation({ name: 'first' }), mutation({ name: 'second', file: 'b.ts', find: 'other', replace: 'changed' })], flaky, killing);
    expect(report.results.map((result) => result.name)).toEqual(['first', 'second']);
    expect(report.unrestored).toContain('a.ts');
    expect(report.ok).toBe(false);
  });
});

describe('mutate: the output tail', () => {
  it('keeps the last lines, which is where a build error lands', () => {
    expect(outputTail('one\ntwo\nthree', 2)).toBe('two\nthree');
  });

  it('drops blank lines rather than spending the budget on them', () => {
    expect(outputTail('one\n\n\n\ntwo', 2)).toBe('one\ntwo');
  });

  it('returns everything when there is less than the budget', () => {
    expect(outputTail('only', 12)).toBe('only');
  });
});

describe('mutate: applying the text', () => {
  // The whole reason this is split/join and not String.replace, whose
  // replacement argument reads `$&`, `` $` ``, `$'` and `$1` as instructions.
  it('treats a replacement containing $ sequences as literal text', () => {
    expect(applyTo('const x = HERE;', { find: 'HERE', replace: "$& $` $' $1 $$" })).toBe("const x = $& $` $' $1 $$;");
  });

  it('treats $ sequences in the find text as literal too', () => {
    expect(applyTo('a $& b', { find: '$&', replace: 'X' })).toBe('a X b');
  });

  it('replaces every occurrence when asked, and the count is what refuse() gates on', () => {
    expect(applyTo('x x x', { find: 'x', replace: 'y' })).toBe('y y y');
  });
});

describe('mutate: staying inside the repository', () => {
  const root = path.resolve('/repo');

  it('accepts a path under the root', () => {
    expect(escapesRoot(root, 'src/content/registry.ts')).toBe(false);
  });

  it('refuses a climb out of the root', () => {
    expect(escapesRoot(root, '../elsewhere/file.ts')).toBe(true);
    expect(escapesRoot(root, 'src/../../file.ts')).toBe(true);
  });

  it('refuses an absolute path outside the root', () => {
    expect(escapesRoot(root, path.resolve('/somewhere/else.ts'))).toBe(true);
  });

  it('accepts an absolute path that is inside the root', () => {
    expect(escapesRoot(root, path.join(root, 'src/x.ts'))).toBe(false);
  });

  it('refuses the root itself, which is a directory rather than a file', () => {
    expect(escapesRoot(root, '.')).toBe(true);
  });
});

describe('mutate: whose journal it is', () => {
  const dead = () => false;
  const live = () => true;
  const now = Date.parse('2026-08-03T12:00:00Z');
  const recent = { pid: 4242, startedAt: '2026-08-03T11:00:00Z' };

  it('recovers from a journal whose owner is gone', () => {
    expect(journalVerdict(recent, 1, dead, now)).toBe('recover');
  });

  it('refuses a journal whose owner is still running', () => {
    expect(journalVerdict(recent, 1, live, now)).toBe('busy');
  });

  it('recovers its own journal, since a live pid that is us is not another run', () => {
    expect(journalVerdict({ pid: 7, startedAt: recent.startedAt }, 7, live, now)).toBe('recover');
  });

  // Otherwise a recycled pid wedges every later run behind a permanent "busy",
  // and the only escape is deleting a file the error does not name.
  it('recovers from a live pid that has held the journal implausibly long, which is pid reuse', () => {
    expect(journalVerdict({ pid: 4242, startedAt: '2026-08-01T00:00:00Z' }, 1, live, now)).toBe('recover');
  });

  it('treats an unparseable startedAt as busy rather than as ancient', () => {
    expect(journalVerdict({ pid: 4242, startedAt: 'whenever' }, 1, live, now)).toBe('busy');
  });
});

describe('mutate: deciding whether a pid is alive', () => {
  const throwing = (code: string) => () => {
    throw Object.assign(new Error(code), { code });
  };

  it('is alive when the probe returns', () => {
    expect(pidIsAlive(1, () => undefined)).toBe(true);
  });

  it('is dead only on ESRCH', () => {
    expect(pidIsAlive(1, throwing('ESRCH'))).toBe(false);
  });

  // A process owned by another user is the most alive a pid can be. Reading
  // EPERM as dead would recover a journal a live run is still holding.
  it('is alive on EPERM, which means it exists and is not ours', () => {
    expect(pidIsAlive(1, throwing('EPERM'))).toBe(true);
  });

  it('is dead on anything else it cannot interpret', () => {
    expect(pidIsAlive(1, throwing('EINVAL'))).toBe(false);
  });
});

describe('mutate: reading a journal off disk', () => {
  const whole = JSON.stringify({ root: '/repo', pid: 7, startedAt: 'now', files: { 'a.ts': 'x' } });

  it('reads a whole one', () => {
    expect(readJournal(whole)).toEqual({ root: '/repo', pid: 7, startedAt: 'now', files: { 'a.ts': 'x' } });
  });

  // The wedge: a run killed mid-write left a half journal, and every later run
  // died on it before reading the manifest, recovering, or restoring anything.
  it('returns null for a truncated journal rather than throwing', () => {
    expect(readJournal(whole.slice(0, 40))).toBeNull();
    expect(readJournal('')).toBeNull();
  });

  it('returns null for JSON that is not a journal', () => {
    expect(readJournal('[]')).toBeNull();
    expect(readJournal('null')).toBeNull();
    expect(readJournal('{"pid":7}')).toBeNull();
    expect(readJournal('{"root":"/r","pid":"seven","files":{}}')).toBeNull();
    expect(readJournal('{"root":"/r","pid":7,"files":{"a.ts":42}}')).toBeNull();
  });

  it('tolerates a missing startedAt, which journalVerdict then reads as busy', () => {
    expect(readJournal('{"root":"/r","pid":7,"files":{}}')?.startedAt).toBe('');
  });
});

describe('mutate: where a journal lives', () => {
  it('gives two checkouts two different journals, so one cannot recover into the other', () => {
    expect(journalPathFor(path.resolve('/a/repo'))).not.toBe(journalPathFor(path.resolve('/b/repo')));
  });

  it('gives one checkout the same journal every time, however the path was spelled', () => {
    expect(journalPathFor(path.resolve('/a/repo'))).toBe(journalPathFor(path.resolve('/a/repo/sub/..')));
  });
});

describe('mutate: recovering an interrupted run', () => {
  const anywhere = () => true;

  it('puts back a file the journal says was mutated', () => {
    const files = store({ 'a.ts': 'MUTATED' });
    expect(recoverFrom({ 'a.ts': ORIGINAL }, files, anywhere).restored).toEqual(['a.ts']);
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('leaves a file that is already correct alone, and reports nothing for it', () => {
    const files = store({ 'a.ts': ORIGINAL });
    expect(recoverFrom({ 'a.ts': ORIGINAL }, files, anywhere).restored).toEqual([]);
    expect(files.writes).toEqual([]);
  });

  it('survives a journal naming a file that no longer exists, and says which', () => {
    const files = store({ 'a.ts': 'MUTATED' });
    const recovery = recoverFrom({ 'gone.ts': 'x', 'a.ts': ORIGINAL }, files, anywhere);
    expect(recovery.restored).toEqual(['a.ts']);
    expect(recovery.refused).toEqual(['gone.ts']);
  });

  // Journal keys are data this process never validated, and recovery runs before
  // anything else. Without this, containment guards only the manifest.
  it('refuses a journal key that escapes the tree, and writes nothing for it', () => {
    // The escaping file must exist and differ, or the guard is indistinguishable
    // from the read simply failing.
    const files = store({ 'a.ts': 'MUTATED', '../outside.ts': 'SOMEONE ELSE\'S FILE' });
    const recovery = recoverFrom({ '../outside.ts': 'journal bytes', 'a.ts': ORIGINAL }, files, (file) => !escapesRoot(path.resolve('/repo'), file));
    expect(recovery.restored).toEqual(['a.ts']);
    expect(recovery.refused).toEqual(['../outside.ts']);
    expect(files.writes.map((each) => each.file)).toEqual(['a.ts']);
    expect(files.read('../outside.ts')).toBe('SOMEONE ELSE\'S FILE');
  });
});

describe('mutate: escalating a narrow survivor', () => {
  const narrow = { tests: ['one.test.ts'] };

  // A file-scope SURVIVED says only that those files missed it. Re-running just
  // the survivors is also what makes a narrow scope affordable: the mutations
  // that die never pay for the whole suite.
  it('re-runs a scoped survivor against the whole suite, and reports both scopes', () => {
    const asked: (readonly string[] | undefined)[] = [];
    const report = runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return tests === undefined ? tally(2, 900) : tally(0, 12);
    });
    expect(asked).toEqual([['one.test.ts'], undefined]);
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].total).toBe(900);
    expect(report.results[0].escalatedFrom).toBe('one.test.ts');
    expect(formatReport(report)).toContain('one.test.ts -> whole suite');
  });

  it('leaves a survivor a survivor when the whole suite misses it too', () => {
    const report = runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => (tests === undefined ? tally(0, 900) : tally(0, 12)));
    expect(report.results[0].verdict).toBe('SURVIVED');
    expect(report.results[0].total).toBe(900);
    expect(report.results[0].escalatedFrom).toBe('one.test.ts');
  });

  it('does not escalate a mutation the narrow scope already killed', () => {
    const asked: (readonly string[] | undefined)[] = [];
    runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return killing();
    });
    expect(asked).toEqual([['one.test.ts']]);
  });

  it('does not escalate a mutation already measured against the whole suite', () => {
    const asked: (readonly string[] | undefined)[] = [];
    runMutations([mutation()], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return surviving();
    });
    expect(asked).toEqual([undefined]);
  });

  it('does not escalate an errored mutation, which measured nothing to escalate', () => {
    const asked: (readonly string[] | undefined)[] = [];
    runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return noTests;
    });
    expect(asked).toEqual([['one.test.ts']]);
  });

  it('keeps the file mutated across the escalation, so the wider run measures the same thing', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const seen: string[] = [];
    runMutations([mutation(narrow)], files, (tests) => {
      seen.push(files.read('a.ts'));
      return tests === undefined ? tally(0, 900) : tally(0, 12);
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[1]).toContain('const base = undefined;');
  });

  it('asks for the whole suite baseline only when something escalates', () => {
    const asked: string[] = [];
    const watching: BaselineFor = (tests) => {
      asked.push(scopeOf({ tests: tests === undefined ? undefined : [...tests] }));
      return { failed: 0, total: 12 };
    };
    runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), killing, watching);
    expect(asked).toEqual(['one.test.ts']);
  });
});

describe('mutate: taking the baseline on an unmutated tree', () => {
  // A baseline measured with the mutant on disk is not a baseline, it is a
  // second reading of the same thing — and the shortfall it exists to expose is
  // exactly what it then suppresses.
  const watchTree = (files: { read(file: string): string }) => {
    const seen: { at: string; sawMutant: boolean }[] = [];
    return {
      seen,
      baselineFor: ((tests) => {
        seen.push({ at: `baseline(${tests ? 'narrow' : 'whole'})`, sawMutant: files.read('a.ts') !== ORIGINAL });
        return { failed: 0, total: 40 };
      }) as BaselineFor,
      runTests: ((tests) => {
        const mutated = files.read('a.ts') !== ORIGINAL;
        seen.push({ at: `run(${tests ? 'narrow' : 'whole'})`, sawMutant: mutated });
        return tally(0, mutated ? 25 : 40);
      }) as RunTests,
    };
  };

  it('measures the narrow baseline before the mutant is written', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    runMutations([mutation({ tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    expect(watch.seen.filter((each) => each.at.startsWith('baseline')).every((each) => each.sawMutant)).toBe(false);
    expect(watch.seen[0]).toEqual({ at: 'baseline(narrow)', sawMutant: false });
  });

  it('measures the whole-suite baseline before re-writing the mutant to escalate', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    runMutations([mutation({ tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    const whole = watch.seen.find((each) => each.at === 'baseline(whole)');
    expect(whole).toEqual({ at: 'baseline(whole)', sawMutant: false });
  });

  it('reports the shortfall a mutated baseline would have hidden', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    const report = runMutations([mutation({ tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    expect(report.results[0].shortfall).toBe(15);
  });

  it('asks for the whole-suite baseline only once, however many survivors escalate', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    runMutations([mutation({ name: 'a', tests: ['a.test.ts'] }), mutation({ name: 'b', find: 'const other = 1', replace: 'const other = 2', tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    expect(watch.seen.filter((each) => each.at === 'baseline(whole)')).toHaveLength(1);
  });
});

describe('mutate: a file that failed to collect', () => {
  // vitest counts a collection failure on `Test Files` and not in `Tests`, so
  // the tests that did collect would otherwise read as a clean sweep of a suite
  // that never assembled — a SURVIVED for a mutation that did not build.
  it('is an error, not a verdict, when files failed and no test did', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(0, 30, 1));
    expect(report.results[0].verdict).toBe('ERROR');
    expect(report.results[0].detail).toContain('failed to collect');
  });

  it('is still a kill when a test actually failed alongside it', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(2, 30, 1)).results[0].verdict).toBe('KILLED');
  });

  it('leaves an ordinary clean run alone', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(0, 30, 0)).results[0].verdict).toBe('SURVIVED');
  });

  it('reads the failed file count off the Test Files line', () => {
    expect(parseVitestTally(' Test Files  1 failed | 1 passed (2)\n      Tests  30 passed (30)\n')).toEqual({ failed: 0, total: 30, filesFailed: 1 });
  });
});

describe('mutate: a tree that was already red', () => {
  // Escalation pushes every survivor into the full suite, where any unrelated
  // failing test lives. Comparing against zero would call them all KILLED.
  it('does not credit a mutation for failures the baseline already had', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(2, 100), baseline({ 'whole suite': 100 }, 2));
    expect(report.results[0].verdict).toBe('SURVIVED');
    expect(report.results[0].baselineFailed).toBe(2);
    expect(formatReport(report)).toContain('already failing');
  });

  it('still kills a mutation that broke something beyond what was already red', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 100), baseline({ 'whole suite': 100 }, 2));
    expect(report.results[0].verdict).toBe('KILLED');
  });

  it('says nothing about a red baseline when the tree was green', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(1, 100), baseline({ 'whole suite': 100 }));
    expect(report.results[0].baselineFailed).toBeUndefined();
    expect(formatReport(report)).not.toContain('already failing');
  });
});

describe('mutate: the baseline', () => {
  it('reports how many tests stopped running when the denominator shrank', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 950), baseline({ 'whole suite': 1000 }));
    expect(report.results[0].shortfall).toBe(50);
    expect(formatReport(report)).toContain('50 fewer tests ran');
  });

  it('says nothing when the count held', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 1000), baseline({ 'whole suite': 1000 }));
    expect(report.results[0].shortfall).toBeUndefined();
    expect(formatReport(report)).not.toContain('fewer tests');
  });

  it('does not treat a suite that grew as a shortfall', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 1100), baseline({ 'whole suite': 1000 })).results[0].shortfall).toBeUndefined();
  });

  it('matches a baseline to the scope it was measured for', () => {
    const report = runMutations([mutation({ tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), () => tally(1, 5), baseline({ 'one.test.ts': 9 }));
    expect(report.results[0].shortfall).toBe(4);
  });

  it('reports nothing when no baseline was measured at all', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 950)).results[0].shortfall).toBeUndefined();
  });

  // A SURVIVED measured without a baseline is a weaker claim than one measured
  // with, and the report is what gets pasted into an audit.
  it('says on the row when a scope had no baseline, rather than looking like a clean measurement', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].unmeasured).toBe(true);
    expect(formatReport(report)).toContain('no baseline');
  });

  it('says nothing of the sort when the scope did have one', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving, baseline({ 'whole suite': 20 }));
    expect(report.results[0].unmeasured).toBe(false);
    expect(formatReport(report)).not.toContain('no baseline');
  });

  it('refuses a manifest with the same answer whether the check runs early or late', () => {
    const files = store({ 'a.ts': ORIGINAL });
    expect(refusalsFor([mutation({ name: 'bad', find: 'absent' })], files)).toHaveLength(1);
    expect(files.writes).toEqual([]);
  });
});

// The refusal that cost three separate sessions two rounds each. All three
// misses were invisible in the manifest and obvious beside the file's own
// line, which the checker already had open.
describe('mutate: a find that missed', () => {
  const file = "export const SEPARATOR = '---';\nconst indented = value;\n";

  it('quotes the nearest line beside what was asked for', () => {
    const refusal = findMissRefusal('m1', 'a.ts', file, "export const SEPARATOR = '--';");
    expect(refusal).toContain('The nearest line is a.ts:1');
    expect(refusal).toContain("asked for: export const SEPARATOR = '--';");
    expect(refusal).toContain("file has:  export const SEPARATOR = '---';");
  });

  it('spells out the whitespace the eye cannot see, at both margins', () => {
    expect(visibleWhitespace('a\tb \r')).toBe('a\\tb \\r');
    expect(visibleWhitespace('trailing   ')).toBe('trailing···');
    expect(visibleWhitespace('    leading')).toBe('····leading');
    expect(findMissRefusal('m1', 'a.ts', 'const x = 1;\n', 'const\tx = 1;')).toContain('asked for: const\\tx = 1;');
  });

  it('draws the margin, so a find text copied without its indentation says why it missed', () => {
    const refusal = findMissRefusal('m1', 'a.ts', '  const indented = value;\n', 'const indented = value;');
    expect(refusal).toContain('asked for: const indented = value;');
    expect(refusal).toContain('file has:  ··const indented = value;');
  });

  it('names a CRLF miss by showing the line ending the file carries', () => {
    const refusal = findMissRefusal('m1', 'a.ts', 'const x = 1;\r\nconst y = 2;\r\n', 'const x = 1;\n');
    expect(refusal).toContain('file has:  const x = 1;\\r');
  });

  it('says the text is simply absent rather than pointing at a coincidence', () => {
    const refusal = findMissRefusal('m1', 'a.ts', file, 'zzzzzzzzzzzzzzzz');
    expect(refusal).toContain('no line in it comes close');
    expect(refusal).not.toContain('nearest line');
  });

  it('is what refusalsFor reports, so the manifest check and the message cannot drift', () => {
    const refusals = refusalsFor([mutation({ name: 'bad', find: 'const iindented = value;' })], store({ 'a.ts': file }));
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('file has:  const indented = value;');
  });
});

// Resolved the way node resolves it. The join onto the repo root named a file
// a worktree does not have, and every mutation there errored with a stack
// instead of the run saying once that it could not start.
describe('mutate: finding the test runner', () => {
  it('resolves the vitest CLI this checkout would actually run', () => {
    const resolved = resolveVitest();
    expect(resolved).not.toHaveProperty('missing');
    expect((resolved as { cli: string }).cli).toMatch(/vitest\.mjs$/);
    expect(existsSync((resolved as { cli: string }).cli)).toBe(true);
  });
});

describe('mutate: reading vitest back', () => {
  it('reads a mixed tally', () => {
    expect(parseVitestTally('   Tests  1 failed | 15 passed (16)\n')).toEqual({ failed: 1, total: 16, filesFailed: 0 });
  });

  it('reads an all-passing tally', () => {
    expect(parseVitestTally(' Test Files  45 passed (45)\n      Tests  985 passed (985)\n')).toEqual({ failed: 0, total: 985, filesFailed: 0 });
  });

  it('reads a tally carrying skips', () => {
    expect(parseVitestTally('Tests  2 failed | 3 passed | 1 skipped (6)')).toEqual({ failed: 2, total: 6, filesFailed: 0 });
  });

  it('reports no tally when the run collected nothing', () => {
    expect(parseVitestTally(' Test Files  1 failed (1)\n      Tests  no tests\n')).toEqual({ failed: 0, total: 0, filesFailed: 1 });
  });

  it('returns null when there is no Tests line at all', () => {
    expect(parseVitestTally('command not found')).toBeNull();
  });

  // Not the same answer as "no tests ran". Collapsing them would let a garbled
  // run read as a clean zero, and the `no tests` branch would be dead code.
  it('returns null for a Tests line it cannot read a count out of', () => {
    expect(parseVitestTally('Tests  something went very wrong')).toBeNull();
  });

  it('still reads a genuine no-tests run as a tally of zero', () => {
    expect(parseVitestTally('Tests  no tests')).toEqual({ failed: 0, total: 0, filesFailed: 0 });
  });

  it('takes the last tally when the output carries more than one', () => {
    expect(parseVitestTally('Tests  1 failed | 1 passed (2)\nrerun\nTests  4 failed | 1 passed (5)')).toEqual({ failed: 4, total: 5, filesFailed: 0 });
  });
});

describe('mutate: which stream the tally comes from', () => {
  const SUMMARY = ' Test Files  2 passed (2)\n      Tests  1 failed | 1 passed (2)\n';

  // The pass-1 HIGH, now reachable. Reading stdout+stderr and taking the last
  // match let a test's own output decide the verdict.
  it('ignores a tally-shaped line a failing test printed to stderr', () => {
    const run = tallyOf({ stdout: SUMMARY, stderr: 'Tests  0 failed | 999 passed (999)\n' });
    expect(run.failed).toBe(1);
    expect(run.total).toBe(2);
  });

  it('ignores a stderr decoy that would have inverted the verdict the other way', () => {
    const run = tallyOf({ stdout: ' Test Files  1 passed (1)\n      Tests  20 passed (20)\n', stderr: 'Tests  3 failed | 1 passed (4)\n' });
    expect(run.failed).toBe(0);
    expect(run.total).toBe(20);
  });

  it('keeps both streams in raw, so the report can still show what happened', () => {
    expect(tallyOf({ stdout: SUMMARY, stderr: 'the failure detail lives here' }).raw).toContain('the failure detail lives here');
  });

  it('throws rather than guessing when stdout carries no tally at all', () => {
    expect(() => tallyOf({ stdout: '', stderr: 'Tests  1 failed | 1 passed (2)' })).toThrow(/could not read a test tally/);
  });
});

describe('mutate: the manifest', () => {
  it('reads a list of mutations', () => {
    const parsed = parseManifest('[{"name":"c6","file":"a.ts","find":"x","replace":"y","tests":["a.test.ts"]}]');
    expect(parsed).toEqual([{ name: 'c6', file: 'a.ts', find: 'x', replace: 'y', tests: ['a.test.ts'] }]);
  });

  it('refuses text that is not JSON, saying so', () => {
    expect(() => parseManifest('not json')).toThrow(/JSON/);
  });

  it('refuses a manifest that is not a list', () => {
    expect(() => parseManifest('{"name":"c6"}')).toThrow(/list/);
  });

  it('names the entry and the field that is missing', () => {
    expect(() => parseManifest('[{"name":"c6","file":"a.ts","find":"x"}]')).toThrow(/c6.*replace|replace.*c6/);
  });

  it('refuses an entry with no name, since the name is how a verdict is reported', () => {
    expect(() => parseManifest('[{"file":"a.ts","find":"x","replace":"y"}]')).toThrow(/name/);
  });

  it('refuses two entries sharing a name', () => {
    expect(() => parseManifest('[{"name":"c6","file":"a.ts","find":"x","replace":"y"},{"name":"c6","file":"a.ts","find":"z","replace":"w"}]')).toThrow(/c6/);
  });

  it('takes an empty replace, because deleting what you found is the most direct mutation', () => {
    expect(parseManifest('[{"name":"c6","file":"a.ts","find":"x","replace":""}]')[0].replace).toBe('');
  });

  it('still refuses an empty find, which would match everywhere', () => {
    expect(() => parseManifest('[{"name":"c6","file":"a.ts","find":"","replace":"y"}]')).toThrow(/find/);
  });

  it('refuses an empty manifest rather than reporting a clean run of nothing', () => {
    expect(() => parseManifest('[]')).toThrow(/nothing to measure/);
  });

  it('refuses tests that is not a list of strings', () => {
    expect(() => parseManifest('[{"name":"c6","file":"a.ts","find":"x","replace":"y","tests":"a.test.ts"}]')).toThrow(/tests/);
  });
});

describe('mutate: the report', () => {
  it('leads with the survivors, because a survivor is the finding', () => {
    const report = runMutations([mutation({ name: 'lived' }), mutation({ name: 'died', find: 'const other = 1', replace: 'const other = 2', tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), (tests) => (tests === undefined ? surviving() : killing()));
    const printed = formatReport(report);
    expect(printed).toContain('SURVIVED');
    expect(printed.indexOf('lived')).toBeLessThan(printed.indexOf('died'));
  });

  it('never prints a verdict without the scope it was measured against', () => {
    const report = runMutations([mutation({ tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), surviving);
    expect(formatReport(report)).toContain('one.test.ts');
  });

  it('says plainly when a file did not come back', () => {
    const files = store({ 'a.ts': ORIGINAL });
    const readOnly: FileStore = { read: files.read, write: (file, text) => files.write(file, `${text}corrupted`) };
    expect(formatReport(runMutations([mutation()], readOnly, killing))).toMatch(/NOT RESTORED|not restored/i);
  });
});
