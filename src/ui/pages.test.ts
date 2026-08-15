import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

const read = (name: string): string => readFileSync(resolve(here, name), 'utf8');

const APP = read('App.tsx');

// A page rides on a strip the shell moves with a transform, and a transform
// makes its element the containing block for everything `fixed` beneath it. So
// a page that opens something over itself and positions it against the window
// gets it positioned against the page instead — a whole page's width off
// screen, drawn and unreachable, which is what happened to the skills page.
//
// The pages are read off App's own `pane` function rather than listed, so a
// page written next month is held to this without anyone adding it here.
const PANE = APP.slice(APP.indexOf('const pane = ('), APP.indexOf('const bodies = '));

const PAGES = [...new Set([...PANE.matchAll(/<([A-Z]\w+)/g)].map(([, name]) => name))];

// Where the shell moves a strip. Two of them, and both are why the rule exists.
const MOVERS = ['Pager.tsx', 'VStack.tsx'];

describe('what a page may open over itself', () => {
  it('reads the pages off the shell rather than off a list', () => {
    expect(PANE).toContain('layer.id');
    expect(PAGES.length).toBeGreaterThan(3);
    expect(PAGES).toContain('SkillsPane');
  });

  it('is drawn on a strip that moves, which is the whole reason for the rule', () => {
    for (const mover of MOVERS) expect(read(mover), `${mover} moves nothing`).toMatch(/style\.transform\s*=/);
  });

  it('positions it against the page and never against the window', () => {
    for (const page of PAGES) {
      const source = read(`${page}.tsx`);

      expect(source, `${page} positions something against the window, which is a transform away from it`).not.toMatch(/\bfixed\b[^'"`]*\binset-0\b|\binset-0\b[^'"`]*\bfixed\b/);
    }
  });

  // The rule matching nothing would pass every page above.
  it('recognises the mistake it is a rule about', () => {
    const wrong = 'className="fixed inset-0 z-50 flex"';

    expect(wrong).toMatch(/\bfixed\b[^'"`]*\binset-0\b|\binset-0\b[^'"`]*\bfixed\b/);
  });
});
