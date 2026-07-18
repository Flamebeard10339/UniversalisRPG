import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadModule } from '../src/game/contentDsl/runtime';
import { startSession, view } from '../src/game/contentDsl/session';
import { handleCommand } from './play-cli';

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
});
