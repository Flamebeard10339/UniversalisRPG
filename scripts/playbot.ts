import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { withEngineLocale } from '../src/content/engineLocale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { askedOption } from '../src/runtime/command';
import { adoptRegistry, apply, applyDirective, startSession, view, type PlaySession, type PlayView } from '../src/runtime/session';

// scripts/playbot.ts holds one live session and calls the model once per turn — see
// docs/specs/a-turn-costs-what-the-last-turn-did.md, whose clauses this file exists to satisfy.

export const repoRoot = path.join(import.meta.dirname, '..');

export const PLAYBOT_MODES = ['author', 'bughunt'] as const;
export type PlaybotMode = (typeof PLAYBOT_MODES)[number];

const SHARED_INTRO = `You are playing Universalis RPG, a text game, through a programmatic loop rather than a chat conversation. Each message you receive is one turn: it shows you everything visible from the current moment, and you answer with exactly one structured reply. You do not see the turns before this one directly — instead, a short journal of the last several turns is included above the view, summarizing what you tried and what happened. Treat that journal as your memory of the run; nothing else persists between turns.

The world is described entirely through the view you are given: a location, what is here, what you can do, and — when the world is asking you something directly — a screen you must answer before anything else. You are the player, not the author and not the engine: you can only act through the two mechanisms below, and only using the exact tokens the current view hands you.`;

const SHARED_MECHANISM = `## How you act

Every turn ends with exactly one JSON object, matching this shape:

{
  "action": { "kind": "choice", "id": "<a choice id copied verbatim from the view>" },
  "note": "<one short sentence: what you just decided and why>",
  "expected": "<one short sentence: something you looked for here and could not do, or an empty string if nothing>",
  "confusion": "<one short sentence: anything that read as unclear, contradictory, or unfinished, or an empty string if nothing>"
}

or, in place of the choice action:

{
  "action": { "kind": "modal", "key": "<the key the open screen is asking>", "value": "<a value copied verbatim from that option, or free text if none are offered>" },
  "note": "...", "expected": "...", "confusion": "..."
}

There are exactly two shapes for "action", because the engine has exactly two ways of taking an input:

- If the view lists choices, answer with a "choice" action, and "id" must be copied character-for-character from one of the listed choice ids. Never invent an id, never guess one from a pattern you have seen elsewhere, never renumber or reorder a list to make one up. If the id is not printed in this turn's view, it does not exist for this turn.
- If the view shows an open screen (a modal — dialogue, character creation, an inventory screen, a crafting confirmation, anything the world is actively asking you), answer with a "modal" action instead, using the exact "key" the screen names and, when it lists values, one of those values verbatim. Free-text fields (like a character's name) take a short plain-text answer instead of a listed value. A modal always takes priority: while one is open there are no choices alongside it, and you must answer it before anything else happens.

A reply naming a token this turn's view did not offer is refused outright and the turn ends without your action having any effect — the loop does not try to guess what you meant, and does not fall back to the closest match. If you are unsure what is available, re-read the view rather than reusing something you remember from an earlier turn: ids can stop existing when an author edits the world mid-run, and a dialogue option's value is only ever its current position, not a name that survives being reordered.`;

const SHARED_PRODUCT = `## What your reply is for

"note" is a running commentary — keep it to one plain sentence, in your own voice, about what you are doing and why. It is not read by the engine, only by whoever reads the run log afterward.

"expected" and "confusion" are the actual point of this exercise. You are not just moving through the world — you are the first read of it. Every time you reach for something that is not there — an action you would expect to be able to take here, an object the room describes but does not let you touch, a verb that exists everywhere else but not on this one thing — say so in "expected", specifically enough that whoever reads it later knows exactly what is missing and where. Every time something reads as unclear, unfinished, self-contradictory, or like it is announcing a fact that never pays off — a room that keeps mentioning something with no way to interact with it, text that promises a consequence nothing delivers — say so in "confusion". Leave both empty only when there is truly nothing to report: do not pad them with something trivial to seem thorough, and do not leave them empty out of politeness when something genuinely did not work. A run that only records the moves you made and never records what you could not do has produced nothing anyone can act on.`;

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

  {"action":{"kind":"choice","id":"use:entity.tutorial-island.mirror.look-in"},"note":"Trying the mirror before talking to anyone, since it is the first thing described in the room.","expected":"","confusion":""}

If that opens a screen asking for a name, the next turn's view shows a modal instead of choices, something like:

  open screen: character-creation — asks name: (free text)

