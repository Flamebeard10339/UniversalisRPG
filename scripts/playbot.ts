import { sourceFiles } from './lib/dslSources';import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { withEngineLocale } from '../src/content/engineLocale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import type { ParsedSave } from '../src/content/sections/save';
import { CORPUS_DIR } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { askedOption, COMMANDS, findCommand, newContext, outcomeOf, runLine, type AuthoringContext, type CommandAudience, type CommandContext, type CommandOutput, type CommandResult, type CommandSpec } from '../src/runtime/command';
import type { Localizer } from '../src/runtime/localized';
import type { PruneWarning } from '../src/runtime/pruning';
import { blocking, describeEntry, journalWindow, journalWindowText, NO_NOTES, NOTE_FIELDS, runAsSections, runId, turnRecord, type KeptRun, type RunLogEntry, type RunNotes } from '../src/runtime/runLog';
import { adoptRegistry, loadSaved, readRoom, serializeSession, sessionLocalizer, sheetOffers, standingLine, startSession, view, type PlaySession, type PlayView } from '../src/runtime/session';
import { fileAuthoring } from './play-cli';
import { formatFocus, formatOutput, printed } from './lib/replLines';


// scripts/playbot.ts holds one live session and calls the model once per turn — see
// docs/specs/a-turn-costs-what-the-last-turn-did.md, whose clauses this file exists to satisfy.

export const repoRoot = path.join(import.meta.dirname, '..');

// A mode is one declaration and nothing else: the framing it plays under, which of the command
// line's audiences it may run, and whether it is turned loose on the world or handed a job. The
// vocabulary its prompt lists and the lines its replies may carry are both read off `audiences`,
// so a mode cannot offer a command it would then refuse, or refuse one it offered.
export interface PlaybotModeSpec {
  readonly framing: string;
  readonly audiences: readonly CommandAudience[];
  readonly carriesBrief: boolean;
}

const SHARED_INTRO = `You are playing Universalis RPG, a text game, through a programmatic loop rather than a chat conversation. Each message you receive is one turn: it shows you everything visible from the current moment, and you answer with exactly one structured reply. You do not see the turns before this one directly — instead, a short journal of the last several turns is included above the view, summarizing what you tried and what happened. Treat that journal as your memory of the run; nothing else persists between turns.

The world is described entirely through the view you are given: a location, what is here, what you can do, and — when the world is asking you something directly — a screen you must answer before anything else. Everything you do goes through this game's own command line, one line per turn, using only the exact tokens the current view hands you or the direct actions listed below.`;

const PLAYER_ONLY = `You are the player, not the author and not the engine.`;

const PLAYER_AND_AUTHOR = `You are the player first and the author second: you walk the world the way anybody else would, and you may also change what you walk through. Both go down the same command line, and playing is what tells you what is worth changing.`;

function vocabulary(mode: PlaybotModeSpec): readonly CommandSpec[] {
  return COMMANDS.filter((spec) => spec.match === 'name' && mode.audiences.includes(spec.audience));
}

function commandLine(spec: CommandSpec): string {
  const spelling = [spec.name, ...spec.aliases].join(', ');
  const label = spec.argHint ? `${spelling} ${spec.argHint}` : spelling;
  return `- ${label} — ${spec.summary}`;
}

// Read off COMMANDS rather than written out, so a command's audience is the one place that
// decides both what /help lists for an author and what this block tells the model exists.
function vocabularyBlock(mode: PlaybotModeSpec): string {
  return vocabulary(mode).map(commandLine).join('\n');
}

const mechanismFor = (mode: PlaybotModeSpec): string => `## How you act

Every turn ends with exactly one JSON object, matching this shape:

{
  "line": "<one line of input, exactly as this game's own command line accepts it>",
  "note": "<one short sentence: what you just decided and why>",
  "expected": "<one short sentence: something you looked for here and could not do, or an empty string if nothing>",
  "confusion": "<one short sentence: anything that read as unclear, contradictory, or unfinished, or an empty string if nothing>"
}

"line" is sent to the same command line a human plays this game through, verbatim and unmodified — there is no second channel and no structured alternative. Two shapes of "line" cover almost every turn:

- If the view lists choices, "line" is a choice id copied character-for-character from one of them. Never invent an id, never guess one from a pattern you have seen elsewhere, never renumber or reorder a list to make one up. If the id is not printed in this turn's view, it does not exist for this turn.
- Anything printed as "?" is something nobody has looked at yet, and looking at it is the only thing it offers until someone has. That is not a fault and not a missing name: take the look, and the thing's own name and everything else it offers come back at once.
- If the view shows an open screen (a modal — dialogue, character creation, an inventory screen, a crafting confirmation, anything the world is actively asking you), "line" is "submit-modal: <key>=<value>", using the exact key the screen names and, when it lists values, one of those values verbatim. Free-text fields (like a character's name) take a short plain-text value instead of a listed one. A modal always takes priority: while one is open there are no choices alongside it, and you must answer it before anything else happens.

Beyond those two shapes, the command line also answers to a set of direct actions that may be used without a choice being offered first. ${mode.audiences.includes('author') ? "Some of these are this game's own authoring commands: in this mode you may change the world as well as walk through it, and everything below is yours to type." : "This is the player's set — this game's own authoring commands are not in it, and a line naming one is refused before the engine sees it."}

${vocabularyBlock(mode)}

Every one of those is available on every turn, in every location, whether or not this turn's view mentions it — the view lists what this place is offering you, never the whole of what you are able to do — and each one's own summary above is the complete account of what it does, so do not narrow it to the one use you have already seen it put to. Most turns are still spent on a choice id or a modal answer. But the view reports state as well as choices, and when its state is the thing that needs answering and no offered choice answers it — a pool sitting low, an action part-way through, an item in hand that nothing here invites you to use — the right turn is a direct action from that list, not a choice picked because it was printed. A reply naming anything this turn's view did not offer, or a line this game's own command line refuses for any reason, is refused outright and the turn ends without your action having any effect — the loop does not try to guess what you meant, and does not fall back to the closest match. If you are unsure what is available, re-read the view rather than reusing something you remember from an earlier turn: ids can stop existing when an author edits the world mid-run, and a dialogue option's value is only ever its current position, not a name that survives being reordered.`;

