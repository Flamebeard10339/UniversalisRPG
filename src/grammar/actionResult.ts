import { Cursor, DslError, Parser } from './parser';
import { id, number, quantified, REFERENCE } from './values';

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
  | { kind: 'open-modal'; modal: string }
  // One signed kind rather than two, as a pool's rate is one signed stat.
  | { kind: 'pool'; resource: string; delta: number }
  // Abandons the action in flight, exactly as a player-initiated cancel does.
  | { kind: 'stop' };

function parseGiveTake(kind: 'give' | 'take', cursor: Cursor): ActionResult {
  return { kind, ...quantified.parse(cursor) };
}

function parseVariable(cursor: Cursor): string {
  const raw = cursor.take(REFERENCE);
  if (raw === null) throw new DslError('expected a variable', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
  return raw;
}

function parseAdd(cursor: Cursor): ActionResult {
  const variable = parseVariable(cursor);
  cursor.take(/[ \t]+/);
  // Signed, so `add: counter -3` subtracts rather than silently meaning +1.
  // Signed, so `add: counter -3` subtracts instead of silently meaning +1.
  const amount = cursor.take(/-?\d+/);
  return { kind: 'add', variable, amount: amount !== null ? Number(amount) : 1 };
}

// Decimal because pools are float: an int pool rounds slow regeneration to zero.
function parsePool(sign: 1 | -1, cursor: Cursor): ActionResult {
  const raw = cursor.take(/\d+(?:\.\d+)?/);
  if (raw === null) throw new DslError('expected an amount and a resource, as in `drain: 5 health`', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
  cursor.take(/[ \t]+/);
  return { kind: 'pool', resource: id.parse(cursor), delta: sign * Number(raw) };
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
  if (cursor.take(/drain:[ \t]*/) !== null) return parsePool(-1, cursor);
  if (cursor.take(/restore:[ \t]*/) !== null) return parsePool(1, cursor);
  if (cursor.take(/relocate:[ \t]*/) !== null) return { kind: 'relocate', location: id.parse(cursor) };
  if (cursor.take(/discover:[ \t]*/) !== null) return { kind: 'discover', location: id.parse(cursor) };
  if (cursor.take(/open modal:[ \t]*/) !== null) return { kind: 'open-modal', modal: id.parse(cursor) };
  if (cursor.take(/stop(?![\w-])/) !== null) return { kind: 'stop' };
  throw new DslError(`unrecognized action result: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
}

export function startsResult(cursor: Cursor): boolean {
  return cursor.peek(/(?:say|add|give|take|xp|drain|restore|relocate|discover|open modal):|(?:set|unset)[: \t]|stop(?![\w-])/) !== null;
}

export const actionResult: Parser<ActionResult> = {
  parse: parseResult,
};
