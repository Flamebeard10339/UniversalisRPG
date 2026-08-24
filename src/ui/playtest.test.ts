import { describe, expect, it } from 'vitest';
import { describeEntry, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, runId, serializeRun, startSaveId, turnRecord, type RunLogEntry, type RunNotes } from '../runtime/runLog';
import { SAVE_VERSION } from '../runtime/save';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import { loadInEnglish } from '../content/engineLocale';
import { createGameState } from '../runtime/runtime';
import { runTest } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { slotStore } from '../runtime/store';
import { engineLocale } from '../content/engineLocale';
import { browserSlots } from './browserStore';
import { pageStorage } from './agent/pageStorage';
import { createDriver, type Driver } from './driver';
import { attached, createRecorder, edited, emptyNotes, feedbackOn, turnsPlayed } from './playtest';

const took = 'applied' as const;
const turnedAway = 'refused' as const;

const played = (turn: number, line: string, notes: Partial<RunNotes> = {}): RunLogEntry => ({ notes: { ...emptyNotes(), ...notes }, turn, line, directives: [line], outcome: 'applied', detail: 'something happened' });

const store = () => slotStore(memoryDriver(), () => 0);

const PLAYED = { at: '2026-08-23T00:00:00.000Z', built: 'abc1234' };
const NEW_GAME = '{"version":1}';

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
    record.opened('travel:beach', took, []);
    expect(record.run()).toBeNull();
  });

  it('records the line, whether the engine took it, and what it settled into', () => {
    const { record } = recorder();
    record.start(NEW_GAME);
    record.opened('travel:beach', took, ['travel: beach']);
    record.opened('talk:nobody', turnedAway, []);

    expect(record.run()?.log.map((entry) => describeEntry(entry))).toEqual([
      'turn 1 [applied] travel:beach — note: (none); expected: (none); confusion: (none)',
      'turn 2 [refused] talk:nobody — note: (none); expected: (none); confusion: (none)',
    ]);
  });

  // The author is looking at the screen the words were said on. The model is not, so its own
  // harness still records them and `turnRecord` tells the two apart by what it is handed.
  it('leaves the answer out entirely, where the playbot would have said nothing happened', () => {
    const { record } = recorder();
    record.start(NEW_GAME);
    record.opened('/cancel', took, ['cancel']);

    expect(describeEntry(record.run()!.log[0])).not.toContain('result:');
    expect(describeEntry(turnRecord(1, '/cancel', 'applied', ['cancel'], []))).toContain('result: nothing happened');
  });

  it('picks a run back up where a reload left it, since a kept run is what recording is', () => {
    const kept = store();
    const first = createRecorder(kept, () => {}, () => PLAYED);
    first.start(NEW_GAME);
    first.opened('travel:beach', took, ['travel: beach']);
    first.attach(1, { ...emptyNotes(), expected: 'to be able to swim' });

    const second = createRecorder(kept, () => {}, () => PLAYED);
    expect(second.written()).toContain('expected: to be able to swim');
    expect(second.run()?.id).toBe(first.run()?.id);
    expect(turnsPlayed(second.run()?.log ?? [])).toBe(1);
  });

  it('drops the run when recording stops, so a later sitting does not open on an old one', () => {
    const { kept, record } = recorder();
    record.start(NEW_GAME);
    record.opened('travel:beach', took, ['travel: beach']);
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
    createRecorder(refusing, (text) => void said.push(text), () => PLAYED).start(NEW_GAME);
    expect(said).toEqual(['the playtest run could not be kept: the quota has been exceeded']);
  });
});