and the next reply answers that modal directly:

  {"action":{"kind":"modal","key":"name","value":"Ash"},"note":"Naming the character now that the mirror is asking.","expected":"","confusion":""}

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
  return [SHARED_INTRO, SHARED_MECHANISM, SHARED_PRODUCT, MODE_FRAMING[mode], SHARED_EXAMPLE, SHARED_TAIL].join('\n\n');
}

export type TurnAction = { readonly kind: 'choice'; readonly id: string } | { readonly kind: 'modal'; readonly key: string; readonly value: string };

export interface TurnReply {
  readonly action: TurnAction;
  readonly note: string;
  readonly expected: string;
  readonly confusion: string;
}

export interface TurnRequest {
  readonly system: string;
  readonly turn: number;
  readonly journal: string;
  readonly view: string;
}

export interface ModelClient {
  send(request: TurnRequest): Promise<unknown>;
}

interface AppliedEntry {
  readonly turn: number;
  readonly outcome: 'applied' | 'refused';
  readonly action: TurnAction;
  readonly note: string;
  readonly expected: string;
  readonly confusion: string;
  readonly detail: string;
}

interface SkippedEntry {
  readonly turn: number;
  readonly outcome: 'reload-failed' | 'invalid-reply';
  readonly detail: string;
}

export type RunLogEntry = AppliedEntry | SkippedEntry;

export const JOURNAL_WINDOW = 6;

function describeAction(action: TurnAction): string {
  return action.kind === 'choice' ? `choice ${action.id}` : `modal ${action.key}=${action.value}`;
}

export function describeEntry(entry: RunLogEntry): string {
  if ('action' in entry) {
    return `turn ${entry.turn} [${entry.outcome}] ${describeAction(entry.action)} — note: ${entry.note || '(none)'}; expected: ${entry.expected || '(none)'}; confusion: ${entry.confusion || '(none)'}; result: ${entry.detail}`;
  }
  return `turn ${entry.turn} [${entry.outcome}] ${entry.detail}`;
}

export function journalWindowText(log: readonly RunLogEntry[]): string {
  const windowed = log.slice(-JOURNAL_WINDOW);
  if (windowed.length === 0) return '(run just started; no turns yet)';
  return windowed.map(describeEntry).join('\n');
}

function fieldLine(label: string, text: string): string {
  return `${label}: ${text}`;
}

export function renderView(v: PlayView): string {
  const parts: string[] = [];
  if (v.said.length > 0) parts.push(v.said.map((line) => String(line)).join('\n'));
  parts.push(fieldLine('location', `${v.location.title} (${v.location.id})`));
  if (v.location.description) parts.push(String(v.location.description));
  if (v.entities.length > 0) parts.push(fieldLine('here', v.entities.map((entity) => String(entity.title)).join(', ')));

  const asking = askedOption(v.modals);
  if (asking) {
    const values = asking.values ? asking.values.map((choice) => `${choice.value}=${String(choice.shown)}`).join(', ') : '(free text)';
    parts.push(`open screen: ${v.modals[v.modals.length - 1].name} — asks ${asking.key}: ${values}`);
  } else if (v.choices.length > 0) {
    parts.push('choices:');
    for (const choice of v.choices) parts.push(`  id=${choice.id} :: ${String(choice.label)}`);
  } else {
    parts.push('(nothing offers itself here)');
  }

  parts.push(fieldLine('clock', String(v.time)));
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

export function parseReply(raw: unknown, v: PlayView): { ok: true; reply: TurnReply } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'reply is not a JSON object' };
  const note = stringField(raw, 'note');
  const expected = stringField(raw, 'expected');
  const confusion = stringField(raw, 'confusion');
  if (note === undefined || expected === undefined || confusion === undefined) {
    return { ok: false, error: 'reply is missing one of note, expected, confusion as a string' };
  }
  const rawAction = raw.action;
  if (!isRecord(rawAction)) return { ok: false, error: 'reply.action is not a JSON object' };

  if (rawAction.kind === 'choice') {
    const id = stringField(rawAction, 'id');
    if (id === undefined) return { ok: false, error: 'choice action is missing id' };
    if (!v.choices.some((choice) => choice.id === id)) return { ok: false, error: `chose an id this view did not offer: ${id}` };
    return { ok: true, reply: { action: { kind: 'choice', id }, note, expected, confusion } };
  }

  if (rawAction.kind === 'modal') {
    const key = stringField(rawAction, 'key');
    const value = stringField(rawAction, 'value');
    if (key === undefined || value === undefined) return { ok: false, error: 'modal action is missing key or value' };
    const asking = askedOption(v.modals);
    if (!asking) return { ok: false, error: 'no modal is open to answer' };
    if (key !== asking.key) return { ok: false, error: `answered a key the open screen did not ask: ${key}` };
    if (asking.values && !asking.values.some((choice) => choice.value === value)) return { ok: false, error: `named a value the asked option did not publish: ${value}` };
    return { ok: true, reply: { action: { kind: 'modal', key, value }, note, expected, confusion } };
  }

  return { ok: false, error: `reply.action.kind must be "choice" or "modal", got ${JSON.stringify(rawAction.kind)}` };
}

