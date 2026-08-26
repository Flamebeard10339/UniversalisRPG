import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunnerTestFile } from 'vitest/node';
import { applyTo, asLiteralPattern, oneMutationFrom, watchedBy, escapesRoot, filesOf, findMissRefusal, formatReport, journalVerdict, outputTail, parseManifest, journalPathFor, pidIsAlive, putBackAll, readJournal, recoveryStanding, scopeOf, tallyRun, type Baseline, type BaselineFor, type RunTests, recoverFrom, refusalsFor, runMutations, visibleWhitespace, type FileStore, type Mutation, type TestRun } from './mutate';

const ORIGINAL = 'const base = entityTypeBase(merged, section);\nconst other = 1;\n';

function store(files: Record<string, string>): FileStore & { writes: { file: string; text: string }[]; paths: () => string[] } {
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
    paths: () => Object.keys(content),
  };
}

const mutation = (over: Partial<Mutation> = {}): Mutation => ({ name: 'c1', file: 'a.ts', find: 'entityTypeBase(merged, section)', replace: 'undefined', ...over });

const failingTests = (count: number, file = 'one.test.ts'): string[] => Array.from({ length: count }, (_, index) => `${file} > the suite > t${index + 1}`);

const tallyIn = (file: string, failed: number, total: number): TestRun => ({ failed, passed: total - failed, total, filesFailed: 0, failures: failingTests(failed, file), raw: `Tests ${failed} failed | ${total - failed} passed (${total})` });
const tally = (failed: number, total: number, filesFailed = 0): TestRun => ({ ...tallyIn('one.test.ts', failed, total), filesFailed });
const noTests: TestRun = { failed: 0, passed: 0, total: 0, filesFailed: 1, failures: [], raw: 'Tests  no tests' };

const baseline = (totals: Record<string, number>, failed = 0): BaselineFor => (tests, test) => {
  const total = totals[scopeOf({ tests: tests === undefined ? undefined : [...tests], test })];
  return total === undefined ? undefined : { failed, total, ran: total, failures: failingTests(failed) };
};

const killing = () => tally(3, 20);
const surviving = () => tally(0, 20);

const runOf = (failures: string[], total = 20): TestRun => ({ failed: failures.length, passed: total - failures.length, total, filesFailed: 0, failures, raw: `Tests ${failures.length} failed | ${total - failures.length} passed (${total})` });
const baselineOf = (failures: string[], total = 20): Baseline => ({ failed: failures.length, total, ran: total, failures });

