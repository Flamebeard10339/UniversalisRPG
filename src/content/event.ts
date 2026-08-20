import { TITLE_FIELD } from './info';
import { DslError, Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { id } from '../grammar/values';

// The closed set of moments a name may be bound to, each beside whether it
// watches a pool. It is closed because an entity's `on <name>:` resolves to a
// declaration rather than to a word, so a trigger nothing produces would be a
// handler that never runs; the arity sits here because it is a property of the
// moment and is what decides whether `resource:` belongs on the declaration.
export const EVENT_TRIGGERS = {
  'on empty': 'pool',
  'on full': 'pool',
  'damage-dealt': 'none',
  'damage-taken': 'none',
  missed: 'none',
  evaded: 'none',
  completed: 'none',
  unfinished: 'none',
} as const;

export type EventTrigger = keyof typeof EVENT_TRIGGERS;

export const TRIGGER_NAMES: readonly EventTrigger[] = Object.keys(EVENT_TRIGGERS) as EventTrigger[];

export const watchesAPool = (trigger: EventTrigger): boolean => EVENT_TRIGGERS[trigger] === 'pool';

// Why this declaration's `resource:` disagrees with what its trigger takes, or
// undefined where the two agree. Asked of the assembled event, because a later
// module may be what supplies the `resource:` line.
export function triggerArityProblem(event: GameEvent): string | undefined {
  if (watchesAPool(event.trigger)) {
    return event.resource ? undefined : `trigger: ${event.trigger} watches a pool, so it needs a resource: naming which one`;
  }
  return event.resource === undefined ? undefined : `trigger: ${event.trigger} watches no pool, so it takes no resource:`;
}

// A name bound to a moment the runtime produces. Any entity may handle it, and
// the results of a handler land on the entity it happened to.
export interface GameEvent {
  id: string;
  title: string;
  resource?: string;
  trigger: EventTrigger;
}

const triggerValue: Parser<EventTrigger> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/(?:on[ \t]+)?[a-z][a-z0-9-]*/);
    const normalized = raw?.replace(/[ \t]+/, ' ');
    if (!normalized || !(TRIGGER_NAMES as readonly string[]).includes(normalized)) {
      throw new DslError(`event trigger must be one of ${TRIGGER_NAMES.join(', ')}, got ${JSON.stringify(raw ?? cursor.rest())}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return normalized as EventTrigger;
  },
  print: (value) => value,
  examples: [...TRIGGER_NAMES],
};

export const eventSchema: SectionSchema<GameEvent> = {
  kind: 'event',
  fields: {
    title: TITLE_FIELD,
    resource: { parser: id },
    trigger: { parser: triggerValue },
  },
};
