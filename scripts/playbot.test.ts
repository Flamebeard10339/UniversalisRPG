import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engineLocale, withEngineLocale } from '../src/content/engineLocale';
import { loadUniverse, loadUniverseWithDiagnostics } from '../src/content/load';
import type { Registry } from '../src/content/registry';
import { moduleSource, shippedFiles } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { askedOption, isChoiceLine, newContext, runLine } from '../src/runtime/command';
import { journalWindowText, NOTE_FIELDS, runAsSections, runId, type RunLogEntry } from '../src/runtime/runLog';
import { runTest, sessionLocalizer, sessionStatus, startSession, view, type PlaySession } from '../src/runtime/session';
import { createGameState } from '../src/runtime/runtime';
import {
  DEFAULT_SOURCES,
  fileContentReader,
  isolatedCwd,
  openSession,
  parseReply,
  reloadInto,
  renderView,
  repoRoot,
  resolveSave,
  runPlaybot,
  runTurn,
  sdkOptionsFor,
  PLAYBOT_MODES,
  REFUSALS_BEFORE_STOPPING,
  systemPromptFor,
  type ContentReader,
  type ModelClient,
  type TurnRequest,
} from './playbot';

// The island and quest actually played: standing Tulsa, plus the tutorial quest module —
// deliberately not the whole shipped corpus, so a run here never meets combat-expansion.
const PLAYED_MODULES = ['core', 'tulsa', 'tutorial-quests'];

// The island and quest actually played, same corpus session.test.ts drives.
const PLAYED_SOURCES: ModuleSource[] = [engineLocale(), ...PLAYED_MODULES.map(moduleSource)];
const played = (): Registry => loadUniverse(PLAYED_SOURCES);

const constantReader = (sources: readonly ModuleSource[]): ContentReader => () => sources;

const tutorialReader: ContentReader = () => withEngineLocale(PLAYED_MODULES.map(moduleSource));

// A well-behaved reply, built by peeking the session's own status rather than by guessing —
// this is what "derives its own subjects" looks like for a fake client.
function wellBehavedReply(session: PlaySession): unknown {
  const status = sessionStatus(session);
  const asking = askedOption(status.modals);
  if (asking) {
    const value = asking.values ? asking.values[0].value : 'Ash';
    return { line: `submit-modal: ${asking.key}=${value}`, note: 'proceeding', expected: '', confusion: '' };
  }
  const choice = status.choices[0];
  return { line: choice.id, note: 'exploring', expected: '', confusion: '' };
}

function wellBehavedClient(session: PlaySession): ModelClient {
  return { send: async () => wellBehavedReply(session) };
}