describe('mutate: restoring the file', () => {
  it('puts back exactly what it captured, and the run leaves no trace', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    await runMutations([mutation()], files, killing);
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('restores work that is not in git, because it never asks git for the original', async () => {
    const uncommitted = `${ORIGINAL}// an edit no commit holds\n`;
    const files = store({ 'a.ts': uncommitted });
    await runMutations([mutation()], files, killing);
    expect(files.read('a.ts')).toBe(uncommitted);
  });

  it('restores when the test command reports failures', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    await runMutations([mutation()], files, () => tally(19, 20));
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('restores when the test command throws, and reports the mutation as errored', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations(
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

  it('restores between mutations, so the second never sees the first', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const seen: string[] = [];
    await runMutations([mutation({ name: 'c1' }), mutation({ name: 'c2', find: 'const other = 1', replace: 'const other = 2' })], files, () => {
      seen.push(files.read('a.ts'));
      return killing();
    });
    expect(seen[0]).toContain('const other = 1');
    expect(seen[1]).toContain('entityTypeBase(merged, section)');
  });

  it('writes the mutant before the tests run, not after', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    let duringRun = '';
    await runMutations([mutation()], files, () => {
      duringRun = files.read('a.ts');
      return killing();
    });
    expect(duringRun).toContain('const base = undefined;');
    expect(duringRun).not.toContain('entityTypeBase');
  });
});

describe('mutate: refusing before it writes', () => {
  it('refuses a find text the file does not contain, by name', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations([mutation({ find: 'nothing like this' })], files, killing);
    expect(report.refusals.join('\n')).toContain('c1');
    expect(files.writes).toEqual([]);
  });

  it('refuses an ambiguous find rather than guessing which one was meant', async () => {
    const files = store({ 'a.ts': 'x = 1;\nx = 1;\n' });
    const report = await runMutations([mutation({ find: 'x = 1', replace: 'x = 2' })], files, killing);
    expect(report.refusals.join('\n')).toMatch(/2 times/);
    expect(files.writes).toEqual([]);
  });

  it('takes an ambiguous find when the mutation says all', async () => {
    const files = store({ 'a.ts': 'x = 1;\nx = 1;\n' });
    let duringRun = '';
    const report = await runMutations([mutation({ find: 'x = 1', replace: 'x = 2', all: true })], files, () => {
      duringRun = files.read('a.ts');
      return killing();
    });
    expect(report.refusals).toEqual([]);
    expect(duringRun).toBe('x = 2;\nx = 2;\n');
  });

  it('refuses a file it cannot read', async () => {
    const report = await runMutations([mutation({ file: 'gone.ts' })], store({}), killing);
    expect(report.refusals.join('\n')).toContain('gone.ts');
  });

  it('applies nothing at all when one mutation of several is bad', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations([mutation({ name: 'good' }), mutation({ name: 'bad', find: 'absent' })], files, killing);
    expect(report.results).toEqual([]);
    expect(files.writes).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it('names every bad mutation, not only the first', async () => {
    const report = await runMutations([mutation({ name: 'bad1', find: 'absent' }), mutation({ name: 'bad2', find: 'also absent' })], store({ 'a.ts': ORIGINAL }), killing);
    expect(report.refusals).toHaveLength(2);
  });

  it('refuses a replacement identical to what it finds, which would measure nothing', async () => {
    const report = await runMutations([mutation({ find: 'const other = 1', replace: 'const other = 1' })], store({ 'a.ts': ORIGINAL }), killing);
    expect(report.refusals.join('\n')).toContain('c1');
  });
});

describe('mutate: the verdict', () => {
  it('calls a mutation the suite noticed KILLED, with the count', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 20));
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].failed).toBe(3);
    expect(report.results[0].total).toBe(20);
  });

  it('calls a mutation nothing noticed SURVIVED', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].verdict).toBe('SURVIVED');
  });

  it('records the scope every verdict was measured against', async () => {
    const scoped = await runMutations([mutation({ tests: ['src/content/entityType.test.ts'] })], store({ 'a.ts': ORIGINAL }), killing);
    expect(scoped.results[0].scope).toBe('src/content/entityType.test.ts');
  });

  it('measures a mutation that names no scope against the whole suite, and says so', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].scope).toBe('whole suite');
  });

  it('hands the runner exactly the tests the mutation named', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    await runMutations([mutation({ tests: ['a.test.ts', 'b.test.ts'] }), mutation({ name: 'c2' })], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return killing();
    });
    expect(asked).toEqual([['a.test.ts', 'b.test.ts'], undefined, ['one.test.ts'], ['one.test.ts']]);
  });

  it('will not call a suite that never ran either killed or survived', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => noTests);
    expect(report.results[0].verdict).toBe('ERROR');
    expect(report.results[0].detail).toMatch(/no tests/i);
  });

  it('keeps the run output on an errored mutation, which is where the reason is', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => ({ failed: 0, passed: 0, total: 0, filesFailed: 1, failures: [], raw: 'Transform failed\nUnexpected token (14:8)\nTests  no tests' }));
    expect(report.results[0].output).toContain('Unexpected token');
    expect(formatReport(report)).toContain('Unexpected token');
  });

  it('is not satisfied by a run that produced a survivor', async () => {
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving)).ok).toBe(false);
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), killing)).ok).toBe(true);
  });
});

describe('mutate: proving the restore', () => {
  it('reports a file it could not put back as a failure of the run, not a result', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const readOnly: FileStore = { read: files.read, write: (file, text) => files.write(file, file === 'a.ts' ? `${text}corrupted` : text) };
    const report = await runMutations([mutation()], readOnly, killing);
    expect(report.ok).toBe(false);
    expect(report.unrestored).toEqual(['a.ts']);
  });

  it('says nothing about restoration when every file came back byte-identical', async () => {
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), killing)).unrestored).toEqual([]);
  });

  it('reports a restore that threw even though the bytes did land', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const flushedThenFailed: FileStore = {
      read: files.read,
      write(file, text) {
        files.write(file, text);
        if (text === ORIGINAL) throw new Error('EIO: bytes written, close failed');
      },
    };
    const report = await runMutations([mutation()], flushedThenFailed, killing);
    expect(files.read('a.ts')).toBe(ORIGINAL);
    expect(report.unrestored).toEqual(['a.ts']);
    expect(report.ok).toBe(false);
  });

  it('survives a restore write that throws, still runs the rest, and still reports', async () => {
    const files = store({ 'a.ts': ORIGINAL, 'b.ts': 'other' });
    let restores = 0;
    const flaky: FileStore = {
      read: files.read,
      write(file, text) {
        if (file === 'a.ts' && text === ORIGINAL && restores++ === 0) throw new Error('EPERM: operation not permitted');
        files.write(file, text);
      },
    };
    const report = await runMutations([mutation({ name: 'first' }), mutation({ name: 'second', file: 'b.ts', find: 'other', replace: 'changed' })], flaky, killing);
    expect(report.results.map((result) => result.name)).toEqual(['first', 'second']);
    expect(report.unrestored).toContain('a.ts');
    expect(report.ok).toBe(false);
  });
});

