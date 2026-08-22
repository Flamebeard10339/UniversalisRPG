import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { withEngineLocale } from '../src/content/engineLocale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { askedOption, COMMANDS, findCommand, newContext, runLine, type CommandContext, type CommandResult, type CommandSpec } from '../src/runtime/command';
import { adoptRegistry, startSession, view, type PlaySession, type PlayView } from '../src/runtime/session';

// scripts/playbot.ts holds one live session and calls the model once per turn — see
// docs/specs/a-turn-costs-what-the-last-turn-did.md, whose clauses this file exists to satisfy.

export const repoRoot = path.join(import.meta.dirname, '..');

export const PLAYBOT_MODES = ['author', 'bughunt'] as const;
export type PlaybotMode = (typeof PLAYBOT_MODES)[number];

const SHARED_INTRO = `You are playing Universalis RPG, a text game, through a programmatic loop rather than a chat conversation. Each message you receive is one turn: it shows you everything visible from the current moment, and you answer with exactly one structured reply. You do not see the turns before this one directly — instead, a short journal of the last several turns is included above the view, summarizing what you tried and what happened. Treat that journal as your memory of the run; nothing else persists between turns.

The world is described entirely through the view you are given: a location, what is here, what you can do, and — when the world is asking you something directly — a screen you must answer before anything else. You are the player, not the author and not the engine: everything you do goes through this game's own command line, one line per turn, using only the exact tokens the current view hands you or the direct actions listed below.`;

function playerCommands(): readonly CommandSpec[] {
  return COMMANDS.filter((spec) => spec.match === 'name' && spec.audience === 'player');
}

function commandLine(spec: CommandSpec): string {
  const spelling = [spec.name, ...spec.aliases].join(', ');
  const label = spec.argHint ? `${spelling} ${spec.argHint}` : spelling;
  return `- ${label} — ${spec.summary}`;
}

// Read off COMMANDS rather than written out, so a command's audience is the one place that
// decides both what /help lists for an author and what this block tells the model exists.
function playerVocabularyBlock(): string {
  return playerCommands().map(commandLine).join('\n');
}

const SHARED_MECHANISM = `## How you act

Every turn ends with exactly one JSON object, matching this shape:

{
  "line": "<one line of input, exactly as this game's own command line accepts it>",
  "note": "<one short sentence: what you just decided and why>",
  "expected": "<one short sentence: something you looked for here and could not do, or an empty string if nothing>",
  "confusion": "<one short sentence: anything that read as unclear, contradictory, or unfinished, or an empty string if nothing>"
}

"line" is sent to the same command line a human plays this game through, verbatim and unmodified — there is no second channel and no structured alternative. Two shapes of "line" cover almost every turn:

- If the view lists choices, "line" is a choice id copied character-for-character from one of them. Never invent an id, never guess one from a pattern you have seen elsewhere, never renumber or reorder a list to make one up. If the id is not printed in this turn's view, it does not exist for this turn.
- If the view shows an open screen (a modal — dialogue, character creation, an inventory screen, a crafting confirmation, anything the world is actively asking you), "line" is "submit-modal: <key>=<value>", using the exact key the screen names and, when it lists values, one of those values verbatim. Free-text fields (like a character's name) take a short plain-text value instead of a listed one. A modal always takes priority: while one is open there are no choices alongside it, and you must answer it before anything else happens.

Beyond those two shapes, the command line also answers to a small set of direct actions a player — never this game's own authors — may use without a choice being offered first:

${playerVocabularyBlock()}

Reach for one of these only when it is the clearest way to say what you are doing (an "equip: <item>" once an item is in hand, a "/wait <seconds>" to let something finish); the choice ids and modal answers above are how most turns are spent. A reply naming anything this turn's view did not offer, or a line this game's own command line refuses for any reason, is refused outright and the turn ends without your action having any effect — the loop does not try to guess what you meant, and does not fall back to the closest match. If you are unsure what is available, re-read the view rather than reusing something you remember from an earlier turn: ids can stop existing when an author edits the world mid-run, and a dialogue option's value is only ever its current position, not a name that survives being reordered.`;

