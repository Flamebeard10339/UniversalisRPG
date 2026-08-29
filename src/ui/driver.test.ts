import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverseWithDiagnostics } from '../content/load';
import { NOT_LOADED, newContext, runLine, type Ticker } from '../runtime/command';
import { startSession, view, type PlayView } from '../runtime/session';
import { slotStore, type SlotDriver } from '../runtime/store';
import { dismissal } from './asking';
import { browserSlots, SLOT_PREFIX, STORAGE_REFUSALS } from './browserStore';
import { listLocalSections, LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { clearingReaches, OPENING_CELLS, type OpeningCell } from '../runtime/openUniverseFixture';
import { createDriver, REMEDIES, type Driver } from './driver';
import { noStorage, pageStorage, REFUSING as BROWSER_REFUSALS } from './agent/pageStorage';
import { EDITOR_SLOT, FORGOTTEN, recorded } from './editorMemory';
import { SHIPPED_SOURCES } from './shippedContent';

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
    'turn a spindle:',
    '  time: 4',
    '  on success:',
    '    say: A spindle comes off the lathe.',
    '',
  ].join('\n'),
};

const LATHE = [engineLocale(), WORKSHOP];

const SPINDLE = 'use:entity.workshop.lathe.turn-a-spindle';

// A small world for driver-layer mechanics (choice indexing, modal answers)
// that any dialogue and any modal-opening entity would prove just as well —
// so a rename of a real entity like Miki cannot break them.
const DRIVER_MODULE = {
  name: 'proving-ground',
  text: [
    '# info proving-ground',
    'version: 1.0.0',
    '',
    '# location camp',
    'x: 0, y: 0',
    'starting',
    'entities:',
    '  guide',
    '  mirror',
    '',
    '# entity guide',
    'title: Guide',
    '',
    '# dialogue guide-chat',
    'owner = guide',
    '',
    'node greeting:',
    '  always',
    '  Hello there, traveller.',
    '  -> Nod.',
    '',
    '# race human',
    '',
    '# race elf',
    '',
    '# entity mirror',
    'title: Mirror',
    'look in:',
    '  instant',
    '  open modal: choose-race',
    '  open modal: name-yourself',
    '',
  ].join('\n'),
};

function handTicker(): Ticker & { advance(elapsedMs: number): void; stops: number } {
  let ticking: ((elapsedMs: number) => void) | null = null;
  const ticker = ((tick) => {
    ticking = tick;
    return () => {
      ticking = null;
      ticker.stops += 1;
    };
  }) as Ticker & { advance(elapsedMs: number): void; stops: number };
  ticker.stops = 0;
  ticker.advance = (elapsedMs) => ticking?.(elapsedMs);
  return ticker;
}

const shown = (driver: Driver): PlayView => driver.snapshot().view;

