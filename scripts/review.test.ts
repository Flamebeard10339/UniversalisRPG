import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { shippedSources } from '../src/content/shipped';
import { parseLedger, printLedger, sheetFor, sheetLines, through } from './review';

const town = (...lines: string[]): string => ['# info town', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', ...lines].join('\n');

const sheet = (text: string) => {
  const { registry } = loadUniverseWithDiagnostics([{ name: 'town.dsl', text }]);
  return sheetFor(registry, 'town', 'content/town.dsl', text);
};

const shipped = shippedSources;

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
    const written = sheetFor(registry, 'engine-en', 'content/engine-en.dsl', english.source.text);

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

  it('reads back a ledger it wrote, so what one sitting marked the next one finds', () => {
    const held = new Map([['town.item.lamp.examine', 'abc123def456']]);

    expect(parseLedger(printLedger(held))).toEqual(held);
  });

  it('counts the corpus rather than a number written down here', () => {
    const { registry, parsed } = loadUniverseWithDiagnostics(shipped());
    const tulsa = parsed.find((module) => module.info.id === 'tulsa')!;
    const written = sheetFor(registry, 'tulsa', 'content/tulsa.dsl', tulsa.source.text);
    const said = written.sections.flatMap((section) => section.said);

    expect(sheetLines(written)[1]).toBe(`  ${said.length} line(s) left to read, of ${said.length} the game says across ${written.sections.length} section(s)`);
  });
});
