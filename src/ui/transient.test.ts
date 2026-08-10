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

describe('the transient channel', () => {
  it('carries any text at all, and nothing about where it came from', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.announce('+12 Woodcutting');
    channel.announce('anything');

    expect(channel.notes().map((note) => note.text)).toEqual(['+12 Woodcutting', 'anything']);
    expect(Object.keys(channel.notes()[0])).toEqual(['id', 'text']);
  });

  it('drops a note when its lifetime is up, leaving the ones still running', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });

    channel.announce('first');
    clock.run();
    channel.announce('second');

    expect(channel.notes().map((note) => note.text)).toEqual(['second']);
  });

  it('tells a subscriber both times, and stops when it unsubscribes', () => {
    const clock = fakeClock();
    const channel = createTransientChannel({ schedule: clock.schedule });
    let told = 0;
    const stop = channel.subscribe(() => void told++);

    channel.announce('one');
    clock.run();
    stop();
    channel.announce('two');

    expect(told).toBe(2);
  });

  it('hands back the same array until something changes', () => {
    const channel = createTransientChannel({ schedule: fakeClock().schedule });

    const before = channel.notes();
    expect(channel.notes()).toBe(before);
    channel.announce('now');
    expect(channel.notes()).not.toBe(before);
  });
});
