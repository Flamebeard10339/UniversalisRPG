import { describe, expect, it } from 'vitest';
import { actionAddress } from '../content/sections/action';
import { mintedActions } from '../content/sections/entity';
import { useChoiceId } from '../content/sections/test';
import { asLocalized } from '../runtime/localizedFixture';
import { sheetOffers, type PlayView } from '../runtime/session';
import { drawsNothing, groupOffers, offerCells } from './choices';
import { drawnFor, type Place } from './discovery';

// Whatever offers a choice is named as the engine names it and drawn as the engine draws it, which
// is one call there and is why the fixture cannot hand out one without the other.
const offeredBy = (source: string): Pick<PlayView['choices'][number], 'of' | 'detail'> => ({ of: `entity.${source.toLowerCase().replace(/ /g, '-')}`, detail: asLocalized(source) });

const choice = (id: string, label: string, detail?: string): PlayView['choices'][number] => ({ id, kind: 'action', label: asLocalized(label), ...(detail ? offeredBy(detail) : {}) });

const unread = (id: string, of: string): PlayView['choices'][number] => ({ id, kind: 'action', label: asLocalized('Examine'), of, detail: asLocalized('?') });

// The list the sheet is handed, cut and numbered by the engine rather than by this file — so a
// fixture cannot make a claim here that no view would ever put in front of the page.
const sheet = (...choices: PlayView['choices']): ReturnType<typeof sheetOffers> => sheetOffers({ choices });

