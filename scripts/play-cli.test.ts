import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadModule } from '../src/game/contentDsl/runtime';
import { beginAction, startSession, view } from '../src/game/contentDsl/session';
import { handleCommand, liveTick } from './play-cli';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

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
