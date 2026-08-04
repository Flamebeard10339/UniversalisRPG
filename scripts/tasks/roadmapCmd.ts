import { readFileSync } from 'node:fs';
import { roadmapView, type Blocker, type DecidedSpec, type ReadSpec, type RoadmapEntry, type RoadmapView, type SpecStanding, type Waiter } from '../lib/roadmap';
import type { Flags } from './cli';
import { readStore, resolveConfig, specFile, type Config } from './context';
import { packGreedy, TERMINAL_WIDTH, wrapUnder } from './render';

// Every column here is a minimum, never a maximum: it says where the next
// column starts when the value is short, and gets out of the way when the
// value is long. A record whose name is wider than its column pushes the
// row right; it never loses the end of its name to make the grid tidy.
const SEVERITY_COLUMN = 8;
const ID_COLUMN = 40;
const STATE_COLUMN = 12;
const STANDING_COLUMN = 23;
const COUNT_LABEL_COLUMN = 14;
const BLOCKED_ID_COLUMN = 32;
const SYSTEM_COUNT_SEPARATOR = ' · ';

// A depth deeper than this keeps its place in the order but stops indenting:
// past six links the chain has already been made, and the columns are worth
// more than the seventh step of a staircase.
const MAX_INDENTED_DEPTH = 6;
const DEPTH_INDENT = 2;

// The bounds that remain, and they are all counts of records: each says what
// it left out and the command that shows the rest, which is a thing a reader
// can act on. Cutting a sentence in half is not.
const SPEC_CAP = 12;
const TOPIC_CAP = 6;
const BLOCKED_CAP = 6;
const FINDING_CAP = 10;
const WAITER_CAP = 3;

// Pads to the column, and leaves anything wider alone. Callers reserve the
// last character of every column for the gap, so two long values never run
// into each other.
export function column(text: string, width: number): string {
  return text.padEnd(width - 1) + ' ';
}

function countLine(label: string, value: number, gloss: string): string {
  return `  ${label.padEnd(COUNT_LABEL_COLUMN)}${String(value).padStart(5)}   ${gloss}`;
}

// A dependency edge names the spec at its far end, so a reader can tell a
// link in the decided chain from an exit into work nobody has decided. A
// spec named after its own task adds nothing and stays silent.
function edgeNote(id: string, spec: string | null, missing = false): string {
  if (missing) return ' (no record)';
  if (spec === null) return ' (unspecced)';
  return spec === id ? '' : ` (spec ${spec})`;
}

function blockerText(blockers: Blocker[]): string {
  if (blockers.length === 0) return 'nothing blocks it';
  return `waits on ${blockers.map((blocker) => `${blocker.id}${edgeNote(blocker.id, blocker.spec, blocker.status === 'missing')}`).join(', ')}`;
}

function waiterText(waiter: Waiter): string {
  const also = waiter.alsoWaitsOn.length > 0 ? ` (also waits on ${waiter.alsoWaitsOn.join(', ')})` : '';
  return `unblocks ${waiter.id}${edgeNote(waiter.id, waiter.spec)}${also}`;
}

function waiterNotes(unblocks: Waiter[]): string[] {
  const notes = unblocks.slice(0, WAITER_CAP).map(waiterText);
  if (unblocks.length > WAITER_CAP) notes.push(`unblocks ${unblocks.length - WAITER_CAP} more`);
  return notes;
}

// The glyph is part of the structure, so a note that outgrows the report
// continues under the glyph rather than beside the next branch.
function tree(indent: string, notes: string[]): string[] {
  return notes.flatMap((note, index) => wrapUnder(note, `${indent}${index === notes.length - 1 ? '└─' : '├─'} `, `${indent}   `));
}

// With no pass recorded every clause stands `unknown`, so the count and
// "no pass" already say the whole standing; the clause-by-clause summary is
// printed only once a pass has made the clauses differ from each other.
function standingText(standing: SpecStanding | null): string {
  if (standing === null) return 'spec file not found';
  if (standing.clauses === 0) return 'no proof clause';
  return `${standing.clauses} clauses, ${standing.latestPass === null ? 'no pass' : `pass ${standing.latestPass}`}`;
}

function specLines(spec: DecidedSpec): string[] {
  const indent = ' '.repeat(Math.min(spec.depth, MAX_INDENTED_DEPTH) * DEPTH_INDENT);
  const idWidth = TERMINAL_WIDTH - 2 - STATE_COLUMN - STANDING_COLUMN - indent.length;
  const branchIndent = `  ${' '.repeat(STATE_COLUMN)}${indent}`;

  // Membership before the edges, because a spec's blockers are the union
  // over its members: with more than one, "blocked" reads as the whole spec
  // until the reader knows how many records that union covers.
  const notes: string[] = [];
  if (spec.members.length > 1) notes.push(`holds ${spec.members.length}: ${spec.members.map((member) => member.id).join(', ')}`);
  if (spec.standing?.latestPass != null) notes.push(spec.standing.outstanding);
  notes.push(blockerText(spec.waitsOn));
  notes.push(...waiterNotes(spec.unblocks));

  return [...wrapUnder(`${column(spec.spec, idWidth)}${standingText(spec.standing)}`, `  ${column(spec.state, STATE_COLUMN)}${indent}`, branchIndent), ...tree(branchIndent, notes)];
}

