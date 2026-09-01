import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/runtime/save';
import { FIXTURE_CORPUS_DIR } from '../src/content/worldFixture';
import { readContent, type ContentFile } from './lib/saveFixtures';
import type { Change, Heading, RenameHistory } from './lib/renameHistory';
import { repair } from './repair-saves';

// No test here runs git: the tool is handed a `RenameHistory` and the one that shells out is
// `gitHistory.ts`, which holds no reasoning to prove. Nor does any read a line of `content/` — the
// world below is written out here, and the one real corpus it stands beside is the fixture's.

const ISLAND = 'island.dsl';

const heading = (kind: string, id: string, title?: string): Heading => ({ file: ISLAND, kind, id, ...(title === undefined ? {} : { title }) });

const history = (...changes: readonly Change[]): RenameHistory => ({
  removalsOf: (id) => changes.filter((change) => change.removed.some((each) => each.id === id)),
});

const RENAMED_COIN: Change = { sha: 'c0ffee123', subject: 'the coin got a shorter name', removed: [heading('item', 'probe-island.old-coin')], added: [heading('item', 'probe-island.coin')] };

const stamped = (rest: string, version: number = SAVE_VERSION): string => `{"version":${version},${rest}}`;

const CARRIES_A_GHOST = '"inventory":{"probe-island.old-coin":2}';

const island = (carried: string): string => `// A module whose comments and blank lines are part of what is under test.
# info probe-island
version: 1.0.0

# location start
title: Start
starting

# item coin
title: Coin

// A note whose exact placement is the point.
# save carried
${carried}

# test replays
load: carried
`;

const outpost = `# info probe-outpost
version: 1.0.0

# location camp
title: Camp

# save camped
${stamped('"location":"probe-outpost.camp"')}
`;

const files = (...pairs: [string, string][]): ContentFile[] => pairs.map(([file, text]) => ({ path: file, text }));

const rotted = (carried: string = stamped(CARRIES_A_GHOST)): ContentFile[] => files([ISLAND, island(carried)]);

// `probe-island.old-coin` is what the body names and `probe-island.coin` is what the world declares,
// so this is the rename that puts the recording back on its feet.
const knows = history(RENAMED_COIN);

const said = (report: { lines: string[] }): string => report.lines.join('\n');

describe('c1: what has rotted, and what it would take to mend it', () => {
  it('names the body the loader has to prune and what history says the id became', () => {
    const report = repair(rotted(), knows);

    expect(report.ok).toBe(true);
    expect(said(report)).toContain('# save probe-island.carried');
    expect(said(report)).toContain('probe-island.old-coin → probe-island.coin');
    expect(said(report)).toContain('c0ffee123 the coin got a shorter name');
  });

  it('has nothing to say about a world whose bodies all name ids it still declares', () => {
    const report = repair(readContent(FIXTURE_CORPUS_DIR), knows);

    expect(report.ok).toBe(true);
    expect(report.files).toEqual([]);
    expect(said(report)).toContain('Nothing to repair');
  });

  it('says a body stamped an older version is a shape question rather than a name one', () => {
    const report = repair(rotted(stamped(CARRIES_A_GHOST, SAVE_VERSION - 1)), knows);

    expect(report.ok).toBe(false);
    expect(said(report)).toContain('npm run migrate-saves');
  });
});

describe('c2: nothing is written on a guess', () => {
  it('writes no file at all without --write, however sure it is', () => {
    const report = repair(rotted(), knows);

    expect(report.files).toEqual([]);
    expect(said(report)).toContain('--write');
  });

  it('rewrites the body span and reproduces every other byte, given --write', () => {
    const report = repair(rotted(), knows, { write: true });

    expect(report.files).toEqual([{ path: ISLAND, text: island(stamped('"inventory":{"probe-island.coin":2}')) }]);
  });

  it('refuses an id history will not settle, and names it for --rename', () => {
    const report = repair(rotted(), history(), { write: true });

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(said(report)).toContain('--rename <old>=<new>');
    expect(said(report)).toContain('probe-island.old-coin');
  });

  it('takes a rename the author named over anything history would have said', () => {
    const elsewhere = history({ sha: 'a1', subject: 'x', removed: [heading('item', 'probe-island.old-coin')], added: [heading('item', 'probe-island.start')] });

    const report = repair(rotted(), elsewhere, { write: true, renames: new Map([['probe-island.old-coin', 'probe-island.coin']]) });

    expect(report.files[0]!.text).toContain('"probe-island.coin":2');
    expect(said(report)).toContain('taken as written');
  });

  it('will not rename one holding onto another the same body already carries', () => {
    const both = rotted(stamped('"inventory":{"probe-island.old-coin":2,"probe-island.coin":1}'));

    const report = repair(both, knows, { write: true });

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(said(report)).toContain('would lose a holding');
  });
});

describe('c3: as a whole rather than in part', () => {
  it('holds back a file it could mend when another file names something it cannot', () => {
    const two = [...rotted(), { path: 'outpost.dsl', text: outpost.replace('"probe-outpost.camp"', '"probe-outpost.nowhere-at-all"') }];

    const report = repair(two, knows, { write: true });

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
  });

  it('refuses when the content it was given does not load, so there is no world to ask', () => {
    const report = repair(files(['broken.dsl', '# info broken\nversion: 1.0.0\n\n# nonsense thing\ntitle: X\n']), knows);

    expect(report.ok).toBe(false);
    expect(said(report)).toContain('does not load');
  });

  it('judges the bytes it will write rather than the renames it applied, so a rewrite that mends nothing is refused', () => {
    const wrong = history({ sha: 'a1', subject: 'x', removed: [heading('item', 'probe-island.old-coin')], added: [heading('item', 'probe-island.start')] });

    const report = repair(rotted(), wrong, { write: true, renames: new Map([['probe-island.old-coin', 'probe-island.also-not-declared']]) });

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(said(report)).toContain('still not a state the world holds');
  });
});
