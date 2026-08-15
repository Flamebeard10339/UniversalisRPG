import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

// Prose stripped first, so the comment explaining this rule is not a breach of
// it. The same trap the moments rule names: this codebase writes a lot of
// prose, and a scanner reading it as code reads the rule as the mistake.
const COMMENTED = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

const SOURCES = [
  ...modulesUnder(here, 'src/ui'),
  { file: 'src/main.tsx', text: readFileSync(resolve(here, '..', 'main.tsx'), 'utf8') },
  { file: 'src/index.css', text: readFileSync(resolve(here, '..', 'index.css'), 'utf8') },
].map((source) => ({ ...source, text: source.text.replace(COMMENTED, ' ') }));

// Everything that asks the browser for a compositor layer. A layer is rastered
// once and then moved as a picture, so every glyph on it is drawn at whatever
// scale it happened to be rastered at and goes soft the moment it is moved or
// scaled. This shell moves three surfaces — the pager's strip, the layer column
// and the map's sheet — and all three are text, so none of them may ask.
//
// Found three times in this tree. The map worked it out and wrote the reason
// down; the pager and the layer column were written afterwards and asked for a
// layer anyway, and the narration and every choice label were soft for as long
// as that stood. A comment could not stop it because a comment is in one file
// and the mistake is available in every file, which is what this is for.
const ASKS_FOR_A_LAYER = [/\btranslate3d\s*\(/, /\btranslateZ\s*\(/, /\bwill-change\b/, /\bwillChange\b/, /\bbackface-visibility\s*:\s*hidden/, /\bperspective\s*:/];

describe('the shell draws on one layer', () => {
  it('reads the tree and the stylesheet it is a rule about', () => {
    expect(SOURCES.map((source) => source.file)).toContain('src/index.css');
    expect(SOURCES.map((source) => source.file)).toContain('src/ui/Pager.tsx');
    expect(SOURCES.length).toBeGreaterThan(6);
  });

  it('asks for none, so nothing it moves is text drawn at the wrong scale', () => {
    for (const source of SOURCES) {
      for (const asking of ASKS_FOR_A_LAYER) expect(source.text, `${source.file} asks the browser for a compositor layer with ${asking}`).not.toMatch(asking);
    }
  });

  it('still moves what it moves, so the rule is about how and not about whether', () => {
    const moved = SOURCES.filter((source) => /style\.transform\s*=|transform:\s*`/.test(source.text));

    expect(moved.map((source) => source.file).sort()).toContain('src/ui/Pager.tsx');
    expect(moved.length).toBeGreaterThan(2);
  });

  // The rule matching nothing would pass every module above.
  it('recognises each of the ways of asking', () => {
    const asked = ['transform: translate3d(0, 0, 0)', 'transform: translateZ(0)', 'will-change: transform', 'style={{ willChange: "transform" }}', 'backface-visibility: hidden', 'perspective: 1000px'];

    for (const [at, asking] of ASKS_FOR_A_LAYER.entries()) expect(asked[at], `${asking} recognises nothing`).toMatch(asking);
  });
});
