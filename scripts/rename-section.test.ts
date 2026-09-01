import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHeading } from './move-sections';
import { readCorpus, renameSection, writeRename, type SectionRenameReport } from './rename-section';
import type { TextFile } from './rename-module';

const ISLAND = `# info probe-island
version: 1.0.0

# stat attack
base: 10

# location start
x: 0, y: 0
title: Start
starting
adjacent: shore
examine: A path runs down to the shore.

// The far end of the only road.
# location shore
x: 1, y: 0
title: Shore
adjacent: start
flags: swept

# item shore-stone
title: Shore Stone

# entity lamp
title: Lamp
light:
  instant
  hidden if: shore.swept
  say: The wick takes.

# save arrived
{"version":11,"inventory":{"probe-island.shore-stone":2},"flags":{"probe-island.shore.swept":true},"location":"probe-island.shore"}
`;

const TOWN = `# info probe-town
version: 1.0.0
dependencies:
  probe-island

# location square
x: 2, y: 0
title: Square
adjacent: probe-island.shore
examine: The shore road ends here.

# save visited
{"version":11,"location":"probe-island.shore","flags":{"probe-island.shore.swept":true}}
`;

const REEF = `# info probe-reef
version: 1.0.0

# location shore
x: 9, y: 0
title: Reef Shore
`;

const FIXTURE = `const where = 'probe-island.shore';
const shore = 'shore';
`;

const world = (): TextFile[] => [
  { path: 'content/probe-island.dsl', text: ISLAND },
  { path: 'content/probe-town.dsl', text: TOWN },
  { path: 'src/content/probe.test.ts', text: FIXTURE },
];

const at = (report: SectionRenameReport, file: string): string => report.files.find((each) => each.path === file)?.text ?? '';

const rename = (files: readonly TextFile[], named: string, to: string): SectionRenameReport => renameSection(files, parseHeading(named), to, 'content');

const harbour = (): SectionRenameReport => rename(world(), 'location:shore', 'harbour');

describe('renaming a section', () => {
  it('writes the heading it was declared under', () => {
    const report = harbour();
    expect(report.ok, report.lines.join('\n')).toBe(true);
    expect(at(report, 'content/probe-island.dsl')).toContain('# location harbour');
  });

  it('writes a bare reference inside its own module', () => {
    expect(at(harbour(), 'content/probe-island.dsl')).toContain('adjacent: harbour');
  });

  it('writes a qualified reference from another module', () => {
    expect(at(harbour(), 'content/probe-town.dsl')).toContain('adjacent: probe-island.harbour');
  });

  it('writes a flag minted beneath it, named bare', () => {
    expect(at(harbour(), 'content/probe-island.dsl')).toContain('hidden if: harbour.swept');
  });

  it('writes the keys and the values inside a save body', () => {
    const island = at(harbour(), 'content/probe-island.dsl');
    expect(island).toContain('"probe-island.harbour.swept":true');
    expect(island).toContain('"location":"probe-island.harbour"');
    expect(at(harbour(), 'content/probe-town.dsl')).toContain('"probe-island.harbour.swept":true');
  });

  it('leaves the word where it is prose rather than a name', () => {
    expect(at(harbour(), 'content/probe-island.dsl')).toContain('examine: A path runs down to the shore.');
    expect(at(harbour(), 'content/probe-town.dsl')).toContain('examine: The shore road ends here.');
  });

  it('leaves a comment as it was written', () => {
    expect(at(harbour(), 'content/probe-island.dsl')).toContain('// The far end of the only road.');
  });

  it('leaves an id that merely shares a prefix alone', () => {
    const island = at(harbour(), 'content/probe-island.dsl');
    expect(island).toContain('# item shore-stone');
    expect(island).toContain('"probe-island.shore-stone":2');
  });

  it('writes nothing outside the world it was pointed at', () => {
    expect(harbour().files.map((file) => file.path)).toEqual(['content/probe-island.dsl', 'content/probe-town.dsl']);
  });

  it('counts what it wrote in every file it touched', () => {
    const report = harbour();
    expect(report.lines[0]).toBe('# location shore → # location harbour, so probe-island.shore → probe-island.harbour');
    expect(report.lines.some((line) => line.startsWith('  content/probe-town.dsl: '))).toBe(true);
  });
});