describe('the offers on the sheet', () => {
  it('gathers what one object offers, in the order the engine listed it', () => {
    const groups = groupOffers(sheet(choice('a', 'Talk to Miki'), choice('b', 'ascend', 'Stairs'), choice('c', 'look in', 'Mirror'), choice('d', 'descend', 'Stairs')));

    expect(groups.map((group) => group.source)).toEqual([null, 'Stairs', 'Mirror']);
    expect(groups[1].offers.map((offer) => offer.label)).toEqual(['ascend', 'descend']);
  });

  it('keeps the position the engine listed each one at, which grouping moves', () => {
    const groups = groupOffers(sheet(choice('a', 'ascend', 'Stairs'), choice('b', 'Talk to Miki'), choice('c', 'descend', 'Stairs')));

    expect(groups[0].offers.map((offer) => offer.position)).toEqual([1, 3]);
    expect(groups[1].offers.map((offer) => offer.position)).toEqual([2]);
  });

  it('has nothing to group when the engine is offering nothing', () => {
    expect(groupOffers(sheet())).toEqual([]);
  });

  // A way out of here is how a player leaves without opening the map; anywhere further off is the
  // map's, which is what keeps a seventy-room town from arriving as a seventy-entry menu. What is
  // cut still counts, so `Look around` is answered as the fourth thing the engine offered though it
  // is drawn third — a page that counted its own list again would take the walk instead.
  it('keeps the way out of here, leaves what is further off to the map, and renumbers neither', () => {
    const near: PlayView['choices'][number] = { id: 'travel:yard', kind: 'travel', label: asLocalized('Travel to Yard'), leadsTo: 'yard', legs: 1 };
    const far: PlayView['choices'][number] = { id: 'travel:ford', kind: 'travel', label: asLocalized('Travel to Ford'), leadsTo: 'ford', legs: 3 };

    const groups = groupOffers(sheet(choice('a', 'Talk to Miki'), near, far, choice('b', 'Look around')));

    expect(groups.flatMap((group) => group.offers.map((offer) => offer.id))).toEqual(['a', 'travel:yard', 'b']);
    expect(groups[0].offers.map((offer) => offer.position)).toEqual([1, 2, 4]);
  });

  it("keeps a staircase, which is an entity's own action and only happens to move the player", () => {
    const stairs: PlayView['choices'][number] = { id: 'use:entity.stairs.ascend', kind: 'action', label: asLocalized('ascend'), detail: asLocalized('Stairs'), leadsTo: 'landing' };

    expect(groupOffers(sheet(stairs)).flatMap((group) => group.offers.map((offer) => offer.id))).toEqual(['use:entity.stairs.ascend']);
  });

  it('draws what one object offers as one cell under its name, and everything else a cell each', () => {
    const cells = offerCells(sheet(choice('a', 'Talk to Miki'), choice('b', 'ascend', 'Stairs'), choice('c', 'look in', 'Mirror'), choice('d', 'descend', 'Stairs')));

    expect(cells.map((cell) => cell.name)).toEqual([null, 'Stairs', 'Mirror']);
    expect(cells.map((cell) => cell.offers.map((offer) => offer.label))).toEqual([['Talk to Miki'], ['ascend', 'descend'], ['look in']]);
  });

  it('lifts the offer that reads a thing onto the cell, so it is not a control beside the rest', () => {
    const examine = useChoiceId({ kind: 'use', obj: 'entity', objId: 'smith', actionId: 'examine' });
    const cells = offerCells(sheet(choice(examine, 'Examine', 'Smith'), choice('b', 'Trade', 'Smith')));

    expect(cells[0].examine?.label).toBe('Examine');
    expect(cells[0].offers.map((offer) => offer.label)).toEqual(['Trade']);
  });

  it('picks that offer out by the address # entity mints it at, and not by a word of its own', () => {
    const minted = mintedActions({ id: 'smith', examine: 'Soot to the elbows.' }, null);
    expect(minted, 'an entity with an examine: mints nothing, so this claim holds vacuously').toHaveLength(1);

    const id = useChoiceId({ kind: 'use', obj: 'entity', objId: 'smith', actionId: actionAddress(minted[0]) });

    expect(offerCells(sheet(choice(id, 'Examine', 'Smith')))[0].examine?.id).toBe(id);
  });

  it('keeps the position of the offer it lifted, because the engine is still counting it', () => {
    const examine = useChoiceId({ kind: 'use', obj: 'entity', objId: 'smith', actionId: 'examine' });
    const cells = offerCells(sheet(choice('a', 'Trade', 'Smith'), choice(examine, 'Examine', 'Smith')));

    expect(cells[0].examine?.position).toBe(2);
    expect(cells[0].offers.map((offer) => offer.position)).toEqual([1]);
  });

  it('gives a cell nothing to read where the thing it draws offers no examine at all', () => {
    const cells = offerCells(sheet(choice('a', 'ascend', 'Stairs'), choice('b', 'Talk to Miki')));

    expect(cells.map((cell) => cell.examine)).toEqual([null, null]);
  });

  it('leaves a cell that nothing in particular offers with one offer on it, and no name over it', () => {
    const cells = offerCells(sheet(choice('a', 'Talk to Miki'), choice('b', 'Talk to Rowan')));

    expect(cells.map((cell) => cell.name)).toEqual([null, null]);
    expect(cells.map((cell) => cell.offers)).toHaveLength(2);
    for (const cell of cells) expect(cell.offers).toHaveLength(1);
  });

  // Everything nobody has read yet is drawn under the same placeholder, so a sheet keyed on the
  // words would gather a whole unread room into one box with one way into it.
  it('keeps two things nobody has read apart, though they are drawn under the same name', () => {
    const cells = offerCells(sheet(unread('use:entity.dresser.examine', 'entity.dresser'), unread('use:entity.cabinet.examine', 'entity.cabinet')));

    expect(cells.map((cell) => cell.of)).toEqual(['entity.dresser', 'entity.cabinet']);
    expect(cells.map((cell) => cell.name)).toEqual(['?', '?']);
    expect(cells.map((cell) => cell.examine?.id)).toEqual(['use:entity.dresser.examine', 'use:entity.cabinet.examine']);
    expect(cells.flatMap((cell) => cell.offers)).toEqual([]);
  });

  it('has nothing to draw when the engine is offering nothing', () => {
    expect(offerCells(sheet())).toEqual([]);
  });

  // The other half of the cut: what the page stops drawing is not what the player stops reaching.
  // The map is asked of the view's own list, so it still draws the far room and still walks there.
  it('leaves a walk two rooms off to the map, which draws the place it leads to and walks there still', () => {
    const at = (id: string, z: number, ...adjacent: string[]): Place => ({ id, title: asLocalized(id.toUpperCase()), x: 0, y: 0, z, adjacent: adjacent.map((to) => ({ to, open: true })) });
    const discovered = [at('landing', 1, 'hall'), at('hall', 0, 'landing', 'cellar'), at('cellar', -1, 'hall')];
    const walk: PlayView['choices'][number] = { id: 'travel:cellar', kind: 'travel', label: asLocalized('Travel to Cellar'), leadsTo: 'cellar', legs: 2 };
    const offers = [choice('a', 'Talk to Miki'), walk];
    const view = { discovered, location: { id: 'landing' }, choices: offers } as unknown as PlayView;

    expect(groupOffers(sheet(...offers)).flatMap((group) => group.offers.map((offer) => offer.id))).toEqual(['a']);
    const drawn = drawnFor(view, null);
    expect(drawn.plane).toBe(1);
    expect(drawn.sheet.nodes.map((node) => node.place.id)).toContain('cellar');
    expect(drawn.sheet.nodes.find((node) => node.place.id === 'cellar')?.goes).toBe(2);
  });
});

describe('a sheet with no cells on it', () => {
  it('has nothing to draw when the engine offers nothing at all', () => {
    expect(drawsNothing(sheet())).toBe(true);
  });

  it('has something to draw when a way out is all this place offers, since a way out is a cell like any other', () => {
    const walk: PlayView['choices'][number] = { id: 'travel:yard', kind: 'travel', label: asLocalized('Travel to Yard'), leadsTo: 'yard', legs: 1 };

    expect(drawsNothing(sheet(walk))).toBe(false);
  });

  it('has nothing to draw where every road out runs further than one step, those being the map\'s', () => {
    const far: PlayView['choices'][number] = { id: 'travel:ford', kind: 'travel', label: asLocalized('Travel to Ford'), leadsTo: 'ford', legs: 4 };

    expect(drawsNothing(sheet(far))).toBe(true);
  });

  it('has something to draw when anything reaches a cell', () => {
    expect(drawsNothing(sheet(choice('a', 'Talk to Miki')))).toBe(false);
  });
});
