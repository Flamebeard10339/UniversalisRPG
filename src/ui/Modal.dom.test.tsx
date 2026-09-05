import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Localized } from '../runtime/localized';
import { Modal } from './Modal';
import { A_CHARACTER, cutTo, lettersIn } from './reveal';

const FIRST = 'the smith looks up from the anvil' as Localized;

const UNDER = 'a bird calls somewhere behind you' as Localized;

function asABrowserWould(): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
    media,
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

function beingRead(): {
  says: (spoken: readonly Localized[]) => void;
  shown: () => string[];
  waits: () => boolean;
  type: (characters: number) => void;
  close: () => void;
} {
  asABrowserWould();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  return {
    says: (spoken) => void act(() => root.render(<Modal manner={{}} subject="a-modal" spoken={spoken} paced />)),
    shown: () => [...host.querySelectorAll('p')].map((each) => each.textContent ?? ''),
    waits: () => host.querySelector('[data-drive="beat.press"]') !== null,
    type: (characters) => {
      for (let each = 0; each < characters; each += 1) act(() => void vi.advanceTimersByTime(A_CHARACTER));
    },
    close: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('a modal being read a character at a time', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('keeps the place it had read to when a quiet tick says nothing under it', () => {
    const read = beingRead();
    read.says([FIRST]);
    read.type(5);
    const reached = read.shown();
    expect(reached).toEqual([cutTo(FIRST, 5)]);

    read.says([]);

    expect(read.shown(), 'a tick that said nothing took the beat away').toEqual(reached);
    read.close();
  });

  it('keeps the place it had read to when the world speaks under it, and carries on from there', () => {
    const read = beingRead();
    read.says([FIRST]);
    read.type(5);

    read.says([UNDER]);

    expect(read.shown(), 'a line said under the beat restarted the one being read').toEqual([cutTo(FIRST, 5)]);
    read.type(3);
    expect(read.shown()).toEqual([cutTo(FIRST, 8)]);
    read.close();
  });

  it('waits on the reader at the end of the only line there is, because nothing stands behind it', () => {
    const read = beingRead();
    read.says([FIRST]);
    read.type(lettersIn(FIRST));

    expect(read.shown()).toEqual([FIRST]);
    expect(read.waits()).toBe(false);
    read.close();
  });

  it('holds what was said under it behind the line being read, rather than dropping it', () => {
    const read = beingRead();
    read.says([FIRST]);
    read.type(2);

    read.says([UNDER]);
    read.type(lettersIn(FIRST));

    expect(read.shown()).toEqual([FIRST]);
    expect(read.waits(), 'the line said under the beat was never added to it').toBe(true);
    read.close();
  });
});
