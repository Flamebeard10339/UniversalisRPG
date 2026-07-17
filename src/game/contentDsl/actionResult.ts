import { Cursor, DslError, Parser } from './parser';
import { id, number, REFERENCE } from './values';

export type ActionResult =
  | { kind: 'say'; text: string }
  | { kind: 'set'; variable: string }
  | { kind: 'unset'; variable: string }
  | { kind: 'add'; variable: string; amount: number }
  | { kind: 'give'; item: string; amount?: number }
  | { kind: 'take'; item: string; amount?: number }
  | { kind: 'xp'; skill: string; amount: number }
  | { kind: 'relocate'; location: string }
  | { kind: 'discover'; location: string }
  | { kind: 'open-modal'; modal: string };

function parseGiveTake(kind: 'give' | 'take', cursor: Cursor): ActionResult {
  const amount = cursor.take(/\d+/);
  if (amount !== null) cursor.take(/[ \t]+/);
  const item = id.parse(cursor);
  return amount !== null ? { kind, item, amount: Number(amount) } : { kind, item };
}

function parseVariable(cursor: Cursor): string {
  const raw = cursor.take(REFERENCE);
  if (raw === null) throw new DslError('expected a variable', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
  return raw;
}

function parseAdd(cursor: Cursor): ActionResult {
  const variable = parseVariable(cursor);
  cursor.take(/[ \t]+/);
  const amount = cursor.take(/\d+/);
  return { kind: 'add', variable, amount: amount !== null ? Number(amount) : 1 };
}

function parseResult(cursor: Cursor): ActionResult {
  if (cursor.take(/say:[ \t]*/) !== null) return { kind: 'say', text: cursor.take(/[^\n]*/) ?? '' };
  if (cursor.take(/set[: \t][ \t]*/) !== null) return { kind: 'set', variable: parseVariable(cursor) };
  if (cursor.take(/unset[: \t][ \t]*/) !== null) return { kind: 'unset', variable: parseVariable(cursor) };
  if (cursor.take(/add:[ \t]*/) !== null) return parseAdd(cursor);
  if (cursor.take(/give:[ \t]*/) !== null) return parseGiveTake('give', cursor);
  if (cursor.take(/take:[ \t]*/) !== null) return parseGiveTake('take', cursor);
  if (cursor.take(/xp:[ \t]*/) !== null) {
    const skill = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return { kind: 'xp', skill, amount: number.parse(cursor) };
  }
  if (cursor.take(/relocate:[ \t]*/) !== null) return { kind: 'relocate', location: id.parse(cursor) };
  if (cursor.take(/discover:[ \t]*/) !== null) return { kind: 'discover', location: id.parse(cursor) };
  if (cursor.take(/open modal:[ \t]*/) !== null) return { kind: 'open-modal', modal: id.parse(cursor) };
  throw new DslError(`unrecognized action result: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
}

export function startsResult(cursor: Cursor): boolean {
  return cursor.peek(/(?:say|add|give|take|xp|relocate|discover|open modal):|(?:set|unset)[: \t]/) !== null;
}

export const actionResult: Parser<ActionResult> = {
  parse: parseResult,
};