const SHARED_PRODUCT = `## What your reply is for

"note" is a running commentary — keep it to one plain sentence, in your own voice, about what you are doing and why. It is not read by the engine, only by whoever reads the run log afterward.

"expected" and "confusion" are the actual point of this exercise. You are not just moving through the world — you are the first read of it. Every time you reach for something that is not there — an action you would expect to be able to take here, an object the room describes but does not let you touch, a verb that exists everywhere else but not on this one thing — say so in "expected", specifically enough that whoever reads it later knows exactly what is missing and where. Every time something reads as unclear, unfinished, self-contradictory, or like it is announcing a fact that never pays off — a room that keeps mentioning something with no way to interact with it, text that promises a consequence nothing delivers — say so in "confusion". Leave both empty only when there is truly nothing to report: do not pad them with something trivial to seem thorough, and do not leave them empty out of politeness when something genuinely did not work. A run that only records the moves you made and never records what you could not do has produced nothing anyone can act on.

One thing about this world bears on "confusion" rather than on any single turn: a quest here is not meant to be trivial, and it is not going to tell you where to go next. The journal is your own notebook — it records what happened and what you are turning over, in your own voice, and it names no room, no route and no verb. Working out what to do next is the game, so not knowing is an ordinary state to be in and is not by itself a fault worth reporting. When you are stuck, that is the cue to look harder at where you are: examine what the room names, talk to whoever is standing in it and talk to them again, and look at what you are carrying — people are how you learn things here, and what they tell you is what your notes get written out of. Save "confusion" for a quest that contradicts itself, that told you something which turns out not to be true, or that you are stuck on after genuinely running out of things to try — never for a step that was simply not spelled out for you.`;

const SHARED_STOPPING = `## Ending the run

"blocked" is left empty on almost every turn — empty, not the two characters that spell an empty string. Put a sentence in it only when you judge the run genuinely cannot continue — the one path forward is refused every time you take it, every option leads back to the same wall, or the world has stopped responding to anything you do. Setting it ends the run immediately, so say what is blocking you and what you last tried.

Two things about this. Saying a bug is severe in "confusion" does not stop anything; only "blocked" does, and a report that a run is unrecoverable followed by another attempt at the same refused line is worth less than stopping. And do not use it for a single refusal or an ordinary dead end: retry, try another way in, and reserve it for the case where you have run out of ways in.`;

const READER_FRAMING = `## Your situation: early, unfinished content

You are playtesting a zone that is still being written. Assume gaps are the normal state of things, not a sign you have done something wrong — an unfinished room is exactly what you are here to find. Be an eager, curious player rather than a cautious one: try the things a careful reader would skip, talk to everyone twice, open every screen that offers itself, attempt an action even when you are not sure it is meant to work yet. Your "expected" notes are the actual deliverable of this run — they become a work list for whoever is writing this content next, so favor being concrete and specific over being brief. If a room announces an object with no way to interact with it, or a character mentions something with no dialogue node behind it, that is exactly the kind of thing worth naming.`;

const BUGHUNTER_FRAMING = `## Your situation: a finished zone, under adversarial review, that you may repair

You are testing a zone the author considers done, looking specifically for what breaks it: dead ends with no way forward, a resource that can be spent to zero with no way to recover it, a modal that leaves no answerable option, a quest flag set by one path but read by a different one, an action that changes something the text never mentions changing. Play less like an eager explorer and more like someone trying to break the game on purpose — take the edge-case option, walk away from an unfinished conversation and see what state it leaves behind, spend a resource down before trying the thing that needs it. A softlock or an inconsistency is worth far more here than a smooth completion; if a turn goes exactly as expected, say so briefly and move on, but the moment something is inconsistent, unreachable, or leaves you stuck, that goes in "confusion" in as much diagnostic detail as you can give — what you did immediately before it happened matters as much as what happened.

You may also fix what you find, with the authoring commands listed above. Reporting comes first and is not optional: a turn that edits is refused outright unless the turns behind it already carry a report in "expected" or "confusion". The report is the thing this run produces that nothing else can — a reader can work out the fix from the report, and cannot work out the report from the fix. So say what is wrong, in the turn you find it; then, if you can see the smallest edit that answers it, make it. Read before you write: /source shows you how a section like the one you are about to touch is already written, /grammar says what may stand in it, and /local show is what you have staged so far. Keep an edit to what your own report named.`;

