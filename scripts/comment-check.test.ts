import { describe, expect, it } from 'vitest';
import { checkComments, codeFiles, commentCheckOutput, commentsInCode, commentsInWorld, MARK_STANDS, REDIRECT, worldFiles } from './comment-check';
import { NOTE_MARK } from '../src/grammar/note';
import { trackedFiles } from './lib/sourceFiles';

const tracked = trackedFiles();

const linesIn = (source: string): number[] => commentsInCode('sample.ts', source).map((found) => found.line);

const worldLinesIn = (source: string): number[] => commentsInWorld('sample.dsl', source).map((found) => found.line);

describe('what the check reads', () => {
  it('sweeps every tracked module under src and scripts, tests among them', () => {
    expect(codeFiles(tracked)).toContain('scripts/printedWords.test.ts');
    expect(codeFiles(tracked)).toContain('src/grammar/structure.ts');
    expect(codeFiles(tracked)).toContain('src/main.tsx');
    expect(codeFiles(tracked).length).toBeGreaterThan(100);
  });

  it('sweeps the world an author writes and the one the suite stands in', () => {
    expect(worldFiles(tracked)).toContain('content/core.dsl');
    expect(worldFiles(tracked)).toContain('src/content/fixture/core.dsl');
  });

  it('reads no file that is neither TypeScript nor world', () => {
    expect([...codeFiles(tracked), ...worldFiles(tracked)].filter((file) => !/\.(?:ts|tsx|dsl)$/.test(file))).toEqual([]);
    expect(worldFiles(['.github/workflows/test.yml', 'tsconfig.json', 'README.md'], () => true)).toEqual([]);
    expect(codeFiles(['.github/workflows/test.yml', 'tsconfig.json', 'README.md'], () => true)).toEqual([]);
  });
});

describe('what counts as a comment in TypeScript', () => {
  it('names the line of a line comment, a trailing one and a block one', () => {
    expect(linesIn('// alone\nconst kept = 1; // trailing\n/* one\n   two */\n')).toEqual([1, 2, 3]);
  });

  it('names a directive, which wears comment syntax and is a comment', () => {
    expect(linesIn('/// <reference types="vite/client" />\n')).toEqual([1]);
    expect(linesIn('// @ts-expect-error deliberate\nconst bad = 1;\n')).toEqual([1]);
    expect(linesIn('import(/* @vite-ignore */ url);\n')).toEqual([1]);
  });

  it('finds no comment in a string, a URL, a template literal or a regex', () => {
    expect(linesIn('const url = "https://example.com";\n')).toEqual([]);
    expect(linesIn("const path = 'a//b';\n")).toEqual([]);
    expect(linesIn('const dsl = `\n// authored content, not code\n`;\n')).toEqual([]);
    expect(linesIn('const message = `a ${lookup["//b"]} c`;\n')).toEqual([]);
    expect(linesIn('const protocols = /https?:\\/\\//;\n')).toEqual([]);
    expect(linesIn('const slashes = /[/*]/;\n')).toEqual([]);
  });

  it('divides rather than opening a regex when a value precedes the slash', () => {
    expect(linesIn('const half = total / 2;\nconst other = count / 2;\n')).toEqual([]);
  });

  it('reads a .tsx file as JSX and a .ts file as a generic', () => {
    expect(commentsInCode('sample.tsx', 'const view = <p>a / b</p>; // gone\n').map((found) => found.line)).toEqual([1]);
    expect(commentsInCode('sample.ts', 'const last = <T>(list: T[]): T => list[0]; // gone\n').map((found) => found.line)).toEqual([1]);
  });
});

describe('what counts as a comment in the world', () => {
  it('names a whole-line comment, indented or not', () => {
    expect(worldLinesIn('# item rope\n// why\ntitle: Rope\n  // deeper\n')).toEqual([2, 4]);
  });

  it('leaves a line holding the author’s own mark, wherever it sits', () => {
    expect(worldLinesIn(`// ${NOTE_MARK} still to write\n`)).toEqual([]);
    expect(worldLinesIn(`say: The road is long ${NOTE_MARK} rewrite this\n`)).toEqual([]);
  });

  it('leaves a slash standing inside a line the engine reads', () => {
    expect(worldLinesIn('say: he went to https://example.com and back\n')).toEqual([]);
  });
});

describe('what the check says', () => {
  const read = (): string => '// prose\n';

  it('passes with a word about what it read', () => {
    const output = commentCheckOutput(checkComments(['src/a.ts'], ['content/a.dsl'], () => 'const kept = 1;\n'));

    expect(output.exitCode).toBe(0);
    expect(output.err).toEqual([]);
  });

  it('fails naming file and line, and says where the fact goes instead', () => {
    const output = commentCheckOutput(checkComments(['src/a.ts'], ['content/a.dsl'], read));

    expect(output.exitCode).toBe(1);
    expect(output.err).toContain('  src/a.ts:1');
    expect(output.err).toContain('  content/a.dsl:1');
    expect(output.err).toContain(REDIRECT);
    expect(output.err).toContain(MARK_STANDS);
  });

  it('fails an empty sweep rather than reporting a clean tree', () => {
    expect(commentCheckOutput(checkComments([], [], () => '')).exitCode).toBe(1);
  });
});
