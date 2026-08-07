import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/runtime/save';
import { tsxCli } from './lib/tsxCli';
import { NO_FIELD_MOVED, SHAPE_CHANGE, migrate, readContent, writeMigration, type ContentFile, type ShapeChange } from './migrate-saves';

const BEHIND = SAVE_VERSION - 1;

const stamped = (version: number, rest: string): string => `{"version":${version},${rest}}`;

const ARRIVAL = '"location":"probe-island.start"';
const CARRIED = '"inventory":{"probe-island.coin":2}';
const ORPHAN = '"time":10';

const island = (arrival: string, carried: string, orphan: string): string => `// A module whose comments and blank lines are part of what is under test.
# info probe-island
version: 1.0.0

# location start
title: Start
starting

# item coin
title: Coin

// A note whose exact placement is the point.
// Two lines of it, above the fixture it explains.
# save arrival
${arrival}

# save carried
${carried}

# save orphan
${orphan}

# test replays
load: arrival

# test records
expect: carried
`;

const at = (version: number): string => island(stamped(version, ARRIVAL), stamped(version, CARRIED), stamped(version, ORPHAN));

const outpost = (version: number): string => `# info probe-outpost
version: 1.0.0

# location camp
title: Camp

# save camped
${stamped(version, '"location":"probe-outpost.camp"')}
`;

const files = (...pairs: [string, string][]): ContentFile[] => pairs.map(([file, text]) => ({ path: file, text }));

const one = (version: number): ContentFile[] => files(['island.dsl', at(version)]);

const addsRng: ShapeChange = { declared: 'rng became a field every save carries', moved: (body) => ({ ...body, rng: 123 }) };

const temporary: string[] = [];

function scratch(...pairs: [string, string][]): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'migrate-saves-'));
  temporary.push(directory);
  for (const [file, text] of pairs) writeFileSync(path.join(directory, file), text);
  return directory;
}

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop()!, { recursive: true, force: true });
});

describe('c1: the body, and nothing else', () => {
  it('restamps every # save body and reproduces the file byte for byte otherwise', () => {
    const report = migrate(one(BEHIND), NO_FIELD_MOVED);

    expect(report.ok).toBe(true);
    expect(report.files).toEqual([{ path: 'island.dsl', text: at(SAVE_VERSION) }]);
  });

  it('applies the shape change to each fixture in place, without moving a byte around it', () => {
    const report = migrate(one(BEHIND), addsRng);

    expect(report.files[0].text).toBe(island(stamped(SAVE_VERSION, `${ARRIVAL},"rng":123`), stamped(SAVE_VERSION, `${CARRIED},"rng":123`), stamped(SAVE_VERSION, `${ORPHAN},"rng":123`)));
  });

  it('returns the shipped content unchanged when the only thing behind it is the version stamp', () => {
    const shipped = readFileSync('content/tutorial-island.dsl', 'utf8');
    const behind = shipped.replace(new RegExp(`\\{"version":${SAVE_VERSION},`, 'g'), `{"version":${BEHIND},`);
    expect(behind).not.toBe(shipped);

    const report = migrate(files(['content/tutorial-island.dsl', behind]), NO_FIELD_MOVED);

    expect(report.lines.filter((line) => line.includes(`version ${BEHIND} rewritten`))).toHaveLength(3);
    expect(report.files[0].text).toBe(shipped);
  });
});

describe('c2: running it twice is running it once', () => {
  it('skips a fixture already stamped SAVE_VERSION rather than transforming it again', () => {
    const once = migrate(one(BEHIND), addsRng);
    const twice = migrate(files(['island.dsl', once.files[0].text]), addsRng);

    expect(twice.ok).toBe(true);
    expect(twice.files).toEqual([]);
    expect(twice.lines).toContain(`island.dsl: probe-island.arrival — already at ${SAVE_VERSION}, left untouched`);
  });

  it('changes no byte on disk when re-run over content it has already migrated', () => {
    const directory = scratch(['island.dsl', at(BEHIND)]);
    const file = path.join(directory, 'island.dsl');

    writeMigration(migrate(readContent(directory), addsRng));
    const migrated = readFileSync(file, 'utf8');
    writeMigration(migrate(readContent(directory), addsRng));

    expect(readFileSync(file, 'utf8')).toBe(migrated);
    expect(migrated).toContain('"rng":123');
  });

  it('has nothing to do against shipped content, which is already at SAVE_VERSION', () => {
    const report = migrate(files(['content/tutorial-island.dsl', readFileSync('content/tutorial-island.dsl', 'utf8')]), addsRng);

    expect(report.ok).toBe(true);
    expect(report.files).toEqual([]);
  });
});

