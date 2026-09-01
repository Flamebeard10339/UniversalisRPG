import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withEngineLocale } from '../src/content/engineLocale';
import { loadUniverse, loadUniverseWithDiagnostics } from '../src/content/load';
import type { Registry } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { askedOption, COMMANDS, isChoiceLine, newContext, runLine } from '../src/runtime/command';
import { journalWindowText, NO_NOTES, NOTE_FIELDS, runAsSections, runId, type RunLogEntry } from '../src/runtime/runLog';
import { runTest, sessionLocalizer, sessionStatus, startSession, view, type PlaySession } from '../src/runtime/session';
import { createGameState } from '../src/runtime/runtime';
import {
  authorsTheWorld,
  DEFAULT_MODE,
  DEFAULT_SOURCES,
  fileContentReader,
  isolatedDir,
  localChangesFile,
  openSession,
  parseArgs,
  parseReply,
  reportedIn,
  reloadInto,
  renderPrompt,
  renderView,
  repoRoot,
  resolveSave,
  runPlaybot,
  runTurn,
  sdkOptionsFor,
  PLAYBOT_MODE_NAMES,
  modeSpec,
  REFUSALS_BEFORE_STOPPING,
  systemPromptFor,
  type ContentReader,
  type ModelClient,
  type TurnRequest,
} from './playbot';
import { fileAuthoring } from './play-cli';
import { fixtureSources } from '../src/content/worldFixture';

// The island and quest actually played: the standing world and nothing else — deliberately not the
// whole shipped corpus, so the archetype pack Tulsa names optionally is absent and a run here never
// meets a jewel. Read off the corpus rather than listed, so a module the tutorial comes to lean on
// is played here the day it does.
const PLAYED_MODULES = fixtureSources().map((source) => source.name);

// The world actually played, the same one session.test.ts drives.
const PLAYED_SOURCES: ModuleSource[] = [...fixtureSources()];
const played = (): Registry => loadUniverse(PLAYED_SOURCES);

const constantReader = (sources: readonly ModuleSource[]): ContentReader => () => sources;

