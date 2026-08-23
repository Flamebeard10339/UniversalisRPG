import { describe, expect, it } from 'vitest';
import { describeEntry, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, turnRecord, type RunLogEntry, type RunNotes } from '../runtime/runLog';
import { memoryDriver } from '../runtime/store';
import { slotStore } from '../runtime/store';
import { engineLocale } from '../content/engineLocale';
import { browserSlots } from './browserStore';
import { pageStorage } from './agent/pageStorage';
import { createDriver, type Driver } from './driver';
import { attached, createRecorder, edited, emptyNotes, feedbackOn, turnsPlayed } from './playtest';

const took = 'applied' as const;
const turnedAway = 'refused' as const;

const played = (turn: number, line: string, notes: Partial<RunNotes> = {}): RunLogEntry => ({ notes: { ...emptyNotes(), ...notes }, turn, line, outcome: 'applied', detail: 'something happened' });

const store = () => slotStore(memoryDriver(), () => 0);

const PLAYED = { at: '2026-08-23T00:00:00.000Z', built: 'abc1234' };

const recorder = (kept = store()) => ({ kept, record: createRecorder(kept, () => {}, () => PLAYED) });

describe('what the feedback sheet is about', () => {
  it('is the last turn played, since an author writes having seen what the line did', () => {
    expect(feedbackOn([played(1, 'travel:beach'), played(2, 'talk:miki')])?.turn).toBe(2);
    expect(feedbackOn([played(1, 'travel:beach'), played(2, 'talk:miki')])?.line).toBe('talk:miki');
  });

  it('is nothing at all where nothing has been played, rather than a turn nobody took', () => {
    expect(feedbackOn([])).toBeNull();
    expect(feedbackOn([{ turn: 1, outcome: 'reload-failed', detail: 'content read failed', notes: emptyNotes() }])?.line).toBe('content read failed');
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
    record.opened('travel:beach', took);
    expect(record.run()).toBeNull();
  });

  it('records the line and whether the engine took it, and not what it answered with', () => {
    const { record } = recorder();
    record.start();
    record.opened('travel:beach', took);
    record.opened('talk:nobody', turnedAway);

    expect(record.run()?.map((entry) => describeEntry(entry))).toEqual([
      'turn 1 [applied] travel:beach — note: (none); expected: (none); confusion: (none)',
      'turn 2 [refused] talk:nobody — note: (none); expected: (none); confusion: (none)',
    ]);
  });

  // The author is looking at the screen the words were said on. The model is not, so its own
  // harness still records them and `turnRecord` tells the two apart by what it is handed.
  it('leaves the answer out entirely, where the playbot would have said nothing happened', () => {
    const { record } = recorder();
    record.start();
    record.opened('/cancel', took);

    expect(describeEntry(record.run()![0])).not.toContain('result:');
    expect(describeEntry(turnRecord(1, '/cancel', 'applied', []))).toContain('result: nothing happened');
  });

  it('picks a run back up where a reload left it, since a kept run is what recording is', () => {
    const kept = store();
    const first = createRecorder(kept, () => {}, () => PLAYED);
    first.start();
    first.opened('travel:beach', took);
    first.attach(1, { ...emptyNotes(), expected: 'to be able to swim' });

    const second = createRecorder(kept, () => {}, () => PLAYED);
    expect(second.written()).toContain('expected: to be able to swim');
    expect(turnsPlayed(second.run() ?? [])).toBe(1);
  });

  it('drops the run when recording stops, so a later sitting does not open on an old one', () => {
    const { kept, record } = recorder();
    record.start();
    record.opened('travel:beach', took);
    record.stop();

    expect(kept.read(PLAYTEST_SLOT)).toBeNull();
    expect(createRecorder(kept, () => {}, () => PLAYED).run()).toBeNull();
  });

  it('opens on no run rather than refusing where what was kept cannot be read', () => {
    const kept = store();
    kept.write(PLAYTEST_SLOT, 'not a run at all');
    expect(parseRun('not a run at all')).toBeNull();
    expect(createRecorder(kept, () => {}, () => PLAYED).run()).toBeNull();
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
    createRecorder(refusing, (text) => void said.push(text), () => PLAYED).start();
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

  const playing = (): Driver => createDriver([engineLocale(), WORKSHOP], { slots: browserSlots(() => pageStorage()), ticker: () => () => undefined, now: () => Date.parse(PLAYED.at) });

  it('holds nothing until the author starts one, so an ordinary session records nothing', () => {
    const driver = playing();
    driver.send('/look');
    expect(driver.snapshot().playtest).toBeNull();
    expect(driver.playtest.written()).toBe('');
  });

  it('reads back one line a turn, under a header saying when and against what', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    driver.send('travel:nowhere-at-all');

    const [header, blank, ...turns] = driver.playtest.written().split('\n');
    expect(header).toMatch(new RegExp(`^# played ${PLAYED.at} against \\S+$`));
    expect(blank).toBe('');
    expect(turns).toEqual([
      'turn 1 [applied] use:entity.workshop.lathe.examine — note: (none); expected: (none); confusion: (none)',
      'turn 2 [refused] travel:nowhere-at-all — note: (none); expected: (none); confusion: (none)',
    ]);
  });

  it('records where in the app the player went, which the engine never hears about', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    driver.playtest.moved('map');
    const about = feedbackOn(driver.snapshot().playtest ?? [])!;
    driver.playtest.attach(about.turn, { ...emptyNotes(), confusion: 'the map says nothing about where I am going' });

    expect(driver.playtest.written().split('\n')[3]).toBe('turn 2 [moved] map — note: (none); expected: (none); confusion: the map says nothing about where I am going');
  });

  it('names the choice the author picked, not the position this driver sends', () => {
    const driver = playing();
    driver.playtest.start();
    driver.choose(1);

    const picked = driver.snapshot().playtest ?? [];
    expect(picked).toHaveLength(1);
    expect(driver.playtest.written()).toContain('use:entity.workshop.lathe.examine');
    expect(driver.playtest.written()).not.toMatch(/^turn 1 \[applied\] 1 —/);
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
