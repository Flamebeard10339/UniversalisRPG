import { ActionResult, actionResult, startsResult } from './actionResult';
import { Cursor, DslError } from './codec';
import { Condition, condition } from './condition';
import { list } from './list';
import { EntryBody, SectionSchema } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';
import { humanize, text } from './values';

export interface Action {
  label: string;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
}

export interface Entity {
  id: string;
  title: string;
  examine?: string;
  actions: Action[];
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

  if (startsResult(cursor)) {
    action.results.push(...results.parse(cursor));
  } else {
    action.tags = (action.tags ?? []).concat(tagClauses.parse(cursor));
  }
}

const actionBody: EntryBody = {
  parse: (cursor) => ({ results: results.parse(cursor) }),
  parseBlock: (lines) => {
    const action: Omit<Action, 'label'> = { results: [] };
    for (const line of lines) parseActionLine(line, action);
    return action;
  },
  printBlock: (value) => {
    const action = value as Action;
    const lines: string[] = [];
    if (action.requires) lines.push(`requires: ${condition.print(action.requires)}`);
    if (action.hiddenIf) lines.push(`hidden if: ${condition.print(action.hiddenIf)}`);
    if (action.tags && action.tags.length > 0) lines.push(tagClauses.print(action.tags));
    for (const result of action.results) lines.push(actionResult.print(result));
    if (action.onSuccess && action.onSuccess.length > 0) {
      lines.push('on success:');
      for (const result of action.onSuccess) lines.push(`  ${actionResult.print(result)}`);
    }
    return lines;
  },
};

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    title: { codec: text, default: (self) => humanize(self.id) },
    examine: { codec: text },
  },
  entries: { into: 'actions', body: actionBody },
};