const BRIEFED_FRAMING = `## Your situation: a job to do inside the world

You have been given a brief, printed below, and this run is for carrying it out. You are not sweeping the zone for whatever turns up: work on what the brief names, and let everything else past unless it stands in your way.

Play the part of the world your brief is about before you change any of it — a section written against a room nobody walked reads like a section written against a room nobody walked. Reporting comes first and is not optional here either: a turn that edits is refused outright unless the turns behind it already carry a report in "expected" or "confusion", so say what you found missing or wrong before you write anything to answer it.

Read before you write. /source shows how a section of the kind you are about to write is already written, and reading two or three of those teaches the language faster than anything else here; /grammar says what may stand under a kind, at the indentation it is written at; /local show is what you have staged so far, and /reload is what puts it into the world you are standing in. Write the smallest thing that answers the brief, reload it, and then go and walk it.`;

const SHARED_EXAMPLE = `## A worked example

Suppose the view shows:

  location: The Guide House (first-steps.guide-house)
  here: Miki, the front door, a mirror
  choices:
    id=talk:first-steps.miki :: Miki: Talk
    id=use:entity.first-steps.mirror.look-in :: Look in the mirror
    id=travel:tulsa.market-square :: Travel to the market square

A reasonable reply is:

  {"line":"use:entity.first-steps.mirror.look-in","note":"Trying the mirror before talking to anyone, since it is the first thing described in the room.","expected":"","confusion":""}

If that opens a screen asking for a name, the next turn's view shows a modal instead of choices, something like:

  open screen: choose-name — asks name:
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
- You are one player on one save, and anything you cannot see this turn you do not know this turn.`;

const READING_ONLY_TAIL = `- You cannot inspect the source and cannot see what an id "should" be: the view is the whole of what you have.`;

const EDITING_TAIL = `- What you can see of the source is what /source and /grammar hand you, and nothing else — there is no file, no directory listing and no editor here.
- An edit is staged the moment you type it and is in the world the moment you /reload. Walk what you wrote afterwards: a section that loads is not a section that plays.`;

const tailFor = (mode: PlaybotModeSpec): string => [SHARED_TAIL, mode.audiences.includes('author') ? EDITING_TAIL : READING_ONLY_TAIL].join('\n');

const briefBlock = (brief: string): string => `## Your brief\n\n${brief}`;

export const PLAYBOT_MODES = {
  reader: { framing: READER_FRAMING, audiences: ['player'], carriesBrief: false },
  bughunter: { framing: BUGHUNTER_FRAMING, audiences: ['player', 'author'], carriesBrief: false },
  briefed: { framing: BRIEFED_FRAMING, audiences: ['player', 'author'], carriesBrief: true },
} as const satisfies Record<string, PlaybotModeSpec>;

export type PlaybotMode = keyof typeof PLAYBOT_MODES;

export const PLAYBOT_MODE_NAMES = Object.keys(PLAYBOT_MODES) as readonly PlaybotMode[];

export const modeSpec = (mode: PlaybotMode): PlaybotModeSpec => PLAYBOT_MODES[mode];

export function systemPromptFor(mode: PlaybotMode, brief = ''): string {
  const spec = modeSpec(mode);
  return [
    SHARED_INTRO,
    spec.audiences.includes('author') ? PLAYER_AND_AUTHOR : PLAYER_ONLY,
    mechanismFor(spec),
    SHARED_PRODUCT,
    SHARED_STOPPING,
    spec.framing,
    ...(spec.carriesBrief ? [briefBlock(brief)] : []),
    SHARED_EXAMPLE,
    tailFor(spec),
  ].join('\n\n');
}

export interface TurnReply extends RunNotes {
  readonly line: string;
}

export interface TurnRequest {
  readonly system: string;
  readonly turn: number;
  readonly turns: number;
  readonly journal: string;
  readonly view: string;
}

export interface TurnUsage {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}

export interface ModelClient {
  send(request: TurnRequest): Promise<unknown>;
  // What the last send billed, when the client is one that knows. A fake does not, and c2 keeps
  // every test on a fake, so this is how a live run answers the half of c5 the suite cannot.
  lastUsage?(): TurnUsage | null;
}

function renderResources(v: PlayView): string[] {
  return v.resources.map((each) => `${each.title} ${each.current}/${each.max}`);
}

function renderCarried(v: PlayView): string[] {
  return v.carried.map((each) => `${each.id} (${each.shown})${each.worn ? ` worn:${each.worn.slot}` : ''}`);
}

