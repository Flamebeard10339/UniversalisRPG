import { describe, expect, it } from 'vitest';
import { asLocalized } from './localizedFixture';
import type { PlayChoice } from './session';
import { waysOut } from './waysOut';

const offer = (id: string, leadsTo?: string): PlayChoice => ({ id, kind: leadsTo ? 'travel' : 'action', label: asLocalized(id), ...(leadsTo === undefined ? {} : { leadsTo }) });

const at = (ways: ReturnType<typeof waysOut>, to: string): number | undefined => ways.find((way) => way.to === to)?.at;

describe('which offer is the way to a place', () => {
  it('answers with the position a driver dispatches it at, counting from one', () => {
    const ways = waysOut([offer('look'), offer('travel:beach', 'beach'), offer('travel:cove', 'cove')]);

    expect(at(ways, 'beach')).toBe(2);
    expect(at(ways, 'cove')).toBe(3);
  });

  it('takes a staircase, which publishes an action and not a travel', () => {
    const stairs: PlayChoice = { id: 'use:entity.stairs.ascend', kind: 'action', label: asLocalized('ascend'), leadsTo: 'landing' };

    expect(at(waysOut([stairs]), 'landing')).toBe(1);
  });

  it('leaves out an offer that goes nowhere, so it can never be dispatched by a tap on a place', () => {
    expect(waysOut([offer('roast chestnuts'), offer('talk to miki')])).toEqual([]);
  });

  it('keeps the first of two ways to one place, which is the order the engine offered them', () => {
    const ways = waysOut([offer('a'), offer('travel:beach', 'beach'), offer('use:entity.path.walk', 'beach')]);

    expect(ways.filter((way) => way.to === 'beach').map((way) => way.at)).toEqual([2]);
  });

  it('carries the words the engine put on the offer, so nobody names a destination twice', () => {
    expect(waysOut([offer('travel:beach', 'beach')])[0].label).toBe('travel:beach');
  });
});
