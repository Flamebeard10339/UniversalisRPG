import { describe, expect, it } from 'vitest';
import { createDriver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';

describe('the content the build carries', () => {
  it('bundles the shipped DSL as text, with no path left for the browser to fetch', () => {
    expect(SHIPPED_SOURCES.map((source) => source.name)).toEqual(['tutorial-island']);
    expect(SHIPPED_SOURCES[0].text).toContain('# info');
  });

  it('opens a session out of what it bundled', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    expect(driver.snapshot().fault).toBeNull();
    expect(driver.snapshot().view?.location.id).toBe('tutorial-island.guide-house');
  });
});
