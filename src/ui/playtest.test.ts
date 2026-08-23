import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../runtime/command';
import { describeEntry, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, type RunLogEntry, type RunNotes } from '../runtime/runLog';
import { memoryDriver } from '../runtime/store';
import { slotStore } from '../runtime/store';
import { engineLocale } from '../content/engineLocale';
import { browserSlots } from './browserStore';
import { pageStorage } from './agent/pageStorage';
import { createDriver, type Driver } from './driver';
import { attached, createRecorder, edited, emptyNotes, feedbackOn, turnsPlayed } from './playtest';

const took: CommandResult = { output: [], quit: false, recorded: [] };
const turnedAway: CommandResult = { output: [{ kind: 'message', words: 'tool', tone: 'error', text: 'no' }], quit: false, recorded: [] };

const played = (turn: number, line: string, notes: Partial<RunNotes> = {}): RunLogEntry => ({ ...emptyNotes(), ...notes, turn, line, outcome: 'applied', detail: 'something happened' });

const store = () => slotStore(memoryDriver(), () => 0);

const recorder = (kept = store()) => ({ kept, record: createRecorder(kept, () => {}) });

describe('what the feedback sheet is about', () => {
  it('is the last turn played, since an author writes having seen what the line did', () => {
    expect(feedbackOn([played(1, 'travel:beach'), played(2, 'talk:miki')])?.turn).toBe(2);
    expect(feedbackOn([played(1, 'travel:beach'), played(2, 'talk:miki')])?.line).toBe('talk:miki');
  });

  it('is nothing at all where nothing has been played, rather than a turn nobody took', () => {
    expect(feedbackOn([])).toBeNull();
    expect(feedbackOn([{ turn: 1, outcome: 'reload-failed', detail: 'content read failed' }])).toBeNull();
  });

  it('carries what is already attached, so opening the sheet twice does not lose the first answer', () => {
    expect(feedbackOn([played(1, 'talk:miki', { note: 'asking again' })])?.held.note).toBe('asking again');
  });

  // The sheet and the model's reply schema are one list. A field added to the run log arrives on
  // the sheet with nothing edited here, and this is what says so.
  it('asks for every field a recorded turn carries, and for nothing else', () => {
    const about = feedbackOn([played(1, 'talk:miki')]);
    expect(Object.keys(about?.held ?? {}).sort()).toEqual(NOTE_FIELDS.map((field) => field.name).sort());
  });
});

describe('attaching notes', () => {
  it('writes them onto the turn they are about and leaves the others alone', () => {
    const log = attached([played(1, 'a'), played(2, 'b')], 2, { ...emptyNotes(), confusion: 'the mirror said nothing' });
    expect(describeEntry(log[0])).toContain('confusion: (none)');
    expect(describeEntry(log[1])).toContain('confusion: the mirror said nothing');
  });

  it('edits one field of an answer without disturbing the rest', () => {
    const held = edited(edited(emptyNotes(), 'note', 'trying the beach'), 'expected', 'to swim');
    expect(held.note).toBe('trying the beach');
    expect(held.expected).toBe('to swim');
    expect(held.confusion).toBe('');
  });
});

