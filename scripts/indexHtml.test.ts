import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHROME_TOKEN, fillIndexHtml, stylesheet, tokenValue } from './lib/indexHtml';

const root = path.resolve(import.meta.dirname, '..');

const served = (): string => fillIndexHtml(readFileSync(path.join(root, 'index.html'), 'utf8'), stylesheet());

const chromeOf = (html: string): string | undefined => /<meta name="theme-color" content="([^"]*)"/.exec(html)?.[1];

describe('the page the build serves', () => {
  it('paints the browser chrome the colour the stylesheet declares', () => {
    expect(chromeOf(served())).toBe(tokenValue(stylesheet(), CHROME_TOKEN));
  });

  it('carries no colour of its own for the fill to overwrite', () => {
    expect(chromeOf(readFileSync(path.join(root, 'index.html'), 'utf8'))).toBe('');
  });

  it('refuses a stylesheet that has stopped declaring the token', () => {
    expect(() => fillIndexHtml('<meta name="theme-color" content="" />', ':root { --color-other: #fff; }')).toThrow(CHROME_TOKEN);
  });

  it('refuses a page that has stopped asking to be painted', () => {
    expect(() => fillIndexHtml('<html></html>', stylesheet())).toThrow('theme-color');
  });
});