describe('mutate: what the run left behind', () => {
  it('a file the tree gained while a mutant was on disk is named in the report', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations(
      [mutation()],
      files,
      () => {
        files.write('dropping.txt', 'left behind');
        return killing();
      },
      undefined,
      files.paths,
    );
    expect(report.treeDelta?.gained).toEqual(['dropping.txt']);
    expect(formatReport(report)).toContain('dropping.txt');
  });

  it('a run that added nothing says so rather than staying silent', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations([mutation()], files, killing, undefined, files.paths);
    expect(report.treeDelta).toEqual({ gained: [], lost: [] });
    expect(formatReport(report)).toContain('gained nothing');
  });

  it('a path the run gained is reported and not deleted', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations(
      [mutation()],
      files,
      () => {
        files.write('dropping.txt', 'left behind');
        return killing();
      },
      undefined,
      files.paths,
    );
    expect(report.treeDelta?.gained).toEqual(['dropping.txt']);
    expect(files.read('dropping.txt')).toBe('left behind');
  });

  it('a path the run lost is named the same way', async () => {
    const listings: string[][] = [['a.ts', 'b.txt'], ['a.ts']];
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), killing, undefined, () => listings.shift()!);
    expect(report.treeDelta?.lost).toEqual(['b.txt']);
    expect(formatReport(report)).toContain('b.txt');
  });

  it('claims nothing about the tree when the run had no way to look', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), killing);
    expect(report.treeDelta).toBeUndefined();
    expect(formatReport(report)).not.toContain('gained nothing');
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
    expect(readJournal(whole)).toEqual({ root: '/repo', pid: 7, startedAt: 'now', head: null, files: { 'a.ts': 'x' } });
  });

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

  it('refuses a journal key that escapes the tree, and writes nothing for it', () => {
    const files = store({ 'a.ts': 'MUTATED', '../outside.ts': 'SOMEONE ELSE\'S FILE' });
    const recovery = recoverFrom({ '../outside.ts': 'journal bytes', 'a.ts': ORIGINAL }, files, (file) => !escapesRoot(path.resolve('/repo'), file));
    expect(recovery.restored).toEqual(['a.ts']);
    expect(recovery.refused).toEqual(['../outside.ts']);
    expect(files.writes.map((each) => each.file)).toEqual(['a.ts']);
    expect(files.read('../outside.ts')).toBe('SOMEONE ELSE\'S FILE');
  });

  it('refuses to restore a journal captured at another commit, and says what it holds instead', () => {
    expect(recoveryStanding({ head: 'a'.repeat(40) }, 'a'.repeat(40))).toEqual({ kind: 'recover' });

    const moved = recoveryStanding({ head: 'a'.repeat(40) }, 'b'.repeat(40));
    expect(moved.kind).toBe('stale');
    expect(moved.kind === 'stale' && moved.reason).toContain('would revert whatever landed in between');
  });

  it('treats a journal that records no commit, and a checkout git cannot answer for, as stale', () => {
    expect(recoveryStanding({ head: null }, 'a'.repeat(40)).kind).toBe('stale');
    expect(recoveryStanding({ head: 'a'.repeat(40) }, null).kind).toBe('stale');
    expect(readJournal(JSON.stringify({ root: '/repo', pid: 7, startedAt: 'now', files: {} }))?.head).toBeNull();
  });
});

