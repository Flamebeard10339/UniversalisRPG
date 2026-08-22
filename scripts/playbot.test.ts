import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engineLocale, withEngineLocale } from '../src/content/engineLocale';
import { loadUniverse, loadUniverseWithDiagnostics } from '../src/content/load';
import type { Registry } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { askedOption } from '../src/runtime/command';
import { sessionStatus, startSession, type PlaySession } from '../src/runtime/session';
import {
  applyAction,
  isolatedCwd,
  journalWindowText,
  parseReply,
  reloadInto,
  renderView,
  repoRoot,
  runPlaybot,
  runTurn,
  sdkOptionsFor,
  systemPromptFor,
  type ContentReader,
  type ModelClient,
  type RunLogEntry,
  type TurnRequest,
} from './playbot';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');
const quests = readFileSync('content/tutorial-quests.dsl', 'utf8');

// The island and quest actually played, same corpus session.test.ts drives.
const PLAYED_SOURCES: ModuleSource[] = [engineLocale(), { name: 'tutorial-island', text: source }, { name: 'tutorial-quests', text: quests }];
const played = (): Registry => loadUniverse(PLAYED_SOURCES);

const constantReader = (sources: readonly ModuleSource[]): ContentReader => () => sources;

const tutorialReader: ContentReader = () => withEngineLocale([{ name: 'tutorial-island', text: source }, { name: 'tutorial-quests', text: quests }]);

// A well-behaved reply, built by peeking the session's own status rather than by guessing —
// this is what "derives its own subjects" looks like for a fake client.
function wellBehavedReply(session: PlaySession): unknown {
  const status = sessionStatus(session);
  const asking = askedOption(status.modals);
  if (asking) {
    const value = asking.values ? asking.values[0].value : 'Ash';
    return { action: { kind: 'modal', key: asking.key, value }, note: 'proceeding', expected: '', confusion: '' };
  }
  const choice = status.choices[0];
  return { action: { kind: 'choice', id: choice.id }, note: 'exploring', expected: '', confusion: '' };
}

function wellBehavedClient(session: PlaySession): ModelClient {
  return { send: async () => wellBehavedReply(session) };
}

