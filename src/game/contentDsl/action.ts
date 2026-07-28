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
  onEscape?: ActionResult[];
  // TODO(default-duration): absent means instant, which is load-bearing — see backlog.
  time?: number;
  // Stat ids, read live, each absent meaning the neutral default.
  speed?: string;
  accuracy?: string;
  evasion?: string;
  ability?: string;
  // Naming a pool is what makes an action a fight rather than a fixed count of hits.
  target?: string;
  dr?: string;
  // Absent is 1, so an action with none of these fields completes in one hit.
  health?: number;
  escapeAfter?: number;
  repeating?: boolean;
  // The owner's own move in an encounter, never offered to the player.
  retaliates?: boolean;
}

const results = list(actionResult);
const tagClauses = list(tagClause);

// Bare tags lifted onto the field they name; extending this list adds another.
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
