import { describe, expect, it } from 'vitest';
import type { CommandOutput } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';

function viewAt(id: string, said: string[] = [], description = ''): PlayView {
  return {
    location: { id, title: `title of ${id}`, description },
    entities: [],
    choices: [],
    time: 0,
    resources: [],
    encounter: null,
    modals: [],
    journey: null,
    inventory: {},
    grown: {},
    equipment: {},
    xp: {},
    stats: {},
    flags: {},
    discovered: [],
    player: { name: '', race: '' },
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
    const transcript = appendOutputs(emptyTranscript(), [{ kind: 'message', tone: 'error', text: 'no.', detail: ['because', 'of this'] }]);

    expect(transcript.entries).toEqual([
      { id: 1, kind: 'message', tone: 'error', text: 'no.' },
      { id: 2, kind: 'detail', tone: 'error', text: 'because' },
      { id: 3, kind: 'detail', tone: 'error', text: 'of this' },
    ]);
  });

  it('keeps nothing from a re-read of what the shell already shows', () => {
    const before = emptyTranscript();
    const after = appendOutputs(before, [
      { kind: 'status', status: viewAt('hall') },
      { kind: 'inventory', status: viewAt('hall') },
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
