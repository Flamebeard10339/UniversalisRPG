import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/runtime/runtime';
import { loadModule } from '../src/content/registry';
import { initialLocalChangesModule } from '../src/content/localChanges';
import type { ModuleSource } from '../src/content/universe';
import { SAVE_VERSION } from '../src/runtime/save';
import { beginAction, runTest, serializeSession, sessionStatus, startSession, view } from '../src/runtime/session';
import { handleCommand, liveTick, loadModportalSources, type AuthoringContext, type Recorder } from './play-cli';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

// tutorial-island.dsl has no `# save` section, so /load and /expect need their own.
const SAVE_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  chest

# item gold
title: Gold

# entity chest
open:
  give: 1 gold

# save empty
{"version":${SAVE_VERSION}}

# test always-passes
assert: time >= 0

# test always-fails
assert: time < 0
`;

// Unaliased on purpose: no entity offers a free relocate to `ruins`, so the edge
// surfaces as a genuine kind: 'travel' choice, which tutorial-island never has.
const TRAVEL_MODULE = `
# location camp
x: 0, y: 0
starting
adjacent:
  ruins

# location ruins
x: 1, y: 0
`;

describe('play-cli handleCommand', () => {
  it('applies a numeric choice, mutating state and returning its narration', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const talkIndex = current.choices.findIndex((choice) => choice.id === 'talk:tutorial-island.miki');
    expect(talkIndex).toBeGreaterThanOrEqual(0);

    const result = handleCommand(session, current, String(talkIndex + 1));
    expect(result.quit).toBe(false);
    expect(result.view?.modals.map((modal) => modal.name)).toEqual(['dialogue']);
    expect(result.output.some((line) => line.includes('Greetings, adventurer!'))).toBe(true);
  });

  it('/wait <seconds> advances the returned view.time by that amount', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const result = handleCommand(session, current, '/wait 30');
    expect(result.quit).toBe(false);
    expect(result.view?.time).toBe(current.time + 30);
  });

  it('/state reports the current sim-time without advancing it', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const waited = handleCommand(session, view(session), '/wait 42');

    const result = handleCommand(session, waited.view!, '/state');
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(result.output.some((line) => line.includes('42'))).toBe(true);
    expect(sessionStatus(session).time).toBe(42);
  });

  it('/inventory prints all three lines the published status carries, and drops Equipped when nothing is worn', () => {
    const registry = loadModule(`
# skill smithing

# location forge
x: 0, y: 0
starting

# item gauntlet
title: Gauntlet
slot: hand

