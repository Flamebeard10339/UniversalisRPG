import { describe, expect, it } from 'vitest';
import { shippedFiles } from '../content/shipped';
import { createDriver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';

// The bridge between the bundler's answer (import.meta.glob, in shippedContent.ts, which the
// browser build needs and content/shipped.ts must stay out of) and the filesystem's answer.
const authored = shippedFiles()
  .map((name) => name.replace(/\.dsl$/, ''))
  .sort();

describe('the content the build carries', () => {
  it('bundles every shipped DSL as text, with no path left for the browser to fetch', () => {
    expect(SHIPPED_SOURCES.map((source) => source.name)).toEqual(authored);
    for (const source of SHIPPED_SOURCES) expect(source.text).toMatch(/^#[ \t]/m);
  });

  it('opens a session out of what it bundled', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    expect(driver.snapshot().problems).toEqual([]);
    expect(driver.snapshot().view.location.id).toBe('tulsa.guide-house');
  });
});