const SHARED_PRODUCT = `## What your reply is for

"note" is a running commentary — keep it to one plain sentence, in your own voice, about what you are doing and why. It is not read by the engine, only by whoever reads the run log afterward.

"expected" and "confusion" are the actual point of this exercise. You are not just moving through the world — you are the first read of it. Every time you reach for something that is not there — an action you would expect to be able to take here, an object the room describes but does not let you touch, a verb that exists everywhere else but not on this one thing — say so in "expected", specifically enough that whoever reads it later knows exactly what is missing and where. Every time something reads as unclear, unfinished, self-contradictory, or like it is announcing a fact that never pays off — a room that keeps mentioning something with no way to interact with it, text that promises a consequence nothing delivers — say so in "confusion". Leave both empty only when there is truly nothing to report: do not pad them with something trivial to seem thorough, and do not leave them empty out of politeness when something genuinely did not work. A run that only records the moves you made and never records what you could not do has produced nothing anyone can act on.`;

const SHARED_STOPPING = `## Ending the run

"blocked" is normally an empty string. Put a sentence in it only when you judge the run genuinely cannot continue — the one path forward is refused every time you take it, every option leads back to the same wall, or the world has stopped responding to anything you do. Setting it ends the run immediately, so say what is blocking you and what you last tried.

Two things about this. Saying a bug is severe in "confusion" does not stop anything; only "blocked" does, and a report that a run is unrecoverable followed by another attempt at the same refused line is worth less than stopping. And do not use it for a single refusal or an ordinary dead end: retry, try another way in, and reserve it for the case where you have run out of ways in.`;

const AUTHOR_FRAMING = `## Your situation: early, unfinished content

You are playtesting a zone that is still being written. Assume gaps are the normal state of things, not a sign you have done something wrong — an unfinished room is exactly what you are here to find. Be an eager, curious player rather than a cautious one: try the things a careful reader would skip, talk to everyone twice, open every screen that offers itself, attempt an action even when you are not sure it is meant to work yet. Your "expected" notes are the actual deliverable of this run — they become a work list for whoever is writing this content next, so favor being concrete and specific over being brief. If a room announces an object with no way to interact with it, or a character mentions something with no dialogue node behind it, that is exactly the kind of thing worth naming.`;

const BUGHUNT_FRAMING = `## Your situation: a finished zone, under adversarial review

You are testing a zone the author considers done, looking specifically for what breaks it: dead ends with no way forward, a resource that can be spent to zero with no way to recover it, a modal that leaves no answerable option, a quest flag set by one path but read by a different one, an action that changes something the text never mentions changing. Play less like an eager explorer and more like someone trying to break the game on purpose — take the edge-case option, walk away from an unfinished conversation and see what state it leaves behind, spend a resource down before trying the thing that needs it. A softlock or an inconsistency is worth far more here than a smooth completion; if a turn goes exactly as expected, say so briefly and move on, but the moment something is inconsistent, unreachable, or leaves you stuck, that goes in "confusion" in as much diagnostic detail as you can give — what you did immediately before it happened matters as much as what happened.`;

const SHARED_EXAMPLE = `## A worked example

Suppose the view shows:

  location: The Guide House (tutorial-island.guide-house)
  here: Miki, the front door, a mirror
  choices:
    id=talk:tutorial-island.miki :: Talk to Miki
    id=use:entity.tutorial-island.mirror.look-in :: Look in the mirror
    id=travel:tutorial-island.beach :: Travel to the beach

A reasonable reply is:

  {"line":"use:entity.tutorial-island.mirror.look-in","note":"Trying the mirror before talking to anyone, since it is the first thing described in the room.","expected":"","confusion":""}

If that opens a screen asking for a name, the next turn's view shows a modal instead of choices, something like:

  open screen: character-creation — asks name:
    value=<free text>

and the next reply answers that modal directly:

  {"line":"submit-modal: name=Ash","note":"Naming the character now that the mirror is asking.","expected":"","confusion":""}

When a screen lists values instead, each one is printed on its own line and the thing you send after the "=" is the token after \`value=\`, never the words after \`::\` — those are only there so you know what you are picking:

  open screen: dialogue — asks choice:
    value=0 :: Sounds good. Teach me.
    value=1 :: Not now.

answered with {"line":"submit-modal: choice=0", ...}. Sending "submit-modal: choice=Sounds good. Teach me." there is refused, because it is the label and not the value.

Notice the second reply does not repeat the mirror action or reference the choices from the previous turn — those choices do not exist while the modal is open, and answering it is the only thing this turn can do.`;

const SHARED_TAIL = `## A few standing rules

- Answer only with the JSON object described above. Nothing before it, nothing after it, no markdown fence around it.
- If the same modal or dead end reappears turn after turn with no way out, say so plainly in "confusion" rather than quietly repeating the same failed attempt — the run log needs to be able to tell a stuck loop from a slow, considered playthrough.
- You are one player on one save. You cannot inspect the source, cannot see what an id "should" be, and cannot act outside a turn's own view — anything you cannot see this turn, you do not know this turn.`;

