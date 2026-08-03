import { describe, expect, it } from 'vitest';
import { formatReport, parseManifest, parseVitestTally, runMutations, type FileStore, type Mutation, type TestRun } from './mutate';

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