const ENTRY_INDENT = ' '.repeat(2 + SEVERITY_COLUMN);

function entryRow(entry: RoadmapEntry): string[] {
  const severity = column(entry.task.severity ?? '-', SEVERITY_COLUMN);
  return wrapUnder(`${column(entry.task.id, ID_COLUMN)}${entry.task.system ?? '(no system)'}`, `  ${severity}`, ENTRY_INDENT);
}

function truncationNote(total: number, shown: number, command: string): string[] {
  return total > shown ? [`  … ${total - shown} more — ${command}`] : [];
}

function headerLines(view: RoadmapView): string[] {
  const { counts } = view;
  const live = counts.total - counts.archived;
  const heading = 'ROADMAP';
  const summary = `${live} live record${live === 1 ? '' : 's'}`;
  return [
    `${heading}${summary.padStart(TERMINAL_WIDTH - heading.length)}`,
    '',
    countLine('ready', counts.ready, 'specced and unblocked — write code'),
    countLine('in progress', counts.inProgress, 'claimed by someone'),
    countLine('blocked', counts.blocked, 'waiting on a record it names'),
    countLine('unspecced', counts.unspecced, 'needs a planning session, not an implementer'),
    countLine('findings', counts.findings, `${counts.highFindings} could redden an audit`),
    ...(counts.otherKinds > 0 ? [countLine('other kinds', counts.otherKinds, 'questions and undelivered clauses')] : []),
    countLine('unreviewed', counts.unreviewed, 'filed by an audit, awaiting triage'),
    countLine('archived', counts.archived, 'done or declined'),
  ];
}

function decidedLines(view: RoadmapView): string[] {
  if (view.decided.length === 0) return ['DECIDED — nothing: no live record names a spec'];
  const shown = view.decided.slice(0, SPEC_CAP);
  return [
    `DECIDED — ${view.decided.length} spec(s), each printed under the decided work it waits on`,
    '',
    ...shown.flatMap(specLines),
    ...truncationNote(view.decided.length, shown.length, 'see docs/specs/'),
  ];
}

function topicLines(view: RoadmapView): string[] {
  if (view.topics.length === 0) return ['UNSPECCED — none: every unspecced task is blocked, or the backlog is empty'];
  const shown = view.topics.slice(0, TOPIC_CAP);
  return [
    `UNSPECCED — ${view.topics.length} topic(s) no spec has decided; each wants a planner`,
    '',
    ...shown.flatMap((entry) => [...entryRow(entry), ...tree(ENTRY_INDENT, [blockerText(entry.waitsOn), ...waiterNotes(entry.unblocks)])]),
    ...truncationNote(view.topics.length, shown.length, '`tasks list --deferred --kind task`'),
  ];
}

function blockedLines(view: RoadmapView): string[] {
  if (view.blocked.length === 0) return [];
  const inSpec = view.counts.blocked - view.blocked.length;
  const shown = view.blocked.slice(0, BLOCKED_CAP);
  return [
    `BLOCKED — ${view.blocked.length} unspecced task(s)${inSpec > 0 ? `; the other ${inSpec} sit in a spec above` : ''}`,
    '',
    ...shown.flatMap((entry) => wrapUnder(blockerText(entry.waitsOn), `  ${column(entry.task.id, BLOCKED_ID_COLUMN)}`, ' '.repeat(2 + BLOCKED_ID_COLUMN))),
    ...truncationNote(view.blocked.length, shown.length, '`tasks list --deferred --kind task`'),
  ];
}

function findingLines(view: RoadmapView): string[] {
  const { counts } = view;
  const shown = view.namedFindings.slice(0, FINDING_CAP);
  const lines = [`FINDINGS — ${counts.findings} open, ${counts.highFindings} could redden an audit`, ''];
  for (const entry of shown) {
    lines.push(...entryRow(entry));
    lines.push(...tree(ENTRY_INDENT, [`${blockerText(entry.waitsOn)} · ${entry.task.title}`]));
  }
  lines.push(...truncationNote(view.namedFindings.length, shown.length, '`tasks list --state open --kind finding --severity high`'));

  const rest = counts.findings - view.namedFindings.length;
  if (rest > 0) {
    lines.push(`  the other ${rest}, by system:`);
    const systems = view.findingsBySystem.map(([system, count]) => `${system} ${count}`);
    for (const line of packGreedy(systems, SYSTEM_COUNT_SEPARATOR, TERMINAL_WIDTH - 6)) lines.push(`      ${line}`);
    lines.push('      `tasks list --state open --kind finding`');
  }
  return lines;
}

export function renderRoadmap(view: RoadmapView): string[] {
  return [headerLines(view), decidedLines(view), topicLines(view), blockedLines(view), findingLines(view)]
    .filter((section) => section.length > 0)
    .flatMap((section) => ['', ...section])
    .slice(1)
    .map((line) => line.trimEnd());
}

// The spec text is the one thing this view cannot derive from the store, and
// a slug that reads back nothing is an answer — never a thrown read.
export function specReader(config: Config): ReadSpec {
  return (slug) => {
    try {
      return readFileSync(specFile(config, slug), 'utf8');
    } catch {
      return null;
    }
  };
}

export function cmdRoadmap(args: Flags): void {
  const config = resolveConfig(args.flags);
  for (const line of renderRoadmap(roadmapView(readStore(config), specReader(config)))) console.log(line);
}
