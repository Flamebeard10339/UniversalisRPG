import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

const STYLESHEET = readFileSync(resolve(here, '..', 'index.css'), 'utf8');
const ENTRY = readFileSync(resolve(here, '..', 'main.tsx'), 'utf8');
const PAGE = readFileSync(resolve(here, '..', '..', 'index.html'), 'utf8');

// The rule this file is about: two surfaces zoom, the page does not. Neither
// half is enough on its own — a stylesheet cannot reach a trackpad and a
// listener cannot reach a double-tap — so all three are held together, because
// dropping any one of them is a hole nobody would notice until a player pinched
// on the device that half covered.

const viewport = (): string => PAGE.match(/<meta name="viewport" content="([^"]*)"/)?.[1] ?? '';

describe('the page itself does not zoom', () => {
  it('reads the three files it is a rule about', () => {
    expect(viewport()).not.toBe('');
    expect(STYLESHEET.length).toBeGreaterThan(0);
    expect(ENTRY).toContain('createRoot');
  });

  it('takes the scale away from the viewport, so a phone offers none', () => {
    expect(viewport()).toMatch(/\buser-scalable=no\b/);
    expect(viewport()).toMatch(/\bmaximum-scale=1(\.0)?\b/);
    // The safe areas are what the shell lays itself out against, and a viewport
    // rewritten without them takes the top and bottom insets with it.
    expect(viewport()).toMatch(/\bviewport-fit=cover\b/);
  });

  it('takes the pinch and the double-tap away from the page, and leaves scrolling', () => {
    const rule = STYLESHEET.match(/html,\s*body\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/touch-action:\s*pan-x pan-y/);
  });

  it('refuses the two gestures neither of those reaches', () => {
    // A trackpad pinch arrives as a wheel with ctrl held, and Safari has
    // gesture events of its own. Both are the browser's own zoom, and both are
    // refused where the page is started rather than inside a component that
    // comes and goes.
    expect(ENTRY).toMatch(/addEventListener\(\s*'wheel'/);
    expect(ENTRY).toMatch(/ctrlKey/);
    for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) expect(ENTRY).toContain(gesture);
    expect(ENTRY).toMatch(/preventDefault/);
  });

  it('leaves the two surfaces that do zoom holding their own gesture', () => {
    const sheet = readFileSync(resolve(here, 'DragSheet.tsx'), 'utf8');

    // `touch-none` is what tells the browser to keep its hands off the sheet,
    // which is the other half of the stylesheet rule above: the page gives up
    // panning nowhere except here, where the sheet takes it over.
    expect(sheet).toContain('touch-none');
    expect(sheet).toMatch(/onWheel/);
  });
});