# save stocked
{"version":${SAVE_VERSION},"inventory":{"gauntlet":1},"xp":{"smithing":5}}
`);
    const session = startSession(registry);

    const bare = handleCommand(session, view(session), '/inventory');
    expect(bare.output).toEqual(['Inventory: {}', 'XP: {}']);

    const loaded = handleCommand(session, view(session), '/load stocked');
    const worn = handleCommand(session, loaded.view!, 'equip: gauntlet');
    const carried = handleCommand(session, worn.view!, '/inventory');
    expect(carried.output).toEqual([
      'Inventory: {"gauntlet":1}',
      'XP: {"smithing":5}',
      'Equipped: {"hand":"gauntlet"}',
    ]);
  });

  it('reports a friendly error for an out-of-range choice number, without throwing or quitting', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const result = handleCommand(session, current, String(current.choices.length + 10));
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(result.output.some((line) => line.toLowerCase().includes('error'))).toBe(true);
  });

  it('reports a friendly error for an unknown slash command, without throwing or quitting', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const result = handleCommand(session, current, '/bogus');
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(result.output.some((line) => line.toLowerCase().includes('error'))).toBe(true);
  });

  it('/quit signals quit: true', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const result = handleCommand(session, current, '/quit');
    expect(result.quit).toBe(true);
  });

  it('/speed <n> accepts a positive multiplier and rejects a non-positive/NaN one', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const ok = handleCommand(session, current, '/speed 4');
    expect(ok.output.some((line) => line.includes('4'))).toBe(true);

    const bad = handleCommand(session, current, '/speed 0');
    expect(bad.output.some((line) => line.toLowerCase().includes('error'))).toBe(true);

    const nan = handleCommand(session, current, '/speed nope');
    expect(nan.output.some((line) => line.toLowerCase().includes('error'))).toBe(true);
  });

  it('a typed travel: directive moves the player and records the canonical form', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    const current = view(session);

    const result = handleCommand(session, current, 'travel: basement');
    expect(result.quit).toBe(false);
    expect(result.view?.location.id).toBe('tutorial-island.basement');
    expect(result.recorded).toBe('travel: tutorial-island.basement');
  });

  it('a numbered choice records the correct canonical directive for a travel option', () => {
    const registry = loadModule(TRAVEL_MODULE);
    const session = startSession(registry);
    const current = view(session);

    const travelIndex = current.choices.findIndex((choice) => choice.id === 'travel:ruins');
    expect(travelIndex).toBeGreaterThanOrEqual(0);
    expect(current.choices[travelIndex].kind).toBe('travel');

    const result = handleCommand(session, current, String(travelIndex + 1));
    expect(result.recorded).toBe('travel: ruins');
    expect(result.view?.location.id).toBe('ruins');
  });
});

describe('play-cli handleCommand: /test, /load, /expect, /assert, /cancel', () => {
  it('/load <id> loads a save by id, erroring cleanly (not throwing) on an unknown one', () => {
    const registry = loadModule(SAVE_MODULE);
    const session = startSession(registry);
    const current = view(session);

    const waited = handleCommand(session, current, '/wait 99'); // diverge, so we can observe /load resetting it
    const ok = handleCommand(session, waited.view!, '/load empty');
    expect(ok.recorded).toBe('load: empty');
    expect(ok.view?.time).toBe(0);

    const bad = handleCommand(session, ok.view ?? current, '/load badsave');
    expect(bad.output.some((line) => line.startsWith('Error:'))).toBe(true);
  });

  it('/expect <id> prints a checkmark on match and a warning on mismatch', () => {
    const registry = loadModule(SAVE_MODULE);
    const session = startSession(registry);
    const current = view(session);

    const match = handleCommand(session, current, '/expect empty');
    expect(match.output.some((line) => line.startsWith('✓'))).toBe(true);
    expect(match.recorded).toBeUndefined();

    handleCommand(session, current, 'use: entity.chest.open'); // diverge from the empty save
    const mismatch = handleCommand(session, current, '/expect empty');
    expect(mismatch.output.some((line) => line.startsWith('⚠'))).toBe(true);
  });

  it('/assert <cond> warns on a false condition and confirms on a true one', () => {
    const registry = loadModule(SAVE_MODULE);
    const session = startSession(registry);
    const current = view(session);

    const ok = handleCommand(session, current, '/assert time >= 0');
    expect(ok.output.some((line) => line.startsWith('✓'))).toBe(true);

    const warn = handleCommand(session, current, '/assert time < 0');
    expect(warn.output.some((line) => line.startsWith('⚠'))).toBe(true);
  });

  it('/test <id> reports PASSED or FAILED', () => {
    const registry = loadModule(SAVE_MODULE);
    const session = startSession(registry);
    const current = view(session);

    const pass = handleCommand(session, current, '/test always-passes');
    expect(pass.output[0]).toBe(`Test 'always-passes' PASSED`);

    const fail = handleCommand(session, current, '/test always-fails');
    expect(fail.output[0]).toBe(`Test 'always-fails' FAILED: time < 0`);
  });

  it('/cancel clears an in-flight spannable action and records "cancel"', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    expect(beginAction(session, 'use:entity.oven.roast').action).not.toBeNull();

    const current = view(session);
    const result = handleCommand(session, current, '/cancel');
    expect(result.view?.action).toBeNull();
    expect(result.recorded).toBe('cancel');
  });
});

// A mirror that opens the shipped multi-field modal and a sage whose menu is
// the other shape one comes in, plus a `# test` that crosses both.
const MODAL_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  mirror
  sage

# flag greeted

# entity mirror
look in: open modal: character-creation

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  -> Ask the way.
  -> Say nothing.

