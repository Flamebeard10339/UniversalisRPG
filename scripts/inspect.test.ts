import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
// store cannot contain.
describe('inspect', () => {
  it('evaluates an expression against the repository\'s own module resolution', async () => {
    expect(await run("(await load('scripts/tasks/render.ts')).wrapText('a b c d', 3)")).toEqual(['a b', 'c d']);
  });

  it('runs a body of statements and prints what it returns', async () => {
    expect(await run("const { packGreedy } = await load('scripts/tasks/render.ts');\nreturn packGreedy(['aa', 'bb', 'cc'], '-', 5);")).toEqual(['aa-bb', 'cc']);
  });

  it('resolves a specifier against the repo root, not against the caller\'s directory', async () => {
    const module = (await load('scripts/lib/taskStore.ts')) as { DEFAULT_STORE_PATH: string };
    expect(module.DEFAULT_STORE_PATH).toBe('docs/tasks.jsonl');
  });

  it('says the source is neither an expression nor a body rather than throwing at the caller', () => {
    const compiled = compile('const = ;');
    expect('error' in compiled && compiled.error).toContain('neither an expression nor a body');
  });

  // The second of the two sizes three sessions actually needed, and the one
  // that sent them to a throwaway file: a `scripts/` view over records the
  // real store cannot contain.
  it('renders a scripts/ view over records the real store does not contain', async () => {
    const lines = (await run([
      "const { renderRoadmap } = await load('scripts/tasks/roadmapCmd.ts');",
      "const { roadmapView } = await load('scripts/lib/roadmap.ts');",
      "const base = { title: 'x', kind: 'task', state: 'open', severity: null, system: null, spec: null, clause: null, discharges: [], requires: [], files: [], writes: [], grant: null, produces: [], deliverable: null, evidence: null, source: null, reason: null, closed: null, closedCommit: null, claimed: null, claimedBy: null, extra: null };",
      "const gates = Array.from({ length: 20 }, (_, i) => ({ ...base, id: `gate-${i}` }));",
      "const members = Array.from({ length: 20 }, (_, i) => ({ ...base, id: `member-${i}`, spec: 'synthetic', requires: gates.map((g) => g.id) }));",
      'return renderRoadmap(roadmapView([...members, ...gates], () => null));',
    ].join('\n'))) as string[];
    expect(lines[0]).toContain('40 live records');
    expect(lines.join('\n')).toContain('DECIDED — 1 spec(s)');
  });

  // The whole point of the command over a scratch `.ts` in the worktree.
  it('leaves no file behind', async () => {
    const before = readdirSync(repoRoot).sort();
    await run("(await load('scripts/tasks/render.ts')).wrapText('a b', 3)");
    expect(readdirSync(repoRoot).sort()).toEqual(before);
  });

  it('prints a string as itself and a structure in full, with no depth limit', () => {
    expect(format('two\nlines')).toBe('two\nlines');
    expect(format({ a: { b: { c: { d: [1, 2] } } } })).toContain('d: [ 1, 2 ]');
  });
});
