import { describe, expect, it } from 'vitest';
import { checkBytes, checkFileBytes, isCheckedTextFile } from './bytes';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('checkFileBytes', () => {
  it('passes ordinary UTF-8, including a BOM and non-ASCII text', () => {
    expect(checkFileBytes('a.ts', utf8('const x = 1;\n'))).toBeNull();
    expect(checkFileBytes('b.md', new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('# héllo — ok')]))).toBeNull();
  });

  it('names a NUL byte by offset, since that is what flips grep to binary mode', () => {
    const bytes = new Uint8Array([...utf8('const x'), 0, ...utf8('= 1;')]);
    expect(checkFileBytes('a.ts', bytes)).toEqual({ file: 'a.ts', issue: 'NUL byte at offset 7 — grep treats this file as binary' });
  });

  it('reports invalid UTF-8', () => {
    // 0xC3 opens a two-byte sequence and 0x28 cannot continue it.
    const bytes = new Uint8Array([0xc3, 0x28]);
    expect(checkFileBytes('a.ts', bytes)).toEqual({ file: 'a.ts', issue: 'not valid UTF-8' });
  });
});

describe('isCheckedTextFile', () => {
  it('checks the extensions this repo tracks as text, and nothing else', () => {
    for (const file of ['src/a.ts', 'a.tsx', 'docs/tasks.jsonl', 'README.md', '.github/workflows/test.yml', 'content/base.dsl', 'android/build.gradle']) {
      expect(isCheckedTextFile(file), file).toBe(true);
    }
    for (const file of ['public/icon.png', 'android/app/release.keystore', 'gradlew', 'no-extension']) {
      expect(isCheckedTextFile(file), file).toBe(false);
    }
  });
});

describe('checkBytes', () => {
  it('skips binary-by-contract files and unreadable files, and reports every corrupt text file', () => {
    const contents = new Map<string, Uint8Array | null>([
      ['ok.ts', utf8('fine')],
      ['bad.ts', new Uint8Array([0])],
      ['icon.png', new Uint8Array([0, 1, 2])],
      ['gone.md', null],
      ['bad2.json', new Uint8Array([0xc3, 0x28])],
    ]);
    const findings = checkBytes([...contents.keys()], (file) => contents.get(file) ?? null);
    expect(findings.map((finding) => finding.file)).toEqual(['bad.ts', 'bad2.json']);
  });
});
