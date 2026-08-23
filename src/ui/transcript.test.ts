import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { CommandOutput } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';

function viewAt(id: string, plain: string[] = [], description = ''): PlayView {
  const said = plain.map(asLocalized);
  return {
    location: { id, title: asLocalized(`title of ${id}`), description: asLocalized(description) },
    entities: [],
    choices: [],
    time: 0,
    resources: [],
    encounter: null,
    modals: [],
    journey: null,
    journal: [],
    inventory: {},
    grown: {},
    carried: [],
    planes: [],
    focus: null,
    equipment: [],
    xp: [],
    stats: [],
    flags: {},
    discovered: [],
    locations: [],
    player: { name: null, race: null },
    action: null,
    said,
  };
}

const seen = (transcript: Transcript): Array<[string, string]> => transcript.entries.map((entry) => [entry.kind, entry.text]);

const shows = (view: PlayView, reread = false): CommandOutput => ({ kind: 'view', view, reread });

describe('the narration column', () => {
  it('writes a place once on arrival and describes it once ever', () => {
    let transcript = appendOutputs(emptyTranscript(), [shows(viewAt('hall', [], 'a wide hall'))]);
    transcript = appendOutputs(transcript, [shows(viewAt('hall', ['you wait']))]);
    transcript = appendOutputs(transcript, [shows(viewAt('yard', [], 'a muddy yard'))]);
    transcript = appendOutputs(transcript, [shows(viewAt('hall', [], 'a wide hall'))]);

    expect(seen(transcript)).toEqual([
      ['place', 'title of hall'],
      ['describe', 'a wide hall'],
      ['said', 'you wait'],
      ['place', 'title of yard'],
      ['describe', 'a muddy yard'],
      ['place', 'title of hall'],
    ]);
  });

  it('describes a place again when the command asked for a re-read', () => {
    let transcript = appendOutputs(emptyTranscript(), [shows(viewAt('hall', [], 'a wide hall'))]);
    transcript = appendOutputs(transcript, [shows(viewAt('hall', [], 'a wide hall'), true)]);

    expect(seen(transcript)).toEqual([
      ['place', 'title of hall'],
      ['describe', 'a wide hall'],
      ['place', 'title of hall'],
      ['describe', 'a wide hall'],
    ]);
  });

  it('keeps a message and its detail as the engine worded them', () => {
    const transcript = appendOutputs(emptyTranscript(), [
      { kind: 'message', words: 'player', tone: 'error', text: asLocalized('no.'), detail: [asLocalized('because'), asLocalized('of this')] },
    ]);

    expect(transcript.entries).toEqual([
      { id: 1, words: 'player', kind: 'message', tone: 'error', text: 'no.', repeats: 1 },
      { id: 2, words: 'player', kind: 'detail', tone: 'error', text: 'because', repeats: 1 },
      { id: 3, words: 'player', kind: 'detail', tone: 'error', text: 'of this', repeats: 1 },
    ]);
  });

  it('counts a line it is told again rather than writing it out again', () => {
    const roasted = { kind: 'message', words: 'player', tone: 'plain', text: asLocalized('a chestnut pops') } as const;
    const told = (held: Transcript, times: number): Transcript => Array.from({ length: times }).reduce<Transcript>((each) => appendOutputs(each, [roasted]), held);

    const transcript = told(emptyTranscript(), 435);

    expect(transcript.entries).toEqual([{ id: 1, words: 'player', kind: 'message', tone: 'plain', text: 'a chestnut pops', repeats: 435 }]);
    expect(transcript.nextId).toBe(2);
  });

  it('counts only what it was just told, so a line coming back after another is its own', () => {
    const pops = { kind: 'message', words: 'player', tone: 'plain', text: asLocalized('a chestnut pops') } as const;
    const burns = { kind: 'message', words: 'player', tone: 'plain', text: asLocalized('one burns') } as const;

    const transcript = appendOutputs(appendOutputs(appendOutputs(emptyTranscript(), [pops, pops]), [burns]), [pops]);

    expect(transcript.entries.map((entry) => [entry.text, entry.repeats])).toEqual([
      ['a chestnut pops', 2],
      ['one burns', 1],
      ['a chestnut pops', 1],
    ]);
  });

  it('tells a diagnostic from something the world said, however alike they read', () => {
    const spoken = { kind: 'message', words: 'player', tone: 'plain', text: asLocalized('the same words') } as const;
    const noted = { kind: 'message', words: 'tool', tone: 'plain', text: 'the same words' } as const;

    const transcript = appendOutputs(emptyTranscript(), [spoken, noted]);

    expect(transcript.entries.map((entry) => [entry.words, entry.repeats])).toEqual([
      ['player', 1],
      ['tool', 1],
    ]);
  });

  it('says whose words each line is, so a shell can draw the tool apart from the player', () => {
    const transcript = appendOutputs(emptyTranscript(), [
      { kind: 'message', words: 'tool', tone: 'error', text: 'local changes did not load.', detail: ['first'] },
      { kind: 'message', words: 'player', tone: 'plain', text: asLocalized('The door opens.') },
    ]);

    expect(transcript.entries.map((entry) => [entry.words, entry.text])).toEqual([
      ['tool', 'local changes did not load.'],
      ['tool', 'first'],
      ['player', 'The door opens.'],
    ]);
  });

  it('keeps nothing from a re-read of what the shell already shows', () => {
    const before = emptyTranscript();
    const after = appendOutputs(before, [
      { kind: 'status', status: viewAt('hall') },
      { kind: 'choices', choices: [] },
    ]);

    expect(after).toBe(before);
  });

  it('numbers every line it keeps, so no two share a key', () => {
    let transcript = appendOutputs(emptyTranscript(), [shows(viewAt('hall', ['one', 'two']))]);
    transcript = appendOutputs(transcript, [shows(viewAt('hall', ['three']))]);

    expect(transcript.entries.map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
  });
});