describe('playbot', () => {
  // c1: one loop, two prompts — below the point a prompt is selected, nothing branches on which
  // one was chosen. The two request bodies from one turn under each prompt differ only in system.
  it('[c1] the two modes differ only in the system block of the assembled request', async () => {
    const registryA = played();
    const registryB = played();
    const sessionA = startSession(registryA);
    const sessionB = startSession(registryB);
    const requests: TurnRequest[] = [];
    const recording: ModelClient = {
      send: async (request) => {
        requests.push(request);
        return wellBehavedReply(sessionA);
      },
    };

    await runTurn({ session: sessionA, read: constantReader(PLAYED_SOURCES), client: recording, system: systemPromptFor('author'), log: [], turn: 1 });
    await runTurn({ session: sessionB, read: constantReader(PLAYED_SOURCES), client: recording, system: systemPromptFor('bughunt'), log: [], turn: 1 });

    expect(requests).toHaveLength(2);
    expect(requests[0].system).not.toBe(requests[1].system);
    expect(requests[0].journal).toBe(requests[1].journal);
    expect(requests[0].view).toBe(requests[1].view);
    expect(requests[0].turn).toBe(requests[1].turn);
  });

  // c2: the model is a seam. Every test in this file drives a fake client; a repo-wide grep for
  // the raw Messages API's endpoint and key (run separately, not here, so this file itself does
  // not contain the pattern it is meant to prove absent) is the rest of this clause's proof —
  // this file never imports or calls the SDK's `query`.
  it('[c2] runPlaybot completes a run against a fake client with no network call', async () => {
    const session = startSession(played());
    const log = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'author', turns: 5, write: () => {} });
    expect(log).toHaveLength(5);
    expect(log.every((entry) => entry.outcome === 'applied' || entry.outcome === 'refused')).toBe(true);
  });

  // c3: billed input does not grow with turn count. The journal window is bounded, so the
  // assembled request grows only by the turn numbers inside that window gaining digits — never by
  // the run's total length. The proof derives its own subjects across several N, not two picked ones.
  it('[c3] request size at turn 4N exceeds request size at turn N by a bound, not by scale', () => {
    const system = systemPromptFor('author');
    const viewText = 'location: fixture (fixture)\nchoices:\n  id=travel:x :: Travel';
    const syntheticLog = (upTo: number): RunLogEntry[] =>
      Array.from({ length: upTo }, (_unused, index) => ({
        turn: index + 1,
        outcome: 'applied' as const,
        action: { kind: 'choice' as const, id: 'travel:x' },
        note: 'moving along the fixed loop',
        expected: '',
        confusion: '',
        detail: 'arrived somewhere',
      }));
    const requestSize = (n: number): number => system.length + journalWindowText(syntheticLog(n)).length + viewText.length;

    const BOUND_BYTES = 64;
    for (const n of [10, 25, 50, 100, 250]) {
      const delta = Math.abs(requestSize(4 * n) - requestSize(n));
      expect(delta).toBeLessThan(BOUND_BYTES);
    }
  });

  // c4: a turn carries the loop's own prompt and nothing the harness would add — no built-in
  // tools, no filesystem settings, and (the opt-out c4 originally missed) a working directory
  // that does not resolve under this repository.
  it('[c4] the SDK options disable tools and settings and run outside the repository', () => {
    const cwd = isolatedCwd();
    expect(path.resolve(cwd).toLowerCase().startsWith(path.resolve(repoRoot).toLowerCase())).toBe(false);

    const options = sdkOptionsFor('THE SYSTEM PROMPT', cwd);
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.systemPrompt).toBe('THE SYSTEM PROMPT');
    expect(options.cwd).toBe(cwd);
  });

  // c5: the system prefix is frozen. It is byte-identical across every turn of a run, because it
  // is a pure function of the mode chosen once at the start, never of the clock or the turn.
  it('[c5] the system block is byte-identical across a multi-turn run', async () => {
    const session = startSession(played());
    const requests: TurnRequest[] = [];
    const recording: ModelClient = {
      send: async (request) => {
        requests.push(request);
        return wellBehavedReply(session);
      },
    };
    await runPlaybot({ session, read: tutorialReader, client: recording, mode: 'bughunt', turns: 6, write: () => {} });

    expect(requests).toHaveLength(6);
    const distinctSystems = new Set(requests.map((request) => request.system));
    expect(distinctSystems.size).toBe(1);
    expect(requests[0].system.length).toBeGreaterThan(0);
  });

  // c6: a selector is a token the engine published. Walking a real, live session across many
  // turns, every id or value the loop sends is one this turn's own view actually offered — the
  // subjects are read off the live view each time, not listed by hand.
  it('[c6] every selector parseReply accepts appears among the view it was taken from', () => {
    const session = startSession(played());
    for (let i = 0; i < 40; i++) {
      const before = sessionStatus(session);
      if (before.choices.length === 0 && before.modals.length === 0) break;
      const raw = wellBehavedReply(session);
      const v = { ...before, said: [] } as unknown as Parameters<typeof parseReply>[1];
      const parsed = parseReply(raw, v);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;

      if (parsed.reply.action.kind === 'choice') {
        expect(before.choices.map((choice) => choice.id)).toContain(parsed.reply.action.id);
      } else {
        const asking = askedOption(before.modals);
        expect(asking).toBeDefined();
        expect(parsed.reply.action.key).toBe(asking!.key);
        if (asking!.values) expect(asking!.values.map((choice) => choice.value)).toContain(parsed.reply.action.value);
      }
      applyAction(session, parsed.reply.action);
    }
  });

  // c8, and the refusal half of c6: a reply naming a token the view did not offer ends the turn
  // with a recorded failure rather than a guess — the loop never approximates to a nearby id.
  it('[c8] a reply naming an id the view never offered is refused, not approximated', async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ action: { kind: 'choice', id: 'travel:somewhere-that-does-not-exist' }, note: 'n', expected: '', confusion: '' }) };
    const locationBefore = sessionStatus(session).location.id;
    const log = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 1, write: () => {} });
    expect(log[0].outcome).toBe('invalid-reply');
    expect(log[0].detail).toMatch(/did not offer/);
    expect(sessionStatus(session).location.id).toBe(locationBefore);
  });

  // c8: the request constrains the reply to this branch's schema, and the loop parses no prose —
  // a reply missing a required field is refused, not read as free text.
  it('[c8] a structurally malformed reply is refused loudly', async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ action: { kind: 'choice', id: 'whatever' } }) };
    const log = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 1, write: () => {} });
    expect(log[0].outcome).toBe('invalid-reply');
    expect(log[0].detail).toMatch(/note, expected, confusion/);
  });

  // c7: content edits land between turns without a restart, and a load that fails leaves the
  // session exactly as it was, with the run continuing on the last good content.
  it('[c7] a mid-run edit is reachable next turn, and a broken read does not end the run', async () => {
    const V1 = withEngineLocale([
      {
        name: 'world',
        text: `
# location start
x: 0, y: 0
starting
adjacent:
  dock

# location dock
x: 1, y: 0
adjacent:
  start
`,
      },
    ]);
    const BROKEN: ModuleSource[] = [{ name: 'world', text: '@@@ not a valid module at all @@@\n???' }];
    const V2 = withEngineLocale([
      {
        name: 'world',
        text: `
# location start
x: 0, y: 0
starting
adjacent:
  dock
  market

# location dock
x: 1, y: 0
adjacent:
  start

# location market
x: 0, y: 1
adjacent:
  start
`,
      },
    ]);

    let calls = 0;
    const read: ContentReader = () => {
      calls += 1;
      return calls === 1 ? V1 : calls === 2 ? BROKEN : V2;
    };

    const session = startSession(loadUniverseWithDiagnostics(V1).registry);
    const seenChoices: string[][] = [];
    const client: ModelClient = {
      send: async () => {
        const choices = sessionStatus(session).choices;
        seenChoices.push(choices.map((choice) => choice.id));
        return { action: { kind: 'choice', id: choices[0].id }, note: 'n', expected: '', confusion: '' };
      },
    };

    const log = await runPlaybot({ session, read, client, mode: 'author', turns: 4, write: () => {} });

    expect(log[0].outcome).toBe('applied');
    expect(log[1].outcome).toBe('reload-failed');
    expect(log[1].detail.length).toBeGreaterThan(0);
    expect(log[2].outcome).toBe('applied');
    expect(log[3].outcome).toBe('applied');

    // The model was never asked on the failed-load turn, so only three calls happened for four turns.
    expect(seenChoices).toHaveLength(3);
    expect(seenChoices[0]).toEqual(['travel:dock']);
    // Turn 2's broken read left the session exactly where turn 1's action put it (still at
    // dock, unaffected by the failed load), and turn 3 continues from there on the last good
    // content — the location authored while the run was in flight (market) is reachable the
    // moment a good read lands and the player is back where it connects, with no restart at all.
    expect(seenChoices[1]).toEqual(['travel:start']);
    expect(seenChoices[2]).toContain('travel:market');
  });

  it('[c7] reloadInto leaves the session untouched when the read throws', () => {
    const session = startSession(played());
    const before = sessionStatus(session).location.id;
    const throwing: ContentReader = () => {
      throw new Error('file was mid-write');
    };
    const result = reloadInto(session, throwing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/mid-write/);
    expect(sessionStatus(session).location.id).toBe(before);
  });

  // c9: the log is the only channel. Every line the loop produces is routed through the one
  // injected sink — nothing bypasses it through console.log/console.error or any other channel.
  describe('[c9] the log is the only channel', () => {
    afterEach(() => vi.restoreAllMocks());

    it('routes every line through the injected write sink and touches no other channel', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = startSession(played());
      const written: string[] = [];
      const log = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'author', turns: 8, write: (line) => written.push(line) });

      expect(written).toHaveLength(log.length);
      expect(written.length).toBeGreaterThan(0);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  it('renderView describes the offered choices and the current location', () => {
    const session = startSession(played());
    const text = renderView({ ...sessionStatus(session), said: [] } as unknown as Parameters<typeof renderView>[0]);
    expect(text).toContain('location:');
    expect(text).toContain('choices:');
  });
});
