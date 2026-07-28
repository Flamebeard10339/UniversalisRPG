import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/contentDsl/runtime';
import { loadModule } from '../src/game/contentDsl/registry';
import { serializeSave } from '../src/game/contentDsl/save';
import { beginAction, runTest, startSession, view } from '../src/game/contentDsl/session';
import { handleCommand, liveTick, type Recorder } from './play-cli';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

// tutorial-island.dsl has no `# save` section (checked: it's all locations/
// entities/dialogue/items for the hand-authored tutorial content), so /load
// and /expect need their own tiny fixture module with one `# save` — mirrors
// the inline-module pattern already used below for LIVE_MODULE and in
// src/game/contentDsl/save.test.ts's SAVE_TEST_MODULE.
const SAVE_MODULE = `
# location camp
x: 0, y: 0
starting

# item gold
title: Gold

# entity chest
open:
  give: 1 gold

# save empty
{"version":3}

# test always-passes
assert: time >= 0

# test always-fails
assert: time < 0
`;

// A plain, unaliased two-location fixture: no entity here offers a free
// relocate to `ruins`, so the camp -> ruins edge surfaces as a genuine kind:
// 'travel' PlayChoice (unlike every edge in tutorial-island.dsl, which is
// aliased by a stairs entity — see the comment at its use site below).
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

    const talkIndex = current.choices.findIndex((choice) => choice.id === 'talk:miki');
    expect(talkIndex).toBeGreaterThanOrEqual(0);

    const result = handleCommand(session, current, String(talkIndex + 1));
    expect(result.quit).toBe(false);
    expect(result.view?.inDialogue).toBe(true);
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
    const current = view(session);
    session.state.time = 42;

    const result = handleCommand(session, current, '/state');
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(result.output.some((line) => line.includes('42'))).toBe(true);
    expect(session.state.time).toBe(42);
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
    expect(session.state.location).toBe('basement');
    expect(result.view?.location.id).toBe('basement');
    expect(result.recorded).toBe('travel: basement');
  });

  // tutorial-island's only travel edges (guide-house <-> upstairs/basement)
  // are all aliased by a stairs entity's free relocate action (see
  // entityAliasesTravelTo in session.ts), so a genuine kind: 'travel' choice
  // never appears there — a plain unaliased two-location fixture is used
  // instead to exercise the numbered-choice 'travel' recording path.
  it('a numbered choice records the correct canonical directive for a travel option', () => {
    const registry = loadModule(TRAVEL_MODULE);
    const session = startSession(registry);
    const current = view(session);

    const travelIndex = current.choices.findIndex((choice) => choice.id === 'travel:ruins');
    expect(travelIndex).toBeGreaterThanOrEqual(0);
    expect(current.choices[travelIndex].kind).toBe('travel');

    const result = handleCommand(session, current, String(travelIndex + 1));
    expect(result.recorded).toBe('travel: ruins');
    expect(session.state.location).toBe('ruins');
  });
});

describe('play-cli handleCommand: /test, /load, /expect, /assert, /cancel', () => {
  // tutorial-island.dsl has no `# save` section, so /load and /expect are
  // exercised against a tiny inline fixture module instead (SAVE_MODULE
  // above), mirroring the pattern already used for LIVE_MODULE below and for
  // save.test.ts's SAVE_TEST_MODULE.
  it('/load <id> loads a save by id, erroring cleanly (not throwing) on an unknown one', () => {
    const registry = loadModule(SAVE_MODULE);
    const session = startSession(registry);
    const current = view(session);

    session.state.time = 99; // diverge, so we can observe /load resetting it
    const ok = handleCommand(session, current, '/load empty');
    expect(ok.recorded).toBe('load: empty');
    expect(session.state.time).toBe(0);

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

    session.state.inventory.gold = 1; // diverge from the empty save
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
    beginAction(session, 'use:entity.oven.roast');
    expect(session.state.activeAction).not.toBeNull();

    const current = view(session);
    const result = handleCommand(session, current, '/cancel');
    expect(session.state.activeAction).toBeNull();
    expect(result.recorded).toBe('cancel');
  });
});

// A small live-mode fixture: `oven.roast` is a REPEATING spannable action
// (never self-completes — a live driver only stops it on Enter/EOF), and
// `anvil.strike` is a NON-repeating spannable action (self-completes once
// its single attempt resolves) — the two shapes runLiveAction's real-time
// loop has to end for (see runLiveAction's doc comment in play-cli.ts).
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
  repeating
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
    beginAction(session, 'use:entity.oven.roast');
    expect(session.state.time).toBe(0); // armed, not yet resolved

    const result = liveTick(session, 500, 2); // 0.5s real * 2x = 1 sim-second
    expect(session.state.time).toBe(1);
    expect(result.active).toBe(true);
  });

  it('a repeating action stays active across many ticks and eventually produces output', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    beginAction(session, 'use:entity.oven.roast');

    // 25 ticks of 200ms at 1x = 5 simulated seconds, comfortably clearing the
    // 4s cycle (time: 4) with margin against float-accumulation error.
    for (let i = 0; i < 25; i++) {
      const result = liveTick(session, 200, 1);
      expect(result.active).toBe(true); // repeating: never self-completes
    }
    expect(session.state.time).toBeCloseTo(5, 5);
    expect(session.state.inventory['roasted-chestnut']).toBe(1);
    expect(session.state.activeAction).not.toBeNull();
  });

  it('multiplier scales elapsed real time into simulated time', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    beginAction(session, 'use:entity.oven.roast');

    // 1 real second at 4x => 4 simulated seconds, exactly one cycle.
    const result = liveTick(session, 1000, 4);
    expect(session.state.time).toBe(4);
    expect(result.active).toBe(true);
    expect(session.state.inventory['roasted-chestnut']).toBe(1);
  });

  it('reports active: false once a non-repeating spannable action completes on its own', () => {
    const registry = loadModule(LIVE_MODULE);
    const session = startSession(registry);
    beginAction(session, 'use:entity.anvil.strike');
    expect(session.state.activeAction).not.toBeNull();

    let result = liveTick(session, 1000, 1); // 1s of 3
    expect(result.active).toBe(true);
    expect(session.state.activeAction).not.toBeNull();

    result = liveTick(session, 1000, 1); // 2s of 3
    expect(result.active).toBe(true);

    result = liveTick(session, 2000, 1); // crosses the 3s completion boundary
    expect(result.active).toBe(false);
    expect(session.state.activeAction).toBeNull();
    expect(session.state.inventory.ingot).toBe(1);
  });
});

// TRAVEL_MODULE (above) rather than tutorial-island.dsl: it's small and
// deterministic (one real travel edge, no dialogue/inventory noise), which
// keeps the recorded-history assertions and the round-trip test's expected
// save diff ({location: 'ruins'}) simple and unambiguous.
describe('play-cli recorder: /create-test and /create-valid-test', () => {
  function recordedFixture() {
    const registry = loadModule(TRAVEL_MODULE);
    const session = startSession(registry);
    const current = view(session);
    const recorder: Recorder = { history: [], startSave: serializeSave(session.state, registry) };
    return { registry, session, current, recorder };
  }

  // Drives one numbered choice (travel) and one typed directive (wait),
  // exercising both of handleCommand's recording paths against the same
  // recorder.
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

    // The key correctness gate: paste the emitted blocks (everything from the
    // first `# ...` line on — the confirmation line above it is a CLI status
    // message, not part of the pasteable DSL) into a brand-new module (fresh
    // registry, zero shared state with the recording session) and confirm
    // replaying the test reproduces the recorded end state.
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
