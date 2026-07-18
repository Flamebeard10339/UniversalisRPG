import { ActionResult, actionResult, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { list } from './list';
import { Cursor, DslError } from './parser';
import { EntryBody } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';

export interface Action {
  label: string;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onFailure?: ActionResult[];
  time?: number;
}

const results = list(actionResult);
const tagClauses = list(tagClause);

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
  if (cursor.take(/time:[ \t]*/) !== null) {
    if (action.time !== undefined) throw new DslError('action time is defined more than once', line.span);
    const raw = cursor.take(/\d+(?:\.\d+)?/);
    if (raw === null) throw new DslError('action time requires a non-negative number', line.span);
    action.time = Number(raw);
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
    return action;
  },
};