# save fresh
{"version":${SAVE_VERSION}}

# test crosses-a-modal
load: fresh
use: entity.mirror.look in
submit-modal: name=Rowan
submit-modal: race=Elf
`;

// A dialogue whose own effect raises a second modal underneath it, so the
// driver has two open at once and has to pick which it is asking about.
const STACKED_MODAL_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  sage

# flag greeted

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  open modal: character-creation
  -> Ask about the mirror.
`;

describe('play-cli drives a modal by its published name and options', () => {
  function modalFixture() {
    const registry = loadModule(MODAL_MODULE);
    const session = startSession(registry);
    const recorder: Recorder = { history: [], startSave: serializeSession(session) };
    return { session, current: view(session), recorder };
  }

  it('prints the open modal and the option it is waiting on, from the name and options alone', () => {
    const { session, current, recorder } = modalFixture();

    const opened = handleCommand(session, current, 'use: entity.mirror.look in', recorder);
    expect(opened.output).toContain('[character-creation] name, race');
    expect(opened.output).toContain('Name:');
    expect(opened.output).toContain('  submit-modal: name=<text>');

    const named = handleCommand(session, opened.view!, 'submit-modal: name=Rowan', recorder);
    expect(named.output).toContain('[character-creation] race');
    expect(named.output).toContain('Race:');
    expect(named.output).toContain('  2) Elf');
  });

  it('answers a listed value by number and records the canonical submit-modal: line either way', () => {
    const { session, current, recorder } = modalFixture();

    const opened = handleCommand(session, current, 'talk: sage', recorder);
    expect(opened.output).toContain('  1) Ask the way.');
    expect(opened.output).toContain('  2) Say nothing.');

    // The second value, not the first: a driver that answered by position but
    // always handed back the head of the list would pass on `1` alone.
    const answered = handleCommand(session, opened.view!, '2', recorder);
    expect(answered.recorded).toBe('submit-modal: choice=Say nothing.');
    expect(answered.view?.modals).toEqual([]);
    expect(recorder.history).toEqual(['talk: sage', 'submit-modal: choice=Say nothing.']);
  });

  it('emits a replayable # test from a session that crossed a modal, with no hand-editing', () => {
    const { session, current, recorder } = modalFixture();

    let v = handleCommand(session, current, 'use: entity.mirror.look in', recorder).view!;
    v = handleCommand(session, v, 'submit-modal: name=Rowan', recorder).view!;
    v = handleCommand(session, v, 'submit-modal: race=Elf', recorder).view!;
    expect(v.player).toEqual({ name: 'Rowan', race: 'Elf' });

    const created = handleCommand(session, v, '/create-valid-test crossed', recorder);
    expect(created.output).toContain('submit-modal: name=Rowan');
    expect(created.output).toContain('submit-modal: race=Elf');

    const blocks = created.output.slice(created.output.findIndex((line) => line.startsWith('# ')));
    const freshRegistry = loadModule(`${MODAL_MODULE}\n${blocks.join('\n')}\n`);
    expect(runTest('crossed', freshRegistry, createGameState())).toEqual({ passed: true });
  });

  it('never takes a line as a modal field: a command after a /test that crossed a modal is still a command', () => {
    const { session, current, recorder } = modalFixture();

    const replayed = handleCommand(session, current, '/test crosses-a-modal', recorder);
    expect(replayed.output[0]).toBe(`Test 'crosses-a-modal' PASSED`);
    expect(replayed.view?.modals).toEqual([]);

    // The two lines that used to be eaten as the name and the race.
    const marker = handleCommand(session, replayed.view!, '/state', recorder);
    expect(marker.output.some((line) => line.startsWith('Location: camp'))).toBe(true);
    const second = handleCommand(session, replayed.view!, '/inventory', recorder);
    expect(second.output.some((line) => line.startsWith('Inventory: '))).toBe(true);
  });

  it('asks for the top of the stack, not the bottom, when one modal sits over another', () => {
    const registry = loadModule(STACKED_MODAL_MODULE);
    const session = startSession(registry);
    const recorder: Recorder = { history: [], startSave: serializeSession(session) };

    const opened = handleCommand(session, view(session), 'talk: sage', recorder);
    expect(opened.view?.modals.map((modal) => modal.name)).toEqual(['character-creation', 'dialogue']);
    // The dialogue is on top, so its menu is what is numbered — the bottom
    // modal's first option is free text and would print no list at all.
    expect(opened.output).toContain('Choice:');
    expect(opened.output).toContain('  1) Ask about the mirror.');
    expect(opened.output).not.toContain('Name:');

    const answered = handleCommand(session, opened.view!, '1', recorder);
    expect(answered.recorded).toBe('submit-modal: choice=Ask about the mirror.');
    expect(answered.output).toContain('Name:');
  });

  it('refuses a bare line while a modal is open instead of taking it as the field being asked for', () => {
    const { session, current, recorder } = modalFixture();

    const opened = handleCommand(session, current, 'use: entity.mirror.look in', recorder);
    expect(opened.view?.modals.map((modal) => modal.name)).toEqual(['character-creation']);
    expect(opened.output).toContain('Name:');

    // The line the old prompt would have swallowed as the name, and the one it
    // would have swallowed as the race.
    const eaten = handleCommand(session, opened.view!, 'Rowan', recorder);
    expect(eaten.output.some((line) => line.startsWith('Error:'))).toBe(true);
    const marker = handleCommand(session, opened.view!, '/state', recorder);
    expect(marker.output.some((line) => line.startsWith('Location: camp'))).toBe(true);

    const still = sessionStatus(session);
    expect(still.player).toEqual({ name: '', race: '' });
    expect(still.modals.map((modal) => modal.name)).toEqual(['character-creation']);
    expect(recorder.history).toEqual(['use: entity.mirror.look in']);
  });
});