describe('mutate: putting the tree back on the way out', () => {
  it('puts every captured file back and reports nothing left to keep a journal for', () => {
    const disk = new Map([['a.ts', 'MUTATED'], ['b.ts', ORIGINAL]]);
    const failed = putBackAll(new Map([['a.ts', ORIGINAL], ['b.ts', ORIGINAL]]), (file) => disk.get(file)!, (file, text) => disk.set(file, text));

    expect(failed).toEqual([]);
    expect(disk.get('a.ts')).toBe(ORIGINAL);
  });

  it('names a file it could not put back, which is the one reason to keep a journal', () => {
    const failed = putBackAll(new Map([['a.ts', ORIGINAL], ['gone.ts', ORIGINAL]]), (file) => {
      if (file === 'gone.ts') throw new Error('ENOENT');
      return 'MUTATED';
    }, () => undefined);

    expect(failed).toEqual(['gone.ts']);
  });

  it('writes nothing and keeps nothing when no file was mutated, which is what a refused run leaves', () => {
    const writes: string[] = [];
    expect(putBackAll(new Map([['a.ts', ORIGINAL]]), () => ORIGINAL, (file) => writes.push(file))).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe('mutate: escalating a narrow survivor', () => {
  const narrow = { tests: ['one.test.ts'] };

  it('re-runs a scoped survivor against the whole suite, and reports both scopes', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    const report = await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      if (tests === undefined) return tallyIn('wide.test.ts', 2, 900);
      return tests[0] === 'wide.test.ts' ? tallyIn('wide.test.ts', 2, 30) : tally(0, 12);
    });
    expect(asked).toEqual([['one.test.ts'], undefined, ['wide.test.ts']]);
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].total).toBe(900);
    expect(report.results[0].escalatedFrom).toBe('one.test.ts');
    expect(formatReport(report)).toContain('one.test.ts -> whole suite');
  });

  it('leaves a survivor a survivor when the whole suite misses it too', async () => {
    const report = await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => (tests === undefined ? tally(0, 900) : tally(0, 12)));
    expect(report.results[0].verdict).toBe('SURVIVED');
    expect(report.results[0].total).toBe(900);
    expect(report.results[0].escalatedFrom).toBe('one.test.ts');
  });

  it('does not escalate a mutation the narrow scope already killed', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return killing();
    });
    expect(asked).toEqual([['one.test.ts'], ['one.test.ts']]);
  });

  it('does not escalate a mutation already measured against the whole suite', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return surviving();
    });
    expect(asked).toEqual([undefined]);
  });

  it('does not escalate an errored mutation, which measured nothing to escalate', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return noTests;
    });
    expect(asked).toEqual([['one.test.ts']]);
  });

  it('keeps the file mutated across the escalation, so the wider run measures the same thing', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const seen: string[] = [];
    await runMutations([mutation(narrow)], files, (tests) => {
      seen.push(files.read('a.ts'));
      return tests === undefined ? tally(0, 900) : tally(0, 12);
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[1]).toContain('const base = undefined;');
  });

  it('asks for the whole suite baseline only when something escalates', async () => {
    const asked: string[] = [];
    const watching: BaselineFor = (tests) => {
      asked.push(scopeOf({ tests: tests === undefined ? undefined : [...tests] }));
      return { failed: 0, total: 12, ran: 12, failures: [] };
    };
    await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), killing, watching);
    expect(asked).toEqual(['one.test.ts']);
  });
});

describe('mutate: naming a single test', () => {
  const named = { tests: ['one.test.ts'], test: 'the one' };

  it('a mutation may name one test, and is measured against that test alone', async () => {
    const asked: { tests?: readonly string[]; test?: string }[] = [];
    const report = await runMutations([mutation(named)], store({ 'a.ts': ORIGINAL }), (tests, test) => {
      asked.push({ tests, test });
      return killing();
    });
    expect(asked).toEqual([{ tests: ['one.test.ts'], test: 'the one' }, { tests: ['one.test.ts'], test: undefined }]);
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].scope).toBe('one.test.ts "the one"');
  });

  it('a manifest naming a test that does not exist is refused before anything is written', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const report = await runMutations([mutation(named)], files, killing, () => ({ failed: 0, total: 20, ran: 0, failures: [] }));
    expect(report.results).toEqual([]);
    expect(report.refusals.join('\n')).toContain('the one');
    expect(files.writes).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it('a mutation surviving its named test is re-measured against the whole file before the whole suite', async () => {
    const asked: { tests?: readonly string[]; test?: string }[] = [];
    const report = await runMutations([mutation(named)], store({ 'a.ts': ORIGINAL }), (tests, test) => {
      asked.push({ tests, test });
      return test !== undefined ? surviving() : killing();
    });
    expect(asked).toEqual([{ tests: ['one.test.ts'], test: 'the one' }, { tests: ['one.test.ts'] }, { tests: ['one.test.ts'], test: undefined }]);
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].scope).toBe('one.test.ts');
    expect(report.results[0].escalatedFrom).toBe('one.test.ts "the one"');
  });

  it('a verdict names every scope an escalation climbed through', async () => {
    const report = await runMutations([mutation(named)], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].verdict).toBe('SURVIVED');
    expect(report.results[0].scope).toBe('whole suite');
    expect(formatReport(report)).toContain('one.test.ts "the one" -> one.test.ts -> whole suite');
  });

  it('pays for the baselines the ladder reached, and no others', async () => {
    const asked: string[] = [];
    const watching: BaselineFor = (tests, test) => {
      asked.push(scopeOf({ tests: tests === undefined ? undefined : [...tests], test }));
      return { failed: 0, total: 12, ran: 12, failures: [] };
    };
    await runMutations([mutation(named)], store({ 'a.ts': ORIGINAL }), (_tests, test) => (test !== undefined ? surviving() : killing()), watching);
    expect(asked).toEqual(['one.test.ts "the one"', 'one.test.ts']);
  });
});