describe('what it refuses', () => {
  const refusal = (report: SectionRenameReport): string => report.lines.join('\n');

  it('refuses a new id another section of that kind already holds, and writes nothing', () => {
    const report = rename(world(), 'location:shore', 'start');
    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(refusal(report)).toContain('probe-island.start is already declared');
  });

  it('refuses an id the language does not take as a heading', () => {
    expect(refusal(rename(world(), 'location:shore', 'Harbour'))).toContain('is not an id the language takes');
  });

  it('refuses a new id that names a module, since a section stays where it belongs', () => {
    expect(refusal(rename(world(), 'location:shore', 'probe-town.harbour'))).toContain('a section is renamed inside the one it already belongs to');
  });

  it('refuses a section no module declares, and names the ones that exist', () => {
    const report = rename(world(), 'location:lagoon', 'harbour');
    expect(report.ok).toBe(false);
    expect(refusal(report)).toContain('No # location is named lagoon.');
    expect(refusal(report)).toContain('probe-island.shore');
  });

  it('refuses a kind whose ids are not a module’s own', () => {
    expect(refusal(rename(world(), 'variable:tuning', 'other'))).toContain('are not a module');
  });

  it('refuses a word that is no section kind', () => {
    expect(refusal(rename(world(), 'lighthouse:shore', 'harbour'))).toContain('is no section kind');
  });

  it('refuses an id renamed to itself', () => {
    expect(refusal(rename(world(), 'location:shore', 'shore'))).toContain('nothing to rename');
  });

  it('refuses a corpus that does not load', () => {
    const broken = world().map((file) => (file.path === 'content/probe-town.dsl' ? { ...file, text: file.text.replace('probe-island.shore', 'probe-island.nowhere') } : file));
    expect(refusal(rename(broken, 'location:shore', 'harbour'))).toContain('The corpus does not load');
  });

  it('refuses an id two modules both declare, and says how to write the one meant', () => {
    const both = [...world(), { path: 'content/probe-reef.dsl', text: REEF }];
    const report = rename(both, 'location:shore', 'harbour');
    expect(report.ok).toBe(false);
    expect(refusal(report)).toContain('ambiguous between probe-island.shore and probe-reef.shore');
    expect(refusal(report)).toContain('location:probe-island.shore');
  });

  it('takes the one meant once it is written whole', () => {
    const both = [...world(), { path: 'content/probe-reef.dsl', text: REEF }];
    const report = rename(both, 'location:probe-reef.shore', 'harbour');
    expect(report.ok, report.lines.join('\n')).toBe(true);
    expect(at(report, 'content/probe-reef.dsl')).toContain('# location harbour');
    expect(report.files.map((file) => file.path)).toEqual(['content/probe-reef.dsl']);
  });
});

// What `--dry-run` skips, which is the only thing that ever writes: the rename itself reads the world
// and hands back what the files would say, and nothing reaches the disk until `writeRename` is called.
describe('nothing is written until it is asked for', () => {
  it('leaves every file as it was, and writes them once the report is taken', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rename-section-'));
    try {
      writeFileSync(path.join(root, 'probe-island.dsl'), ISLAND);
      writeFileSync(path.join(root, 'probe-town.dsl'), TOWN);
      const posix = root.replace(/\\/g, '/');
      const report = renameSection(readCorpus(posix), parseHeading('location:shore'), 'harbour', posix);

      expect(report.ok, report.lines.join('\n')).toBe(true);
      expect(readFileSync(path.join(root, 'probe-island.dsl'), 'utf8')).toBe(ISLAND);

      writeRename(report);
      expect(readFileSync(path.join(root, 'probe-island.dsl'), 'utf8')).toContain('# location harbour');
      expect(readFileSync(path.join(root, 'probe-town.dsl'), 'utf8')).toContain('adjacent: probe-island.harbour');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