function renderEquipment(v: PlayView): string[] {
  return v.equipment.map((row) => (row.name === null ? String(row.title) : `${row.title}: ${row.name}`));
}

// One line to a quest, the way a person glancing at a shelf of notebooks gets the spines. The whole of what any of them says is what /quests answers with, which is where a terminal player reads it too.
function renderJournal(v: PlayView): string[] {
  return v.journal.map((entry) => {
    const standing = standingLine(entry);
    return `${entry.title} [${entry.standing}]${standing === null ? '' : ` — ${String(standing)}`}`;
  });
}

function renderDiscovered(v: PlayView): string[] {
  return v.discovered.map((each) => `${each.title}${each.adjacent.length === 0 ? '' : ` → ${each.adjacent.filter((edge) => edge.open).map((edge) => edge.to).join(' ')}`}`);
}

// A location holds a count of its kind and not a roster, so the foe standing after a kill wears the
// id of the one that fell. Saying how many of its kind are left is what tells a player it is a new
// one at full health rather than the old one healing — two runs reported that as a broken fight.
function renderEncounter(v: PlayView): string[] {
  return v.encounter === null ? [] : v.encounter.foes.map((foe) => `${foe.title} ${foe.current}/${foe.max}${foe.remaining === null ? '' : ` (${foe.remaining} of its kind still standing here)`}`);
}

// The view decides which of an action's figures mean anything: `completion` arrives as null when
// there is no such reading to give, and this says nothing rather than inventing one. Reading it as
// a done-fraction had every turn of a fight printing "100% done" at a player who had just started.
function renderAction(action: NonNullable<PlayView['action']>): string[] {
  const counted = action.completion === null ? [] : [`${Math.round(action.completion * 100)}% of this cycle still to count`];
  const named = action.detail === undefined ? String(action.label) : `${action.label} · ${action.detail}`;
  return [[named, `${action.attempts} attempts this cycle`, `${Math.round(action.progress * 100)}% through the next`, ...counted].join(', ')];
}

// Every line of a turn is labelled with the name the view itself gives the field, so that the
// claim in scripts/playbot.test.ts can read what must appear off a live view rather than off a
// second list of labels that would drift from it.
function labelled(field: keyof PlayView, held: readonly string[]): string[] {
  return held.length === 0 ? [] : [`${field}: ${held.join(', ')}`];
}

export function renderView(v: PlayView, localizer: Localizer): string {
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
    ...labelled('player', Object.values(v.player).flatMap((row) => (row === null ? [] : [`${row.label} ${row.title}`]))),
    ...labelled('journey', v.journey === null ? [] : [`travelling to ${v.journey.to} by ${v.journey.legs.join(' ')}`]),
    ...labelled('action', v.action === null ? [] : renderAction(v.action)),
  ];

  const asking = askedOption(v.modals);
  if (asking) {
    // What the open screen is reading, where it is about something drawn beside the question
    // rather than in it — a quest's own notebook page, a jewel plane. Drawn through the same
    // function scripts/play-cli.ts draws it with, so a screen a player can read cannot be one
    // this player reaches and finds blank.
    parts.push(...formatFocus(v, localizer).map(printed));
    parts.push(`open screen: ${v.modals[v.modals.length - 1].name} — ${String(asking.label)}, answered as ${asking.key}:`);
    if (asking.values) for (const choice of asking.values) parts.push(`  value=${choice.value} :: ${String(choice.shown)}`);
    else parts.push('  value=<free text>');
  } else if (v.choices.length > 0) {
    // The same cut the app's sheet and the terminal's numbered list take: what is here and what is
    // one step out. A player reads the rest off /map, and so does this one — a bot shown every
    // discovered room is not playing the game a person plays, and a town of any size would spend
    // most of a turn's context listing roads.
    const sheet = sheetOffers(v);
    if (sheet.length > 0) {
      parts.push('choices:');
      // What the choice is offered by, which the terminal draws beside the label through
      // `engine.repl.choice.owned`. Without it three things standing here that can each be looked at
      // read as `Look`, `Look`, `Look`, told apart only by an id the model has to parse.
      for (const choice of sheet) parts.push(`  id=${choice.id} :: ${choice.detail === undefined ? '' : `${String(choice.detail)}: `}${String(choice.label)}`);
    }
    const further = v.choices.length - sheet.length;
    if (further > 0) parts.push(`further: ${further} place(s) a road reaches from here, under /map`);
  } else {
    parts.push('choices: (nothing offers itself here)');
  }

  parts.push(`time: ${v.time}`);
  return parts.join('\n');
}

