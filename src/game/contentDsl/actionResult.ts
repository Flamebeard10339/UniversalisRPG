import { Codec, Cursor, DslError } from './codec';
import { id, number } from './values';

export type ActionResult =
  | { kind: 'say'; text: string }
  | { kind: 'set'; variable: string }
  | { kind: 'unset'; variable: string }
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

function parseResult(cursor: Cursor): ActionResult {
  if (cursor.take(/say:[ \t]*/) !== null) return { kind: 'say', text: cursor.take(/[^\n]*/) ?? '' };
  if (cursor.take(/set[: \t][ \t]*/) !== null) return { kind: 'set', variable: id.parse(cursor) };
  if (cursor.take(/unset[: \t][ \t]*/) !== null) return { kind: 'unset', variable: id.parse(cursor) };
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

function printResult(result: ActionResult): string {
  switch (result.kind) {
    case 'say':
      return `say: ${result.text}`;
    case 'set':
      return `set: ${result.variable}`;
    case 'unset':
      return `unset: ${result.variable}`;
    case 'give':
      return result.amount !== undefined ? `give: ${result.amount} ${result.item}` : `give: ${result.item}`;
    case 'take':
      return result.amount !== undefined ? `take: ${result.amount} ${result.item}` : `take: ${result.item}`;
    case 'xp':
      return `xp: ${result.skill} ${result.amount}`;
    case 'relocate':
      return `relocate: ${result.location}`;
    case 'discover':
      return `discover: ${result.location}`;
    case 'open-modal':
      return `open modal: ${result.modal}`;
  }
}

export function startsResult(cursor: Cursor): boolean {
  return cursor.peek(/(?:say|give|take|xp|relocate|discover|open modal):|(?:set|unset)[: \t]/) !== null;
}

export const actionResult: Codec<ActionResult> = {
  parse: parseResult,
  print: printResult,
};