const tutorialReader: ContentReader = () => [...fixtureSources()];

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
    await runTurn({ ctx: ctxA, read: constantReader(PLAYED_SOURCES), client: recording, mode: 'reader', brief: '', log: [], turn: 1, turns: 1, report: () => {} });
    await runTurn({ ctx: ctxB, read: constantReader(PLAYED_SOURCES), client: recording, mode: 'bughunter', brief: '', log: [], turn: 1, turns: 1, report: () => {} });

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
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'reader', turns: 5, at: PLAYED_AT, write: () => {} });
    expect(recorded.log).toHaveLength(5);
    expect(recorded.log.every((entry) => entry.outcome === 'applied' || entry.outcome === 'refused')).toBe(true);
  });

  // A bot run and an author's run are one kind of thing. What the model played comes back as the
  // two sections that replay it against the same corpus, which is what makes a found bug watchable
  // rather than a paragraph somebody has to re-enact by hand.
  it('comes back as the # test that replays it, against the corpus it was played on', async () => {
    const session = startSession(played());
    const kept = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'reader', turns: 6, at: PLAYED_AT, write: () => {} });

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
    const system = systemPromptFor('reader');
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
    const cwd = isolatedDir();
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
    await runPlaybot({ session, read: tutorialReader, client: recording, mode: 'bughunter', turns: 6, at: PLAYED_AT, write: () => {} });

    expect(requests).toHaveLength(6);
    const distinctSystems = new Set(requests.map((request) => request.system));
    expect(distinctSystems.size).toBe(1);
    expect(requests[0].system.length).toBeGreaterThan(0);
  });

  // A run's turns are its budget, and a player told only which turn it is on cannot spend one
  // knowing what it costs. So every turn opens by naming both, off the same `turns` the loop
  // counts to — there is no second place the horizon is written.
  it('opens every turn by naming the turn it is on and how many the run has', async () => {
    const session = startSession(played());
    const TURNS = 4;
    const requests: TurnRequest[] = [];
    const recording: ModelClient = {
      send: async (request) => {
        requests.push(request);
        return wellBehavedReply(session);
      },
    };
    await runPlaybot({ session, read: tutorialReader, client: recording, mode: 'reader', turns: TURNS, at: PLAYED_AT, write: () => {} });

    expect(requests).toHaveLength(TURNS);
    for (const request of requests) {
      expect(request.turns).toBe(TURNS);
      expect(renderPrompt(request).split('\n')[0]).toBe(`Turn ${request.turn} of ${TURNS}`);
    }
  });

  // c5, the other half: byte identity is necessary and not sufficient. A frozen prefix under
  // 1024 tokens does not cache at all, so a run that passes the clause above and sits under the
  // floor is re-billed in full on every turn and looks correct while doing it. Measured in
  // characters because the tokenizer is not in this repository; 4096 is 1024 tokens at four
  // characters each, which is the conservative end of English prose.
  const CACHE_FLOOR_CHARS = 4096;
  it.each(PLAYBOT_MODE_NAMES)('[c5] the %s prefix clears the floor under which nothing caches', (mode) => {
    expect(systemPromptFor(mode).length).toBeGreaterThan(CACHE_FLOOR_CHARS);
  });

  // The shape a turn is recorded in is shared with the app's own playtest recorder, and the
  // schema and the parser already read it. The prompt is the one thing that cannot: it is a page
  // of prose tuned for a model, not a form label. So a field added to the list fails here until
  // the prose that tells the model what to put in it is written.
  it.each(PLAYBOT_MODE_NAMES)('the %s prompt asks for every field a recorded turn carries', (mode) => {
    const unasked = NOTE_FIELDS.filter((field) => !systemPromptFor(mode).includes(`"${field.name}"`));
    expect(unasked.map((field) => field.name)).toEqual([]);
  });

  it('[c1] the reply schema takes exactly the line and the fields a recorded turn carries', () => {
    const schema = sdkOptionsFor('THE SYSTEM PROMPT', isolatedDir()).outputFormat as unknown as { schema: { required: string[]; properties: Record<string, unknown> } };
    const expected = ['line', ...NOTE_FIELDS.map((field) => field.name)];
    expect(schema.schema.required).toEqual(expected);
    expect(Object.keys(schema.schema.properties)).toEqual(expected);
  });


  // Narrowed for free text: the loop builds no
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
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'reader', turns: 20, at: PLAYED_AT, write: (line) => lines.push(line) });

    expect(asked).toBe(2);
    expect(recorded.log).toHaveLength(2);
    expect(lines[lines.length - 2]).toContain('every way on is refused');
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
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'reader', turns: 30, at: PLAYED_AT, write: (line) => lines.push(line) });

    expect(asked).toBe(REFUSALS_BEFORE_STOPPING);
    expect(recorded.log.every((entry) => entry.outcome === 'refused' || entry.outcome === 'invalid-reply')).toBe(true);
    expect(lines[lines.length - 2]).toContain('in a row were refused');
  });

  it('[c6] a line drawn from the view it was taken from is accepted, never refused as unrecognised', () => {
    const session = startSession(played());
    const ctx = newContext(session, view(session));
    let exercised = 0;
    for (let i = 0; i < 40; i++) {
      const before = sessionStatus(session);
      if (before.choices.length === 0 && before.modals.length === 0) break;
      const raw = wellBehavedReply(session);
      const parsed = parseReply(raw, modeSpec('reader'));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      exercised += 1;

      const result = runLine(ctx, parsed.reply.line);
      const refusals = result.output.filter((each) => each.kind === 'message' && each.tone === 'error');
      expect(refusals, parsed.reply.line).toEqual([]);
    }
    expect(exercised).toBeGreaterThan(10);
  });

  // Measured on the bughunter run of 2026-08-29: told `blocked` was normally an empty string, the
  // model wrote the two characters that spell one, and the run stopped on turn 44 having reported
  // nothing. Every note field is for a sentence, so what carries no letter and no digit carries
  // none — which is also what keeps a stray quote from passing for the report an edit is gated on.
  describe('a note field that spells emptiness rather than being empty', () => {
    const reply = (blocked: string) => parseReply({ line: '/look', note: 'n', expected: '', confusion: '', blocked }, modeSpec('bughunter'));

    it.each(['""', "''", '  ', '-', '(none)'.replace(/[a-z]/g, '.')])('says nothing when it holds %j', (written) => {
      const parsed = reply(written);
      expect(parsed.ok && parsed.reply.blocked).toBe('');
    });

    it('still carries a sentence that has words in it', () => {
      const parsed = reply('Every way out of this room is refused.');
      expect(parsed.ok && parsed.reply.blocked).toBe('Every way out of this room is refused.');
    });
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
    const client: ModelClient = { send: async () => ({ line: '/dsl location first-steps.guide-house x: 9, y: 9', note: 'n', expected: '', confusion: '' }) };
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'reader', turns: 1, at: PLAYED_AT, write: () => {} });
    expect(recorded.log[0].outcome).toBe('invalid-reply');
    expect(recorded.log[0].detail).toMatch(/\/dsl is not a command this player may run/);
  });

  // A mode is one declaration, and both readings of it — what its prompt offers and what its
  // replies may carry — come off the same `audiences`. The subjects are every mode there is and
  // every command there is, so a mode or a command added next month is covered with no edit.
  describe('a mode is the audiences it declares, read the same way twice', () => {
    it.each(PLAYBOT_MODE_NAMES)('%s lists in its prompt exactly the commands it will let through', (mode) => {
      const prompt = systemPromptFor(mode, 'a brief');
      for (const spec of COMMANDS) {
        if (spec.match !== 'name') continue;
        const offered = modeSpec(mode).audiences.includes(spec.audience);
        expect(prompt.includes(`- ${[spec.name, ...spec.aliases].join(', ')}`), `${mode}: ${spec.name}`).toBe(offered);
        const refusal = parseReply({ line: `${spec.name} whatever`, note: 'n', expected: '', confusion: '' }, modeSpec(mode));
        expect(refusal.ok, `${mode}: ${spec.name}`).toBe(offered);
        if (!refusal.ok) expect(refusal.error, `${mode}: ${spec.name}`).toContain(`${spec.name} is not a command this player may run`);
      }
    });

    it('reads and writes are told apart by the modes, not by one list of them', () => {
      const reading = PLAYBOT_MODE_NAMES.filter((mode) => !modeSpec(mode).audiences.includes('author'));
      const writing = PLAYBOT_MODE_NAMES.filter((mode) => modeSpec(mode).audiences.includes('author'));
      expect(reading.length).toBeGreaterThan(0);
      expect(writing.length).toBeGreaterThan(0);
      expect(PLAYBOT_MODE_NAMES.filter((mode) => modeSpec(mode).carriesBrief)).toHaveLength(1);
    });

    it('carries the brief it was given, and only where the mode declares one', () => {
      for (const mode of PLAYBOT_MODE_NAMES) {
        expect(systemPromptFor(mode, 'author the ball-of-a-boy quest').includes('author the ball-of-a-boy quest'), mode).toBe(modeSpec(mode).carriesBrief);
      }
    });

    it('answers --mode author by naming both of the things it used to mean', () => {
      const refused = (): unknown => parseArgs(['--mode', 'author']);
      expect(refused).toThrow(/retired/);
      expect(refused).toThrow('--mode reader');
      expect(refused).toThrow('--mode briefed');
      expect(parseArgs([]).mode).toBe(DEFAULT_MODE);
      expect(PLAYBOT_MODE_NAMES).toContain(DEFAULT_MODE);
    });

    it('will not run a briefed mode with no brief, nor a brief with no mode that reads one', () => {
      expect(() => parseArgs(['--mode', 'briefed'])).toThrow(/carries a brief and none was given/);
      expect(() => parseArgs(['--mode', 'reader', '--brief', 'job.md'])).toThrow(/carries no brief/);
      expect(parseArgs(['--mode', 'briefed', '--brief', 'job.md']).briefFile).toBe('job.md');
    });

    // The same shape the authorbot takes it in, and the reason is the shape rather than a guard on
    // it: a path holds no newline, so there is nothing for a shell to cut a brief in half at.
    it('takes the brief as a file, so a multi-line one cannot arrive as its own first line', () => {
      expect(() => parseArgs(['--mode', 'briefed', '--brief', '--turns'])).toThrow(/wants the file/);
      expect(parseArgs(['--mode', 'briefed', '--brief', 'job.md', '--turns', '7'])).toMatchObject({ briefFile: 'job.md', turns: 7 });
    });
  });

  // The report is the half of a playtest that cannot be re-derived from the other, so a bot that
  // may edit does not get to skip it. The gate is read off the same journal window the model is
  // shown, so there is nothing stored and no field on the reply to drift from the notes.
  describe('an edit waits on a report', () => {
    const editing = (lines: readonly unknown[]): ModelClient => {
      let at = 0;
      return { send: async () => lines[Math.min(at++, lines.length - 1)] };
    };
    const STAGES = { line: '/dsl item first-steps.gem title: Gem', note: 'writing it', expected: '', confusion: '' };

    it('refuses the edit while nothing behind it reports anything, and takes it once something does', async () => {
      const session = startSession(played());
      const { run: recorded } = await runPlaybot({
        session,
        read: tutorialReader,
        client: editing([STAGES, { line: '/look', note: 'looking', expected: 'a gem to pick up, and there is none', confusion: '' }, STAGES]),
        mode: 'briefed',
        brief: 'add a gem',
        turns: 3,
        at: PLAYED_AT,
        write: () => {},
      });

      expect(recorded.log[0].outcome).toBe('invalid-reply');
      expect(recorded.log[0].detail).toMatch(/\/dsl edits the world/);
      expect(recorded.log[1].outcome).toBe('applied');
      // Staged for real this time: refused only because this session has no file to write into,
      // which is a different refusal from the gate's and the point of telling them apart.
      expect(recorded.log[2].detail).not.toMatch(/edits the world/);
    });

    it('names every field a report may be written in, off the fields themselves', () => {
      const reporting = NOTE_FIELDS.filter((field) => field.reports);
      expect(reporting.length).toBeGreaterThan(0);
      expect(reportedIn([])).toBe(false);
      for (const field of reporting) {
        expect(reportedIn([{ turn: 1, outcome: 'applied', line: '/look', directives: [], detail: '', notes: { ...NO_NOTES, [field.name]: 'something' } }]), field.name).toBe(true);
      }
      for (const field of NOTE_FIELDS.filter((each) => !each.reports)) {
        expect(reportedIn([{ turn: 1, outcome: 'applied', line: '/look', directives: [], detail: '', notes: { ...NO_NOTES, [field.name]: 'something' } }]), field.name).toBe(false);
      }
    });

    it('lets a reading mode past untouched, because it could not have edited anything anyway', async () => {
      const session = startSession(played());
      const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client: editing([STAGES]), mode: 'reader', turns: 1, at: PLAYED_AT, write: () => {} });
      expect(recorded.log[0].detail).toMatch(/not a command this player may run/);
    });
  });

  // What a run cost, which is the question an operator asks before commissioning a second one.
  // Summed off the turns already logged rather than tallied beside them.
  it('closes with what the run cost: turns, seconds, and the four token totals summed', async () => {
    const session = startSession(played());
    const lines: string[] = [];
    let clock = 1000;
    const billed = { input: 10, cacheRead: 20, cacheWrite: 30, output: 40 };
    const client: ModelClient = { send: async () => wellBehavedReply(session), lastUsage: () => billed };
    const TURNS = 5;

    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'reader', turns: TURNS, at: PLAYED_AT, now: () => (clock += 500), write: (line) => lines.push(line) });

    expect(recorded.log).toHaveLength(TURNS);
    const summary = lines[lines.length - 1];
    expect(summary).toContain(`run of ${TURNS} turn(s)`);
    expect(summary).toContain('0.5s');
    expect(summary).toContain(`${billed.input * TURNS} in`);
    expect(summary).toContain(`${billed.cacheRead * TURNS} cached read`);
    expect(summary).toContain(`${billed.cacheWrite * TURNS} cached write`);
    expect(summary).toContain(`${billed.output * TURNS} out`);
    // Every turn's own line says what that turn billed, output included.
    for (const line of lines.slice(0, TURNS)) expect(line).toContain(`${billed.output} out`);
  });

  it('says nothing was billed rather than four zeroes, where the client does not know', async () => {
    const session = startSession(played());
    const lines: string[] = [];
    await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'reader', turns: 2, at: PLAYED_AT, write: (line) => lines.push(line) });
    expect(lines[lines.length - 1]).toContain('nothing billed');
  });

  // c8, and the refusal half of c6: a reply naming a token the view did not offer ends the turn
  // with a recorded failure rather than a guess — the loop never approximates to a nearby id.
  it('[c8] a reply naming an id the view never offered is refused, not approximated', async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ line: 'travel:somewhere-that-does-not-exist', note: 'n', expected: '', confusion: '' }) };
    const locationBefore = sessionStatus(session).location.id;
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'reader', turns: 1, at: PLAYED_AT, write: () => {} });
    expect(recorded.log[0].outcome).toBe('refused');
    expect(recorded.log[0].detail).toMatch(/unknown location/);
    expect(sessionStatus(session).location.id).toBe(locationBefore);
  });

  // c8: the request constrains the reply to this branch's schema, and the loop parses no prose —
  // a reply missing a required field is refused, not read as free text.
  it('[c8] a structurally malformed reply is refused loudly', async () => {
    const session = startSession(played());
    const client: ModelClient = { send: async () => ({ line: 'whatever' }) };
    const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client, mode: 'reader', turns: 1, at: PLAYED_AT, write: () => {} });
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

    const { run: recorded } = await runPlaybot({ session, read, client, mode: 'reader', turns: 4, at: PLAYED_AT, write: () => {} });

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
      const { run: recorded } = await runPlaybot({ session, read: tutorialReader, client: wellBehavedClient(session), mode: 'reader', turns: 8, at: PLAYED_AT, write: (line) => written.push(line) });

      // A line per turn, and the one line the run itself writes: what it cost.
      expect(written).toHaveLength(recorded.log.length + 1);
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
    // The save and the place it stands in are read off the registry rather than named, so a sheet
    // written next month opens the same way with nothing edited here.
    const [id] = [...registry.saves.keys()].filter((each) => typeof registry.saves.get(each)!.diff.location === 'string');
    expect(id, 'no # save names a location, so opening on one proves nothing').toBeDefined();
    const stood = String(registry.saves.get(id!)!.diff.location);
    const { session, warnings } = openSession(registry, id!);

    expect(warnings).toEqual([]);
    expect(view(session).location.id).toBe(stood);
  });

  // --save implies its own sources: with nothing named positionally, the default reader stands for
  // a whole world, so every fixture that world declares can be opened by --save alone. Both halves
  // derive their subjects — the files from the directory, the fixtures from the registry — so a
  // module or a # save added next month is covered with no edit here. Which directories the default
  // names is `SHIPPED_DIRS`, and that it is the shipped ones is `shipped.ts`'s to say.
  it('[--save] the default sources are read off a directory apiece, and every fixture in one opens', () => {
    const read = fileContentReader(DEFAULT_SOURCES);
    const named = read().map((source) => source.name);
    expect(named.length).toBeGreaterThan(fixtureSources().length);

    const loaded = loadUniverseWithDiagnostics(constantReader(fixtureSources())());
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

  // A run's turns are its budget, and the mask must not spend any of them: the room is read before
  // the model is asked anything, so a turn still buys a move on the quest. The subjects come off the
  // view the loop actually handed over, so a thing standing somewhere next month is covered here.
  it('reads the room on arrival, so no turn is spent lifting a mask and nothing reaches the model under one', async () => {
    const session = startSession(played());
    const ctx = newContext(session, view(session));
    const asked: TurnRequest[] = [];
    const client: ModelClient = {
      send: async (request) => {
        asked.push(request);
        return wellBehavedReply(session);
      },
    };

    const masked = sessionStatus(session).entities.filter((entity) => entity.masked);
    expect(masked.length, 'the opening room has to hold a mask for this to be asking anything').toBeGreaterThan(0);

    const entry = await runTurn({ ctx, read: tutorialReader, client, mode: 'reader', brief: '', log: [], turn: 1, turns: 1, report: () => undefined });

    expect(entry.turn).toBe(1);
    expect(asked).toHaveLength(1);
    expect(ctx.view.entities.filter((entity) => entity.masked)).toEqual([]);
    for (const entity of masked) expect(asked[0].view, entity.id).toContain(String(ctx.view.entities.find((each) => each.id === entity.id)!.title));
  });

  it('renderView describes the offered choices and the current location', () => {
    const session = startSession(played());
    const text = renderView({ ...sessionStatus(session), said: [] } as unknown as Parameters<typeof renderView>[0], sessionLocalizer(session));
    expect(text).toContain('location:');
    expect(text).toContain('choices:');
  });
});