export function renderPrompt(request: TurnRequest): string {
  return `Turn ${request.turn} of ${request.turns}\n\n${request.journal}\n\n${request.view}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? (value[key] as string) : undefined;
}

export function commandIn(line: string): CommandSpec | undefined {
  const token = line.trim().split(/[ \t]+/)[0];
  return token === undefined ? undefined : findCommand(token);
}

// A command whose audience this mode does not run is not in the vocabulary its prompt offered, so
// a line naming one is refused here rather than handed to runLine — the one place that
// classification has to make a behavioural difference, not just a prompt-text one.
function offMenuCommand(mode: PlaybotModeSpec, line: string): CommandSpec | undefined {
  const spec = commandIn(line);
  return spec && !mode.audiences.includes(spec.audience) ? spec : undefined;
}

// The first read is the thing this run produces that nothing else can, and a bot that may edit will
// answer a gap with a diff instead — the half that can be re-derived from the other. So an edit
// waits on a report: it is refused until the window the model is already being shown carries one.
// Read off the log the same way stoppedBy is, with nothing stored and no field on the reply.
const REPORTING_FIELDS = NOTE_FIELDS.filter((field) => field.reports);

export const reportedIn = (log: readonly RunLogEntry[]): boolean =>
  journalWindow(log).some((entry) => REPORTING_FIELDS.some((field) => entry.notes[field.name] !== ''));

function unreportedEdit(line: string, log: readonly RunLogEntry[]): string | null {
  const spec = commandIn(line);
  if (spec === undefined || !spec.edits || reportedIn(log)) return null;
  return `${spec.name} edits the world, and nothing behind this turn reports anything: say what is wrong in ${REPORTING_FIELDS.map((field) => field.name).join(' or ')} before you write anything to answer it`;
}

const DEMANDED = ['line', ...NOTE_FIELDS.filter((field) => field.required).map((field) => field.name)];

// A field told to be empty comes back holding a written-out empty string often enough to matter: a
// run was stopped on turn 44 by the two characters `""` in `blocked`. What every note field is for
// is a sentence, so one carrying no letter and no digit is carrying no sentence, whatever
// punctuation it spells that with — and the same reading keeps a stray quote from passing for the
// report an edit is gated on.
const reported = (said: string | undefined): string => (said !== undefined && /[\p{L}\p{N}]/u.test(said) ? said : '');

export function parseReply(raw: unknown, mode: PlaybotModeSpec): { ok: true; reply: TurnReply } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'reply is not a JSON object' };
  const line = stringField(raw, 'line');
  const notes = Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, stringField(raw, field.name)]));
  if (line === undefined || DEMANDED.some((name) => name !== 'line' && notes[name] === undefined)) {
    return { ok: false, error: `reply is missing one of ${DEMANDED.join(', ')} as a string` };
  }
  if (line.trim() === '') return { ok: false, error: 'reply.line is empty' };
  const offMenu = offMenuCommand(mode, line);
  if (offMenu) return { ok: false, error: `${offMenu.name} is not a command this player may run` };
  const said = Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, reported(notes[field.name])])) as RunNotes;
  return { ok: true, reply: { ...said, line } };
}

function summarize(v: PlayView): string {
  const said = v.said.map((line) => String(line)).join(' ').trim();
  return said.length > 0 ? said : `arrived at ${v.location.title}`;
}

// A view output is the only kind this reads nothing out of, because runTurn renders the view
// itself at the top of the very next turn: printing it here as well would put a second copy of the
// same screen into every entry the journal window carries.
export const ANSWER_NOT_SHOWN: ReadonlyArray<{ kind: CommandOutput['kind']; why: string }> = [
  { kind: 'view', why: 'the screen the next turn opens with, which runTurn renders in full before the model is asked anything; a copy of it here would ride in the journal window for ten turns after' },
];

const excusedKinds = new Set(ANSWER_NOT_SHOWN.map((each) => each.kind));

// What the line answered with, in the same words a player at scripts/play-cli.ts reads. Silence
// here is the capability gap this exists to close: a bot that types /quests and is told nothing
// has strictly less to go on than a person at the same command line.
export function answerLines(result: CommandResult, localizer: Localizer): string[] {
  const moved = result.view === undefined ? [] : [summarize(result.view)];
  return [...moved, ...result.output.flatMap((output) => (excusedKinds.has(output.kind) ? [] : formatOutput(output, localizer).map(printed)))];
}

export type ContentReader = () => readonly ModuleSource[];

export function reloadInto(session: PlaySession, read: ContentReader): { ok: true; pruned: readonly PruneWarning[] } | { ok: false; message: string } {
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
  return { ok: true, pruned: adoptRegistry(session, loaded.registry) };
}

export interface RunTurnDeps {
  readonly ctx: CommandContext;
  readonly read: ContentReader;
  readonly client: ModelClient;
  // The mode, not the prompt it makes: the framing the model is shown and the lines its reply may
  // carry are two readings of the one declaration, and passing them separately is how they drift.
  readonly mode: PlaybotMode;
  readonly brief: string;
  readonly log: readonly RunLogEntry[];
  readonly turn: number;
  readonly turns: number;
  // What an edit mid-run dropped out of this session. It goes to whoever is reading the run, not
  // into the turn's own entry: the player did not do it and has nothing to answer for it.
  readonly report: (line: string) => void;
}

export async function runTurn(deps: RunTurnDeps): Promise<RunLogEntry> {
  const reloaded = reloadInto(deps.ctx.session, deps.read);
  if (!reloaded.ok) return { turn: deps.turn, outcome: 'reload-failed', detail: reloaded.message, notes: NO_NOTES };
  for (const warning of reloaded.pruned) deps.report(`turn ${deps.turn} [pruned] ${warning.message}`);

  readRoom(deps.ctx.session);
  deps.ctx.view = view(deps.ctx.session);
  const localizer = sessionLocalizer(deps.ctx.session);
  const mode = modeSpec(deps.mode);
  const request: TurnRequest = { system: systemPromptFor(deps.mode, deps.brief), turn: deps.turn, turns: deps.turns, journal: journalWindowText(deps.log), view: renderView(deps.ctx.view, localizer) };

  let raw: unknown;
  try {
    raw = await deps.client.send(request);
  } catch (error) {
    return { turn: deps.turn, outcome: 'invalid-reply', detail: error instanceof Error ? error.message : String(error), notes: NO_NOTES };
  }

  const parsed = parseReply(raw, mode);
  if (!parsed.ok) return { turn: deps.turn, outcome: 'invalid-reply', detail: parsed.error, notes: NO_NOTES };

  // Refused with the turn's own notes kept, not dropped: the player said something here, and what
  // they said may be the report that lets the next turn through.
  const unreported = unreportedEdit(parsed.reply.line, deps.log);
  if (unreported !== null) return { turn: deps.turn, outcome: 'invalid-reply', detail: unreported, notes: parsed.reply };

  const result = runLine(deps.ctx, parsed.reply.line);
  return turnRecord(deps.turn, parsed.reply.line, outcomeOf(result), result.recorded, answerLines(result, sessionLocalizer(deps.ctx.session)), parsed.reply);
}

export interface PlaybotOptions {
  readonly session: PlaySession;
  readonly read: ContentReader;
  readonly client: ModelClient;
  readonly mode: PlaybotMode;
  readonly turns: number;
  readonly write: (line: string) => void;
  // When the run is played, which names the `# test` it comes back as. Passed in rather than read
  // off a clock here, so the caller owns the one instant the whole run is filed under.
  readonly at: string;
  // Where an authoring command writes, asked for rather than given: a mode that runs none never
  // calls this, so a reader run opens no staging file and the engine answers every authoring
  // command the way it answers a terminal started without a local file.
  readonly authoring?: () => AuthoringContext;
  readonly brief?: string;
  readonly now?: () => number;
}

