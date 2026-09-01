import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { fixtureSources } from '../src/content/worldFixture';
import { isLeft, LEDGER, markedLines, nextUp, orphanLines, orphansIn, parseArgs, parseLedger, printLedger, sheetFor, sheetLines, STINT, stintLines, stintsLeft, through } from './review';

const town = (...lines: string[]): string => ['# info town', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', ...lines].join('\n');

const sheet = (text: string) => {
  const { registry } = loadUniverseWithDiagnostics([{ name: 'town.dsl', text }]);
  return sheetFor(registry, 'town', 'content/town.dsl', text);
};

const shipped = fixtureSources;

describe('the sheet a reviewer reads', () => {
  it('puts every line a section says under that section, at the line the section is written on', () => {
    const written = sheet(town('', '# entity miki', 'title: Miki', 'examine: A guide, mid-sentence.'));

    expect(written.sections.find((section) => section.id === 'miki')).toMatchObject({
      kind: 'entity',
      id: 'miki',
      line: 8,
      said: [
        { key: 'town.entity.miki.title', field: 'title', text: 'Miki', generated: false },
        { key: 'town.entity.miki.examine', field: 'examine', text: 'A guide, mid-sentence.', generated: false },
      ],
    });
  });

  it('says which lines the engine wrote out of an id rather than an author out of a sentence', () => {
    const said = sheet(town('', '# item rope')).sections.find((section) => section.id === 'rope')!.said;

    expect(said).toMatchObject([{ field: 'title', text: 'Rope', generated: true }]);
  });

  it('shows what a note asked for beneath the line it was left in, and the line still stands', () => {
    const said = sheet(town('', '# item lamp', 'examine: A lamp. @@@ it should light the cave')).sections.find((section) => section.id === 'lamp')!.said;

    expect(said).toContainEqual(expect.objectContaining({ field: 'examine', text: 'A lamp.', asked: 'it should light the cave', generated: false }));
  });

  it('reviews a line one section gave another under the section that wrote it', () => {
    const written = sheet(town('', '# entity miki', 'title: Miki', '', '# quest settling-in', 'stage arrived:', '  log: You are here.', '  complete', '  miki says:', '    always', '    A traveller, out here?'));

    expect(written.sections.find((section) => section.id === 'settling-in')!.said.map((said) => said.text)).toContain('A traveller, out here?');
    expect(written.loose).toEqual([]);
  });

  it('reviews the lines a module names outright, which is the only way the engine says anything on its own behalf', () => {
    const { registry, parsed } = loadUniverseWithDiagnostics(shipped());
    const english = parsed.find((module) => module.info.id === 'engine-en')!;
    const written = sheetFor(registry, 'engine-en', 'engine-en.dsl', english.source.text);

    expect(written.sections.map((section) => section.kind)).toEqual(['locale']);
    expect(written.sections[0].said.map((said) => said.field)).toContain('engine.travel.to');
  });

  it('leaves nothing the corpus says outside the sheet its module writes', () => {
    const { registry, parsed } = loadUniverseWithDiagnostics(shipped());
    const loose = parsed.flatMap((module) => sheetFor(registry, module.info.id, module.source.name, module.source.text).loose);

    expect(loose).toEqual([]);
  });

  it('holds a line as read only against the words that were read, so a rewrite brings it back', () => {
    const text = town('', '# item lamp', 'examine: A lamp.');
    const { registry } = loadUniverseWithDiagnostics([{ name: 'town.dsl', text }]);
    const lamp = sheetFor(registry, 'town', 'content/town.dsl', text).sections.find((section) => section.id === 'lamp')!;
    const held = new Map(lamp.said.map((said) => [said.key, said.hash]));

    const read = sheetFor(registry, 'town', 'content/town.dsl', text, held);
    expect(read.sections.find((section) => section.id === 'lamp')!.said.every((said) => said.standing === 'reviewed')).toBe(true);

    const rewritten = town('', '# item lamp', 'examine: A lamp, by another hand.');
    const after = sheetFor(loadUniverseWithDiagnostics([{ name: 'town.dsl', text: rewritten }]).registry, 'town', 'content/town.dsl', rewritten, held);
    const said = after.sections.find((section) => section.id === 'lamp')!.said;

    expect(said.find((each) => each.field === 'examine')!.standing).toBe('changed');
    expect(said.find((each) => each.field === 'title')!.standing).toBe('reviewed');
  });

  it('marks a run of sections down to the one named, and nothing past it', () => {
    const text = town('', '# item rope', 'examine: A rope.', '', '# item lamp', 'examine: A lamp.', '', '# item pan', 'examine: A pan.');
    const { registry } = loadUniverseWithDiagnostics([{ name: 'town.dsl', text }]);
    const written = sheetFor(registry, 'town', 'content/town.dsl', text);

    expect(through(written, 'lamp').map((section) => section.id)).toEqual(['shore', 'rope', 'lamp']);
    expect(() => through(written, 'nowhere')).toThrow('town writes no section called nowhere');
  });

  it('names a row whose key moved, since a rewrite comes back CHANGED but a move comes back as nothing at all', () => {
    const text = town('', '# item lamp', 'examine: A lamp.');
    const { registry } = loadUniverseWithDiagnostics([{ name: 'town.dsl', text }]);
    const written = sheetFor(registry, 'town', 'content/town.dsl', text);
    const held = new Map(written.sections.flatMap((section) => section.said).map((said) => [said.key, said.hash]));
    expect(orphansIn([written], held)).toEqual([]);

    const moved = town('', '# item hurricane-lamp', 'examine: A lamp.');
    const after = sheetFor(loadUniverseWithDiagnostics([{ name: 'town.dsl', text: moved }]).registry, 'town', 'content/town.dsl', moved, held);

    expect(after.sections.flatMap((section) => section.said).some((said) => said.standing === 'changed')).toBe(false);
    expect(orphansIn([after], held)).toEqual(['town.item.lamp.examine', 'town.item.lamp.title']);
    expect(orphanLines(orphansIn([after], held)).join('\n')).toContain('town.item.lamp.examine');
  });

  it('calls nothing an orphan while the corpus still says it, whichever module says it', () => {
    const { registry, parsed } = loadUniverseWithDiagnostics(shipped());
    const everySheet = parsed.map((module) => sheetFor(registry, module.info.id, module.source.name, module.source.text));
    const held = new Map(everySheet.flatMap((sheet) => sheet.sections.flatMap((section) => section.said)).map((said) => [said.key, said.hash]));

    expect(held.size).toBeGreaterThan(100);
    expect(orphansIn(everySheet, held)).toEqual([]);
    expect(orphanLines([])).toEqual([]);
  });

  it('says where the rows it is talking about are kept', () => {
    expect(orphanLines(['town.item.lamp.title']).join('\n')).toContain(LEDGER);
  });

  it('reads back a ledger it wrote, so what one sitting marked the next one finds', () => {
    const held = new Map([['town.item.lamp.examine', 'abc123def456']]);

    expect(parseLedger(printLedger(held))).toEqual(held);
  });

  it('counts what a module says rather than a number written down here', () => {
    const { registry, parsed } = loadUniverseWithDiagnostics(shipped());
    const wordiest = parsed.reduce((most, each) => (sheetFor(registry, each.info.id, each.source.name, each.source.text).sections.flatMap((section) => section.said).length > sheetFor(registry, most.info.id, most.source.name, most.source.text).sections.flatMap((section) => section.said).length ? each : most));
    const written = sheetFor(registry, wordiest.info.id, wordiest.source.name, wordiest.source.text);
    const said = written.sections.flatMap((section) => section.said);

    expect(sheetLines(written)[1]).toBe(`  ${said.length} line(s) left to read, of ${said.length} the game says across ${written.sections.length} section(s)`);
  });
});

describe('review: a sitting, bounded', () => {
  const shelf = (...items: string[]) => {
    const text = town('', ...items.flatMap((id) => [`# item ${id}`, `examine: A ${id}.`, '']));
    const { registry } = loadUniverseWithDiagnostics([{ name: 'town.dsl', text }]);
    return { text, registry, sheet: (held?: Map<string, string>) => sheetFor(registry, 'town', 'content/town.dsl', text, held) };
  };

  it('takes the front of the queue and stops there, however much is behind it', () => {
    const { sheet } = shelf('rope', 'lamp', 'pan', 'kettle');

    expect(nextUp([sheet()], 2).map(({ section }) => section.id)).toEqual(['shore', 'rope']);
    expect(stintsLeft([sheet()]).length).toBeGreaterThan(2);
  });

  it('draws one stint across modules, so a sitting is not cut short by a module running out', () => {
    const { registry, parsed } = loadUniverseWithDiagnostics(shipped());
    const sheets = parsed.map((module) => sheetFor(registry, module.info.id, `content/${module.source.name}`, module.source.text));

    expect(new Set(nextUp(sheets, 400).map(({ sheet }) => sheet.module)).size).toBeGreaterThan(1);
  });

  it('offers no section whose every line has been read, so a stint is always work', () => {
    const { sheet } = shelf('rope', 'lamp');
    const first = nextUp([sheet()], 1);
    const held = new Map(first.flatMap(({ section }) => section.said).map((said) => [said.key, said.hash]));

    expect(nextUp([sheet(held)], 1).map(({ section }) => section.id)).not.toEqual(first.map(({ section }) => section.id));
    expect(stintsLeft([sheet(held)]).every(({ section }) => section.said.some(isLeft))).toBe(true);
  });

  it('signs off the batch it printed, worked out again rather than typed back in', () => {
    const { sheet } = shelf('rope', 'lamp', 'pan');
    const shown = nextUp([sheet()], 2);
    const held = new Map<string, string>();
    for (const { section } of nextUp([sheet()], 2)) for (const said of section.said) held.set(said.key, said.hash);

    expect(shown.map(({ section }) => section.id)).toEqual(['shore', 'rope']);
    expect(shown.flatMap(({ section }) => section.said).every((said) => held.get(said.key) === said.hash)).toBe(true);
    expect(nextUp([sheet(held)], 2).map(({ section }) => section.id)).toEqual(['lamp', 'pan']);
  });

  it('says how many are left behind the stint, and how to sign it off', () => {
    const { sheet } = shelf('rope', 'lamp', 'pan');
    const waiting = stintsLeft([sheet()]);
    const printed = stintLines(nextUp([sheet()], 2), waiting.length, 2).join('\n');

    expect(printed).toContain(`2 section(s) to read now, of ${waiting.length} still waiting`);
    expect(printed).toContain('--read-next 2');
    expect(stintLines(nextUp([sheet()], 2), waiting.length, STINT).join('\n')).toContain('--read-next\n');
  });

  it('names every section a mark covered, so nothing is signed off out of sight', () => {
    const { sheet } = shelf('rope', 'lamp');
    const taken = nextUp([sheet()], 2);

    expect(markedLines(taken, 3, 1).join('\n')).toContain('# item rope');
    expect(markedLines(taken, 3, 1).join('\n')).toContain('1 section(s) still waiting.');
  });

  it('takes the sitting as the size of a stint nobody sized, from one place', () => {
    expect(parseArgs([])).toMatchObject({ size: STINT, readNext: false, sheet: false });
    expect(parseArgs(['--next', '5'])).toMatchObject({ size: 5, readNext: false });
    expect(parseArgs(['--read-next'])).toMatchObject({ size: STINT, readNext: true });
    expect(parseArgs(['--read-next', '5'])).toMatchObject({ size: 5, readNext: true });
    expect(parseArgs(['tulsa'])).toMatchObject({ modules: ['tulsa'], size: STINT });
  });

  it('refuses a mark that says the batch two ways, and a stint of nothing', () => {
    expect(() => parseArgs(['--read-next', '--read', 'miki'])).toThrow(/one/);
    expect(() => parseArgs(['--read-next', '--read-through', 'miki'])).toThrow(/one/);
    expect(() => parseArgs(['--read-next', '--sheet'])).toThrow(/one/);
    expect(() => parseArgs(['--next'])).toThrow(/how many/);
    expect(() => parseArgs(['--next', '0'])).toThrow(/nothing to read/);
  });
});
