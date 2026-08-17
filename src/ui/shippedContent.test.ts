import { readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { createDriver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';

// What content/ holds, under the one exclusion the bundle makes. Derived rather
// than listed, because a listed answer is a second manifest and the glob is the
// first: the pair drifted the moment a second module was authored.
const authored = readdirSync('content')
  .filter((name) => name.endsWith('.dsl'))
  .map((name) => name.replace(/\.dsl$/, ''))
  .filter((name) => name !== LOCAL_CHANGES_MODULE_ID)
  .sort();

describe('the content the build carries', () => {
  it('bundles every shipped DSL as text, with no path left for the browser to fetch', () => {
    expect(SHIPPED_SOURCES.map((source) => source.name)).toEqual(authored);
    for (const source of SHIPPED_SOURCES) expect(source.text).toMatch(/^#[ \t]/m);
  });

  it('opens a session out of what it bundled', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    expect(driver.snapshot().problems).toEqual([]);
    expect(driver.snapshot().view.location.id).toBe('tutorial-island.guide-house');
  });
});