const PLAYED_AT = '2026-08-23T00:00:00.000Z';

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

    const ctxA = newContext(sessionA, view(sessionA));
    const ctxB = newContext(sessionB, view(sessionB));
    await runTurn({ ctx: ctxA, read: constantReader(PLAYED_SOURCES), client: recording, system: systemPromptFor('author'), log: [], turn: 1, report: () => {} });
    await runTurn({ ctx: ctxB, read: constantReader(PLAYED_SOURCES), client: recording, system: systemPromptFor('bughunt'), log: [], turn: 1, report: () => {} });

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
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'author', turns: 5, at: PLAYED_AT, write: () => {} });
    expect(recorded.log).toHaveLength(5);
    expect(recorded.log.every((entry) => entry.outcome === 'applied' || entry.outcome === 'refused')).toBe(true);
  });

  // A bot run and an author's run are one kind of thing. What the model played comes back as the
  // two sections that replay it against the same corpus, which is what makes a found bug watchable
  // rather than a paragraph somebody has to re-enact by hand.
  it('comes back as the # test that replays it, against the corpus it was played on', async () => {
    const session = startSession(played());
    const kept = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'author', turns: 6, at: PLAYED_AT, write: () => {} });

    const filed = runAsSections(kept, { at: PLAYED_AT, built: 'a test' })
      .map((block) => block.join('\n'))
      .join('\n\n');
    const registry = loadUniverse([...PLAYED_SOURCES, { name: 'the-run', text: ['# info the-run', 'version: 1.0.0', 'dependencies:', ...PLAYED_MODULES.map((each) => `  ${each}`), '', filed].join('\n') }]);

    expect(runTest(`the-run.${runId(PLAYED_AT)}`, registry, createGameState())).toEqual({ passed: true });
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
        line: 'travel:x',
        directives: ['travel: x'],
        notes: { note: 'moving along the fixed loop', expected: '', confusion: '', blocked: '' },
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
    await runPlaybot({ session, read: tutorialReader, client: recording, mode: 'bughunt', turns: 6, at: PLAYED_AT, write: () => {} });

    expect(requests).toHaveLength(6);
    const distinctSystems = new Set(requests.map((request) => request.system));
    expect(distinctSystems.size).toBe(1);
    expect(requests[0].system.length).toBeGreaterThan(0);
  });

  // c5, the other half: byte identity is necessary and not sufficient. A frozen prefix under
  // 1024 tokens does not cache at all, so a run that passes the clause above and sits under the
  // floor is re-billed in full on every turn and looks correct while doing it. Measured in
  // characters because the tokenizer is not in this repository; 4096 is 1024 tokens at four
  // characters each, which is the conservative end of English prose.
  const CACHE_FLOOR_CHARS = 4096;
  it.each(PLAYBOT_MODES)('[c5] the %s prefix clears the floor under which nothing caches', (mode) => {
    expect(systemPromptFor(mode).length).toBeGreaterThan(CACHE_FLOOR_CHARS);
  });

  // The shape a turn is recorded in is shared with the app's own playtest recorder, and the
  // schema and the parser already read it. The prompt is the one thing that cannot: it is a page
  // of prose tuned for a model, not a form label. So a field added to the list fails here until
  // the prose that tells the model what to put in it is written.
  it.each(PLAYBOT_MODES)('the %s prompt asks for every field a recorded turn carries', (mode) => {
    const unasked = NOTE_FIELDS.filter((field) => !systemPromptFor(mode).includes(`"${field.name}"`));
    expect(unasked.map((field) => field.name)).toEqual([]);
  });

  it('[c1] the reply schema takes exactly the line and the fields a recorded turn carries', () => {
    const schema = sdkOptionsFor('THE SYSTEM PROMPT', isolatedCwd()).outputFormat as unknown as { schema: { required: string[]; properties: Record<string, unknown> } };
    const expected = ['line', ...NOTE_FIELDS.map((field) => field.name)];
    expect(schema.schema.required).toEqual(expected);
    expect(Object.keys(schema.schema.properties)).toEqual(expected);
  });


  // c6, narrowed for free text (see docs/specs' ## Decisions for 2026-08-22): the loop builds no
  // selector of its own. It forwards exactly the line a well-behaved reply drew from the live
  // view to the same runLine every driver shares, and none of them come back refused as
  // unrecognised — walking a real session across many turns, not two hand-picked ones.
  // The run measured on 2026-08-22 lost eleven turns to this: every `fight:` choice the view
  // printed was refused, because a choice id that is not also a directive verb could once be
  // picked only by its position, which c6 forbids the loop from constructing. The subjects are
  // every choice a live session offers, so a choice shape added later is covered with no edit.
  it('every choice a live view prints can be taken by the id it was printed under', () => {
    const session = startSession(played());
    const ctx = newContext(session, view(session));
    expect(ctx.view.choices.length).toBeGreaterThan(0);
    for (const choice of ctx.view.choices) {
      expect(isChoiceLine(ctx.view, choice.id), `${choice.id} is offered and cannot be answered by its own id`).not.toBeNull();
    }
  });

  it('a player that says it is blocked ends the run on that turn', async () => {
    const session = startSession(played());
    const lines: string[] = [];
    let asked = 0;
    const client: ModelClient = {
      send: async () => {
        asked += 1;
        return { line: '/look', note: 'looking', expected: '', confusion: '', blocked: asked === 2 ? 'every way on is refused' : '' };
      },
    };
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 20, at: PLAYED_AT, write: (line) => lines.push(line) });

    expect(asked).toBe(2);
    expect(recorded.log).toHaveLength(2);
    expect(lines[lines.length - 1]).toContain('every way on is refused');
  });

  it('a run the world has stopped answering ends without the player having to say so', async () => {
    const session = startSession(played());
    const lines: string[] = [];
    let asked = 0;
    const client: ModelClient = {
      send: async () => {
        asked += 1;
        return { line: 'no-such-choice-at-all', note: 'trying', expected: '', confusion: 'it keeps refusing', blocked: '' };
      },
    };
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 30, at: PLAYED_AT, write: (line) => lines.push(line) });

    expect(asked).toBe(REFUSALS_BEFORE_STOPPING);
    expect(recorded.log.every((entry) => entry.outcome === 'refused' || entry.outcome === 'invalid-reply')).toBe(true);
    expect(lines[lines.length - 1]).toContain('in a row were refused');
  });

  it('[c6] a line drawn from the view it was taken from is accepted, never refused as unrecognised', () => {
    const session = startSession(played());
    const ctx = newContext(session, view(session));
    let exercised = 0;
    for (let i = 0; i < 40; i++) {
      const before = sessionStatus(session);
      if (before.choices.length === 0 && before.modals.length === 0) break;
      const raw = wellBehavedReply(session);
      const parsed = parseReply(raw);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      exercised += 1;

      const result = runLine(ctx, parsed.reply.line);
      const refusals = result.output.filter((each) => each.kind === 'message' && each.tone === 'error');
      expect(refusals, parsed.reply.line).toEqual([]);
    }
    expect(exercised).toBeGreaterThan(10);
  });

  // c6's residue: without the view itself gating what parseReply accepts, the guarantee that
  // moves to runLine is the registry's own, not a positional one this loop keeps. The proof
  // covers three different directive shapes reaching runLine, so it is not one lucky case.
  it('[c6, c8] a line naming something this world does not recognise is refused, not approximated', () => {
    for (const line of ['travel:nowhere-at-all', 'talk:nobody-at-all', 'use:entity.nobody-at-all.look']) {
      const session = startSession(played());
      const ctx = newContext(session, view(session));
      const before = sessionStatus(session).location.id;

      const result = runLine(ctx, line);

      expect(result.output.some((each) => each.kind === 'message' && each.tone === 'error'), line).toBe(true);
      expect(sessionStatus(session).location.id, line).toBe(before);
    }
  });

  // c9's teeth, not just its prose: a line naming a command this player's vocabulary never
  // listed is refused before runLine ever sees it, regardless of whether the engine itself would
  // have honoured it.
  it("[c9] a line naming a command outside this player's audience is refused before runLine runs it", async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ line: '/dsl location tulsa.guide-house x: 9, y: 9', note: 'n', expected: '', confusion: '' }) };
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 1, at: PLAYED_AT, write: () => {} });
    expect(recorded.log[0].outcome).toBe('invalid-reply');
    expect(recorded.log[0].detail).toMatch(/\/dsl is not a command this player may run/);
  });

  // c8, and the refusal half of c6: a reply naming a token the view did not offer ends the turn
  // with a recorded failure rather than a guess — the loop never approximates to a nearby id.
  it('[c8] a reply naming an id the view never offered is refused, not approximated', async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ line: 'travel:somewhere-that-does-not-exist', note: 'n', expected: '', confusion: '' }) };
    const locationBefore = sessionStatus(session).location.id;
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 1, at: PLAYED_AT, write: () => {} });
    expect(recorded.log[0].outcome).toBe('refused');
    expect(recorded.log[0].detail).toMatch(/unknown location/);
    expect(sessionStatus(session).location.id).toBe(locationBefore);
  });

  // c8: the request constrains the reply to this branch's schema, and the loop parses no prose —
  // a reply missing a required field is refused, not read as free text.
  it('[c8] a structurally malformed reply is refused loudly', async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ line: 'whatever' }) };
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'author', turns: 1, at: PLAYED_AT, write: () => {} });
    expect(recorded.log[0].outcome).toBe('invalid-reply');
    expect(recorded.log[0].detail).toMatch(/line, note, expected, confusion/);
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
        return { line: choices[0].id, note: 'n', expected: '', confusion: '' };
      },
    };

    const { run: recorded } = await runPlaybot({ session, read, client, mode: 'author', turns: 4, at: PLAYED_AT, write: () => {} });

    expect(recorded.log[0].outcome).toBe('applied');
    expect(recorded.log[1].outcome).toBe('reload-failed');
    expect(recorded.log[1].detail.length).toBeGreaterThan(0);
    expect(recorded.log[2].outcome).toBe('applied');
    expect(recorded.log[3].outcome).toBe('applied');

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
      const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'author', turns: 8, at: PLAYED_AT, write: (line) => written.push(line) });

      expect(written).toHaveLength(recorded.log.length);
      expect(written.length).toBeGreaterThan(0);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  // --save: the start-anywhere lever. A run opened on a named fixture begins the turn loop in
  // exactly the state the save describes, not a fresh session — the same registry.saves lookup
  // the # test 'load' directive already uses (session.ts), read here instead of re-derived.
  it('[--save] a run opens in the state a named save describes', () => {
    const registry = played();
    const { session, warnings } = openSession(registry, 'tulsa.dresser-trinket-end');
    expect(warnings).toEqual([]);
    expect(view(session).location.id).toBe('tulsa.guide-house-upstairs');
  });

  // --save implies its own sources: with nothing named positionally, the default reader stands for
  // the shipped corpus, so every fixture the corpus declares can be opened by --save alone. Both
  // halves derive their subjects — the files from the directory, the fixtures from the registry —
  // so a module or a # save added next month is covered with no edit here.
  it('[--save] the default sources are the whole shipped corpus, and every fixture in it opens', () => {
    const read = fileContentReader(DEFAULT_SOURCES);
    const named = read().map((source) => source.name).sort();
    const shipped = shippedFiles().map((file) => file.replace(/\.dsl$/, '')).sort();
    expect(named).toEqual(shipped);

    const loaded = loadUniverseWithDiagnostics(read());
    expect(loaded.diagnostics.map(String)).toEqual([]);
    const fixtures = [...loaded.registry.saves.keys()];
    expect(fixtures.length).toBeGreaterThan(0);
    for (const id of fixtures) {
      expect(() => openSession(loaded.registry, id), id).not.toThrow();
    }
  });

  it('[--save] an id naming no save is refused with a message listing what exists, not a stack trace', () => {
    const registry = played();
    // Every id the registry holds, read off the registry: a fixture added to the corpus next month
    // is one this refusal has to name, and naming one by hand here is how that stopped being true.
    const refusal = (): unknown => resolveSave(registry, 'no-such-fixture-at-all');
    expect(refusal).toThrow(/no # save with that id\. Defined: /);
    for (const id of registry.saves.keys()) expect(refusal, id).toThrow(id);
    expect(() => openSession(registry, 'no-such-fixture-at-all')).toThrow(/no # save with that id/);
  });

  it('renderView describes the offered choices and the current location', () => {
    const session = startSession(played());
    const text = renderView({ ...sessionStatus(session), said: [] } as unknown as Parameters<typeof renderView>[0], sessionLocalizer(session));
    expect(text).toContain('location:');
    expect(text).toContain('choices:');
  });
});