const MODE_FRAMING: Record<PlaybotMode, string> = {
  author: AUTHOR_FRAMING,
  bughunt: BUGHUNT_FRAMING,
};

export function systemPromptFor(mode: PlaybotMode): string {
  return [SHARED_INTRO, SHARED_MECHANISM, SHARED_PRODUCT, SHARED_STOPPING, MODE_FRAMING[mode], SHARED_EXAMPLE, SHARED_TAIL].join('\n\n');
}

export interface TurnReply {
  readonly line: string;
  readonly note: string;
  readonly expected: string;
  readonly confusion: string;
  // Non-empty when the player judges the run cannot go on. A run that keeps asking after the
  // world has stopped answering buys nothing and spends the plan it is drawn against.
  readonly blocked: string;
}

export interface TurnRequest {
  readonly system: string;
  readonly turn: number;
  readonly journal: string;
  readonly view: string;
}

export interface TurnUsage {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

export interface ModelClient {
  send(request: TurnRequest): Promise<unknown>;
  // What the last send billed, when the client is one that knows. A fake does not, and c2 keeps
  // every test on a fake, so this is how a live run answers the half of c5 the suite cannot.
  lastUsage?(): TurnUsage | null;
}

interface AppliedEntry {
  readonly turn: number;
  readonly outcome: 'applied' | 'refused';
  readonly line: string;
  readonly note: string;
  readonly expected: string;
  readonly confusion: string;
  readonly blocked: string;
  readonly detail: string;
}

interface SkippedEntry {
  readonly turn: number;
  readonly outcome: 'reload-failed' | 'invalid-reply';
  readonly detail: string;
}

export type RunLogEntry = AppliedEntry | SkippedEntry;

export const JOURNAL_WINDOW = 10;

export function describeEntry(entry: RunLogEntry): string {
  if ('line' in entry) {
    const stopping = entry.blocked === '' ? '' : `; BLOCKED: ${entry.blocked}`;
    return `turn ${entry.turn} [${entry.outcome}] ${entry.line} — note: ${entry.note || '(none)'}; expected: ${entry.expected || '(none)'}; confusion: ${entry.confusion || '(none)'}${stopping}; result: ${entry.detail}`;
  }
  return `turn ${entry.turn} [${entry.outcome}] ${entry.detail}`;
}

export function journalWindowText(log: readonly RunLogEntry[]): string {
  const windowed = log.slice(-JOURNAL_WINDOW);
  if (windowed.length === 0) return '(run just started; no turns yet)';
  return windowed.map(describeEntry).join('\n');
}

// A player who cannot see what it holds reports the world as poorer than it is: the first spike
// blamed content four times over an object it was carrying and could not find. The claim in
// scripts/playbot.test.ts reads its subjects off a live view, so a field added to PlayStatus
// cannot go unshown here without something saying so.
export const NOT_SHOWN: ReadonlyArray<{ field: keyof PlayView; why: string }> = [
  { field: 'inventory', why: 'the same holdings as `carried`, keyed by id and without names or counts, so showing both states one fact twice' },
  { field: 'grown', why: 'which held items are instances, which `carried` already reports as its own `grown` flag' },
  { field: 'planes', why: 'the jewel plane of an item, reached through a modal and published as one for as long as it is open' },
  { field: 'focus', why: 'which screen is being shown, which the open-screen line already says in the words the player reads' },
  { field: 'modals', why: 'rendered as the open screen, carrying the key and the values this turn has to answer' },
  { field: 'flags', why: 'the engine bookkeeping behind what the world says. A player learns a quest has moved by being told so, and reading the flags would let it act on content it has not met' },
  { field: 'locations', why: 'every location the registry holds, discovered or not. `discovered` is the half the player has walked to, and handing over the rest is what c9 exists to refuse' },
];

function renderResources(v: PlayView): string[] {
  return v.resources.map((each) => `${each.title} ${each.current}/${each.max}`);
}

function renderCarried(v: PlayView): string[] {
  return v.carried.map((each) => `${each.id} (${each.shown})${each.count > 1 ? ` x${each.count}` : ''}${each.worn ? ` worn:${each.worn.slot}` : ''}`);
}

function renderEquipment(v: PlayView): string[] {
  return v.equipment.map((row) => (row.name === null ? String(row.title) : `${row.title}: ${row.name}`));
}

function renderJournal(v: PlayView): string[] {
  return v.journal.map((entry) => `${entry.title} [${entry.standing}]${entry.hint === null ? '' : ` — next: ${entry.hint}`}`);
}

function renderDiscovered(v: PlayView): string[] {
  return v.discovered.map((each) => `${each.title}${each.adjacent.length === 0 ? '' : ` → ${each.adjacent.filter((edge) => edge.open).map((edge) => edge.to).join(' ')}`}`);
}

function renderEncounter(v: PlayView): string[] {
  return v.encounter === null ? [] : v.encounter.foes.map((foe) => `${foe.title} ${foe.current}/${foe.max}`);
}

// Every line of a turn is labelled with the name the view itself gives the field, so that the
// claim in scripts/playbot.test.ts can read what must appear off a live view rather than off a
// second list of labels that would drift from it.
function labelled(field: keyof PlayView, held: readonly string[]): string[] {
  return held.length === 0 ? [] : [`${field}: ${held.join(', ')}`];
}

export function renderView(v: PlayView): string {
  const parts: string[] = [
    ...labelled('said', v.said.map((line) => String(line))),
    `location: ${v.location.title} (${v.location.id})${v.location.description ? ` — ${v.location.description}` : ''}`,
    ...labelled('entities', v.entities.map((entity) => String(entity.title))),
    ...labelled('resources', renderResources(v)),
    ...labelled('encounter', renderEncounter(v)),
    ...labelled('carried', renderCarried(v)),
    ...labelled('equipment', renderEquipment(v)),
    ...labelled('xp', v.xp.map((row) => `${row.title} level ${row.level}`)),
    ...labelled('stats', v.stats.map((row) => `${row.title} ${row.value}`)),
    ...labelled('journal', renderJournal(v)),
    ...labelled('discovered', renderDiscovered(v)),
    ...labelled('player', [v.player.name, v.player.race].filter((each) => each !== '')),
    ...labelled('journey', v.journey === null ? [] : [`travelling to ${v.journey.to} by ${v.journey.legs.join(' ')}`]),
    ...labelled('action', v.action === null ? [] : [`${v.action.label} ${Math.round(v.action.completion * 100)}% done, ${v.action.attempts} attempts`]),
  ];

  const asking = askedOption(v.modals);
  if (asking) {
    parts.push(`open screen: ${v.modals[v.modals.length - 1].name} — asks ${asking.key}:`);
    if (asking.values) for (const choice of asking.values) parts.push(`  value=${choice.value} :: ${String(choice.shown)}`);
    else parts.push('  value=<free text>');
  } else if (v.choices.length > 0) {
    parts.push('choices:');
    for (const choice of v.choices) parts.push(`  id=${choice.id} :: ${String(choice.label)}`);
  } else {
    parts.push('choices: (nothing offers itself here)');
  }

  parts.push(`time: ${v.time}`);
  return parts.join('\n');
}

export function renderPrompt(request: TurnRequest): string {
  return `Turn ${request.turn}\n\n${request.journal}\n\n${request.view}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? (value[key] as string) : undefined;
}

// A command the audience field marks as anything but 'player' is not in the vocabulary this
// prompt offered, so a line naming one is refused here rather than handed to runLine — the one
// place that classification has to make a behavioural difference, not just a prompt-text one.
function offMenuCommand(line: string): CommandSpec | undefined {
  const token = line.trim().split(/[ \t]+/)[0];
  const spec = token === undefined ? undefined : findCommand(token);
  return spec && spec.audience !== 'player' ? spec : undefined;
}

export function parseReply(raw: unknown): { ok: true; reply: TurnReply } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'reply is not a JSON object' };
  const line = stringField(raw, 'line');
  const note = stringField(raw, 'note');
  const expected = stringField(raw, 'expected');
  const confusion = stringField(raw, 'confusion');
  if (line === undefined || note === undefined || expected === undefined || confusion === undefined) {
    return { ok: false, error: 'reply is missing one of line, note, expected, confusion as a string' };
  }
  if (line.trim() === '') return { ok: false, error: 'reply.line is empty' };
  const offMenu = offMenuCommand(line);
  if (offMenu) return { ok: false, error: `${offMenu.name} is not a command this player may run` };
  return { ok: true, reply: { line, note, expected, confusion, blocked: stringField(raw, 'blocked') ?? '' } };
}

function summarize(v: PlayView): string {
  const said = v.said.map((line) => String(line)).join(' ').trim();
  return said.length > 0 ? said : `arrived at ${v.location.title}`;
}

// The engine, not this file, decides what a line refuses: an error-toned message in the result
// is the one signal command.ts already gives every driver, so reading it is not a second
// validation layer beside runLine — it is how the CLI and the GUI already tell success from
// refusal too.
function refusalMessages(result: CommandResult): string[] {
  return result.output.flatMap((output) => (output.kind === 'message' && output.tone === 'error' ? [String(output.text)] : []));
}

function settleTurn(result: CommandResult, before: PlayView): { outcome: 'applied' | 'refused'; detail: string } {
  const refusals = refusalMessages(result);
  if (refusals.length > 0) return { outcome: 'refused', detail: refusals.join('; ') };
  return { outcome: 'applied', detail: summarize(result.view ?? before) };
}

export type ContentReader = () => readonly ModuleSource[];

export function reloadInto(session: PlaySession, read: ContentReader): { ok: true } | { ok: false; message: string } {
  let sources: readonly ModuleSource[];
  try {
    sources = read();
  } catch (error) {
    return { ok: false, message: `content read failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  const loaded = loadUniverseWithDiagnostics(sources);
  if (loaded.diagnostics.length > 0) {
    return { ok: false, message: loaded.diagnostics.map((diagnostic) => formatModuleDiagnostic(diagnostic)).join('; ') };
  }
  adoptRegistry(session, loaded.registry);
  return { ok: true };
}

export interface RunTurnDeps {
  readonly ctx: CommandContext;
  readonly read: ContentReader;
  readonly client: ModelClient;
  readonly system: string;
  readonly log: readonly RunLogEntry[];
  readonly turn: number;
}

export async function runTurn(deps: RunTurnDeps): Promise<RunLogEntry> {
  const reloaded = reloadInto(deps.ctx.session, deps.read);
  if (!reloaded.ok) return { turn: deps.turn, outcome: 'reload-failed', detail: reloaded.message };

  deps.ctx.view = view(deps.ctx.session);
  const request: TurnRequest = { system: deps.system, turn: deps.turn, journal: journalWindowText(deps.log), view: renderView(deps.ctx.view) };

  let raw: unknown;
  try {
    raw = await deps.client.send(request);
  } catch (error) {
    return { turn: deps.turn, outcome: 'invalid-reply', detail: error instanceof Error ? error.message : String(error) };
  }

  const parsed = parseReply(raw);
  if (!parsed.ok) return { turn: deps.turn, outcome: 'invalid-reply', detail: parsed.error };

  const before = deps.ctx.view;
  const result = runLine(deps.ctx, parsed.reply.line);
  const { outcome, detail } = settleTurn(result, before);

  return { turn: deps.turn, outcome, line: parsed.reply.line, note: parsed.reply.note, expected: parsed.reply.expected, confusion: parsed.reply.confusion, blocked: parsed.reply.blocked, detail };
}

export interface PlaybotOptions {
  readonly session: PlaySession;
  readonly read: ContentReader;
  readonly client: ModelClient;
  readonly mode: PlaybotMode;
  readonly turns: number;
  readonly write: (line: string) => void;
}

// A player that says it is stuck is believed at once. A player that does not say so is still cut
// off, because the run measured on 2026-08-22 called its own bug severe and run-blocking on turn
// twenty and went on asking for three more turns: saying so and stopping are not the same act.
export const REFUSALS_BEFORE_STOPPING = 4;

function stoppedBy(log: readonly RunLogEntry[]): string | null {
  const last = log[log.length - 1];
  if (last !== undefined && 'blocked' in last && last.blocked !== '') return `the player stopped the run: ${last.blocked}`;
  const tail = log.slice(-REFUSALS_BEFORE_STOPPING);
  if (tail.length < REFUSALS_BEFORE_STOPPING || !tail.every((entry) => entry.outcome === 'refused')) return null;
  return `${REFUSALS_BEFORE_STOPPING} turns in a row were refused, the last of them: ${tail[tail.length - 1].detail}`;
}

export async function runPlaybot(options: PlaybotOptions): Promise<RunLogEntry[]> {
  const system = systemPromptFor(options.mode);
  const ctx = newContext(options.session, view(options.session));
  const log: RunLogEntry[] = [];
  for (let turn = 1; turn <= options.turns; turn++) {
    const entry = await runTurn({ ctx, read: options.read, client: options.client, system, log, turn });
    log.push(entry);
    const billed = options.client.lastUsage?.() ?? null;
    options.write(billed === null ? describeEntry(entry) : `${describeEntry(entry)} [billed ${billed.input} in, ${billed.cacheRead} cached read, ${billed.cacheWrite} cached write]`);
    const stopping = stoppedBy(log);
    if (stopping !== null) {
      options.write(`run ended after turn ${turn}: ${stopping}`);
      return log;
    }
  }
  return log;
}

const REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['line', 'note', 'expected', 'confusion', 'blocked'],
  properties: {
    line: { type: 'string' },
    note: { type: 'string' },
    expected: { type: 'string' },
    confusion: { type: 'string' },
    blocked: { type: 'string' },
  },
} as const;

