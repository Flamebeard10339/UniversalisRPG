import { describe, expect, it } from 'vitest';
import { occurrencesOf, rename, type RenameReport, type TextFile } from './rename-module';

const ISLAND = `// probe-island, named once in a comment.
# info probe-island
version: 1.0.0

# stat attack
base: 10

# location start
title: Start
starting
adjacent: shore

# location shore
title: Shore

# item coin
title: Coin

# save arrived
{"version":11,"inventory":{"probe-island.coin":2},"flags":{"probe-island.shore.discovered":true},"location":"probe-island.start"}

# test replays
load: arrived
`;

const QUESTS = `# info probe-quests
version: 1.0.0
dependencies:
  probe-island

# location leave-probe-island
title: Leave Probe Island

# location outpost
title: Outpost
adjacent: probe-island.shore
`;

const FIXTURE = `const where = 'probe-island.shore';
const module = { name: 'probe-island', text: '' };
const other = 'probe-quests.outpost';
const suffix = 'probe-islander';
`;

const world = (): TextFile[] => [
  { path: 'content/probe-island.dsl', text: ISLAND },
  { path: 'content/probe-quests.dsl', text: QUESTS },
  { path: 'src/content/probe.test.ts', text: FIXTURE },
];

const at = (report: { files: TextFile[] }, file: string): string => report.files.find((each) => each.path === file)?.text ?? '';

const applied = (report: RenameReport, files: readonly TextFile[]): TextFile[] => {
  const written = new Map(report.files.map((file) => [file.path, file]));
  const kept = files.filter((file) => file.path !== report.moved?.from).map((file) => written.get(file.path) ?? file);
  return report.moved === null ? kept : [written.get(report.moved.to)!, ...kept];
};

describe('what a module id is', () => {
  it('matches the id whole and nothing that merely starts or ends with it', () => {
    const found = 'probe-island probe-islander leave-probe-island probe-island.shore probe-quests content/probe-island.dsl'.match(occurrencesOf('probe-island'));
    expect(found).toHaveLength(3);
  });
});

describe('renaming a module', () => {
  it('rewrites a qualified reference in another module', () => {
    const report = rename(world(), 'probe-island', 'core');
    expect(report.ok, report.lines.join('\n')).toBe(true);
    expect(at(report, 'content/probe-quests.dsl')).toContain('adjacent: core.shore');
  });

  it('rewrites the keys and the values inside a save body', () => {
    const report = rename(world(), 'probe-island', 'core');
    expect(at(report, 'content/core.dsl')).toContain('{"core.coin":2}');
    expect(at(report, 'content/core.dsl')).toContain('"location":"core.start"');
  });

  it('rewrites a string literal under src', () => {
    const report = rename(world(), 'probe-island', 'core');
    expect(at(report, 'src/content/probe.test.ts')).toContain("const where = 'core.shore';");
  });

  it('moves the module onto a file named for its new id', () => {
    const report = rename(world(), 'probe-island', 'core');
    expect(report.moved).toEqual({ from: 'content/probe-island.dsl', to: 'content/core.dsl' });
    expect(at(report, 'content/core.dsl')).toContain('# info core');
  });

  it('leaves a same-prefix id, a same-suffix id and a longer id alone', () => {
    const report = rename(world(), 'probe-island', 'core');
    const quests = at(report, 'content/probe-quests.dsl');
    expect(quests).toContain('# info probe-quests');
    expect(quests).toContain('# location leave-probe-island');
    expect(quests).toContain('title: Leave Probe Island');
    expect(at(report, 'src/content/probe.test.ts')).toContain("'probe-islander'");
    expect(at(report, 'src/content/probe.test.ts')).toContain("'probe-quests.outpost'");
  });

  it('refuses an old id no module declares, and names the ones that exist', () => {
    const report = rename(world(), 'probe-atoll', 'core');
    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(report.lines.join('\n')).toContain('No module declares the id probe-atoll.');
    expect(report.lines.join('\n')).toContain('Declared: probe-island, probe-quests');
  });

  it('refuses a new id another module already declares', () => {
    const report = rename(world(), 'probe-island', 'probe-quests');
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('probe-quests is already declared');
  });

  it('refuses a new id the loader would not accept', () => {
    const report = rename(world(), 'probe-island', 'item');
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('reserved module id');
  });

  it('refuses a corpus that does not load', () => {
    const broken = world().map((file) => (file.path === 'content/probe-quests.dsl' ? { ...file, text: file.text.replace('probe-island.shore', 'probe-island.nowhere') } : file));
    const report = rename(broken, 'probe-island', 'core');
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('The corpus does not load');
  });

  it('refuses an id renamed to itself', () => {
    expect(rename(world(), 'probe-island', 'probe-island').lines.join('\n')).toContain('the same id');
  });

  it('has nothing left to do on a second run', () => {
    const first = rename(world(), 'probe-island', 'core');
    const again = rename(applied(first, world()), 'probe-island', 'core');
    expect(again.ok).toBe(false);
    expect(again.lines.join('\n')).toContain('No module declares the id probe-island.');
  });

  it('counts what it wrote in every file it touched', () => {
    const report = rename(world(), 'probe-island', 'core');
    expect(report.lines).toContain('content/probe-quests.dsl: 2');
    expect(report.lines[report.lines.length - 1]).toBe('9 occurrence(s) of probe-island written as core in 3 file(s).');
  });
});
