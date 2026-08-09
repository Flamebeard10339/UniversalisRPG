import { DslError, Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { humanize, id, text } from '../grammar/values';

// The closed set of moments a name may be bound to. It is closed because an
// entity's `on <name>:` resolves to a declaration rather than to a word, so a
// trigger nothing produces would be a handler that never runs.
export const EVENT_TRIGGERS = ['on empty', 'on full'] as const;
export type EventTrigger = (typeof EVENT_TRIGGERS)[number];

// A name bound to a pool crossing a threshold. Any entity may handle it, and the
// results of a handler land on the entity it happened to.
export interface GameEvent {
  id: string;
  title: string;
  resource: string;
  trigger: EventTrigger;
}

const triggerValue: Parser<EventTrigger> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/on[ \t]+[a-z][a-z0-9-]*/);
    const normalized = raw?.replace(/[ \t]+/, ' ');
    if (!normalized || !(EVENT_TRIGGERS as readonly string[]).includes(normalized)) {
      throw new DslError(`event trigger must be one of ${EVENT_TRIGGERS.join(', ')}, got ${JSON.stringify(raw ?? cursor.rest())}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return normalized as EventTrigger;
  },
};

export const eventSchema: SectionSchema<GameEvent> = {
  kind: 'event',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    resource: { parser: id },
    trigger: { parser: triggerValue },
  },
};
