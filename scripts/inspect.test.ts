import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from './lib/tsxCli';
import { compile, format, loaderFor } from './inspect';

const repoRoot = path.join(import.meta.dirname, '..');
const load = loaderFor(repoRoot);
const run = async (source: string): Promise<unknown> => {
  const compiled = compile(source);
  if ('error' in compiled) throw new Error(compiled.error);
  return compiled.run(load);
};

// The two sizes three sessions actually needed: calling one exported
// function on a handful of inputs, and building a view over data the real
// tree does not contain.
describe('inspect', () => {
  it('evaluates an expression against the repository\'s own module resolution', async () => {
    expect(await run("(await load('scripts/lib/layers.ts')).layerOf('src/runtime/session.ts')")).toBe('runtime');
  });

  it('runs a body of statements and prints what it returns', async () => {
    expect(await run("const { stripComments } = await load('scripts/lib/stripComments.ts');\nreturn stripComments('a // b\\nc');")).toEqual(['a ', 'c']);
  });

  it('resolves a specifier against the repo root, not against the caller\'s directory', async () => {
    const module = (await load('scripts/lib/modportalCache.ts')) as { DEFAULT_MODPORTAL_CACHE: string };
    expect(module.DEFAULT_MODPORTAL_CACHE).toBe('content/modportal.local');
  });

  it('says the source is neither an expression nor a body rather than throwing at the caller', () => {
    const compiled = compile('const = ;');
    expect('error' in compiled && compiled.error).toContain('neither an expression nor a body');
  });

  // The second of the two sizes three sessions actually needed, and the one
  // that sent them to a throwaway file: a `scripts/` view over a tree the
  // real repository does not hold.
  it('renders a scripts/ view over files the real tree does not contain', async () => {
    const swept = (await run([
      "const { sweptFiles } = await load('scripts/lib/layers.ts');",
      "const tracked = ['src/runtime/a.ts', 'docs/b.md', 'src/ui/c.tsx', 'scripts/d.ts'];",
      'return sweptFiles(tracked, () => true);',
    ].join('\n'))) as string[];
    expect(swept).toEqual(['src/runtime/a.ts', 'src/ui/c.tsx', 'scripts/d.ts']);
  });

  // The whole point of the command over a scratch `.ts` in the worktree, and
  // it has to be asked of the command rather than of the two pure functions
  // under it: `compile` and `loaderFor` contain no filesystem write, so no
  // implementation of them could fail an in-process version of this. Spawned,
  // and answered by git over the whole tree rather than by one directory
  // listing, so a file written into any subdirectory is caught.
  it('leaves no file behind', () => {
    const dirty = (): string =>
      spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).stdout;
    const before = dirty();
    const result = spawnSync(process.execPath, [tsxCli, path.join(repoRoot, 'scripts/inspect.ts'), "(await load('scripts/lib/layers.ts')).layerOf('src/grammar/lex.ts')"], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('grammar');
    expect(dirty()).toBe(before);
  });

  it('prints a string as itself and a structure in full, with no depth limit', () => {
    expect(format('two\nlines')).toBe('two\nlines');
    expect(format({ a: { b: { c: { d: [1, 2] } } } })).toContain('d: [ 1, 2 ]');
  });
});
