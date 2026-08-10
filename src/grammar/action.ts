import { ActionResult, parseResultLine, resultList, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { HOOK_FIELD_REFUSALS, hookLabelProblem } from './hook';
import { list } from './list';
import { Cursor, DslError, requireEnd, Span } from './parser';
import { EntryBody } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';
import { decimal, DECIMAL, id, refuseRange } from './values';

// What ends the action, which is a different question from how fast it attempts.
export type ActionKind = 'instant' | 'duration' | 'continuous';

export type Side = 'my' | 'their';

// A stat, pool or skill together with the participant it is read off. Both sides
// carry the name, so the marker is the only thing that says which one is meant.
export interface Sided {
  side?: Side;
  id: string;
}

// `X vs Y`: my X against their Y. An absent right half is the neutral default.
export interface Contest {
  left: Sided;
  right?: Sided;
}

export interface Action {
  label: string;
  // Absent is `duration`, and absent is what an untagged action records — so a
  // block overriding an inherited action keeps the kind it did not restate.
  kind?: ActionKind;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onFailure?: ActionResult[];
  onUnfinished?: ActionResult[];
  // The cadence, one axis in two spellings: `time` is seconds per attempt and
  // `rate` is attempts per minute, where a name is the stat holding that number.
  // At most one, and absent on a `duration` action defers to the tuning variable.
  time?: number;
  rate?: number | Sided;
  accuracy?: Contest;
  damage?: Contest;
  // The pool a landed hit reduces, and what makes an action a fight rather than
  // a fixed count of hits.
  depletes?: Sided;
  attempts?: number;
  // The fields this block wrote with a leading `+`. Meaningful only where a
  // block overlays another — an entity's overload of an action it `uses:` — and
  // empty everywhere else, because a first declaration has nothing to append to.
  appended?: string[];
}

const results = resultList;
const tagClauses = list(tagClause);

// The kinds an author writes. `duration` is what an untagged action is, so it
// has no tag to write and naming it would give one kind two spellings.
const TAGGED_ACTION_KINDS = ['instant', 'continuous'] as const;

// Every bare word an action's tag list may hold. The set is closed because a
// word an action keeps and never reads cannot be told apart from a typo, and a
// mistyped kind would silently mean `duration`.
const ACTION_KEYWORD_TAGS: ReadonlySet<string> = new Set<string>(TAGGED_ACTION_KINDS);

// Words that meant something once, or look like they should. Each names what to
// write instead, because "unknown tag" is not an answer to "then how do I?".
const RETIRED_ACTION_TAGS: Readonly<Record<string, string>> = {
  once: 'tag "once" was never implemented — gate the action with `hidden if: <flag>` and `set:` that flag among its results',
  repeating: 'tag "repeating" was renamed — write `continuous`',
  retaliates: 'tag "retaliates" was retired — one two-sided action is brought by whoever swings, so an entity retaliates with the actions it `uses:` and nothing marks a block as the owner\'s own',
};

export const actionKind = (action: Action): ActionKind => action.kind ?? 'duration';

export const SIDES: readonly Side[] = ['my', 'their'];

const SIDE = /(?:my|their)(?![\w-])/;

// A marker is optional here and demanded by the table below, because whether one
// is required follows from the whole action rather than from any one line.
function sided(cursor: Cursor): Sided {
  const marker = cursor.take(SIDE);
  if (marker === null) return { id: id.parse(cursor) };
  cursor.take(/[ \t]+/);
  return { side: marker as Side, id: id.parse(cursor) };
}

function contest(cursor: Cursor): Contest {
  const left = sided(cursor);
  if (cursor.take(/[ \t]+vs[ \t]+/) === null) return { left };
  return { left, right: sided(cursor) };
}

// Every value reader takes the label for the same reason the table check does:
// an error about an action is unreadable if it cannot say which action.
type ActionValue = (cursor: Cursor, line: RawLine, label: string) => unknown;

const conditionValue: ActionValue = (cursor) => (cursor.done ? undefined : condition.parse(cursor));
const contestValue = (written: string): ActionValue => (cursor, line, label) => named(written, label, line, () => contest(cursor));
const sidedValue = (written: string): ActionValue => (cursor, line, label) => named(written, label, line, () => sided(cursor));
const resultsValue: ActionValue = (cursor, line, label) => {
  if (cursor.done) return line.children.length > 0 ? results.parseBlock(line.children) : undefined;
  const inline = results.parse(cursor);
  if (line.children.length > 0) throw new DslError(actionProblem(label, 'a result group is written inline and as a block; give it one'), line.span);
  return inline;
};

// A shared value parser reports what it expected but not what it was reading,
// and pins the span to the cursor rather than the line. Every reader below is
// wrapped so an unreadable value names its field, its action, and its line.
function named<T>(written: string, label: string, line: RawLine, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    throw new DslError(actionProblem(label, `${written}: ${error.message}`), line.span);
  }
}

