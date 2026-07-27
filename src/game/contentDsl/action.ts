import { ActionResult, actionResult, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { list } from './list';
import { Cursor, DslError } from './parser';
import { EntryBody } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';
import { id } from './values';

export interface Action {
  label: string;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onFailure?: ActionResult[];
  // Applies instead of results/onSuccess when a fight ends by running out of
  // attempts (escape after:) rather than by exhausting the target's health.
  onEscape?: ActionResult[];
  // Seconds the action occupies (0 / absent = instant). TODO(default-duration):
  // the playtest suggested a small nonzero default (~0.5s) so every action feels
  // weighty. Not done here on purpose: an absent `time:` is currently the seam
  // that distinguishes an INSTANT action (mirror/stairs/eat — a deliberate
  // design tool per CLAUDE.md) from a spannable one, and beginAction routes on
  // `firstUnit > 0`. Flipping the default to 0.5 turns every instant action
  // spannable and shifts every timing assertion (session.test's ~19s Miki
  // route, resolve.test). Needs a design call on which actions stay instant
  // before changing the default.
  time?: number;
  // The stat whose value scales this action's per-attempt duration (time: /
  // statValue) — attempts per second, e.g. a cooking-speed stat. Absent
  // means a fixed multiplier of 1.
  speed?: string;
  // The attacker's skill in the opposed roll that decides whether each attempt
  // lands (see hitChance in runtime.ts). Absent means every attempt is a
  // certain, deterministic hit — no randomness is drawn for this action at all
  // (see runtime.ts's resolve()/RNG contract). A stat is never read as a raw
  // probability: the chance always comes out of this stat against `evasion:`,
  // so the difficulty of a task lives in the thing being attempted.
  accuracy?: string;
  // The stat ON THE TARGET opposed to `accuracy:` — a rat's dodge, a dish's
  // complexity, a lock's resistance. Absent means the target opposes nothing,
  // so the attempt is decided by the attacker's skill against zero.
  evasion?: string;
  // The stat whose value is subtracted from the target's remaining health
  // per successful attempt. Absent defaults to a magnitude of 1.
  ability?: string;
  // The pool ON THE TARGET ACTOR that a successful attempt drains — `health` on
  // a rat, `integrity` on a lock. The target actor is the entity this action
  // belongs to. Naming a pool is what makes an action a real fight: it ends when
  // that pool reaches 0 rather than when `health:` attempts are spent, damage is
  // sampled per hit (ability minus dr, see hitDamage), and it always resolves
  // attempt-by-attempt because a sampled sum has no closed form to batch.
  target?: string;
  // The stat ON THE TARGET whose value is subtracted from each incoming hit.
  // Absent means no reduction. Only meaningful alongside `target:`.
  dr?: string;
  // The target's hitpoints for one fight. Absent defaults to 1 — combined
  // with the accuracy/ability defaults above, this makes an action with none
  // of these fields a fight that always completes in exactly one hit (i.e.
  // today's action shape).
  health?: number;
  // After this many attempts against one target without completing, the
  // fight ends unsuccessfully instead (the target "escapes") and onEscape
  // applies instead of results/onSuccess. Absent means never (Infinity).
  escapeAfter?: number;
  // A `repeating` bare tag (see below) makes this a spannable, looping
  // action instead of a one-shot: resolve() re-arms a fresh fight after each
  // completion or escape instead of clearing it.
  repeating?: boolean;
  // A `retaliates` bare tag marks this as the OWNER's own move in an encounter
  // rather than something the player invokes: it is kept out of the player's
  // choice list, and while its owner is in a fight it runs on that owner's
  // cadence against the player. The fields read the same way either direction —
  // `speed`/`ability` off whoever is swinging, `target`/`dr` off whoever is
  // being hit — so only the perspective flips.
  retaliates?: boolean;
}

const results = list(actionResult);
const tagClauses = list(tagClause);

// Bare keyword tags that also name a boolean field on Action get lifted onto
// that field directly (see the loop in parseBlock below) instead of staying
// inert like an ordinary tag (e.g. `once`). `repeating` is the only one
// today, but the lift itself isn't hardcoded to it — extending this list is
// what adds a new one.
const BOOLEAN_ACTION_FLAGS = ['repeating', 'retaliates'] as const;
type BooleanActionField = (typeof BOOLEAN_ACTION_FLAGS)[number];
const BOOLEAN_ACTION_FLAG_SET: ReadonlySet<string> = new Set<string>(BOOLEAN_ACTION_FLAGS);

function parseActionLine(line: RawLine, action: Omit<Action, 'label'>): void {
  const cursor = new Cursor(line.text, 0, line.span.start);

  if (cursor.take(/(?:requires|require):[ \t]*/) !== null) {
    if (action.requires !== undefined) throw new DslError('action requires is defined more than once', line.span);
    if (!cursor.done) action.requires = condition.parse(cursor);
    return;
  }
  if (cursor.take(/hidden if:[ \t]*/) !== null) {
    if (action.hiddenIf !== undefined) throw new DslError('action hidden if is defined more than once', line.span);
    if (!cursor.done) action.hiddenIf = condition.parse(cursor);
    return;
  }
  if (cursor.take(/on success:[ \t]*/) !== null) {
    if (action.onSuccess !== undefined) throw new DslError('action on success is defined more than once', line.span);
    if (!cursor.done) action.onSuccess = results.parse(cursor);
    else if (line.children.length > 0) action.onSuccess = results.parseBlock(line.children);
    return;
  }
  if (cursor.take(/on failure:[ \t]*/) !== null) {
    if (action.onFailure !== undefined) throw new DslError('action on failure is defined more than once', line.span);
    if (!cursor.done) action.onFailure = results.parse(cursor);
    else if (line.children.length > 0) action.onFailure = results.parseBlock(line.children);
    return;
  }
  if (cursor.take(/on escape:[ \t]*/) !== null) {
    if (action.onEscape !== undefined) throw new DslError('action on escape is defined more than once', line.span);
    if (!cursor.done) action.onEscape = results.parse(cursor);
    else if (line.children.length > 0) action.onEscape = results.parseBlock(line.children);
    return;
  }
  if (cursor.take(/time:[ \t]*/) !== null) {
    if (action.time !== undefined) throw new DslError('action time is defined more than once', line.span);
    const raw = cursor.take(/\d+(?:\.\d+)?/);
    if (raw === null) throw new DslError('action time requires a non-negative number', line.span);
    action.time = Number(raw);
    return;
  }
  if (cursor.take(/speed:[ \t]*/) !== null) {
    if (action.speed !== undefined) throw new DslError('action speed is defined more than once', line.span);
    action.speed = id.parse(cursor);
    return;
  }
  if (cursor.take(/accuracy:[ \t]*/) !== null) {
    if (action.accuracy !== undefined) throw new DslError('action accuracy is defined more than once', line.span);
    action.accuracy = id.parse(cursor);
    return;
  }
  if (cursor.take(/evasion:[ \t]*/) !== null) {
    if (action.evasion !== undefined) throw new DslError('action evasion is defined more than once', line.span);
    action.evasion = id.parse(cursor);
    return;
  }
  if (cursor.take(/ability:[ \t]*/) !== null) {
    if (action.ability !== undefined) throw new DslError('action ability is defined more than once', line.span);
    action.ability = id.parse(cursor);
    return;
  }
  if (cursor.take(/target:[ \t]*/) !== null) {
    if (action.target !== undefined) throw new DslError('action target is defined more than once', line.span);
    action.target = id.parse(cursor);
    return;
  }
  if (cursor.take(/dr:[ \t]*/) !== null) {
    if (action.dr !== undefined) throw new DslError('action dr is defined more than once', line.span);
    action.dr = id.parse(cursor);
    return;
  }
  if (cursor.take(/health:[ \t]*/) !== null) {
    if (action.health !== undefined) throw new DslError('action health is defined more than once', line.span);
    const raw = cursor.take(/\d+(?:\.\d+)?/);
    if (raw === null) throw new DslError('action health requires a non-negative number', line.span);
    action.health = Number(raw);
    return;
  }
  if (cursor.take(/escape after[ \t]+/) !== null) {
    if (action.escapeAfter !== undefined) throw new DslError('action escape after is defined more than once', line.span);
    const raw = cursor.take(/\d+/);
    if (raw === null || Number(raw) <= 0) throw new DslError('action escape after requires a positive integer', line.span);
    action.escapeAfter = Number(raw);
    return;
  }

  if (startsResult(cursor)) {
    action.results.push(...results.parse(cursor));
  } else {
    action.tags = (action.tags ?? []).concat(tagClauses.parse(cursor));
  }
}

export const actionBody: EntryBody = {
  parse: (cursor) => ({ results: results.parse(cursor) }),
  parseBlock: (lines) => {
    const action: Omit<Action, 'label'> = { results: [] };
    for (const line of lines) parseActionLine(line, action);
    for (const tag of action.tags ?? []) {
      if (tag.kind === 'keyword' && BOOLEAN_ACTION_FLAG_SET.has(tag.value)) {
        action[tag.value as BooleanActionField] = true;
      }
    }
    return action;
  },
};
