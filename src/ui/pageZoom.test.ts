import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

const STYLESHEET = readFileSync(resolve(here, '..', 'index.css'), 'utf8');
const ENTRY = readFileSync(resolve(here, '..', 'main.tsx'), 'utf8');
const PAGE = readFileSync(resolve(here, '..', '..', 'index.html'), 'utf8');

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
    expect(viewport()).toMatch(/\bviewport-fit=cover\b/);
  });

  it('takes the pinch and the double-tap away from the page, and leaves scrolling', () => {
    const rule = STYLESHEET.match(/html,\s*body\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/touch-action:\s*pan-x pan-y/);
  });

  it('refuses the two gestures neither of those reaches', () => {
    expect(ENTRY).toMatch(/addEventListener\(\s*'wheel'/);
    expect(ENTRY).toMatch(/ctrlKey/);
    for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) expect(ENTRY).toContain(gesture);
    expect(ENTRY).toMatch(/preventDefault/);
  });

  it('leaves the two surfaces that do zoom holding their own gesture', () => {
    const sheet = readFileSync(resolve(here, 'DragSheet.tsx'), 'utf8');

    expect(sheet).toContain('touch-none');
    expect(sheet).toMatch(/onWheel/);
  });
});
