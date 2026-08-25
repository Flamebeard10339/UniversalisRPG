import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import { sayingOf, type Notice } from './notice';
import { createTransientChannel } from './transient';

const notice = (text: string, count = 0, key = text): Notice => ({ key, count, words: asLocalized(text) });

function fakeClock(): { schedule: (expire: () => void, ms: number) => void; run: () => void; next: () => void } {
  const due: Array<() => void> = [];
  return {
    schedule: (expire) => void due.push(expire),
    run: () => {
      const pending = due.splice(0);
      for (const expire of pending) expire();
    },
    next: () => due.shift()?.(),
  };
}

describe('the channel every moment is played through', () => {
  it('carries any words at all, and nothing about where they came from', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.note(notice('Woodcutting', 12, 'xp:woodcutting'));
    channel.note(notice('anything'));

    expect(channel.notices().map(sayingOf)).toEqual(['anything', '+12 Woodcutting']);
  });

  it('drops a notification when its lifetime is up, leaving the ones still running', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.note(notice('first'));
    clock.run();
    channel.note(notice('second'));

    expect(channel.notices().map(sayingOf)).toEqual(['second']);
  });

  it('keeps one alive while it is still being fed, without reading a clock to do it', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.note(notice('Rope', 1, 'item:rope'));
    channel.note(notice('Rope', 2, 'item:rope'));
    clock.next();

    expect(channel.notices().map(sayingOf)).toEqual(['+3 Rope']);
    clock.next();
    expect(channel.notices()).toEqual([]);
  });

  it('tells a subscriber both times, and stops when it unsubscribes', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });
    let told = 0;
    const stop = channel.subscribe(() => void told++);

    channel.note(notice('one'));
    clock.run();
    stop();
    channel.note(notice('two'));

    expect(told).toBe(2);
  });

  it('hands back the same array until something changes', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    const before = channel.notices();
    expect(channel.notices()).toBe(before);
    channel.note(notice('now'));
    expect(channel.notices()).not.toBe(before);
  });

  it('hands a caller what its node needs, which is what makes asking the writing-down', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    expect(channel.play('arrival', 'guide-house')).toBe('arrived');
    expect(channel.play('rise')).toBe('risen');
    expect(channel.play('darken')).toBe('darkened');
    expect(channel.play('settle')).toMatch(/^transform \d+ms /);
  });

  it('reports what played since a cursor, not what is playing at it', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    channel.play('arrival', 'guide-house');
    const first = channel.playedSince(0);
    channel.play('rise');
    channel.note(notice('Cooking', 3, 'xp:cooking'));
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

    channel.note(notice('gone by now'));
    clock.run();

    expect(channel.notices()).toEqual([]);
    expect(channel.playedSince(0).moments.map((moment) => moment.subject)).toEqual(['gone by now']);
  });

  it('keeps the log bounded, dropping the oldest rather than growing without end', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule, limit: 3 });

    for (const place of ['one', 'two', 'three', 'four']) channel.play('arrival', place);

    expect(channel.playedSince(0).moments.map((moment) => moment.subject)).toEqual(['two', 'three', 'four']);
  });
});