function position(driver: Driver, choiceId: string): number {
  const at = shown(driver).choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

function texts(driver: Driver): string[] {
  return driver.snapshot().transcript.entries.map((entry) => entry.text);
}

describe('the GUI driver', () => {
  it('opens the shipped session and logs the place it opened in', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    expect(driver.snapshot().problems).toEqual([]);
    const view = shown(driver);
    expect(view.location.id).toBe('first-steps.guide-house');
    expect(texts(driver)).toEqual([view.location.title, view.location.description]);
    expect(view.choices.length).toBeGreaterThan(0);
  });

  it('dispatches a choice by the position the engine listed it at', () => {
    const driver = createDriver([engineLocale(), DRIVER_MODULE]);
    const before = texts(driver).length;

    driver.choose(position(driver, 'talk:proving-ground.guide'));

    expect(shown(driver).modals).toHaveLength(1);
    expect(shown(driver).choices).toEqual([]);
    expect(texts(driver).slice(before)).toEqual(shown(driver).said);
  });

  // What a darkened screen draws above its choices is what the view it covers came with, and a screen
  // the player opened for themselves came with nothing. The subjects are read off the shipped view —
  // whatever it offers to look at, whatever quest it lists first — so neither is a name here.
  it('hands a screen the player opened no words, however much was said before it', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    const examine = shown(driver).choices.find((choice) => choice.id.endsWith('.examine'))!;
    driver.choose(position(driver, examine.id));
    expect(shown(driver).said.length).toBeGreaterThan(0);

    driver.readQuest(shown(driver).journal[0]!.quest);

    expect(shown(driver).modals.map((modal) => modal.name)).toEqual(['quest-journal']);
    expect(shown(driver).said).toEqual([]);
  });

  // The same claim of every screen the player opens for themselves, its subjects derived from what
  // the shipped world puts in their hands and on their sheet rather than named here. What the app
  // draws above a screen can no longer be anything but this: `Modal`'s `spoken` takes the view's own
  // `Localized` lines, which the transcript's entries are not, so the guess that drew the tail of the
  // chat over the item screen is refused by the compiler and not only by a test.
  it('hands every screen a player opens no words, whichever door they opened it by', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    // A pack with something in it, which is the one of the three doors a fresh session cannot open.
    driver.send('/dev on');
    driver.send('/load tulsa.four-rows-and-a-blade-worn');
    const opening: Array<[string, () => void]> = [
      ['quest-journal', () => driver.readQuest(shown(driver).journal[0]!.quest)],
      ['stat-breakdown', () => driver.readStat(shown(driver).stats[0]!.id)],
      ['carried-items', () => driver.open(shown(driver).carried[0]!.id)],
    ];

    for (const [screen, open] of opening) {
      const examine = shown(driver).choices.find((choice) => choice.id.endsWith('.examine'))!;
      driver.choose(position(driver, examine.id));
      expect(shown(driver).said.length, screen).toBeGreaterThan(0);

      open();

      expect(shown(driver).modals.map((modal) => modal.name), screen).toEqual([screen]);
      expect(shown(driver).said, screen).toEqual([]);
      driver.answer(dismissal(shown(driver).modals)!.key, dismissal(shown(driver).modals)!.value);
    }
  });

  it('answers a modal by its published option key, and what was beneath comes back', () => {
    const driver = createDriver([engineLocale(), DRIVER_MODULE]);
    driver.choose(position(driver, 'talk:proving-ground.guide'));

    const asked = shown(driver).modals[0].options[0];
    driver.answer(asked.key, asked.values![0].value);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).choices.map((choice) => choice.id)).toContain('talk:proving-ground.guide');
  });

  it('carries a free-text answer through with the spaces it was typed with', () => {
    const driver = createDriver([engineLocale(), DRIVER_MODULE]);
    driver.choose(position(driver, 'talk:proving-ground.guide'));
    const menu = shown(driver).modals[0].options[0];
    driver.answer(menu.key, menu.values![0].value);
    driver.choose(position(driver, 'use:entity.proving-ground.mirror.look-in'));

    const name = shown(driver).modals[1].options[0];
    driver.answer(name.key, 'Sir Robin');
    const race = shown(driver).modals[0].options[0];
    driver.answer(race.key, race.values![0].value);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).player.name?.title).toBe('Sir Robin');
  });

  it('reports a refusal as the engine worded it and leaves the session where it was', () => {
    const driver = createDriver([engineLocale(), DRIVER_MODULE]);
    const before = shown(driver).choices.length;

    driver.choose(before + 7);

    const written = texts(driver);
    expect(written[written.length - 1]).toBe(`invalid choice: ${JSON.stringify(String(before + 7))}`);
    expect(shown(driver).choices).toHaveLength(before);
  });

  it('arms a spannable action rather than resolving it, and reports the run before any time passes', () => {
    const driver = createDriver(LATHE, { ticker: handTicker() });

    driver.choose(position(driver, SPINDLE));

    expect(driver.snapshot().live).toMatchObject({ label: 'Turn A Spindle', active: true, progress: 0 });
    expect(shown(driver).time).toBe(0);
  });

  it('advances simulated time from the elapsed milliseconds it is handed', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));

    ticker.advance(1_000);
    ticker.advance(500);

    expect(shown(driver).time).toBe(1.5);
    expect(driver.snapshot().live?.progress).toBeCloseTo(0.375);
  });

  it('closes the run when the action finishes, stops the ticker and gives the choices back', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));

    ticker.advance(4_000);

    expect(driver.snapshot().live).toBeNull();
    expect(ticker.stops).toBe(1);
    expect(shown(driver).time).toBe(4);
    expect(texts(driver)).toContain('A spindle comes off the lathe.');
    expect(shown(driver).choices.map((choice) => choice.id)).toContain(SPINDLE);
  });

  it('cancels on request, keeping the time already spent and saying so in the engine words', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.cancel();

    expect(driver.snapshot().live).toBeNull();
    expect(ticker.stops).toBe(1);
    expect(shown(driver).time).toBe(1);
    expect(texts(driver)).toContain('Stopped.');
    expect(texts(driver)).not.toContain('A spindle comes off the lathe.');
    expect(shown(driver).choices.map((choice) => choice.id)).toContain(SPINDLE);
  });

  it('hands the run under way over to the next thing dispatched, keeping the time it spent', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.choose(position(driver, SPINDLE));

    expect(texts(driver), 'beginning something else displaces what was under way rather than calling it off').not.toContain('Stopped.');
    expect(shown(driver).time).toBe(1);
    expect(driver.snapshot().live).toMatchObject({ active: true, progress: 0 });
    expect(ticker.stops).toBe(1);
  });

  it('leaves the run under way alone for a line that takes no turn', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.send('/look');

    expect(driver.snapshot().live, 'looking at the room is free, so what was under way is still under way').toMatchObject({ active: true });
    expect(texts(driver)).not.toContain('Stopped.');
    expect(shown(driver).action?.label).toBe('Turn A Spindle');
  });

  it('leaves it alone for opening the pack, which is the same freedom by another door', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.readStat('nothing-at-all');

    expect(driver.snapshot().live).toMatchObject({ active: true });
    expect(shown(driver).action?.label).toBe('Turn A Spindle');
  });

  it('reaches the state the REPL live path reaches over the same elapsed span', () => {
    const spans = [200, 200, 750, 3_000, 200];

    const session = startSession(loadUniverseWithDiagnostics(LATHE).registry);
    const repl = newContext(session, view(session), { driving: true });
    const armed = runLine(repl, '1');
    for (const span of spans) armed.live!.tick(span);
    armed.live!.end(false);

    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(1);
    for (const span of spans) ticker.advance(span);

    expect(shown(driver)).toEqual(repl.view);
  });

  it('carries the problem when a universe cannot open, and stands the shell somewhere anyway', () => {
    const driver = createDriver([{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }]);

    expect(driver.snapshot().problems).toEqual([{ modules: [], words: 'tool', message: 'no # location is marked starting, so a new game has nowhere to begin' }]);
    const view = shown(driver);
    expect(texts(driver)).toEqual([driver.snapshot().problems[0].message, view.location.title, view.location.description]);
  });
});

