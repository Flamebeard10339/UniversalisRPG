import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { newContext, runLine, type Ticker } from '../runtime/command';
import { startSession, view, type PlayView } from '../runtime/session';
import { slotStore, type SlotDriver } from '../runtime/store';
import { browserSlots, SLOT_PREFIX, STORAGE_REFUSALS } from './browserStore';
import { createDriver, type Driver } from './driver';
import { noStorage, pageStorage, REFUSING as BROWSER_REFUSALS } from './agent/pageStorage';
import { EDITOR_SLOT, FORGOTTEN, recorded } from './editorMemory';
import { SHIPPED_SOURCES } from './shippedContent';

// One spannable action and nothing else, so a test about time is not also a
// test about what the tutorial happens to offer.
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
    'turn a spindle:',
    '  time: 4',
    '  on success:',
    '    say: A spindle comes off the lathe.',
    '',
  ].join('\n'),
};

// Beside the engine's own English, because a universe loading no `# locale en`
// renders every engine key as itself and these tests read the words a player
// would have seen.
const LATHE = [engineLocale(), WORKSHOP];

const SPINDLE = 'use:entity.workshop.lathe.turn-a-spindle';

// A ticker a test drives by hand, so elapsed milliseconds arrive on demand
// rather than whenever a real timer got around to it.
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

