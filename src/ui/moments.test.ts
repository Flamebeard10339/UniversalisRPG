import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

const CHANNEL = 'src/ui/transient.ts';

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

const SOURCES = modulesUnder(here, 'src/ui');

const ELSEWHERE = SOURCES.filter((source) => source.file !== CHANNEL);

const STYLESHEET = readFileSync(resolve(here, '..', 'index.css'), 'utf8');

const KEYFRAMES = [...STYLESHEET.matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name]) => name);

const WRITES_A_LITERAL_MOMENT = /style\.(?:transition|animation)\s*=\s*(['"`])(?!none\1)/;

const DECLARES_A_MOMENT = /cubic-bezier\(|\b\d+(?:\.\d+)?m?s\b[^'"`]*\b(?:ease|linear|steps)\b|\b(?:transitionProperty|animationName|animationDuration)\s*:/;

const QUOTED = /'[^'\n]*'|"[^"\n]*"|`[^`]*`/g;

const COMMENTED = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function strings(text: string): string[] {
  text = text.replace(COMMENTED, ' ');
  return [...text.matchAll(QUOTED)].map((match) => match[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ' '));
}

describe('the channel every moment is played through', () => {
  it('reads the tree and the stylesheet it is a rule about', () => {
    expect(SOURCES.map((source) => source.file)).toContain(CHANNEL);
    expect(SOURCES.length).toBeGreaterThan(6);
    expect(KEYFRAMES.length).toBeGreaterThan(0);
  });

  it('answers every keyframe the stylesheet defines, so one added and never routed fails', () => {
    const channel = SOURCES.find((source) => source.file === CHANNEL)!;

    for (const name of KEYFRAMES) {
      expect(channel.text, `${CHANNEL} answers to no moment named ${name}`).toContain(`'${name}'`);
    }
  });

  it('is the only module that names one, so a component cannot play one without it', () => {
    for (const source of ELSEWHERE) {
      for (const written of strings(source.text)) {
        for (const name of KEYFRAMES) {
          expect(written, `${source.file} writes the moment ${name} rather than asking for it`).not.toMatch(new RegExp(`\\b${name}\\b`));
        }
      }
    }
  });

  it('is the only module that writes what a moment is made of, so one begun elsewhere came from here', () => {
    for (const source of ELSEWHERE) {
      expect(source.text, `${source.file} writes a moment onto a node rather than one the channel handed it`).not.toMatch(WRITES_A_LITERAL_MOMENT);
      expect(source.text, `${source.file} declares a moment of its own`).not.toMatch(DECLARES_A_MOMENT);
    }

    const channel = SOURCES.find((source) => source.file === CHANNEL)!;
    expect(channel.text).toMatch(DECLARES_A_MOMENT);
    expect(`node.style.transition = 'transform 220ms ease'`).toMatch(WRITES_A_LITERAL_MOMENT);
    expect(`node.style.transition = 'none'`).not.toMatch(WRITES_A_LITERAL_MOMENT);
  });

  it('is provided once, at the top, so a moment played anywhere under it is written down', () => {
    const app = SOURCES.find((source) => source.file === 'src/ui/App.tsx')!;
    const providing = ELSEWHERE.filter((source) => source.text.includes('<TransientProvider'));

    expect(app.text).toContain('<TransientProvider value={driver.transient}>');
    expect(providing.map((source) => source.file)).toEqual(['src/ui/App.tsx']);
  });
});