// `oven.roast` repeats and never self-completes; `anvil.strike` completes after
// its single attempt. Both shapes runLiveAction's loop has to end for.
const LIVE_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  oven
  anvil

# item roasted-chestnut
examine: Split and steaming.

# item ingot
examine: A dull grey bar.

# entity oven
roast:
  continuous
  time: 4
  give: 1 roasted-chestnut

# entity anvil
strike:
  time: 3
  give: 1 ingot
`;

describe('liveTick: pure per-tick core of live mode', () => {
  it('advances sim-time by exactly elapsedMs/1000*multiplier for one tick', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    const armed = beginAction(session, 'use:entity.oven.roast');
    expect(armed.time).toBe(0); // armed, not yet resolved

    const result = liveTick(session, armed, 500, 2); // 0.5s real * 2x = 1 sim-second
    expect(result.view.time).toBe(1);
    expect(result.active).toBe(true);
  });

  it('a repeating action stays active across many ticks and eventually produces output', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    let v = beginAction(session, 'use:entity.oven.roast');

    // 25 ticks of 200ms at 1x = 5 simulated seconds, clearing the 4s cycle.
    for (let i = 0; i < 25; i++) {
      const result = liveTick(session, v, 200, 1);
      expect(result.active).toBe(true); // repeating: never self-completes
      v = result.view;
    }
    expect(v.time).toBe(5);
    expect(v.inventory['roasted-chestnut']).toBe(1);
    expect(v.action).not.toBeNull();
  });

  it('multiplier scales elapsed real time into simulated time', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    const armed = beginAction(session, 'use:entity.oven.roast');

    // 1 real second at 4x => 4 simulated seconds, exactly one cycle.
    const result = liveTick(session, armed, 1000, 4);
    expect(result.view.time).toBe(4);
    expect(result.active).toBe(true);
    expect(result.view.inventory['roasted-chestnut']).toBe(1);
  });

  it('draws the bar, the pools and the clock from the published view alone', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    let v = beginAction(session, 'use:entity.anvil.strike');

    const lines: string[] = [];
    for (let i = 0; i < 5; i++) {
      const tick = liveTick(session, v, 700, 1);
      lines.push(tick.line);
      if (!tick.active) break;
      v = tick.view;
    }

    expect(lines).toEqual([
      'strike... [#####---------------]  [time: 0.7s]',
      'strike... [#########-----------]  [time: 1.4s]',
      'strike... [##############------]  [time: 2.1s]',
      'strike... [###################-]  [time: 2.8s]',
      // The action is gone from the view that ends it, so its name comes from
      // the one before.
      'strike: done.  [time: 3.5s]',
    ]);
  });

  // A tap worth a fifth of a completion, so the run to one takes five swings
  // and the countdown to it is visible between them.
  const TAPPING_MODULE = `