const MODEL_ID = 'claude-sonnet-5';
// A turn picks one of a handful of printed options and says why in a sentence. Deliberation buys
// nothing here and is the difference between a run of five hundred turns and a run of fifty.
const TURN_EFFORT = 'low';

// The fourth opt-out c4 needs: settingSources/tools alone still leave a turn naming this
// repository's own working directory, git status and CLAUDE.md, because those ride a section a
// string systemPrompt does not remove. Only a cwd outside the repository takes them out.
export function sdkOptionsFor(system: string, cwd: string): Options {
  return {
    systemPrompt: system,
    settingSources: [],
    tools: [],
    cwd,
    model: MODEL_ID,
    effort: TURN_EFFORT,
    outputFormat: { type: 'json_schema', schema: REPLY_JSON_SCHEMA as unknown as Record<string, unknown> },
  };
}

export function isolatedCwd(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'universalis-playbot-'));
}

export function createSdkModelClient(cwd: string): ModelClient {
  let usage: TurnUsage | null = null;
  return {
    lastUsage: () => usage,
    async send(request) {
      usage = null;
      const stream = query({ prompt: renderPrompt(request), options: sdkOptionsFor(request.system, cwd) });
      for await (const message of stream) {
        if (message.type === 'result') {
          const billed = message.usage as unknown as Record<string, number> | undefined;
          usage = billed === undefined ? null : { input: billed.input_tokens ?? 0, cacheRead: billed.cache_read_input_tokens ?? 0, cacheWrite: billed.cache_creation_input_tokens ?? 0 };
          if (message.subtype === 'success') return message.structured_output;
          throw new Error(`playbot turn did not complete: ${message.subtype}`);
        }
      }
      throw new Error('playbot turn produced no result message');
    },
  };
}

