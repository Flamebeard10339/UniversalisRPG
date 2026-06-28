import { describe, expect, it } from 'vitest';
import { buildDisplayMessages } from './ChatPanel';
import type { ChatMessage } from '../game/types';
import type { Translator } from '../game/i18n';

const t: Translator = (key, fallbackOrParams) => {
  const params = typeof fallbackOrParams === 'object' ? fallbackOrParams : {};

  if (key === 'kill') return `You killed the ${params.target}.`;
  if (key === 'hit') return `You hit the ${params.target} for ${params.damage} damage.`;
  return typeof fallbackOrParams === 'string' ? fallbackOrParams : key;
};

const message = (
  id: number,
  key: string,
  params: Record<string, string | number>,
  count = 1,
): ChatMessage => ({
  author: 'system',
  key,
  params,
  id,
  count,
  createdAt: id,
});

describe('buildDisplayMessages', () => {
  it('compresses matching rendered messages across intervening chat and orders by latest occurrence', () => {
    const display = buildDisplayMessages([
      message(1, 'kill', { target: 'goblin' }),
      message(2, 'kill', { target: 'ork' }),
      message(3, 'kill', { target: 'goblin' }),
      message(4, 'kill', { target: 'goblin' }),
      message(5, 'kill', { target: 'ork' }),
      message(6, 'kill', { target: 'goblin' }),
    ], t, true);

    expect(display.map((entry) => `${entry.text} (${entry.count})`)).toEqual([
      'You killed the ork. (2)',
      'You killed the goblin. (4)',
    ]);
  });

  it('groups by rendered text so hidden params do not split identical display messages', () => {
    const display = buildDisplayMessages([
      message(1, 'kill', { target: 'goblin', damage: 1 }),
      message(2, 'kill', { target: 'goblin', damage: 99 }),
    ], t, true);

    expect(display).toHaveLength(1);
    expect(display[0]).toMatchObject({
      text: 'You killed the goblin.',
      count: 2,
    });
  });

  it('does not compress messages with different rendered text', () => {
    const display = buildDisplayMessages([
      message(1, 'hit', { target: 'goblin', damage: 1 }),
      message(2, 'hit', { target: 'goblin', damage: 2 }),
    ], t, true);

    expect(display.map((entry) => entry.text)).toEqual([
      'You hit the goblin for 1 damage.',
      'You hit the goblin for 2 damage.',
    ]);
  });

  it('preserves the visible stream when compression is disabled', () => {
    const display = buildDisplayMessages([
      message(1, 'kill', { target: 'goblin' }),
      message(2, 'kill', { target: 'goblin' }, 3),
    ], t, false);

    expect(display.map((entry) => [entry.text, entry.count])).toEqual([
      ['You killed the goblin.', 1],
      ['You killed the goblin.', 3],
    ]);
  });
});