function summarize(v: PlayView): string {
  const said = v.said.map((line) => String(line)).join(' ').trim();
  return said.length > 0 ? said : `arrived at ${v.location.title}`;
}

export function applyAction(session: PlaySession, action: TurnAction): { outcome: 'applied' | 'refused'; detail: string } {
  if (action.kind === 'choice') {
    const v = apply(session, action.id);
    return { outcome: 'applied', detail: summarize(v) };
  }
  const result = applyDirective(session, { kind: 'submit-modal', key: action.key, value: action.value });
  const v = view(session);
  return result.failure ? { outcome: 'refused', detail: result.failure } : { outcome: 'applied', detail: summarize(v) };
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
  readonly session: PlaySession;
  readonly read: ContentReader;
  readonly client: ModelClient;
  readonly system: string;
  readonly log: readonly RunLogEntry[];
  readonly turn: number;
}

export async function runTurn(deps: RunTurnDeps): Promise<RunLogEntry> {
  const reloaded = reloadInto(deps.session, deps.read);
  if (!reloaded.ok) return { turn: deps.turn, outcome: 'reload-failed', detail: reloaded.message };

  const v = view(deps.session);
  const request: TurnRequest = { system: deps.system, turn: deps.turn, journal: journalWindowText(deps.log), view: renderView(v) };

  let raw: unknown;
  try {
    raw = await deps.client.send(request);
  } catch (error) {
    return { turn: deps.turn, outcome: 'invalid-reply', detail: error instanceof Error ? error.message : String(error) };
  }

  const parsed = parseReply(raw, v);
  if (!parsed.ok) return { turn: deps.turn, outcome: 'invalid-reply', detail: parsed.error };

  const applied = applyAction(deps.session, parsed.reply.action);
  return {
    turn: deps.turn,
    outcome: applied.outcome,
    action: parsed.reply.action,
    note: parsed.reply.note,
    expected: parsed.reply.expected,
    confusion: parsed.reply.confusion,
    detail: applied.detail,
  };
}

export interface PlaybotOptions {
  readonly session: PlaySession;
  readonly read: ContentReader;
  readonly client: ModelClient;
  readonly mode: PlaybotMode;
  readonly turns: number;
  readonly write: (line: string) => void;
}

export async function runPlaybot(options: PlaybotOptions): Promise<RunLogEntry[]> {
  const system = systemPromptFor(options.mode);
  const log: RunLogEntry[] = [];
  for (let turn = 1; turn <= options.turns; turn++) {
    const entry = await runTurn({ session: options.session, read: options.read, client: options.client, system, log, turn });
    log.push(entry);
    options.write(describeEntry(entry));
  }
  return log;
}

const REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'note', 'expected', 'confusion'],
  properties: {
    note: { type: 'string' },
    expected: { type: 'string' },
    confusion: { type: 'string' },
    action: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['kind', 'id'], properties: { kind: { const: 'choice' }, id: { type: 'string' } } },
        { type: 'object', additionalProperties: false, required: ['kind', 'key', 'value'], properties: { kind: { const: 'modal' }, key: { type: 'string' }, value: { type: 'string' } } },
      ],
    },
  },
} as const;

const MODEL_ID = 'claude-sonnet-5';

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
    outputFormat: { type: 'json_schema', schema: REPLY_JSON_SCHEMA as unknown as Record<string, unknown> },
  };
}

export function isolatedCwd(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'universalis-playbot-'));
}

export function createSdkModelClient(cwd: string): ModelClient {
  return {
    async send(request) {
      const stream = query({ prompt: renderPrompt(request), options: sdkOptionsFor(request.system, cwd) });
      for await (const message of stream) {
        if (message.type === 'result') {
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