# stat tap
base: 0.2

# stat taps-per-minute
base: 60

# location camp
x: 0, y: 0
starting
entities:
  bell

# entity bell
title: Bell
ring:
  continuous
  rate: taps-per-minute
  damage: tap
`;

  it('counts an untargeted action’s swings down to its completion instead of a foe’s pool', () => {
    const session = startSession(loadModule(TAPPING_MODULE));
    let v = beginAction(session, 'use:entity.bell.ring');

    const lines: string[] = [];
    for (let i = 0; i < 4; i++) {
      const tick = liveTick(session, v, 1000, 1);
      lines.push(tick.line);
      v = tick.view;
    }

    expect(lines).toEqual([
      'ring... [--------------------] hits:1 completion:0.8  [time: 1.0s]',
      'ring... [--------------------] hits:2 completion:0.6  [time: 2.0s]',
      'ring... [--------------------] hits:3 completion:0.4  [time: 3.0s]',
      'ring... [--------------------] hits:4 completion:0.2  [time: 4.0s]',
    ]);
  });

  it('reports active: false once a non-repeating spannable action completes on its own', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    const armed = beginAction(session, 'use:entity.anvil.strike');
    expect(armed.action).not.toBeNull();

    let result = liveTick(session, armed, 1000, 1); // 1s of 3
    expect(result.active).toBe(true);
    expect(result.view.action).not.toBeNull();

    result = liveTick(session, result.view, 1000, 1); // 2s of 3
    expect(result.active).toBe(true);

    result = liveTick(session, result.view, 2000, 1); // crosses the 3s completion boundary
    expect(result.active).toBe(false);
    expect(result.view.action).toBeNull();
    expect(result.view.inventory.ingot).toBe(1);
  });
});

// TRAVEL_MODULE rather than tutorial-island: one edge, no dialogue or inventory
// noise, so the expected save diff stays unambiguous.
describe('play-cli recorder: /create-test and /create-valid-test', () => {
  function recordedFixture() {
    const registry = loadModule(TRAVEL_MODULE);
    const session = startSession(registry);
    const current = view(session);
    const recorder: Recorder = { history: [], startSave: serializeSession(session) };
    return { registry, session, current, recorder };
  }

  // One numbered choice and one typed directive: both of handleCommand's paths.
  function recordATravelAndAWait(session: ReturnType<typeof recordedFixture>['session'], current: ReturnType<typeof recordedFixture>['current'], recorder: Recorder) {
    const travelIndex = current.choices.findIndex((choice) => choice.id === 'travel:ruins');
    expect(travelIndex).toBeGreaterThanOrEqual(0);
    const afterTravel = handleCommand(session, current, String(travelIndex + 1), recorder);
    handleCommand(session, afterTravel.view ?? current, 'wait: 1', recorder);
  }

  it('a numbered choice and a typed directive both land in recorder.history in canonical form', () => {
    const { session, current, recorder } = recordedFixture();
    recordATravelAndAWait(session, current, recorder);
    expect(recorder.history).toEqual(['travel: ruins', 'wait: 1']);
  });

  it('/create-test emits a # test block prepended with load: <id>-start and a matching # save block, and registers the test', () => {
    const { session, current, recorder } = recordedFixture();
    recordATravelAndAWait(session, current, recorder);

    const result = handleCommand(session, view(session), '/create-test foo', recorder);
    expect(result.output).toContain('# save foo-start');
    expect(result.output).toContain('load: foo-start');
    expect(result.output).toContain('# test foo');
    expect(result.output).toContain('travel: ruins');
    expect(result.output).toContain('wait: 1');
    expect(session.registry.tests.has('foo')).toBe(true);
    expect(session.registry.saves.has('foo-start')).toBe(true);
  });

  it('/create-test on an id that already exists errors instead of overwriting', () => {
    const { session, current, recorder } = recordedFixture();
    recordATravelAndAWait(session, current, recorder);
    handleCommand(session, view(session), '/create-test foo', recorder);

    const again = handleCommand(session, view(session), '/create-test foo', recorder);
    expect(again.output.some((line) => line.includes('already exists'))).toBe(true);
  });

  it('/create-valid-test appends expect: <id>-end and a # save <id>-end block; the record -> emit -> reload -> replay round trip passes', () => {
    const { session, current, recorder } = recordedFixture();
    recordATravelAndAWait(session, current, recorder);

    const result = handleCommand(session, view(session), '/create-valid-test bar', recorder);
    expect(result.output).toContain('# save bar-end');
    expect(result.output).toContain('expect: bar-end');
    expect(session.registry.tests.has('bar')).toBe(true);

    // The correctness gate: paste the emitted blocks into a brand-new module,
    // sharing no state with the recording session, and replay them.
    const blocks = result.output.slice(result.output.findIndex((line) => line.startsWith('# ')));
    const pasted = `${TRAVEL_MODULE}\n${blocks.join('\n')}\n`;
    const freshRegistry = loadModule(pasted);
    const outcome = runTest('bar', freshRegistry, createGameState());
    expect(outcome.passed).toBe(true);
  });

  it('does not prepend a second load:/-start save when the history already begins with load:', () => {
    const { session, current, recorder } = recordedFixture();
    recorder.history.push('load: someplace');
    recordATravelAndAWait(session, current, recorder); // travel + wait appended after the load

    const result = handleCommand(session, current, '/create-test baz', recorder);
    expect(result.output.some((line) => line.startsWith('# save baz-start'))).toBe(false);
    expect(result.output.some((line) => line === 'load: someplace')).toBe(true);
    expect(result.output.filter((line) => line.startsWith('load:')).length).toBe(1);
  });

  it('/create-test with nothing recorded yet errors', () => {
    const { session, current, recorder } = recordedFixture();
    const result = handleCommand(session, current, '/create-test empty', recorder);
    expect(result.output.some((line) => line.includes('nothing recorded'))).toBe(true);
    expect(session.registry.tests.has('empty')).toBe(false);
  });
});

const AUTHORING_MODULE = `
# info base
version: 1.0.0

