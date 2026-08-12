import { describe, expect, it } from 'vitest';
import { createTransientChannel } from './transient';

function fakeClock(): { schedule: (expire: () => void, ms: number) => void; run: () => void } {
  const due: Array<() => void> = [];
  return {
    schedule: (expire) => void due.push(expire),
    run: () => {
      const pending = due.splice(0);
      for (const expire of pending) expire();
    },
  };
}

describe('the channel every moment is played through', () => {
  it('carries any text at all, and nothing about where it came from', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.play('note', '+12 Woodcutting');
    channel.play('note', 'anything');

    expect(channel.notes().map((note) => note.text)).toEqual(['+12 Woodcutting', 'anything']);
    expect(Object.keys(channel.notes()[0])).toEqual(['id', 'text']);
  });

  it('drops a note when its lifetime is up, leaving the ones still running', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.play('note', 'first');
    clock.run();
    channel.play('note', 'second');

    expect(channel.notes().map((note) => note.text)).toEqual(['second']);
  });

  it('tells a subscriber both times, and stops when it unsubscribes', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });
    let told = 0;
    const stop = channel.subscribe(() => void told++);

    channel.play('note', 'one');
    clock.run();
    stop();
    channel.play('note', 'two');

    expect(told).toBe(2);
  });

  it('hands back the same array until something changes', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    const before = channel.notes();
    expect(channel.notes()).toBe(before);
    channel.play('note', 'now');
    expect(channel.notes()).not.toBe(before);
  });

  it('hands a caller what its node needs, which is what makes asking the writing-down', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    expect(channel.play('arrival', 'guide-house')).toBe('arrived');
    expect(channel.play('rise')).toBe('risen');
    expect(channel.play('darken')).toBe('darkened');
    // A settle is written onto a node rather than named as a class, so what it
    // hands back is a transition and the only place that string is written.
    expect(channel.play('settle')).toMatch(/^transform \d+ms /);
    // A note is drawn by the channel itself, so its node needs nothing.
    expect(channel.play('note', 'text')).toBe('');
  });

  it('reports what played since a cursor, not what is playing at it', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    channel.play('arrival', 'guide-house');
    const first = channel.playedSince(0);
    channel.play('rise');
    channel.play('note', '+3 Cooking');
    const next = channel.playedSince(first.cursor);

    expect(first.moments.map((moment) => moment.kind)).toEqual(['arrival']);
    expect(first.moments[0].subject).toBe('guide-house');
    expect(next.moments.map((moment) => moment.kind)).toEqual(['rise', 'note']);
  });

  it('moves the cursor over a step that played nothing, so the next read is not the last one again', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    channel.play('arrival', 'guide-house');
    const after = channel.playedSince(0);
    const quiet = channel.playedSince(after.cursor);

    expect(quiet.moments).toEqual([]);
    expect(quiet.cursor).toBe(after.cursor);
  });

  it('reports a moment that is already over, which is the whole reason it is a log', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.play('note', 'gone by now');
    clock.run();

    expect(channel.notes()).toEqual([]);
    expect(channel.playedSince(0).moments.map((moment) => moment.subject)).toEqual(['gone by now']);
  });

  it('keeps the log bounded, dropping the oldest rather than growing without end', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule, limit: 3 });

    for (const place of ['one', 'two', 'three', 'four']) channel.play('arrival', place);

    expect(channel.playedSince(0).moments.map((moment) => moment.subject)).toEqual(['two', 'three', 'four']);
  });
});
