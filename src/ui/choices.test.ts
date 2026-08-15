import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { groupOffers } from './choices';
import { drawnFor, type Place } from './discovery';

const choice = (id: string, label: string, detail?: string): PlayView['choices'][number] => ({ id, kind: 'action', label: asLocalized(label), ...(detail ? { detail: asLocalized(detail) } : {}) });

describe('the offers on the sheet', () => {
  it('gathers what one object offers, in the order the engine listed it', () => {
    const groups = groupOffers([
      choice('a', 'Talk to Miki'),
      choice('b', 'ascend', 'Stairs'),
      choice('c', 'look in', 'Mirror'),
      choice('d', 'descend', 'Stairs'),
    ]);

    expect(groups.map((group) => group.source)).toEqual([null, 'Stairs', 'Mirror']);
    expect(groups[1].offers.map((offer) => offer.label)).toEqual(['ascend', 'descend']);
  });

  it('keeps the position the engine listed each one at, which grouping moves', () => {
    const groups = groupOffers([choice('a', 'ascend', 'Stairs'), choice('b', 'Talk to Miki'), choice('c', 'descend', 'Stairs')]);

    expect(groups[0].offers.map((offer) => offer.position)).toEqual([1, 3]);
    expect(groups[1].offers.map((offer) => offer.position)).toEqual([2]);
  });

  it('has nothing to group when the engine is offering nothing', () => {
    expect(groupOffers([])).toEqual([]);
  });

  it('leaves out the places that are a walk away, and keeps the one next door', () => {
    const near: PlayView['choices'][number] = { id: 'travel:yard', kind: 'travel', label: asLocalized('Travel to Yard'), leadsTo: 'yard', legs: 1 };
    const far: PlayView['choices'][number] = { id: 'travel:ford', kind: 'travel', label: asLocalized('Travel to Ford'), leadsTo: 'ford', legs: 3 };

    const groups = groupOffers([choice('a', 'Talk to Miki'), near, far]);

    expect(groups.flatMap((group) => group.offers.map((offer) => offer.id))).toEqual(['a', 'travel:yard']);
    // The position is still the engine's, so the sheet dispatches the right
    // line however many offers it left off it.
    expect(groups[0].offers.map((offer) => offer.position)).toEqual([1, 2]);
  });

  // The sheet drops a walk-away offer because the map carries it, and the map
  // carries it whatever plane is being looked at. Held here rather than left to
  // either file's comment, because it is the one claim neither owns alone.
  it('withdraws a walk-away offer only where the map is drawing the place it leads to', () => {
    const at = (id: string, z: number, ...adjacent: string[]): Place => ({ id, title: asLocalized(id.toUpperCase()), x: 0, y: 0, z, adjacent: adjacent.map((to) => ({ to, open: true })) });
    // Two roads out and two floors down from where the player is standing.
    const discovered = [at('landing', 1, 'hall'), at('hall', 0, 'landing', 'cellar'), at('cellar', -1, 'hall')];
    const walk: PlayView['choices'][number] = { id: 'travel:cellar', kind: 'travel', label: asLocalized('Travel to Cellar'), leadsTo: 'cellar', legs: 2 };
    const offers = [choice('a', 'Talk to Miki'), walk];
    const view = { discovered, location: { id: 'landing' }, choices: offers } as unknown as PlayView;

    expect(groupOffers(offers).flatMap((group) => group.offers.map((offer) => offer.id))).toEqual(['a']);
    // Drawn through what the component draws through, and on the plane the
    // player is left standing on rather than one asked for.
    const drawn = drawnFor(view, null);
    expect(drawn.plane).toBe(1);
    expect(drawn.sheet.nodes.map((node) => node.place.id)).toContain('cellar');
    expect(drawn.travels.get('cellar')).toBe(2);
  });
});
