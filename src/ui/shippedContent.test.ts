import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DIRS, shippedFiles } from '../content/shipped';
import { createDriver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';
import { FIXTURE_CORPUS_DIR, fixtureSources } from '../content/worldFixture';

const GLOBBED = /import\.meta\.glob\((['"`])([^'"`]+)\1/g;

const globbedDirs = (): string[] =>
  [...readFileSync('src/ui/shippedContent.ts', 'utf8').matchAll(GLOBBED)]
    .map(([, , pattern]) => pattern!.replace(/\/[^/]*$/, ''))
    .map((dir) => (dir.startsWith('../../') ? dir.slice('../../'.length) : `src/${dir.slice('../'.length)}`))
    .sort();

describe('the content the build carries', () => {
  it('reads the same directories the filesystem answer reads, and no others', () => {
    expect(globbedDirs()).toEqual([...SHIPPED_DIRS].sort());
  });

  it('opens a session out of what a world bundles, with nothing left for the browser to fetch', () => {
    const bundled = fixtureSources().map((source) => ({ ...source }));
    const driver = createDriver(bundled);

    for (const source of bundled) expect(source.text, source.name).toMatch(/^#[ \t]/m);
    expect(driver.snapshot().problems).toEqual([]);
    expect(driver.snapshot().view.location.id).toBe('fixture-town.green');
  });

  it('is pointed at a directory that holds modules, so the reading above is not of nothing', () => {
    expect(FIXTURE_CORPUS_DIR).toBe('src/content/fixture');
    expect(fixtureSources().length).toBeGreaterThan(2);
  });
});

describe('both doors into the shipped corpus', () => {
  const refused = /does not open while the suite is running/;

  it('refuses the loader that reads the directory', () => {
    expect(() => shippedFiles()).toThrow(refused);
  });

  it('refuses the page that globs the same two directories', () => {
    expect(() => SHIPPED_SOURCES[0]).toThrow(refused);
    expect(() => [...SHIPPED_SOURCES]).toThrow(refused);
  });
});