function pageSlots(limit?: number): SlotDriver {
  const storage = pageStorage(limit);
  return browserSlots(() => storage);
}

const sourceLines = (driver: Driver): string[] =>
  driver
    .snapshot()
    .transcript.entries.filter((entry) => entry.words === 'tool' && entry.kind === 'detail')
    .map((entry) => entry.text);

const said = (driver: Driver): string[] => driver.snapshot().transcript.entries.filter((entry) => entry.words === 'tool').map((entry) => String(entry.text));

// Any real location proves the same rule; naming one by hand would go stale the day an author renamed it.
const STARTING_LOCATION = [...loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry.locations.values()].find((location) => location.starting)!.id;

const EDIT = `/dsl location ${STARTING_LOCATION} x: 7, y: 7`;

describe('the browser authors through the same door (c1, c9, c13, c16)', () => {
  it('stages a section, adopts it, and the session is playing the edit', () => {
    const driver = createDriver(SHIPPED_SOURCES, { slots: pageSlots() });

    driver.send(EDIT);

    expect(said(driver)).toContain(`Staged # location ${STARTING_LOCATION} in local-changes.`);
    expect(shown(driver).discovered.find((place) => place.id === STARTING_LOCATION)).toMatchObject({ x: 7, y: 7 });
  });

  it('refuses a whole edit that does not load, and goes on playing what it had', () => {
    const driver = createDriver(SHIPPED_SOURCES, { slots: pageSlots() });
    const before = shown(driver);

    driver.send(`/dsl location ${STARTING_LOCATION} adjacent: nowhere-at-all`);

    expect(said(driver)).toContain(NOT_LOADED);
    expect(shown(driver)).toEqual(before);
    expect(driver.localChanges()).toBe('');
  });

  it('opens a second driver over the same store with the edit already applied', () => {
    const slots = pageSlots();
    const first = createDriver(SHIPPED_SOURCES, { slots });
    first.send(EDIT);
    first.send('/local list');

    const reopened = createDriver(SHIPPED_SOURCES, { slots });
    reopened.send('/local list');

    expect(shown(reopened).discovered.find((place) => place.id === STARTING_LOCATION)).toMatchObject({ x: 7, y: 7 });
    expect(sourceLines(reopened)).toEqual([`# location ${STARTING_LOCATION} — also in ${STARTING_LOCATION.split('.')[0]}`, ...sourceLines(first)]);
    expect(reopened.localChanges()).toBe(first.localChanges());
  });

  it('hands over the same bytes /local show prints and the slot holds', () => {
    const slots = pageSlots();
    const driver = createDriver(SHIPPED_SOURCES, { slots });
    driver.send(EDIT);
    driver.send('/local show');

    const handed = driver.localChanges()!;
    expect(handed).toContain(`# location ${STARTING_LOCATION}`);
    expect(sourceLines(driver).join('\n')).toBe(handed.trimEnd());
    expect(slotStore(slots, () => 0).read('local-changes')?.payload).toBe(handed);
  });

  it('offers nothing to hand over when the store cannot be read', () => {
    expect(createDriver(SHIPPED_SOURCES, { slots: browserSlots(noStorage) }).localChanges()).toBeNull();
  });
});