const DEFAULT_FILES = ['content/tutorial-island.dsl', 'content/tutorial-quests.dsl'];
const DEFAULT_TURNS = 100;

function fileContentReader(files: readonly string[]): ContentReader {
  return () =>
    withEngineLocale(
      files.map((file) => ({
        name: path.basename(file).replace(/\.[^.]*$/, ''),
        text: readFileSync(path.resolve(repoRoot, file), 'utf8'),
      })),
    );
}

interface CliArgs {
  readonly files: readonly string[];
  readonly mode: PlaybotMode;
  readonly turns: number;
}

function requireMode(value: string | undefined): PlaybotMode {
  const found = PLAYBOT_MODES.find((mode) => mode === value);
  if (found !== undefined) return found;
  throw new Error(`--mode must be one of ${PLAYBOT_MODES.join(', ')}, got ${JSON.stringify(value)}`);
}

function requireTurns(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--turns must be a positive integer, got ${JSON.stringify(value)}`);
  return parsed;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let mode: PlaybotMode = 'author';
  let turns = DEFAULT_TURNS;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      mode = requireMode(argv[++i]);
      continue;
    }
    if (arg.startsWith('--mode=')) {
      mode = requireMode(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--turns') {
      turns = requireTurns(argv[++i]);
      continue;
    }
    if (arg.startsWith('--turns=')) {
      turns = requireTurns(arg.slice('--turns='.length));
      continue;
    }
    files.push(arg);
  }
  return { files: files.length > 0 ? files : DEFAULT_FILES, mode, turns };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const read = fileContentReader(args.files);
  const loaded = loadUniverseWithDiagnostics(read());
  for (const diagnostic of loaded.diagnostics) console.error(formatModuleDiagnostic(diagnostic));
  const session = startSession(loaded.registry);
  const client = createSdkModelClient(isolatedCwd());
  const log = await runPlaybot({ session, read, client, mode: args.mode, turns: args.turns, write: (line) => console.log(line) });
  process.exitCode = log.some((entry) => entry.outcome === 'applied' || entry.outcome === 'refused') ? 0 : 1;
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) main();