const totalOf = (billed: readonly TurnUsage[], pick: (usage: TurnUsage) => number): number => billed.reduce((sum, usage) => sum + pick(usage), 0);

// What the run cost, summed off the turns already logged rather than tallied a second time
// alongside them. A client that does not know what it billed leaves the tokens unsaid rather than
// reporting four zeroes, which reads like a run that was free.
function costLine(turns: number, seconds: number, billed: readonly TurnUsage[]): string {
  const tokens =
    billed.length === 0
      ? 'nothing billed'
      : `${totalOf(billed, (usage) => usage.input)} in, ${totalOf(billed, (usage) => usage.cacheRead)} cached read, ${totalOf(billed, (usage) => usage.cacheWrite)} cached write, ${totalOf(billed, (usage) => usage.output)} out`;
  return `run of ${turns} turn(s) in ${seconds.toFixed(1)}s: ${tokens}`;
}

// A player that says it is stuck is believed at once. A player that does not say so is still cut
// off, because the run measured on 2026-08-22 called its own bug severe and run-blocking on turn
// twenty and went on asking for three more turns: saying so and stopping are not the same act.
export const REFUSALS_BEFORE_STOPPING = 4;

function stoppedBy(log: readonly RunLogEntry[]): string | null {
  const last = log[log.length - 1];
  if (last !== undefined && blocking(last) !== '') return `the player stopped the run: ${blocking(last)}`;
  const tail = log.slice(-REFUSALS_BEFORE_STOPPING);
  if (tail.length < REFUSALS_BEFORE_STOPPING || !tail.every((entry) => entry.outcome === 'refused')) return null;
  return `${REFUSALS_BEFORE_STOPPING} turns in a row were refused, the last of them: ${tail[tail.length - 1].detail}`;
}

// The run and the save it started from, which is what the app's own recorder keeps too: a bot run
// and an author's run are one kind of thing and come back written the same way.
export async function runPlaybot(options: PlaybotOptions): Promise<KeptRun> {
  const clock = options.now ?? Date.now;
  const started = clock();
  const ctx = newContext(options.session, view(options.session), { authoring: authorsTheWorld(options.mode) ? options.authoring?.() : undefined });
  const from = { bytes: serializeSession(options.session) };
  const id = runId(options.at);
  const log: RunLogEntry[] = [];
  const billed: TurnUsage[] = [];
  for (let turn = 1; turn <= options.turns; turn++) {
    const entry = await runTurn({ ctx, read: options.read, client: options.client, mode: options.mode, brief: options.brief ?? '', log, turn, turns: options.turns, report: options.write });
    log.push(entry);
    const usage = options.client.lastUsage?.() ?? null;
    if (usage !== null) billed.push(usage);
    options.write(usage === null ? describeEntry(entry) : `${describeEntry(entry)} [billed ${usage.input} in, ${usage.cacheRead} cached read, ${usage.cacheWrite} cached write, ${usage.output} out]`);
    const stopping = stoppedBy(log);
    if (stopping !== null) {
      options.write(`run ended after turn ${turn}: ${stopping}`);
      break;
    }
  }
  options.write(costLine(log.length, (clock() - started) / 1000, billed));
  return { run: { id, log }, from };
}