// Where the bytes land is asserted together with where they do not: a run that stages into the
// checkout it was launched from is a second writer in somebody else's tree, and the file it lands
// on is the one the terminal and the app both stage through.
describe('a run stages where it was told and nowhere else', () => {
  const CHECKOUT_LOCAL = path.join(repoRoot, 'content', 'local-changes.dsl');

  const answering = (replies: readonly Record<string, string>[]): ModelClient => ({
    send: async (request) => replies[request.turn - 1],
  });

  it('stages outside this checkout unless an operator names a file inside it', () => {
    expect(path.relative(repoRoot, localChangesFile(undefined))).toMatch(/^\.\./);
    expect(localChangesFile('content/local-changes.dsl')).toBe('content/local-changes.dsl');
  });

  it('writes a staged section into the file it was given and creates no other', async () => {
    const dir = isolatedDir();
    const local = path.join(dir, 'bot-local.dsl');
    const standing = existsSync(CHECKOUT_LOCAL);
    const session = startSession(played());
    const kept = await runPlaybot({
      session,
      read: tutorialReader,
      client: answering([
        { line: '/help', note: 'looking around', expected: 'nothing here names a gem', confusion: '' },
        { line: '/dsl item local-changes.bot-gem title: Gem | examine: Cut bright.', note: 'writing it', expected: '', confusion: '' },
      ]),
      mode: 'bughunter',
      turns: 2,
      at: '2026-01-01T00:00:00.000Z',
      authoring: () => fileAuthoring(() => PLAYED_SOURCES, local),
      write: () => undefined,
    });

    expect(kept.run.log[1].outcome).toBe('applied');
    expect(readFileSync(local, 'utf8')).toContain('# item local-changes.bot-gem');
    expect(existsSync(CHECKOUT_LOCAL)).toBe(standing);
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(PLAYBOT_MODE_NAMES)('%s asks for a staging file only if it runs an authoring command', async (mode) => {
    let asked = false;
    const session = startSession(played());
    await runPlaybot({
      session,
      read: tutorialReader,
      client: { send: async () => wellBehavedReply(session) },
      mode,
      turns: 1,
      at: '2026-01-01T00:00:00.000Z',
      authoring: () => {
        asked = true;
        return fileAuthoring(() => PLAYED_SOURCES, path.join(isolatedDir(), 'local-changes.dsl'));
      },
      write: () => undefined,
    });

    expect(asked).toBe(authorsTheWorld(mode));
  });
});