# location camp
x: 0, y: 0
starting
entities:
  chest

# entity chest
title: Chest
open:
  say: Empty.

# item coin
title: Coin
`;

describe('play-cli local DSL authoring', () => {
  function authoringFixture() {
    const baseSources: ModuleSource[] = [{ name: 'base', text: AUTHORING_MODULE }];
    const registry = loadModule(AUTHORING_MODULE);
    const session = startSession(registry);
    const current = view(session);
    const writes: string[] = [];
    const recorder: Recorder = { history: [], startSave: serializeSession(session) };
    const authoring: AuthoringContext = {
      baseSources,
      dependencies: ['base'],
      localSource: { name: 'local-changes', text: initialLocalChangesModule(['base']) },
      writeLocalChanges: (text) => writes.push(text),
    };
    return { session, current, recorder, authoring, writes };
  }

  function runLocal(
    fixture: ReturnType<typeof authoringFixture>,
    command: string,
    current: { value: ReturnType<typeof view> },
  ) {
    const result = handleCommand(fixture.session, current.value, command, fixture.recorder, fixture.authoring);
    if (result.view) current.value = result.view;
    return result;
  }

  it('/dsl stages a section, persists it, reloads it, and /local can show/delete it', () => {
    const fixture = authoringFixture();
    const current = { value: fixture.current };

    const created = runLocal(fixture, '/dsl item gem title: Gem | examine: Cut bright.', current);
    expect(created.output[0]).toBe('Staged # item gem in local-changes.');
    expect(fixture.writes).toHaveLength(1);
    expect(fixture.authoring.localSource.text).toContain('# item gem');
    expect(fixture.authoring.localSource.text).toContain('dependencies:');
    expect(fixture.session.registry.items.get('local-changes.gem')?.title).toBe('Gem');

    const listed = runLocal(fixture, '/local', current);
    expect(listed.output).toContain('# item gem');

    const shown = runLocal(fixture, '/local show', current);
    expect(shown.output).toContain('# info local-changes');
    expect(shown.output).toContain('# item gem');

    const removed = runLocal(fixture, '/local delete item gem', current);
    expect(removed.output[0]).toBe('Deleted local # item gem.');
    expect(fixture.session.registry.items.has('local-changes.gem')).toBe(false);
    expect(runLocal(fixture, '/local', current).output).toEqual(['No local changes staged.']);
  });

  it('/dsl edits existing content by staging a field-granular patch', () => {
    const fixture = authoringFixture();
    const current = { value: fixture.current };

    const edited = runLocal(fixture, '/dsl entity base.chest title: Treasure Chest', current);
    expect(edited.output[0]).toBe('Staged # entity base.chest in local-changes.');
    const chest = fixture.session.registry.entities.get('base.chest')!;
    expect(chest.title).toBe('Treasure Chest');
    expect(chest.actions.map((action) => action.label)).toEqual(['open']);
  });

  it('/dsl rejects invalid local changes without writing or mutating the live registry', () => {
    const fixture = authoringFixture();
    const current = { value: fixture.current };
    const before = fixture.authoring.localSource.text;

    const rejected = runLocal(fixture, '/dsl entity base.chest open: |   give: missing-item', current);
    expect(rejected.output[0]).toBe('Error: local changes did not load.');
    expect(rejected.output.some((line) => line.includes('missing-item'))).toBe(true);
    expect(fixture.writes).toEqual([]);
    expect(fixture.authoring.localSource.text).toBe(before);
    expect(fixture.session.registry.entities.get('base.chest')?.actions[0].results).toEqual([{ kind: 'say', text: 'Empty.' }]);
  });

  it('/local clear reloads and prunes stale state from removed local content', () => {
    const fixture = authoringFixture();
    const current = { value: fixture.current };

    runLocal(fixture, '/dsl item gem title: Gem', current);
    runLocal(fixture, `/dsl save carried {"version":${SAVE_VERSION},"inventory":{"local-changes.gem":1}}`, current);
    runLocal(fixture, '/load local-changes.carried', current);
    expect(current.value.inventory['local-changes.gem']).toBe(1);

    const cleared = runLocal(fixture, '/local clear', current);

    expect(cleared.output[0]).toBe('Cleared local-changes.');
    expect(cleared.output.some((line) => line.includes('Removed inventory local-changes.gem'))).toBe(true);
    expect(cleared.view?.inventory['local-changes.gem']).toBeUndefined();
  });

  it('/dsl can author every DSL section kind that local-changes is allowed to own', () => {
    const fixture = authoringFixture();
    const current = { value: fixture.current };
    const commands = [
      '/dsl stat vigor base: 10',
      '/dsl skill focus stat-id: local-changes.vigor',
      '/dsl item token title: Token',
      '/dsl item ore title: Ore',
      '/dsl item ingot title: Ingot',
      '/dsl item temporary title: Temporary',
      '/dsl entity npc title: NPC | cheer: say: Hello.',
      '/dsl location grove x: 1, y: 0 | entities: local-changes.npc',
      '/dsl flag levered',
      '/dsl variable local-knob value: 2',
      '/dsl resource stamina max: local-changes.vigor',
      '/dsl recipe smelt in: local-changes.ore | out: local-changes.ingot',
      '/dsl dialogue npc-chat owner = local-changes.npc | node greet: |   Hello there.',
      `/dsl save blank {"version":${SAVE_VERSION}}`,
      '/dsl test smoke assert: time >= 0',
      '/dsl remove item.local-changes.temporary',
    ];

    for (const command of commands) {
      const result = runLocal(fixture, command, current);
      expect(result.output[0], command).not.toMatch(/^Error:/);
    }

    const registry = fixture.session.registry;

    expect(registry.stats.get('local-changes.vigor')?.base).toEqual({ min: 10, max: 10 });
    expect(registry.skills.get('local-changes.focus')?.['stat-id']).toBe('local-changes.vigor');
    expect(registry.items.get('local-changes.token')?.title).toBe('Token');
    expect(registry.entities.get('local-changes.npc')?.actions).toEqual([{ label: 'cheer', results: [{ kind: 'say', text: 'Hello.' }] }]);
    expect(registry.locations.get('local-changes.grove')).toMatchObject({ x: 1, y: 0, entities: [{ entity: 'local-changes.npc' }] });
    expect(registry.flags.has('local-changes.levered')).toBe(true);
    expect(registry.variables.get('local-knob')?.value).toBe(2);
    expect(registry.resources.get('local-changes.stamina')?.max).toBe('local-changes.vigor');
    expect(registry.recipes.get('local-changes.smelt')).toMatchObject({ in: [{ item: 'local-changes.ore' }], out: [{ item: 'local-changes.ingot' }] });
    expect(registry.dialogues.get('local-changes.npc-chat')?.owner).toBe('local-changes.npc');
    expect(registry.saves.get('local-changes.blank')).toEqual({ version: SAVE_VERSION, diff: {} });
    expect(registry.tests.get('local-changes.smoke')?.directives).toMatchObject([{ kind: 'assert', condition: { operator: '>=' } }]);
    expect(registry.items.has('local-changes.temporary')).toBe(false);

    expect(runLocal(fixture, '/load local-changes.blank', current).recorded).toBe('load: local-changes.blank');
  });

  it('reports local authoring commands as unavailable when no authoring context is provided', () => {
    const registry = loadModule(AUTHORING_MODULE);
    const session = startSession(registry);
    const result = handleCommand(session, view(session), '/dsl item gem');
    expect(result.output).toEqual(['Error: local authoring is unavailable.']);
  });
});

describe('play-cli modportal cache loading', () => {
  it('loads synced approved mods with their manifest enablement', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      writeFileSync(path.join(dir, '1-approved-mod-1.dsl'), '# info approved-mod-1\nversion: 0.0.0\n', 'utf8');
      writeFileSync(path.join(dir, '2-approved-mod-2.dsl'), '# info approved-mod-2\nversion: 0.0.0\n', 'utf8');
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          version: 2,
          entries: [
            { issue: 1, title: 'One', tier: 'auto-enabled', moduleId: 'approved-mod-1', file: '1-approved-mod-1.dsl', enabled: true },
            { issue: 2, title: 'Two', tier: 'approved', moduleId: 'approved-mod-2', file: '2-approved-mod-2.dsl', enabled: false },
          ],
        }),
        'utf8',
      );

      const loaded = loadModportalSources(dir);

      expect(loaded.warnings).toEqual([]);
      expect(loaded.sources.map((source) => ({ name: source.name, enabled: source.enabled }))).toEqual([
        { name: 'approved-mod-1', enabled: true },
        { name: 'approved-mod-2', enabled: false },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns instead of crashing on a manifest a truncated write left unreadable', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      writeFileSync(path.join(dir, 'manifest.json'), '{"version": 1, "entries": [{"issue": 1,', 'utf8');
      expect(loadModportalSources(dir).sources).toEqual([]);
      expect(loadModportalSources(dir).warnings[0]).toMatch(/^Modportal ignored manifest\.json:/);

      writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 2 }), 'utf8');
      expect(loadModportalSources(dir).warnings).toEqual(['Modportal ignored manifest.json: it holds no entries array']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns instead of reading manifest files outside the cache directory', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ version: 2, entries: [{ issue: 1, title: 'One', tier: 'approved', moduleId: 'approved-mod-1', file: '../outside.dsl', enabled: true }] }),
        'utf8',
      );

      const loaded = loadModportalSources(dir);

      expect(loaded.sources).toEqual([]);
      expect(loaded.warnings).toEqual(['Modportal skipped approved-mod-1: file escapes cache directory']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