const seconds: ActionValue = (cursor, line, label) => named('time', label, line, () => decimal.parse(cursor));

// A literal is attempts per minute; a name is the stat holding that number,
// which is what makes a haste buff move a swing without touching the action.
// Positivity is the table's business, checked once for both spellings.
const perMinute: ActionValue = (cursor, line, label) =>
  named('rate', label, line, () => {
    const raw = cursor.take(DECIMAL);
    return raw === null ? sided(cursor) : Number(raw);
  });

const positiveCount =
  (written: string): ActionValue =>
  (cursor, line, label) => {
    const raw = cursor.take(/\d+/);
    if (raw === null || Number(raw) <= 0) throw new DslError(actionProblem(label, `${written} requires a positive integer`), line.span);
    named(written, label, line, () => refuseRange(cursor, 'this number is a threshold, not a quantity, so it takes one value rather than a range'));
    return Number(raw);
  };

// Field name as written, the label that introduces it, and how its value reads.
// One row per field is the whole shape: the once-guard and the end-of-line
// demand below are what keep a new row from inventing its own laxity.
const ACTION_FIELDS: readonly { written: string; label: RegExp; name: keyof Omit<Action, 'label' | 'results'>; value: ActionValue }[] = [
  { written: 'requires', label: /(?:requires|require):[ \t]*/, name: 'requires', value: conditionValue },
  { written: 'hidden if', label: /hidden if:[ \t]*/, name: 'hiddenIf', value: conditionValue },
  { written: 'on success', label: /on success:[ \t]*/, name: 'onSuccess', value: resultsValue },
  { written: 'on failure', label: /on failure:[ \t]*/, name: 'onFailure', value: resultsValue },
  { written: 'on unfinished', label: /on unfinished:[ \t]*/, name: 'onUnfinished', value: resultsValue },
  { written: 'time', label: /time:[ \t]*/, name: 'time', value: seconds },
  { written: 'rate', label: /rate:[ \t]*/, name: 'rate', value: perMinute },
  { written: 'accuracy', label: /accuracy:[ \t]*/, name: 'accuracy', value: contestValue('accuracy') },
  { written: 'damage', label: /damage:[ \t]*/, name: 'damage', value: contestValue('damage') },
  { written: 'depletes', label: /depletes:[ \t]*/, name: 'depletes', value: sidedValue('depletes') },
  { written: 'attempts', label: /attempts:[ \t]*/, name: 'attempts', value: positiveCount('attempts') },
];

// A field that was removed rather than renamed away silently: without a row
// here, `speed: cooking-speed` falls through to the tag parser and reports an
// unrecognized clause, which says nothing about where the field went.
const RETIRED_ACTION_FIELDS: readonly { label: RegExp; message: string }[] = [
  { label: /speed:[ \t]*/, message: 'speed: was retired — write rate: for attempts per minute, either a number or the stat holding one' },
  { label: /evasion:[ \t]*/, message: 'evasion: was retired — it is the right half of one line, `accuracy: my accuracy vs their evasion`' },
  { label: /ability:[ \t]*/, message: 'ability: was retired — it is the left half of one line, `damage: my attack vs their defense`' },
  { label: /dr:[ \t]*/, message: 'dr: was retired — it is the right half of one line, `damage: my attack vs their defense`' },
  { label: /target:[ \t]*/, message: 'target: was retired — write `depletes: their <pool>` for the pool a landed hit reduces' },
  { label: /escape after[ \t]+/, message: 'escape after was retired — write `attempts: N`, which bounds the action at N of the performer\'s attempts' },
  { label: /on escape:[ \t]*/, message: 'on escape: was retired — write `on unfinished:`, which runs when `attempts:` ran out before the action completed' },
  // A hook is a field of nothing: it belongs to the character, so an action's
  // body is the one place it cannot be written.
  ...HOOK_FIELD_REFUSALS,
];