describe('mutate: taking the baseline on an unmutated tree', () => {
  const watchTree = (files: { read(file: string): string }) => {
    const seen: { at: string; sawMutant: boolean }[] = [];
    return {
      seen,
      baselineFor: ((tests) => {
        seen.push({ at: `baseline(${tests ? 'narrow' : 'whole'})`, sawMutant: files.read('a.ts') !== ORIGINAL });
        return { failed: 0, total: 40, ran: 40, failures: [] };
      }) as BaselineFor,
      runTests: ((tests) => {
        const mutated = files.read('a.ts') !== ORIGINAL;
        seen.push({ at: `run(${tests ? 'narrow' : 'whole'})`, sawMutant: mutated });
        return tally(0, mutated ? 25 : 40);
      }) as RunTests,
    };
  };

  it('measures the narrow baseline before the mutant is written', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    await runMutations([mutation({ tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    expect(watch.seen.filter((each) => each.at.startsWith('baseline')).every((each) => each.sawMutant)).toBe(false);
    expect(watch.seen[0]).toEqual({ at: 'baseline(narrow)', sawMutant: false });
  });

  it('measures the whole-suite baseline before re-writing the mutant to escalate', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    await runMutations([mutation({ tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    const whole = watch.seen.find((each) => each.at === 'baseline(whole)');
    expect(whole).toEqual({ at: 'baseline(whole)', sawMutant: false });
  });

  it('reports the shortfall a mutated baseline would have hidden', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    const report = await runMutations([mutation({ tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    expect(report.results[0].shortfall).toBe(15);
  });

  it('asks for the whole-suite baseline only once, however many survivors escalate', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const watch = watchTree(files);
    await runMutations([mutation({ name: 'a', tests: ['a.test.ts'] }), mutation({ name: 'b', find: 'const other = 1', replace: 'const other = 2', tests: ['a.test.ts'] })], files, watch.runTests, watch.baselineFor);
    expect(watch.seen.filter((each) => each.at === 'baseline(whole)')).toHaveLength(1);
  });
});

describe('mutate: a file that failed to collect', () => {
  it('is an error, not a verdict, when files failed and no test did', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(0, 30, 1));
    expect(report.results[0].verdict).toBe('ERROR');
    expect(report.results[0].detail).toContain('failed to collect');
  });

  it('is still a kill when a test actually failed alongside it', async () => {
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(2, 30, 1))).results[0].verdict).toBe('KILLED');
  });

  it('leaves an ordinary clean run alone', async () => {
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(0, 30, 0))).results[0].verdict).toBe('SURVIVED');
  });
});

describe('mutate: a tree that was already red', () => {
  it('does not credit a mutation for failures the baseline already had', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(2, 100), baseline({ 'whole suite': 100 }, 2));
    expect(report.results[0].verdict).toBe('SURVIVED');
    expect(report.results[0].baselineFailed).toBe(2);
    expect(formatReport(report)).toContain('already failing');
  });

  it('still kills a mutation that broke something beyond what was already red', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 100), baseline({ 'whole suite': 100 }, 2));
    expect(report.results[0].verdict).toBe('KILLED');
  });

  it('says nothing about a red baseline when the tree was green', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(1, 100), baseline({ 'whole suite': 100 }));
    expect(report.results[0].baselineFailed).toBeUndefined();
    expect(formatReport(report)).not.toContain('already failing');
  });
});

describe('mutate: attributing a verdict to a test', () => {
  const WATCHER = 'x.test.ts > the suite > the watcher';

  it('names the test whose result changed, rather than reporting that a number went up', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => runOf([WATCHER]), () => baselineOf([]));
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].attributed).toEqual([WATCHER]);
    expect(formatReport(report)).toContain(`killed by ${WATCHER}`);
  });

  it('kills on a different test failing, even when the same number of them failed', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => runOf([WATCHER]), () => baselineOf(['x.test.ts > the suite > something else']));
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].attributed).toEqual([WATCHER]);
  });

  it('does not credit a mutation for a test that was failing without it', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => runOf([WATCHER]), () => baselineOf([WATCHER]));
    expect(report.results[0].verdict).toBe('SURVIVED');
  });

  it('is an error, not a kill, when the failures that appeared cannot be named', async () => {
    const unnamed: TestRun = { failed: 3, passed: 17, total: 20, filesFailed: 0, failures: [], raw: 'Tests  3 failed | 17 passed (20)' };
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => unnamed, () => baselineOf([]));
    expect(report.results[0].verdict).toBe('ERROR');
    expect(report.results[0].detail).toContain('a count going up is not a kill');
  });

});

