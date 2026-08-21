import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../src/content/engineLocale';
import { noteLines, notesIn } from './notes';

const island = (...lines: string[]) => loadInEnglish(['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', ...lines].join('\n')).locales;

describe('what the corpus says is unfinished', () => {
  it('addresses each note by the key of the line it was left in, whatever kind wrote that line', () => {
    const locales = island('', '# entity miki', 'title: Miki @@@ she should have a surname once the family is written', '', '# dialogue chat', 'owner = miki', 'node greet:', '  A traveller, out here? @@@');

    expect(notesIn(locales)).toEqual([
      { key: 'island.dialogue.chat.greet.line.0', language: 'en', said: '', stands: 'A traveller, out here?' },
      { key: 'island.entity.miki.title', language: 'en', said: 'she should have a surname once the family is written', stands: 'Miki' },
    ]);
  });

  it('tells work someone asked for from writing that is only rough, since a bare mark asks for nothing', () => {
    const lines = noteLines(island('', '# item rope', 'title: Rope @@@', '', '# item lamp', 'title: Lamp @@@ it should light the cave, and nothing lights anything yet'));

    expect(lines.join('\n')).toContain('1 note(s) — what an author asked for and did not get:');
    expect(lines.join('\n')).toContain('asked for: it should light the cave, and nothing lights anything yet');
    expect(lines.join('\n')).toContain('1 line(s) marked rough');
  });

  it('says so plainly where a line is nothing but a mark, which is a line the game will say as nothing', () => {
    expect(noteLines(island('', '# item rope', 'title: @@@')).join('\n')).toContain('stands as: (nothing at all)');
  });

  it('finds nothing to say about a corpus that left no marks', () => {
    expect(noteLines(island('', '# item rope', 'title: Rope'))).toEqual(['no @@@ anywhere: nothing here is marked unfinished']);
  });
});