const REPLY_KEYS = ['line', ...NOTE_FIELDS.map((field) => field.name)];

const REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: REPLY_KEYS,
  properties: Object.fromEntries(REPLY_KEYS.map((key) => [key, { type: 'string' }])),
};

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

export function isolatedDir(): string {
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
          usage = billed === undefined ? null : { input: billed.input_tokens ?? 0, cacheRead: billed.cache_read_input_tokens ?? 0, cacheWrite: billed.cache_creation_input_tokens ?? 0, output: billed.output_tokens ?? 0 };
          if (message.subtype === 'success') return message.structured_output;
          throw new Error(`playbot turn did not complete: ${message.subtype}`);
        }
      }
      throw new Error('playbot turn produced no result message');
    },
  };
}

export const DEFAULT_SOURCES = [CORPUS_DIR];

// A run stages into a directory of its own unless an operator names a file, because the run that
// found this could not say --local: `npx` on Windows drops every argument after a multi-line one,
// and a default inside the checkout turns that into a second writer in somebody else's tree.
export function localChangesFile(named: string | undefined): string {
  return named ?? path.join(isolatedDir(), 'local-changes.dsl');
}

// Whether the run authors at all, read off the mode rather than asked for separately: a mode that
// offers no author command cannot reach an authoring context, so it is never handed one.
export const authorsTheWorld = (mode: PlaybotMode): boolean => modeSpec(mode).audiences.includes('author');

const DEFAULT_TURNS = 100;

// A directory is expanded on every read, not once at startup, so a module authored while the run
// is in flight arrives the same turn an edit to an already-named one does.
export function fileContentReader(sources: readonly string[]): ContentReader {
  return () =>
    withEngineLocale(
      sources
        .flatMap((source) => sourceFiles(path.resolve(repoRoot, source)))
        .map((file) => ({
          name: path.basename(file).replace(/\.[^.]*$/, ''),
          text: readFileSync(file, 'utf8'),
        })),
    );
}

export const DEFAULT_MODE: PlaybotMode = 'reader';

const modeUsage = (mode: PlaybotMode): string =>
  `             ${mode}${mode === DEFAULT_MODE ? ' (default)' : ''} — ${modeSpec(mode).audiences.join(' and ')} commands${modeSpec(mode).carriesBrief ? ', and wants --brief' : ''}`;

const usage = [
  `Usage: npm run playbot -- [<source>...] [--mode ${PLAYBOT_MODE_NAMES.join('|')}] [--brief <text>] [--turns <n>] [--save <id>]`,
  '',
  '  <source>   a DSL file to load, or a directory standing for the .dsl files in',
  '             it; with none, the content/ directory — the shipped corpus',
  '  --mode     which framing the run plays under, and what it may type:',
  ...PLAYBOT_MODE_NAMES.map(modeUsage),
  '  --brief    the job a briefed run is to carry out, in the operator\'s own words',
  '  --turns    how many turns to play, default 100',
  '  --save     open the run on a named # save fixture instead of a fresh session',
  '  --local    where an editing run stages what it writes; with none, a fresh',
  '             temporary directory outside this checkout, named when the run starts',
  '',
  'Plays the loaded content one turn at a time against a model client, logging',
  'each turn to stdout. Exits non-zero if no turn completed.',
].join('\n');

interface CliArgs {
  readonly sources: readonly string[];
  readonly mode: PlaybotMode;
  readonly brief: string;
  readonly turns: number;
  readonly save: string | undefined;
  readonly local: string | undefined;
}

// `author` named the exploratory framing and was also the only mode there was, so it now names two
// things and neither of them is a mode. Saying so beats the general refusal below, which would
// leave an operator to guess which of three replaced the one they typed.
const RETIRED: Readonly<Record<string, string>> = {
  author: '--mode author is retired: it framed a run that only reads and named the only run there was. The framing is --mode reader, and a run that may write is --mode bughunter (sweep and repair) or --mode briefed (carry out a job)',
};

function requireMode(value: string | undefined): PlaybotMode {
  const found = PLAYBOT_MODE_NAMES.find((mode) => mode === value);
  if (found !== undefined) return found;
  if (value !== undefined && RETIRED[value] !== undefined) throw new Error(RETIRED[value]);
  throw new Error(`--mode must be one of ${PLAYBOT_MODE_NAMES.join(', ')}, got ${JSON.stringify(value)}`);
}