describe('mutate: a kill that has to happen twice', () => {
  const CONTENDED = 'slow.test.ts > the suite > tips over under contention';
  const narrow = { tests: ['one.test.ts'] };

  it('will not let a failure that only happens under the whole suite become proof', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    const report = await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return tests === undefined ? runOf([CONTENDED], 900) : runOf([], 12);
    });
    expect(asked).toEqual([['one.test.ts'], undefined, ['slow.test.ts']]);
    expect(report.results[0].verdict).toBe('UNSTABLE');
    expect(report.results[0].unreproduced).toEqual([CONTENDED]);
    expect(report.ok).toBe(false);
    expect(formatReport(report)).toContain('did not happen again on the same tree');
  });

  it('still kills when the test the wider scope found fails again on its own', async () => {
    const report = await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => (tests?.[0] === 'one.test.ts' ? runOf([], 12) : runOf([CONTENDED], 900)));
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].attributed).toEqual([CONTENDED]);
    expect(report.results[0].confirmedAt).toBe('slow.test.ts');
  });

  it('measures a narrow kill at its own scope a second time before reporting it', async () => {
    const scopes: string[] = [];
    const report = await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), (tests) => {
      scopes.push(scopeOf({ tests: tests === undefined ? undefined : [...tests] }));
      return runOf(['one.test.ts > the suite > the watcher'], 12);
    });
    expect(scopes).toEqual(['one.test.ts', 'one.test.ts']);
    expect(report.results[0].verdict).toBe('KILLED');
    expect(report.results[0].confirmedAt).toBe('one.test.ts');
  });

  it('reports a verdict that changed between two identical measurements as unstable, not as fact', async () => {
    let measured = 0;
    const report = await runMutations([mutation(narrow)], store({ 'a.ts': ORIGINAL }), () => (measured++ === 0 ? runOf(['one.test.ts > the suite > the flaky one'], 12) : runOf([], 12)));
    expect(report.results[0].verdict).toBe('UNSTABLE');
    expect(report.results[0].unreproduced).toEqual(['one.test.ts > the suite > the flaky one']);
    expect(report.ok).toBe(false);
  });

  it('does not confirm a kill by a test that is red at the scope it was re-run in', async () => {
    const alreadyRed = 'red.test.ts > the suite > broken on its own';
    const report = await runMutations(
      [mutation(narrow)],
      store({ 'a.ts': ORIGINAL }),
      (tests) => (tests?.[0] === 'one.test.ts' ? runOf([], 12) : runOf([alreadyRed], 900)),
      (tests) => (tests?.[0] === 'red.test.ts' ? baselineOf([alreadyRed], 30) : undefined),
    );
    expect(report.results[0].verdict).toBe('UNSTABLE');
  });

  it('takes the files its named tests live in as the scope to re-run them at', () => {
    expect(filesOf(['b.test.ts > s > two', 'a.test.ts > s > one', 'a.test.ts > s > another'])).toEqual(['a.test.ts', 'b.test.ts']);
  });

  it('leaves a survivor alone, since nothing was claimed that needs confirming', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), (tests) => {
      asked.push(tests);
      return runOf([]);
    });
    expect(asked).toEqual([undefined]);
  });
});

describe('mutate: a scope that did not report the same thing twice', () => {
  const FLAKY = 'flaky.test.ts > the suite > goes both ways';

  it('names a test the baseline saw fail and the mutated run saw pass', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => runOf([], 20), () => baselineOf([FLAKY], 20));
    expect(report.results[0].verdict).toBe('SURVIVED');
    expect(report.results[0].flaked).toEqual([FLAKY]);
    expect(formatReport(report)).toContain('did not report the same thing twice');
  });

  it('says nothing of the sort when tests stopped running, where the same shape is a shortfall', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => runOf([], 12), () => baselineOf([FLAKY], 20));
    expect(report.results[0].flaked).toBeUndefined();
    expect(report.results[0].shortfall).toBe(8);
  });

  it('says nothing at all when the baseline and the run agree', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => runOf([FLAKY], 20), () => baselineOf([FLAKY], 20));
    expect(report.results[0].flaked).toBeUndefined();
    expect(formatReport(report)).not.toContain('did not report the same thing twice');
  });
});