describe('c3: nothing is written until everything validates', () => {
  const breaksCarried: ShapeChange = { declared: 'a transform that got one fixture wrong', moved: (body, fixture) => (fixture.id === 'probe-island.carried' ? { ...body, time: 'potato' } : body) };

  it('writes no file at all when one rewritten fixture does not load', () => {
    const report = migrate(one(BEHIND), breaksCarried);

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(report.lines.join('\n')).toContain('probe-island.carried: save field time holds "potato"');
  });

  it('holds back a file whose own fixtures are fine when another file has a bad one', () => {
    const report = migrate(files(['island.dsl', at(BEHIND)], ['outpost.dsl', outpost(BEHIND)]), breaksCarried);

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
  });

  it('leaves every byte on disk alone when it refuses', () => {
    const directory = scratch(['island.dsl', at(BEHIND)], ['outpost.dsl', outpost(BEHIND)]);
    const before = readContent(directory);

    writeMigration(migrate(before, breaksCarried));

    expect(readContent(directory)).toEqual(before);
  });

  it('catches a rewrite that survives the field table but names something the registry does not hold', () => {
    const invents: ShapeChange = { declared: 'inventory keys re-pointed at an item nobody declares', moved: (body) => ({ ...body, inventory: { 'probe-island.ghost': 1 } }) };

    const report = migrate(one(BEHIND), invents);

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(report.lines.join('\n')).toContain('probe-island.ghost');
  });
});

describe('c4: a bump has to state what it did to the shape', () => {
  it('refuses an unset shape change', () => {
    const report = migrate(one(BEHIND), null);

    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(report.lines.join('\n')).toContain('SHAPE_CHANGE');
  });

  it('separates "nothing moved" from "nobody said", which is the whole point of declaring it', () => {
    expect(migrate(one(BEHIND), NO_FIELD_MOVED).ok).toBe(true);
    expect(migrate(one(BEHIND), null).ok).toBe(false);
  });

  it('names what it did at the top of every run', () => {
    expect(migrate(one(BEHIND), addsRng).lines[0]).toBe(`shape change: ${addsRng.declared}`);
  });
});

describe('c5: inputs and recordings are not confused', () => {
  it('classifies each fixture by the # test that names it', () => {
    const lines = migrate(one(BEHIND), NO_FIELD_MOVED).lines;

    expect(lines).toContain(`island.dsl: probe-island.arrival — version ${BEHIND} rewritten to ${SAVE_VERSION} as input`);
    expect(lines).toContain(`island.dsl: probe-island.carried — version ${BEHIND} rewritten to ${SAVE_VERSION} as recording`);
    expect(lines).toContain(`island.dsl: probe-island.orphan — version ${BEHIND} rewritten to ${SAVE_VERSION} as unreferenced`);
  });

  it('names every recording it rewrote as needing regeneration, and no input', () => {
    const regenerate = migrate(one(BEHIND), NO_FIELD_MOVED).lines.find((line) => line.includes('/create-valid-test'));

    expect(regenerate).toContain('probe-island.carried');
    expect(regenerate).not.toContain('probe-island.arrival');
  });

  it('asks for no regeneration when the run rewrote no recording', () => {
    const inputsOnly = at(BEHIND).replace('expect: carried', 'load: carried');

    expect(migrate(files(['island.dsl', inputsOnly]), NO_FIELD_MOVED).lines.join('\n')).not.toContain('/create-valid-test');
  });

  it('reports a fixture no # test references', () => {
    expect(migrate(one(BEHIND), NO_FIELD_MOVED).lines.join('\n')).toContain('No # test names these fixtures, so nothing replays them: probe-island.orphan');
  });
});

describe('the command seam', () => {
  const repoRoot = path.join(import.meta.dirname, '..');

  const run = (args: string[]) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [tsxCli, path.join(repoRoot, 'scripts/migrate-saves.ts'), ...args], { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) };
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string };
      return { status: failure.status, out: `${failure.stdout}${failure.stderr}` };
    }
  };

  it.skipIf(SHAPE_CHANGE !== null)('exits non-zero and writes nothing while no bump has declared a shape change', () => {
    const directory = scratch(['island.dsl', at(BEHIND)]);

    const result = run([directory]);

    expect(result.status).toBe(1);
    expect(result.out).toContain('SHAPE_CHANGE');
    expect(readFileSync(path.join(directory, 'island.dsl'), 'utf8')).toBe(at(BEHIND));
  });

  it('reads every .dsl under the directory it is given', () => {
    const directory = scratch(['island.dsl', at(BEHIND)], ['outpost.dsl', outpost(BEHIND)]);

    expect(readContent(directory).map((file) => path.basename(file.path))).toEqual(['island.dsl', 'outpost.dsl']);
  });
});