// The deliverable, end to end and through the driver rather than the DOM: an author plays, says
// what they thought, and what comes out is the `# test` that replays what they did.
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

  const playingWith = (slots: SlotDriver): Driver => createDriver([engineLocale(), WORKSHOP], { slots, ticker: () => () => undefined, now: () => Date.parse(PLAYED.at) });

  const playing = (): Driver => playingWith(browserSlots(() => pageStorage()));

  const said = (driver: Driver): string =>
    driver
      .snapshot()
      .transcript.entries.map((entry) => String(entry.text))
      .join('\n');

  it('holds nothing until the author starts one, so an ordinary session records nothing', () => {
    const driver = playing();
    driver.send('/look');
    expect(driver.snapshot().playtest).toBeNull();
    expect(driver.playtest.written()).toBe('');
  });

  it('reads back as a # test, named for when it was played, saying what it was played against', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    driver.send('travel:nowhere-at-all');

    const [saved, run] = driver.playtest.written().split('\n\n');
    // The save the run walks forward from, so the replay begins where the author pressed start.
    expect(saved.split('\n')[0]).toBe(`# save ${runId(PLAYED.at)}-start`);
    expect(JSON.parse(saved.split('\n')[1])).toHaveProperty('version');

    const [heading, from, said, ...turns] = run.split('\n');
    expect(heading).toBe(`# test ${runId(PLAYED.at)}`);
    expect(from).toBe(`load: ${runId(PLAYED.at)}-start`);
    expect(said).toMatch(new RegExp(`^note: played ${PLAYED.at} against \\S+$`));
    // A line the engine refused settled into no directive, so the record writes what was tried and
    // marks it refused — which is the whole of what makes a failed run replayable.
    expect(turns).toEqual(['use: entity.workshop.lathe.examine', 'travel: nowhere-at-all', 'refused']);
  });

  // The whole of why a run is written this way: what the author did comes back as something the
  // engine will do again, refusals and all.
  it('replays through the engine, including the turn that was refused', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    driver.playtest.moved('character/inventory');
    const about = feedbackOn(driver.snapshot().playtest?.log ?? [])!;
    driver.playtest.attach(about.turn, { ...emptyNotes(), confusion: 'nothing here says the belt can be fixed' });

    const registry = loadInEnglish([WORKSHOP.text, '', driver.playtest.written()].join('\n'));
    expect(runTest(`${WORKSHOP.name}.${runId(PLAYED.at)}`, registry, createGameState())).toEqual({ passed: true });
  });

  it('records where in the app the player went, which the engine never hears about', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    driver.playtest.moved('map/map');
    const about = feedbackOn(driver.snapshot().playtest?.log ?? [])!;
    driver.playtest.attach(about.turn, { ...emptyNotes(), confusion: 'the map says nothing about where I am going' });

    expect(driver.playtest.written().split('\n').slice(-2)).toEqual(['page: map/map', 'confusion: the map says nothing about where I am going']);
  });

  it('names the choice the author picked, not the position this driver sends', () => {
    const driver = playing();
    driver.playtest.start();
    driver.choose(1);

    expect(driver.snapshot().playtest?.log).toHaveLength(1);
    expect(driver.playtest.written()).toContain('use: entity.workshop.lathe.examine');
    expect(driver.playtest.written().split('\n')).not.toContain('1');
  });

  // The deliverable the owner asked for: stop recording, reload, run through what you just did.
  it('lands in the game when the author stops it, so a reload finds the run in the registry', () => {
    const slots = memoryDriver();
    const driver = playingWith(slots);
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');

    const filing = driver.playtest.stop();
    if (!filing.filed) throw new Error(filing.because);

    expect(filing.at).toBe(qualify(LOCAL_CHANGES_MODULE_ID, runId(PLAYED.at)));
    expect(driver.localChanges()).toContain(`# save ${startSaveId(runId(PLAYED.at))}`);
    expect(driver.localChanges()).toContain(`# test ${runId(PLAYED.at)}`);
    // Only a filed run clears the slot, and this one filed.
    expect(driver.snapshot().playtest).toBeNull();

    const holds = (each: Driver): boolean => each.declared().some((declared) => declared.kind === 'test' && declared.address === filing.at);
    expect(holds(driver)).toBe(true);
    expect(holds(playingWith(slots))).toBe(true);
  });

  it('refuses a run the game could not be left holding, says why, and goes on recording it', () => {
    const driver = playingWith(memoryDriver());
    driver.playtest.start();
    // A refused line is written as what was tried, so a run that reached for a location nobody
    // declared is a run whose `# test` names one — and the module would not load with it in.
    driver.send('travel:nowhere-at-all');

    const filing = driver.playtest.stop();
    expect(filing.filed).toBe(false);
    expect(driver.localChanges() ?? '').not.toContain(runId(PLAYED.at));
    expect(filing.filed ? '' : filing.because).toContain('nowhere-at-all');
    expect(said(driver)).toContain('nowhere-at-all');

    driver.send('use:entity.workshop.lathe.examine');
    expect(turnsPlayed(driver.snapshot().playtest?.log ?? [])).toBe(2);
  });

  it('refuses a run whose starting save this build cannot read, since nothing here migrates one', () => {
    const slots = memoryDriver();
    slotStore(slots, () => 0).write(PLAYTEST_SLOT, serializeRun({ run: { id: runId(PLAYED.at), log: [] }, from: `{"version":${SAVE_VERSION - 1}}` }));
    const driver = playingWith(slots);

    const filing = driver.playtest.stop();
    expect(filing.filed ? '' : filing.because).toContain(`expected ${SAVE_VERSION}`);
    expect(driver.localChanges() ?? '').not.toContain(runId(PLAYED.at));
    expect(driver.snapshot().playtest).not.toBeNull();
  });

  it('carries the author’s own words on the turn they were about', () => {
    const driver = playing();
    driver.playtest.start();
    driver.send('use:entity.workshop.lathe.examine');
    const about = feedbackOn(driver.snapshot().playtest?.log ?? []);
    driver.playtest.attach(about!.turn, { ...emptyNotes(), expected: 'to be able to fix the belt', confusion: 'the lathe is described but does nothing' });

    expect(driver.playtest.written()).toContain('expected: to be able to fix the belt');
    expect(driver.playtest.written()).toContain('confusion: the lathe is described but does nothing');
  });
});