describe('mutate: the baseline', () => {
  it('reports how many tests stopped running when the denominator shrank', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 950), baseline({ 'whole suite': 1000 }));
    expect(report.results[0].shortfall).toBe(50);
    expect(formatReport(report)).toContain('50 fewer tests ran');
  });

  it('says nothing when the count held', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 1000), baseline({ 'whole suite': 1000 }));
    expect(report.results[0].shortfall).toBeUndefined();
    expect(formatReport(report)).not.toContain('fewer tests');
  });

  it('does not treat a suite that grew as a shortfall', async () => {
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 1100), baseline({ 'whole suite': 1000 }))).results[0].shortfall).toBeUndefined();
  });

  it('matches a baseline to the scope it was measured for', async () => {
    const report = await runMutations([mutation({ tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), () => tally(1, 5), baseline({ 'one.test.ts': 9 }));
    expect(report.results[0].shortfall).toBe(4);
  });

  it('reports nothing when no baseline was measured at all', async () => {
    expect((await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 950))).results[0].shortfall).toBeUndefined();
  });

  it('says on the row when a scope had no baseline, rather than looking like a clean measurement', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving);
    expect(report.results[0].unmeasured).toBe(true);
    expect(formatReport(report)).toContain('no baseline');
  });

  it('says nothing of the sort when the scope did have one', async () => {
    const report = await runMutations([mutation()], store({ 'a.ts': ORIGINAL }), surviving, baseline({ 'whole suite': 20 }));
    expect(report.results[0].unmeasured).toBe(false);
    expect(formatReport(report)).not.toContain('no baseline');
  });

  it('refuses a manifest with the same answer whether the check runs early or late', () => {
    const files = store({ 'a.ts': ORIGINAL });
    expect(refusalsFor([mutation({ name: 'bad', find: 'absent' })], files)).toHaveLength(1);
    expect(files.writes).toEqual([]);
  });
});

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

describe('mutate: one mutation asked for on the command line', () => {
  const asked = (...args: string[]) => oneMutationFrom(args)[0];

  it('takes every field a manifest entry has, under a flag of its own name', () => {
    expect(asked('--file', 'src/x.ts', '--find', 'a', '--replace', 'b', '--test', 'one test', '--tests', 'src/x.test.ts', '--note', 'why')).toEqual({
      name: 'src/x.ts',
      file: 'src/x.ts',
      find: 'a',
      replace: 'b',
      test: 'one test',
      tests: ['src/x.test.ts'],
      note: 'why',
    });
  });

  it('names the verdict after the file it breaks, unless a name was asked for', () => {
    expect(asked('--file', 'src/x.ts', '--find', 'a', '--replace', 'b').name).toBe('src/x.ts');
    expect(asked('--file', 'src/x.ts', '--find', 'a', '--replace', 'b', '--name', 'c6').name).toBe('c6');
  });

  it('collects a scope given a file at a time', () => {
    expect(asked('--file', 'src/x.ts', '--find', 'a', '--replace', 'b', '--tests', 'one.test.ts', '--tests', 'two.test.ts').tests).toEqual(['one.test.ts', 'two.test.ts']);
  });

  it('takes all by its being there, since it is the one field that is not a value', () => {
    expect(asked('--file', 'src/x.ts', '--find', 'a', '--replace', 'b', '--all').all).toBe(true);
  });

  it('takes an empty replace, which is how a find is deleted rather than changed', () => {
    expect(asked('--file', 'src/x.ts', '--find', 'a', '--replace', '').replace).toBe('');
  });

  it('offers every field a mutation has when it is handed one that is not', () => {
    expect(() => oneMutationFrom(['--scope', 'src/x.test.ts'])).toThrow(/--scope is not something a mutation has.*--file.*--find.*--replace/s);
  });

  it('refuses a bare word, since there is nowhere for it to belong', () => {
    expect(() => oneMutationFrom(['src/x.ts', '--find', 'a'])).toThrow(/src\/x\.ts is not a flag/);
  });

  it('is refused by the rules a manifest is refused by, and in the same words', () => {
    expect(() => oneMutationFrom(['--find', 'a', '--replace', 'b'])).toThrow(/file is required and must be a non-empty string/);
    expect(() => oneMutationFrom(['--file', 'src/x.ts', '--find', 'a'])).toThrow(/replace is required/);
    expect(() => oneMutationFrom(['--file', 'src/x.ts', '--find', 'a', '--replace', 'b', '--test', 'one'])).toThrow(/tests must name the file it lives in/);
  });
});