describe('a store that refuses leaves the session playing (c13)', () => {
  const REFUSING: Record<string, () => SlotDriver> = {
    ...Object.fromEntries(Object.entries(BROWSER_REFUSALS).map(([mode, induce]) => [mode, () => browserSlots(induce())])),
    unrecognised: () => {
      const storage = pageStorage();
      storage.setItem(`${SLOT_PREFIX}local-changes`, 'not a slot at all');
      return browserSlots(() => storage);
    },
  };

  const HEADER = ['# info local-changes', 'version: 0.0.0', ''].join('\n');

  const MOMENTS: Record<string, { drive(driver: Driver): void; asks(store: ReturnType<typeof slotStore>): void }> = {
    opening: {
      drive: () => undefined,
      asks: (store) => void store.read('local-changes'),
    },
    staging: {
      drive: (driver) => driver.send(EDIT),
      asks: (store) => {
        store.read('local-changes');
        store.write('local-changes', HEADER);
      },
    },
    remembering: {
      drive: (driver) => driver.editorMemory.write(recorded(FORGOTTEN)),
      asks: (store) => void store.write(EDITOR_SLOT, recorded(FORGOTTEN)),
    },
    reading: {
      drive: (driver) => void driver.editorMemory.read(),
      asks: (store) => void store.read(EDITOR_SLOT),
    },
  };

const STORE_REACHES = [...readFileSync('src/ui/driver.ts', 'utf8').matchAll(/save\.store\.\w+\(/g)].length;

  const refusesAt = (slots: () => SlotDriver, moment: string): boolean => {
    try {
      MOMENTS[moment].asks(slotStore(slots(), () => 0));
      return false;
    } catch {
      return true;
    }
  };

  const through = (slots: SlotDriver): { driver: Driver; at: Record<string, string[]> } => {
    const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
    const at: Record<string, string[]> = {};
    let before: string[] = [];
    for (const [moment, what] of Object.entries(MOMENTS)) {
      what.drive(driver);
      const now = said(driver);
      at[moment] = now.slice(before.length);
      before = now;
    }
    return { driver, at };
  };

  it('covers every refusal the adapter names, and the one the store itself names', () => {
    expect(Object.keys(REFUSING)).toEqual(expect.arrayContaining([...STORAGE_REFUSALS]));
    expect(Object.keys(REFUSING).length).toBeGreaterThan(STORAGE_REFUSALS.length);
  });

  it('asks every moment of the driver that the store could refuse at', () => {
    expect(Object.keys(MOMENTS)).toHaveLength(STORE_REACHES);
    expect(Object.keys(MOMENTS).filter((moment) => refusesAt(REFUSING.unavailable, moment))).toEqual(Object.keys(MOMENTS));
  });

  for (const [mode, slots] of Object.entries(REFUSING)) {
    it(`says so at every moment it refuses, and goes on playing, when the store is ${mode}`, () => {
      const refused = through(slots());
      const quiet = through(pageSlots());

      expect(refused.driver.snapshot().problems).toEqual([]);
      expect(shown(refused.driver).location.id).toBe(STARTING_LOCATION);

      const refusing = Object.keys(MOMENTS).filter((moment) => refusesAt(slots, moment));
      expect(refusing, `${mode} refuses nothing, so nothing below is asked`).not.toEqual([]);
      for (const moment of refusing) {
        expect(refused.at[moment].filter((line) => !quiet.at[moment].includes(line)), `nothing said while ${moment}`).not.toEqual([]);
      }

      refused.driver.send('/look');
      expect(shown(refused.driver).location.id).toBe(STARTING_LOCATION);
    });
  }
});

function opened(cell: OpeningCell): { driver: Driver; slots: SlotDriver } {
  const slots = pageSlots();
  if (cell.local !== '') slotStore(slots, () => 0).write(LOCAL_CHANGES_MODULE_ID, cell.local);
  return { driver: createDriver(cell.base, { slots, ticker: () => () => undefined }), slots };
}

const report = (driver: Driver): string => driver.snapshot().problems.map((problem) => `${problem.modules.join(' ')}: ${problem.message}`).join('\n');

const ELSEWHERE = ['# info local-changes', 'version: 0.0.0', 'pack: local', '', '# entity gull-from-another-tab', 'peck:', '  give: nothing-a-cell-names', ''].join('\n');

describe('the controls a state offers follow from the door\'s report (c7)', () => {
  it('walks the family the door is proved over, so a cell added there is a cell here', () => {
    expect(OPENING_CELLS.length).toBeGreaterThan(6);
  });

  it('offers clearing exactly where clearing could reach what the fixture broke', () => {
    let offered = 0;
    for (const cell of OPENING_CELLS) {
      const { driver } = opened(cell);
      const wanted = clearingReaches(cell);

      expect(driver.snapshot().remedies.includes('clear-local'), `${cell.where}: ${report(driver)}`).toBe(wanted);
      if (wanted) offered += 1;
    }
    expect(offered).toBeGreaterThan(0);
    expect(offered).toBeLessThan(OPENING_CELLS.length);
  });

  it('offers it where taking it changes the answer, and withholds it where taking it would not', () => {
    const cells = OPENING_CELLS.filter((cell) => cell.local !== '');
    expect(cells.length).toBeGreaterThan(6);
    let moved = 0;

    for (const cell of cells) {
      const { driver } = opened(cell);
      const before = report(driver);
      const offered = driver.snapshot().remedies.includes('clear-local');

      driver.clearLocalChanges();

      const changed = report(driver) !== before;
      expect(changed, `${cell.where}: ${before} -> ${report(driver)}`).toBe(offered);
      if (changed) moved += 1;
    }

    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(cells.length);
  });

  it('stands a clean local module beside every breakage in the base, and withholds clearing there', () => {
    const beside = OPENING_CELLS.filter((cell) => cell.broke !== null && cell.broke !== LOCAL_CHANGES_MODULE_ID);
    expect(beside.length).toBeGreaterThan(6);

    for (const cell of beside) {
      const { driver } = opened(cell);

      expect(driver.localChanges(), cell.where).toBe(cell.local);
      expect(cell.local, cell.where).not.toBe('');
      expect(driver.snapshot().problems.flatMap((problem) => problem.modules), cell.where).not.toContain(LOCAL_CHANGES_MODULE_ID);
      expect(driver.snapshot().remedies, cell.where).toEqual(['reopen']);
    }
  });

  it('names, through the driver too, exactly the modules the fixture broke', () => {
    for (const cell of OPENING_CELLS) {
      const problems = opened(cell).driver.snapshot().problems;

      expect(new Set(problems.flatMap((problem) => problem.modules)), cell.where).toEqual(new Set(cell.names));
    }
  });

  it('leaves every state a control that moves it, taken from that state and measured', () => {
    const drawn = new Set<string>();
    for (const cell of OPENING_CELLS) {
      const { driver, slots } = opened(cell);
      const { problems, remedies } = driver.snapshot();
      const before = report(driver);

      expect(problems.length, cell.where).toBeGreaterThan(0);
      expect(remedies.every((remedy) => REMEDIES.includes(remedy)), cell.where).toBe(true);
      expect(remedies, cell.where).toContain('reopen');
      for (const remedy of remedies) drawn.add(remedy);

      slotStore(slots, () => 0).write(LOCAL_CHANGES_MODULE_ID, ELSEWHERE);
      driver.reopen();

      expect(report(driver), `${cell.where}: ${before}`).not.toBe(before);
    }

    expect(drawn).toEqual(new Set(REMEDIES));
  });

  it('moves the answer from every state the author’s own module left it in', () => {
    const cells = OPENING_CELLS.filter((cell) => cell.broke === LOCAL_CHANGES_MODULE_ID);
    expect(cells.length).toBeGreaterThan(5);

    for (const cell of cells) {
      const { driver } = opened(cell);
      const before = report(driver);
      expect(before, cell.where).not.toBe('');

      driver.reopen();
      expect(report(driver), `${cell.where} reopened`).toBe(before);

      expect(driver.snapshot().remedies, cell.where).toContain('clear-local');
      driver.clearLocalChanges();

      expect(report(driver), `${cell.where}: ${before}`).not.toBe(before);
      expect(driver.snapshot().problems.flatMap((problem) => problem.modules), cell.where).not.toContain(LOCAL_CHANGES_MODULE_ID);
    }
  });

  it('offers nothing where the door had nothing to say, with a module staged', () => {
    const slots = pageSlots();
    const staging = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
    staging.send(EDIT);
    expect(staging.localChanges()).not.toBe('');

    const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });

    expect(driver.snapshot().problems).toEqual([]);
    expect(driver.snapshot().remedies).toEqual([]);
  });

  it('clears, wherever clearing is offered, and leaves a module that stages nothing', () => {
    const cells = OPENING_CELLS.filter(clearingReaches);
    expect(cells.length).toBeGreaterThan(0);
    let recovered = 0;

    for (const cell of cells) {
      const { driver } = opened(cell);

      driver.clearLocalChanges();

      expect(listLocalSections(driver.localChanges() ?? ''), cell.where).toEqual([]);
      if (driver.snapshot().problems.length === 0) recovered += 1;
    }

    expect(recovered).toBeGreaterThan(0);
  });
});