function shown(driver: Driver): PlayView {
  const view = driver.snapshot().view;
  if (!view) throw new Error(driver.snapshot().fault ?? 'no view');
  return view;
}

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

    expect(driver.snapshot().fault).toBeNull();
    const view = shown(driver);
    expect(view.location.id).toBe('tutorial-island.guide-house');
    expect(texts(driver)).toEqual([view.location.title, view.location.description]);
    expect(view.choices.length).toBeGreaterThan(0);
  });

  it('dispatches a choice by the position the engine listed it at', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    const before = texts(driver).length;

    driver.choose(position(driver, 'talk:tutorial-island.miki'));

    // The world is withdrawn under an open modal, which is the engine's rule
    // and not one this driver applies.
    expect(shown(driver).modals).toHaveLength(1);
    expect(shown(driver).choices).toEqual([]);
    expect(texts(driver).slice(before)).toEqual(shown(driver).said);
  });

  it('answers a modal by its published option key, and what was beneath comes back', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));

    const asked = shown(driver).modals[0].options[0];
    driver.answer(asked.key, asked.values![0].value);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).choices.map((choice) => choice.id)).toContain('talk:tutorial-island.miki');
  });

  it('carries a free-text answer through with the spaces it was typed with', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));
    const menu = shown(driver).modals[0].options[0];
    driver.answer(menu.key, menu.values![0].value);
    driver.choose(position(driver, 'use:entity.tutorial-island.mirror.look-in'));

    const name = shown(driver).modals[0].options[0];
    driver.answer(name.key, 'Sir Robin');
    const race = shown(driver).modals[0].options[0];
    driver.answer(race.key, race.values![0].value);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).player.name).toBe('Sir Robin');
  });

  it('reports a refusal as the engine worded it and leaves the session where it was', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    const before = shown(driver).choices.length;

    driver.choose(before + 7);

    const written = texts(driver);
    expect(written[written.length - 1]).toBe(`invalid choice: ${JSON.stringify(String(before + 7))}`);
    expect(shown(driver).choices).toHaveLength(before);
  });

  it('arms a spannable action rather than resolving it, and reports the run before any time passes', () => {
    const driver = createDriver(LATHE, { ticker: handTicker() });

    driver.choose(position(driver, SPINDLE));

    expect(driver.snapshot().live).toMatchObject({ label: 'turn a spindle', active: true, progress: 0 });
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

  it('replaces the run under way with the next thing dispatched, keeping the time it spent', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.choose(position(driver, SPINDLE));

    expect(texts(driver)).toContain('Stopped.');
    // A second run, not the first one carried on: the spent second stands and
    // the new one starts from nothing.
    expect(shown(driver).time).toBe(1);
    expect(driver.snapshot().live).toMatchObject({ active: true, progress: 0 });
    expect(ticker.stops).toBe(1);
  });

  it('stops the run under way before a command that is not a choice at all', () => {
    const ticker = handTicker();
    const driver = createDriver(LATHE, { ticker });
    driver.choose(position(driver, SPINDLE));

    driver.send('/look');

    expect(driver.snapshot().live).toBeNull();
    expect(texts(driver)).toContain('Stopped.');
  });

  // The clause's own comparison: the same action, the same elapsed span, two
  // drivers. The REPL side is built the way play-cli builds it — a context
  // with `driving`, runLine, and the run ticked with what the wall clock said.
  it('reaches the state the REPL live path reaches over the same elapsed span', () => {
    const spans = [200, 200, 750, 3_000, 200];

    const session = startSession(loadUniverseWithDiagnostics([WORKSHOP]).registry);
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

  it('carries the fault when a universe cannot open, rather than throwing at the mount', () => {
    const driver = createDriver([{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }]);

    expect(driver.snapshot().view).toBeNull();
    expect(driver.snapshot().fault).toBe('no # location is marked starting, so a new game has nowhere to begin');
    expect(texts(driver)).toEqual([driver.snapshot().fault]);
  });
});

// The store a page would have, stood up in memory. One per driver unless a
// test hands the same one to two of them, which is what closing a tab and
// opening it again looks like from here.
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

const EDIT = '/dsl location tutorial-island.guide-house x: 7, y: 7';

describe('the browser authors through the same door (c1, c9, c13, c16)', () => {
  // c1. The door the REPL has had all along, opened from the browser: staged,
  // validated, adopted, and the world the session is playing has moved.
  it('stages a section, adopts it, and the session is playing the edit', () => {
    const driver = createDriver(SHIPPED_SOURCES, { slots: pageSlots() });

    driver.send(EDIT);

    expect(said(driver)).toContain('Staged # location tutorial-island.guide-house in local-changes.');
    expect(shown(driver).discovered.find((place) => place.id === 'tutorial-island.guide-house')).toMatchObject({ x: 7, y: 7 });
  });

  // c1's other half: a section that cannot load changes nothing at all.
  it('refuses a whole edit that does not load, and goes on playing what it had', () => {
    const driver = createDriver(SHIPPED_SOURCES, { slots: pageSlots() });
    const before = shown(driver);

    driver.send('/dsl location tutorial-island.guide-house adjacent: nowhere-at-all');

    expect(said(driver)).toContain('local changes did not load.');
    expect(shown(driver)).toEqual(before);
    expect(driver.localChanges()).toBe('');
  });

  // c9. Every staged edit is in the slot as it is staged, and a driver built
  // over that slot opens with it applied — no save command anywhere.
  it('opens a second driver over the same store with the edit already applied', () => {
    const slots = pageSlots();
    const first = createDriver(SHIPPED_SOURCES, { slots });
    first.send(EDIT);
    first.send('/local list');

    const reopened = createDriver(SHIPPED_SOURCES, { slots });
    reopened.send('/local list');

    expect(shown(reopened).discovered.find((place) => place.id === 'tutorial-island.guide-house')).toMatchObject({ x: 7, y: 7 });
    expect(sourceLines(reopened)).toEqual(sourceLines(first));
    expect(reopened.localChanges()).toBe(first.localChanges());
  });

  // c16. One route out, and it is the bytes the store holds: the control reads
  // what `/local show` prints, because there is no second spelling of them.
  it('hands over the same bytes /local show prints and the slot holds', () => {
    const slots = pageSlots();
    const driver = createDriver(SHIPPED_SOURCES, { slots });
    driver.send(EDIT);
    driver.send('/local show');

    const handed = driver.localChanges()!;
    expect(handed).toContain('# location tutorial-island.guide-house');
    expect(sourceLines(driver).join('\n')).toBe(handed.trimEnd());
    expect(slotStore(slots, () => 0).read('local-changes')?.payload).toBe(handed);
  });

  it('offers nothing to hand over when the store cannot be read', () => {
    expect(createDriver(SHIPPED_SOURCES, { slots: browserSlots(noStorage) }).localChanges()).toBeNull();
  });
});

// c13. Universal over the modes the adapter can distinguish, plus the one the
// store itself distinguishes — a slot whose shape this build does not know.
// No message text is named: what is asserted is that the session is still
// playable and that something was said on the tool channel.
describe('a store that refuses leaves the session playing (c13)', () => {
  const REFUSING: Record<string, () => SlotDriver> = {
    ...Object.fromEntries(Object.entries(BROWSER_REFUSALS).map(([mode, induce]) => [mode, () => browserSlots(induce())])),
    unrecognised: () => {
      const storage = pageStorage();
      storage.setItem(`${SLOT_PREFIX}local-changes`, 'not a slot at all');
      return browserSlots(() => storage);
    },
  };

  // Every moment this driver touches the store on its own account, in the
  // order a page reaches them: it opens over what is kept, it stages an edit,
  // and it writes down where the author is. One entry is what the driver does
  // and one is what a store would have to do for it, so which moments a mode
  // refuses at is asked of a store built the same way rather than named — a
  // mode added to the adapter is placed by what it does.
  // As much of a local module as a staging write puts in the slot, which is
  // all the probe needs: what is asked is whether the store takes a write of
  // about that size, not what the module says.
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

// Every place the driver reaches the store on its own account, counted off the
// module rather than listed here. A reach added there without a moment above is
// a reach nothing asks about, which is what this clause was unmet for once.
const STORE_REACHES = [...readFileSync('src/ui/driver.ts', 'utf8').matchAll(/save\.store\.\w+\(/g)].length;

  const refusesAt = (slots: () => SlotDriver, moment: string): boolean => {
    try {
      MOMENTS[moment].asks(slotStore(slots(), () => 0));
      return false;
    } catch {
      return true;
    }
  };

  // What the session said at each moment, in order. Run against a store that
  // refuses and against one that does not, so what is compared is the refusal
  // and not the wording of it: no message text is named anywhere below.
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
    // A probe that never refuses would leave every assertion below vacuous.
    expect(Object.keys(MOMENTS).filter((moment) => refusesAt(REFUSING.unavailable, moment))).toEqual(Object.keys(MOMENTS));
  });

  for (const [mode, slots] of Object.entries(REFUSING)) {
    it(`says so at every moment it refuses, and goes on playing, when the store is ${mode}`, () => {
      const refused = through(slots());
      const quiet = through(pageSlots());

      // The session opened on the shipped modules whatever the store did.
      expect(refused.driver.snapshot().fault).toBeNull();
      expect(shown(refused.driver).location.id).toBe('tutorial-island.guide-house');

      // At each moment this store refuses at, something was said that a store
      // which did not refuse never says at that moment. Nothing is named: the
      // comparison is the same session over a store that worked.
      const refusing = Object.keys(MOMENTS).filter((moment) => refusesAt(slots, moment));
      expect(refusing, `${mode} refuses nothing, so nothing below is asked`).not.toEqual([]);
      for (const moment of refusing) {
        expect(refused.at[moment].filter((line) => !quiet.at[moment].includes(line)), `nothing said while ${moment}`).not.toEqual([]);
      }

      // Still playable: the world still answers, with the state it already had.
      refused.driver.send('/look');
      expect(shown(refused.driver).location.id).toBe('tutorial-island.guide-house');
    });
  }
});