// One field per line, and the whole line: `requireEnd` is what the generic
// section engine does by looping to the end of the line, and without it a typo
// after a value — `time: 1 typo`, `attempts: 3 times` — is silently dropped.
function parseActionLine(line: RawLine, action: Omit<Action, 'label'>, label: string): void {
  const cursor = new Cursor(line.text, 0, line.span.start);
  parseActionField(line, cursor, action, label);
  requireEnd(cursor, 'an action field');
}

// A `+` line adds to what a block overlays instead of replacing it, which only
// two kinds of value can do: a condition gains an `and`, and a result group
// gains more results. Anything else has one value and no way to hold two.
const APPENDABLE: ReadonlySet<string> = new Set(['requires', 'hidden if', 'on success', 'on failure', 'on unfinished']);

function parseActionField(line: RawLine, cursor: Cursor, action: Omit<Action, 'label'>, label: string): void {
  const held = action as Record<string, unknown>;
  // A leading `+` is an append marker only when a field follows it. `+3 attack`
  // is a stat bonus and `+100% luck` a percent one, so the cursor rewinds rather
  // than eating the sign off a tag clause.
  const beforePlus = cursor.pos;
  const appends = cursor.take(/\+[ \t]*/) !== null;
  for (const retired of RETIRED_ACTION_FIELDS) {
    if (cursor.take(retired.label) !== null) throw new DslError(actionProblem(label, retired.message), line.span);
  }
  for (const field of ACTION_FIELDS) {
    if (cursor.take(field.label) === null) continue;
    if (held[field.name] !== undefined) throw new DslError(actionProblem(label, `${field.written} is defined more than once`), line.span);
    if (appends && !APPENDABLE.has(field.written)) throw new DslError(actionProblem(label, `${field.written} holds one value, so + has nothing to add to — write it bare to replace what this block overlays`), line.span);
    const value = field.value(cursor, line, label);
    if (value !== undefined) held[field.name] = value;
    if (appends) action.appended = (action.appended ?? []).concat(field.name);
    return;
  }
  if (appends) cursor.pos = beforePlus;

  if (startsResult(cursor)) {
    // The whole line, because a wrapper's body may be the block hanging off it,
    // and a cursor over the line's text alone cannot see one.
    action.results.push(...parseResultLine(line));
    cursor.pos = line.text.length;
  } else {
    action.tags = (action.tags ?? []).concat(tagClauses.parse(cursor));
  }
}

const isSided = (value: number | Sided | undefined): value is Sided => typeof value === 'object' && value !== null;

// Every field of an action that names a stat, a pool or a skill, beside the word
// that introduced it. One walk, so a field added above cannot quietly escape the
// marker rule by being missed here.
export function sidedFields(action: Action): { written: string; value: Sided }[] {
  const found: { written: string; value: Sided }[] = [];
  if (isSided(action.rate)) found.push({ written: 'rate', value: action.rate });
  for (const [written, held] of [['accuracy', action.accuracy], ['damage', action.damage]] as const) {
    if (!held) continue;
    found.push({ written, value: held.left });
    if (held.right) found.push({ written, value: held.right });
  }
  if (action.depletes) found.push({ written: 'depletes', value: action.depletes });
  return found;
}

// Side vocabulary in the body is the whole declaration of kind: an action that
// writes one is brought by a performer and applied to a target, and one that
// writes none belongs to the object declaring it.
export const isTwoSided = (action: Action): boolean => sidedFields(action).some((field) => field.value.side !== undefined);