describe('mutate: telling the held module graph what changed', () => {
  it('announces every file it writes, in the order it wrote them', () => {
    const heard: string[] = [];
    const files = store({ 'a.ts': ORIGINAL, 'b.ts': 'const b = 1;\n' });
    const watched = watchedBy(files, (file) => heard.push(file));

    watched.write('a.ts', 'mutant');
    watched.write('b.ts', 'mutant');
    watched.write('a.ts', ORIGINAL);

    expect(heard).toEqual(['a.ts', 'b.ts', 'a.ts']);
  });

  it('announces every write a whole run makes, restores included, however many runs it took', async () => {
    const heard: string[] = [];
    const files = store({ 'a.ts': ORIGINAL });

    await runMutations([mutation()], watchedBy(files, (file) => heard.push(file)), killing);

    expect(heard).toEqual(files.writes.map((write) => write.file));
    expect(heard.length).toBeGreaterThan(0);
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('says nothing about a file it only read', () => {
    const heard: string[] = [];
    watchedBy(store({ 'a.ts': ORIGINAL }), (file) => heard.push(file)).read('a.ts');

    expect(heard).toEqual([]);
  });
});

describe('mutate: what a run reported', () => {
  const test = (name: string, state?: string) => ({ type: 'test', name, result: state === undefined ? undefined : { state } });
  const suite = (name: string, tasks: unknown[]) => ({ type: 'suite', name, tasks });
  const ran = (name: string, tasks: unknown[], result?: unknown): RunnerTestFile => ({ name, filepath: `/repo/${name}`, type: 'suite', tasks, result }) as unknown as RunnerTestFile;

  it('names a test by its file, the suites it is nested in, and its own name', () => {
    const run = tallyRun([ran('scripts/a.test.ts', [suite('outer', [suite('inner', [test('fails on purpose', 'fail')])])])]);

    expect(run.failures).toEqual(['scripts/a.test.ts > outer > inner > fails on purpose']);
    expect(filesOf(run.failures)).toEqual(['scripts/a.test.ts']);
  });

  it('counts a test that did not run in the total and in neither of what passed or failed', () => {
    const run = tallyRun([ran('a.test.ts', [suite('outer', [test('ran', 'pass'), test('filtered out')])])]);

    expect(run).toMatchObject({ total: 2, passed: 1, failed: 0 });
  });

  it('takes a file that never collected for a failed file naming no test, and keeps what it recorded', () => {
    const run = tallyRun([ran('a.test.ts', [], { state: 'fail', errors: [{ message: 'Cannot find name x' }] })]);

    expect(run).toMatchObject({ total: 0, failed: 0, filesFailed: 1, failures: [] });
    expect(run.raw).toContain('Cannot find name x');
  });

  it('cannot report more failures than it can name, because it counts the same tests it names', () => {
    const run = tallyRun([ran('a.test.ts', [suite('outer', [test('one', 'fail'), test('two', 'fail')])])]);

    expect(run.failures).toHaveLength(run.failed);
  });
});

describe('mutate: naming one test to vitest', () => {
  it('asks for the words a manifest wrote, not for the pattern they happen to spell', () => {
    expect(new RegExp(asLiteralPattern('a kill (that has to happen) twice')).test('a kill (that has to happen) twice')).toBe(true);
    expect(new RegExp(asLiteralPattern('costs $1.50 [or more]')).test('costs $1.50 [or more]')).toBe(true);
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

  it('reads a mutation naming one test', () => {
    expect(parseManifest('[{"name":"c6","file":"a.ts","find":"x","replace":"y","tests":["a.test.ts"],"test":"one name"}]')[0].test).toBe('one name');
  });

  it('refuses a test name without the file it lives in', () => {
    expect(() => parseManifest('[{"name":"c6","file":"a.ts","find":"x","replace":"y","test":"one name"}]')).toThrow(/tests/);
  });
});

describe('mutate: the report', () => {
  it('leads with the survivors, because a survivor is the finding', async () => {
    const report = await runMutations([mutation({ name: 'lived' }), mutation({ name: 'died', find: 'const other = 1', replace: 'const other = 2', tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), (tests) => (tests === undefined ? surviving() : killing()));
    const printed = formatReport(report);
    expect(printed).toContain('SURVIVED');
    expect(printed.indexOf('lived')).toBeLessThan(printed.indexOf('died'));
  });

  it('never prints a verdict without the scope it was measured against', async () => {
    const report = await runMutations([mutation({ tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), surviving);
    expect(formatReport(report)).toContain('one.test.ts');
  });

  it('says plainly when a file did not come back', async () => {
    const files = store({ 'a.ts': ORIGINAL });
    const readOnly: FileStore = { read: files.read, write: (file, text) => files.write(file, `${text}corrupted`) };
    expect(formatReport(await runMutations([mutation()], readOnly, killing))).toMatch(/NOT RESTORED|not restored/i);
  });
});
