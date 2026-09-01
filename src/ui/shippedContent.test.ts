import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DIRS } from '../content/shipped';
import { createDriver } from './driver';
import { FIXTURE_CORPUS_DIR, fixtureSources } from '../content/worldFixture';

// The page reads what ships a second way — `import.meta.glob`, which the browser build needs and
// `shipped.ts` must stay out of — so it is a second place a directory could be left out of. What
// used to hold the two together was a module-by-module comparison of what each found, which could
// only go red because somebody wrote a quest. The fact worth holding is the one that cannot: that
// both readings name the same directories. Their agreeing about `content/` is then a fact about two
// source files, and the corpus itself is `npm run oracle -- --at content`'s to answer for.
const GLOBBED = /import\.meta\.glob\((['"`])([^'"`]+)\1/g;

const globbedDirs = (): string[] =>
  [...readFileSync('src/ui/shippedContent.ts', 'utf8').matchAll(GLOBBED)]
    // A pattern is relative to `src/ui/`, the file it is written in, and names the files in a
    // directory: one `../` up is `src/`, two is the repository root.
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