describe('the recorder', () => {
  it('holds nothing until a run is started, which is what not recording is', () => {
    const { record } = recorder();
    expect(record.run()).toBeNull();
    record.opened('travel:beach', took, 0);
    expect(record.run()).toBeNull();
  });

  it('records the line, whether the engine took it, and the words the author read', () => {
    const { record } = recorder();
    record.start();
    record.opened('travel:beach', took, 0);
    record.settle(() => ['You walk down to the beach.']);
    record.opened('talk:nobody', turnedAway, 1);
    record.settle(() => ['There is nobody here by that name.']);

    expect(record.run()?.map((entry) => describeEntry(entry))).toEqual([
      'turn 1 [applied] travel:beach — note: (none); expected: (none); confusion: (none); result: You walk down to the beach.',
      'turn 2 [refused] talk:nobody — note: (none); expected: (none); confusion: (none); result: There is nobody here by that name.',
    ]);
  });

  it('says nothing happened rather than leaving a turn with no answer at all', () => {
    const { record } = recorder();
    record.start();
    record.opened('/cancel', took, 0);
    record.settle(() => ['   ']);
    expect(describeEntry(record.run()![0])).toContain('result: nothing happened');
  });

  // A live action's ending lines arrive after the turn that began it has been recorded, and they
  // are that turn's answer rather than the next one's.
  it('takes what the transcript gains later as the answer of the turn that opened it', () => {
    const { record } = recorder();
    record.start();
    record.opened('use:entity.oven.roast', took, 0);
    record.settle(() => ['You put the dough in.']);
    record.settle(() => ['You put the dough in.', 'The oven bakes it into a golden loaf.']);
    expect(describeEntry(record.run()![0])).toContain('result: You put the dough in.\nThe oven bakes it into a golden loaf.');
  });

  it('picks a run back up where a reload left it, since a kept run is what recording is', () => {
    const kept = store();
    const first = createRecorder(kept, () => {});
    first.start();
    first.opened('travel:beach', took, 0);
    first.settle(() => ['You walk down to the beach.']);
    first.attach(1, { ...emptyNotes(), expected: 'to be able to swim' });

    const second = createRecorder(kept, () => {});
    expect(second.written()).toContain('expected: to be able to swim');
    expect(turnsPlayed(second.run() ?? [])).toBe(1);
  });

  it('drops the run when recording stops, so a later sitting does not open on an old one', () => {
    const { kept, record } = recorder();
    record.start();
    record.opened('travel:beach', took, 0);
    record.settle(() => ['You walk down to the beach.']);
    record.stop();

    expect(kept.read(PLAYTEST_SLOT)).toBeNull();
    expect(createRecorder(kept, () => {}).run()).toBeNull();
  });

  it('opens on no run rather than refusing where what was kept cannot be read', () => {
    const kept = store();
    kept.write(PLAYTEST_SLOT, 'not a run at all');
    expect(parseRun('not a run at all')).toBeNull();
    expect(createRecorder(kept, () => {}).run()).toBeNull();
  });

  it('says so rather than throwing where the run cannot be kept', () => {
    const said: string[] = [];
    const refusing = slotStore(
      {
        read: () => null,
        write: () => {
          throw new Error('the quota has been exceeded');
        },
        remove: () => undefined,
        names: () => [],
      },
      () => 0,
    );
    createRecorder(refusing, (text) => void said.push(text)).start();
    expect(said).toEqual(['the playtest run could not be kept: the quota has been exceeded']);
  });
});

// The deliverable, end to end and through the driver rather than the DOM: an author plays, says
// what they thought, and what comes out is what a playbot run is written in.
describe('a run an author played in the app', () => {
  const WORKSHOP = {
    name: 'workshop',
    text: [
      '# info workshop',
      'version: 1.0.0',
      '',
      '# location workshop',
      'x: 0, y: 0',
      'starting',
      'examine: A bench and a lathe.',
      'entities:',
      '  lathe',
      '',
      '# entity lathe',
      'title: Lathe',
      'examine: A lathe, belt slack.',
      '',
    ].join('\n'),
  };

  const playing = (): Driver => createDriver([engineLocale(), WORKSHOP], { slots: browserSlots(() => pageStorage()), ticker: () => () => undefined });

  it('holds nothing until the author starts one, so an ordinary session records nothing', () => {
    const driver = playing();
    driver.send('/look');
    expect(driver.snapshot().playtest).toBeNull();
    expect(driver.playtest.written()).toBe('');
  });

  it('reads back as a playbot run does: the line, whether it was taken, and what it answered', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    driver.send('travel:nowhere-at-all');

    const written = driver.playtest.written().split('\n');
    expect(written[0]).toMatch(/^turn 1 \[applied\] use:entity\.workshop\.lathe\.examine — note: \(none\); expected: \(none\); confusion: \(none\); result: /);
    expect(written[0]).toContain('A lathe, belt slack.');
    expect(written[written.length - 1]).toMatch(/^turn 2 \[refused\] travel:nowhere-at-all —/);
  });

  it('carries the author’s own words on the turn they were about', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    const about = feedbackOn(driver.snapshot().playtest ?? []);
    driver.playtest.attach(about!.turn, { ...emptyNotes(), expected: 'to be able to fix the belt', confusion: 'the lathe is described but does nothing' });

    expect(driver.playtest.written()).toContain('expected: to be able to fix the belt');
    expect(driver.playtest.written()).toContain('confusion: the lathe is described but does nothing');
  });
});