function requireBrief(value: string | undefined): string {
  if (value === undefined || value.trim() === '') throw new Error(`--brief wants the job to be done after it\n\n${usage}`);
  return value;
}

// A brief is what a briefed run is for and is nothing to any other, so neither half of the pair is
// allowed to go missing quietly: a run turned loose under a brief nobody reads is a wasted run.
function requireBriefedPair(mode: PlaybotMode, brief: string): string {
  if (modeSpec(mode).carriesBrief === (brief !== '')) return brief;
  throw new Error(modeSpec(mode).carriesBrief ? `--mode ${mode} carries a brief and none was given: say what is to be done with --brief` : `--mode ${mode} carries no brief, and one was given. The mode that does is ${PLAYBOT_MODE_NAMES.filter((each) => modeSpec(each).carriesBrief).join(', ')}`);
}

function requireTurns(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--turns must be a positive integer, got ${JSON.stringify(value)}`);
  return parsed;
}

function requireSave(value: string | undefined): string {
  if (value === undefined) throw new Error(`--save wants a fixture id after it\n\n${usage}`);
  return value;
}

function requireLocal(value: string | undefined): string {
  if (value === undefined || value.startsWith('-')) throw new Error(`--local wants a file after it\n\n${usage}`);
  return value;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let mode: PlaybotMode = DEFAULT_MODE;
  let brief = '';
  let turns = DEFAULT_TURNS;
  let save: string | undefined;
  let local: string | undefined;
  const sources: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      throw new Error(usage);
    }
    if (arg === '--mode') {
      mode = requireMode(argv[++i]);
      continue;
    }
    if (arg.startsWith('--mode=')) {
      mode = requireMode(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--brief') {
      brief = requireBrief(argv[++i]);
      continue;
    }
    if (arg.startsWith('--brief=')) {
      brief = requireBrief(arg.slice('--brief='.length));
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
    if (arg === '--local') {
      local = requireLocal(argv[++i]);
      continue;
    }
    if (arg.startsWith('--local=')) {
      local = requireLocal(arg.slice('--local='.length));
      continue;
    }
    if (arg === '--save') {
      save = requireSave(argv[++i]);
      continue;
    }
    if (arg.startsWith('--save=')) {
      save = requireSave(arg.slice('--save='.length));
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}\n\n${usage}`);
    }
    sources.push(arg);
  }
  return { sources: sources.length > 0 ? sources : DEFAULT_SOURCES, mode, brief: requireBriefedPair(mode, brief), turns, save, local };
}

// The one place a save id becomes a fixture: read off registry.saves the same way the # test
// directives that load one already do (session.ts), but naming what is available instead of a
// bare "unknown save" — an operator picking a fixture by hand needs the list a directive script
// never has to ask for.
export function resolveSave(registry: Registry, id: string): ParsedSave {
  const saved = registry.saves.get(id);
  if (saved !== undefined) return saved;
  const defined = [...registry.saves.keys()].sort();
  throw new Error(`${id}: no # save with that id. Defined: ${defined.length > 0 ? defined.join(', ') : 'none'}`);
}

export interface OpenedSession {
  readonly session: PlaySession;
  readonly warnings: readonly PruneWarning[];
}

// Loading a save is setup, done once before the turn loop exists — runPlaybot and runTurn take
// only the already-opened session and never learn whether one was loaded.
export function openSession(registry: Registry, save: string | undefined): OpenedSession {
  const session = startSession(registry);
  if (save === undefined) return { session, warnings: [] };
  return { session, warnings: loadSaved(session, resolveSave(registry, save)) };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const read = fileContentReader(args.sources);
  const loaded = loadUniverseWithDiagnostics(read());
  for (const diagnostic of loaded.diagnostics) console.error(formatModuleDiagnostic(diagnostic));

  let opened: OpenedSession;
  try {
    opened = openSession(loaded.registry, args.save);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
    return;
  }
  for (const warning of opened.warnings) console.error(warning.message);

  const client = createSdkModelClient(isolatedDir());
  const at = new Date().toISOString();
  const kept = await runPlaybot({
    session: opened.session,
    read,
    client,
    mode: args.mode,
    brief: args.brief,
    turns: args.turns,
    at,
    // The same wiring the terminal authors through, over the same reader the turn loop reloads
    // from, so a section this run stages is a section the next turn is standing in. Asked for
    // once, by a mode that authors, and never by one that does not.
    authoring: () => {
      const file = localChangesFile(args.local);
      console.log(`staging local changes into ${file}`);
      return fileAuthoring(read, file);
    },
    write: (line) => console.log(line),
  });

  // The lines above are the run happening; this is the run. Paste it into a module and it replays,
  // notes and refusals and all — which is the only reason to write a run down rather than read it.
  console.log('');
  for (const block of runAsSections(kept, { at, built: 'this working tree' })) console.log(`${block.join('\n')}\n`);

  process.exitCode = kept.run.log.some((entry) => entry.outcome === 'applied' || entry.outcome === 'refused') ? 0 : 1;
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) main();
