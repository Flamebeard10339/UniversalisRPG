import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

// The channel, as the file it is: every rule below is about what may name what
// this one names.
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

// The stylesheet is the ground truth for what the shell can play: a keyframe
// exists because someone wrote one, and the channel is where the name of it has
// to be answered. Read off the CSS rather than off the channel's own table, so
// a keyframe added and never routed fails rather than passing unmentioned.
const KEYFRAMES = [...STYLESHEET.matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name]) => name);

// A module holding a node may write a moment onto it — the settle is written
// onto a strip a finger has just let go of, and no other module can reach that
// strip — so what the rule refuses is the literal, not the assignment. What is
// written has to have come from the channel. `none` is the one literal that is
// not a moment: it is a moment being taken back off.
const WRITES_A_LITERAL_MOMENT = /style\.(?:transition|animation)\s*=\s*(['"`])(?!none\1)/;

// The other half, which does not depend on reaching a node at all: a duration
// with an easing beside it is an animation however it gets onto the page, and a
// style object naming a transition property is one being declared. A Tailwind
// `transition-*` utility is neither — it says how a value is drawn as it
// changes, which is what press feedback is and what no agent can miss.
const DECLARES_A_MOMENT = /cubic-bezier\(|\b\d+(?:\.\d+)?m?s\b[^'"`]*\b(?:ease|linear|steps)\b|\b(?:transitionProperty|animationName|animationDuration)\s*:/;

// Every string a module writes, of any quoting. A class name reaches a node
// from inside one of these and nowhere else, where the same word outside one is
// an ordinary local — `arrived` is both a moment and what App.tsx calls the
// places that have just turned up.
const QUOTED = /'[^'\n]*'|"[^"\n]*"|`[^`]*`/g;

// Comments first, because this codebase writes prose and prose has apostrophes
// in it: "the map's own working out" opens a string literal that a scanner
// then runs to the next apostrophe, swallowing whatever code is in between.
const COMMENTED = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function strings(text: string): string[] {
  text = text.replace(COMMENTED, ' ');
  // Interpolations dropped: what a template writes is its literal parts, and
  // what it interpolates is code that has already been read as code. A class
  // list is very often `${asked} the-rest`, and the name inside the braces is
  // the local the channel handed back.
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

    // Both rules matching nothing anywhere would pass every module above.
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