// The whole table, as one predicate over a finished action: a kind says what
// ends the action, and carries exactly one positive cadence or none. Returning
// the problem rather than throwing is what lets the two places an action can be
// assembled — authored, and compiled from a recipe — share the rule instead of
// each growing its own copy of it.
export function actionTableProblem(action: Action): string | undefined {
  const cadence = [action.time !== undefined && 'time:', action.rate !== undefined && 'rate:'].filter((written): written is string => written !== false);
  if (cadence.length > 1) return 'time: and rate: are the same axis written two ways; give one';

  const kind = actionKind(action);
  if (kind === 'instant' && cadence.length > 0) return `an instant action takes no ${cadence[0]}`;
  // Nothing else ends it, so a cadence it does not have is one the tuning
  // default would have to supply, and a default of 0 spins the resolver.
  if (kind === 'continuous' && cadence.length === 0) return 'a continuous action needs a time: or rate: to set its pace';

  const written = action.time !== undefined ? 'time:' : 'rate:';
  const value = action.time ?? (typeof action.rate === 'number' ? action.rate : undefined);
  if (value !== undefined && !(value > 0)) return `${written} must be positive — something that takes no time carries no cadence at all`;

  if (!isTwoSided(action)) return undefined;
  const unmarked = sidedFields(action).find((field) => field.value.side === undefined);
  if (unmarked) return `${unmarked.written}: ${unmarked.value.id} names no side — write ${SIDES.map((side) => `${side} ${unmarked.value.id}`).join(' or ')}, because this action already names one`;
  return undefined;
}

// What is true of a WHOLE action and not of a fragment. An entity's overload
// names only what it changes, so a block that writes a side and leaves the
// pool to the declaration it overlays is well-formed until the two are one.
export function assembledActionProblem(action: Action): string | undefined {
  const problem = actionTableProblem(action);
  if (problem) return problem;
  if (isTwoSided(action) && !action.depletes) return 'a side-naming action with nothing to deplete is not a contest — write `depletes: their <pool>`';
  return undefined;
}

// Reported wherever an action is finished, so every message names the action it
// is about. A section that owns one prefixes itself; see `validateActionTable`.
export const actionProblem = (label: string, problem: string): string => `action ${JSON.stringify(label)}: ${problem}`;

// A tag list is the one place an action accepts free-form words, so it is the
// one place a typo has nowhere to land.
function checkTags(action: Omit<Action, 'label'>, label: string, span: RawLine['span'] | undefined): void {
  for (const tag of action.tags ?? []) {
    if (tag.kind === 'duration') throw new DslError(actionProblem(label, 'a duration clause paces nothing on an action — write `time: <seconds>` or `rate: <per minute>`'), span);
    if (tag.kind !== 'keyword' || ACTION_KEYWORD_TAGS.has(tag.value)) continue;
    const retired = RETIRED_ACTION_TAGS[tag.value];
    throw new DslError(actionProblem(label, retired ?? `unknown tag ${JSON.stringify(tag.value)} — an action's bare tags are ${[...ACTION_KEYWORD_TAGS].join(', ')}`), span);
  }
}

function resolveKind(action: Omit<Action, 'label'>, label: string, lines: RawLine[]): ActionKind | undefined {
  const span = lines[0]?.span;
  checkTags(action, label, span);
  const tagged = TAGGED_ACTION_KINDS.filter((kind) => (action.tags ?? []).some((tag) => tag.kind === 'keyword' && tag.value === kind));
  if (tagged.length > 1) throw new DslError(actionProblem(label, `cannot be both ${tagged.join(' and ')}`), span);

  const problem = actionTableProblem({ ...action, label, kind: tagged[0] });
  if (problem) throw new DslError(actionProblem(label, problem), span);
  return tagged[0];
}

// A section whose labelled blocks are actions takes any unclaimed label, so a
// hook written on one is an action named `on hit` unless the label is read here.
// The carriers intercept the two labels as fields before an action body sees
// them; everything else reaches this and is refused.
function refuseHookLabel(label: string, span: Span | undefined): void {
  const problem = hookLabelProblem(label);
  if (problem !== undefined) throw new DslError(problem, span);
}

export const actionBody: EntryBody = {
  parse: (cursor, label) => {
    refuseHookLabel(label, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) });
    return { results: results.parse(cursor) };
  },
  parseBlock: (lines, label) => {
    refuseHookLabel(label, lines[0]?.span);
    const action: Omit<Action, 'label'> = { results: [] };
    for (const line of lines) parseActionLine(line, action, label);
    const kind = resolveKind(action, label, lines);
    return kind === undefined ? action : { ...action, kind };
  },
};
