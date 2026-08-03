import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyTo, escapesRoot, formatReport, journalVerdict, outputTail, parseManifest, parseVitestTally, recoverFrom, runMutations, type FileStore, type Mutation, type TestRun } from './mutate';

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

const tally = (failed: number, total: number): TestRun => ({ failed, total, raw: `Tests ${failed} failed | ${total - failed} passed (${total})` });
const noTests: TestRun = { failed: 0, total: 0, raw: 'Tests  no tests' };

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
    const scoped = runMutations([mutation({ tests: ['src/content/entityType.test.ts'] })], store({ 'a.ts': ORIGINAL }), surviving);
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
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => ({ failed: 0, total: 0, raw: 'Transform failed\nUnexpected token (14:8)\nTests  no tests' }));
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

  it('recovers from a journal whose owner is gone', () => {
    expect(journalVerdict({ pid: 4242 }, 1, dead)).toBe('recover');
  });

  // Recovering here would restore files another run is deliberately holding
  // mutated, and delete the only record it has of their originals.
  it('refuses a journal whose owner is still running', () => {
    expect(journalVerdict({ pid: 4242 }, 1, live)).toBe('busy');
  });

  it('recovers its own journal, since a live pid that is us is not another run', () => {
    expect(journalVerdict({ pid: 7 }, 7, live)).toBe('recover');
  });

  it('recovers a journal with no pid at all, rather than deadlocking on an old format', () => {
    expect(journalVerdict({} as unknown as { pid: number }, 1, live)).toBe('recover');
  });
});

describe('mutate: recovering an interrupted run', () => {
  it('puts back a file the journal says was mutated', () => {
    const files = store({ 'a.ts': 'MUTATED' });
    expect(recoverFrom({ 'a.ts': ORIGINAL }, files)).toEqual(['a.ts']);
    expect(files.read('a.ts')).toBe(ORIGINAL);
  });

  it('leaves a file that is already correct alone, and reports nothing for it', () => {
    const files = store({ 'a.ts': ORIGINAL });
    expect(recoverFrom({ 'a.ts': ORIGINAL }, files)).toEqual([]);
    expect(files.writes).toEqual([]);
  });

  it('survives a journal naming a file that no longer exists', () => {
    const files = store({ 'a.ts': 'MUTATED' });
    expect(recoverFrom({ 'gone.ts': 'x', 'a.ts': ORIGINAL }, files)).toEqual(['a.ts']);
  });
});

describe('mutate: the baseline', () => {
  it('reports how many tests stopped running when the denominator shrank', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 950), new Map([['whole suite', 1000]]));
    expect(report.results[0].shortfall).toBe(50);
    expect(formatReport(report)).toContain('50 fewer tests ran');
  });

  it('says nothing when the count held', () => {
    const report = runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 1000), new Map([['whole suite', 1000]]));
    expect(report.results[0].shortfall).toBeUndefined();
    expect(formatReport(report)).not.toContain('fewer tests');
  });

  it('does not treat a suite that grew as a shortfall', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 1100), new Map([['whole suite', 1000]])).results[0].shortfall).toBeUndefined();
  });

  it('matches a baseline to the scope it was measured for', () => {
    const report = runMutations([mutation({ tests: ['one.test.ts'] })], store({ 'a.ts': ORIGINAL }), () => tally(1, 5), new Map([['one.test.ts', 9]]));
    expect(report.results[0].shortfall).toBe(4);
  });

  it('reports nothing when no baseline was measured at all', () => {
    expect(runMutations([mutation()], store({ 'a.ts': ORIGINAL }), () => tally(3, 950)).results[0].shortfall).toBeUndefined();
  });
});

describe('mutate: reading vitest back', () => {
  it('reads a mixed tally', () => {
    expect(parseVitestTally('   Tests  1 failed | 15 passed (16)\n')).toEqual({ failed: 1, total: 16 });
  });

  it('reads an all-passing tally', () => {
    expect(parseVitestTally(' Test Files  45 passed (45)\n      Tests  985 passed (985)\n')).toEqual({ failed: 0, total: 985 });
  });

  it('reads a tally carrying skips', () => {
    expect(parseVitestTally('Tests  2 failed | 3 passed | 1 skipped (6)')).toEqual({ failed: 2, total: 6 });
  });

  it('reports no tally when the run collected nothing', () => {
    expect(parseVitestTally(' Test Files  1 failed (1)\n      Tests  no tests\n')).toEqual({ failed: 0, total: 0 });
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
    expect(parseVitestTally('Tests  no tests')).toEqual({ failed: 0, total: 0 });
  });

  it('takes the last tally when the output carries more than one', () => {
    expect(parseVitestTally('Tests  1 failed | 1 passed (2)\nrerun\nTests  4 failed | 1 passed (5)')).toEqual({ failed: 4, total: 5 });
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