describe('a local module that will not load never costs the session (c1)', () => {
  const STAGED = ((): string => {
    const driver = createDriver(SHIPPED_SOURCES, { slots: pageSlots(), ticker: () => () => undefined });
    driver.send(EDIT);
    const text = driver.localChanges();
    if (text === null || text.trim() === '') throw new Error('nothing was staged, so every module below would be empty');
    return text;
  })();

  const BROKEN: Record<string, string> = {
    'will not parse': STAGED.replace('x: 7, y: 7', 'x: sideways'),
    'will not resolve': STAGED.replace('x: 7, y: 7', 'x: 7, y: 7\nadjacent:\n  nowhere-at-all'),
  };

  const over = (local: string): Driver => opened({ where: local, base: SHIPPED_SOURCES, local, broke: null, names: [], aim: OPENING_CELLS[0].aim }).driver;

  it('opens on the shipped content alone, says why, and plays exactly as with no local module at all', () => {
    for (const [local, text] of Object.entries(BROKEN)) {
      const driver = over(text);
      const bare = over('');

      expect(driver.snapshot().problems.flatMap((problem) => problem.modules), local).toEqual([LOCAL_CHANGES_MODULE_ID]);
      expect(driver.serialized(), local).toBe(bare.serialized());
      expect(shown(driver), local).toEqual(shown(bare));
      driver.send('/look');
      bare.send('/look');
      expect(shown(driver), local).toEqual(shown(bare));
      expect(said(driver).some((line) => line.includes(LOCAL_CHANGES_MODULE_ID)), local).toBe(true);
    }
  });

  it('leaves the text in the store to read', () => {
    expect(over(BROKEN['will not parse']).localChanges()).toBe(BROKEN['will not parse']);
  });

  it('clears from text nothing can parse, and leaves no residue for the next launch', () => {
    for (const [local, text] of Object.entries(BROKEN)) {
      const slots = pageSlots();
      slotStore(slots, () => 0).write(LOCAL_CHANGES_MODULE_ID, text);
      const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
      const fresh = over('');

      expect(driver.snapshot().remedies, local).toContain('clear-local');
      driver.clearLocalChanges();

      expect(driver.snapshot().problems, local).toEqual([]);
      expect(driver.serialized(), local).toBe(fresh.serialized());
      expect(listLocalSections(driver.localChanges() ?? ''), local).toEqual([]);
      expect(createDriver(SHIPPED_SOURCES, { slots }).serialized(), local).toBe(fresh.serialized());
    }
  });
});
