import { describe, expect, it } from 'vitest';
import { codeOnly, stripComments } from './stripComments';

function commentLines(source: string): number {
  const original = source.split('\n');
  return stripComments(source).filter((line, index) => (original[index] ?? '').trim() !== '' && line.trim() === '').length;
}

describe('stripComments', () => {
  it('blanks a comment without moving the lines below it', () => {
    expect(stripComments('// gone\nconst kept = 1;\n')).toEqual(['       ', 'const kept = 1;']);
  });

  it('keeps the code on a line that only ends in a comment', () => {
    expect(codeOnly('const modulus = 4294967296; // 2^32\n')).toEqual(['const modulus = 4294967296;']);
  });

  it('does not find a comment inside a string', () => {
    expect(commentLines('const url = "https://example.com";\n')).toBe(0);
    expect(codeOnly("const path = 'a//b';\n")).toEqual(["const path = 'a//b';"]);
  });

  it('does not find a comment inside a regex literal', () => {
    expect(commentLines('const slashes = /[/*]/;\n')).toBe(0);
    expect(codeOnly('const reference = /[a-z]+(?:\\.[a-z]+)*/;\n')).toEqual(['const reference = /[a-z]+(?:\\.[a-z]+)*/;']);
  });

  it('divides rather than opening a regex when a value precedes the slash', () => {
    expect(codeOnly('const half = total / 2;\nconst other = count / 2;\n')).toEqual(['const half = total / 2;', 'const other = count / 2;']);
  });

  it('does not find a comment inside a template literal, including its expressions', () => {
    const source = 'const dsl = `\n// authored content, not code\n`;\n';
    expect(commentLines(source)).toBe(0);
    expect(codeOnly('const message = `a ${lookup["//b"]} c`;\n')).toEqual(['const message = `a ${lookup["//b"]} c`;']);
  });

  it('handles a template literal nested inside its own expression', () => {
    expect(commentLines('const nested = `${`${inner}` /* stripped */}`;\n')).toBe(0);
    expect(codeOnly('const nested = `${`${inner}`}`;\n')).toEqual(['const nested = `${`${inner}`}`;']);
  });

  it('spans a block comment across lines', () => {
    expect(commentLines('/*\n * two\n */\nconst kept = 1;\n')).toBe(3);
  });

  it('blanks a directive too, which wears comment syntax and is a comment', () => {
    expect(commentLines('/// <reference types="vite/client" />\n')).toBe(1);
    expect(commentLines('// @ts-expect-error deliberate\nconst bad = 1;\n')).toBe(1);
    expect(codeOnly('import(/* @vite-ignore */ url);\n').map((line) => line.replace(/ +/g, ' '))).toEqual(['import( url);']);
  });

  it('reads a file by its extension, so JSX and a generic each parse as written', () => {
    expect(codeOnly('const view = <p>a / b</p>; // gone\n', 'sample.tsx')).toEqual(['const view = <p>a / b</p>;']);
    expect(codeOnly('const last = <T>(list: T[]): T => list[0]; // gone\n', 'sample.ts')).toEqual(['const last = <T>(list: T[]): T => list[0];']);
  });
});

describe('codeOnly', () => {
  it('reduces a file to its code, so a comment edit compares equal', () => {
    const before = '// one story\n\nexport const seed = 1;\n';
    const after = 'export const seed = 1; // a different story\n';
    expect(codeOnly(before)).toEqual(codeOnly(after));
  });

  it('still sees a code change hiding among comment edits', () => {
    const before = '// one story\nexport const seed = 1;\n';
    const after = '// two\nexport const seed = 2;\n';
    expect(codeOnly(before)).not.toEqual(codeOnly(after));
  });
});
