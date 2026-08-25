import { describe, expect, it } from 'vitest';
import { clickingOffLeaves, declaredFor, DEFAULT_MANNER, EVERY_MANNER, layerOf, mannerOf, showsTheBeat, type Manner } from './modalManner';

// Every claim below picks its subjects from EVERY_MANNER, which is built out of the tables that
// have to resolve a word rather than listed beside the type. A strategy grown next month is held to
// all of them with nothing edited here.

const withPlace = (place: Manner['place']): readonly Manner[] => EVERY_MANNER.filter((manner) => manner.place === place);

describe('the manner a screen is drawn in', () => {
  it('offers more than one of each strategy, so nothing below holds by there being one answer', () => {
    expect(new Set(EVERY_MANNER.map((manner) => manner.place)).size).toBeGreaterThan(1);
    expect(new Set(EVERY_MANNER.map((manner) => manner.behind)).size).toBeGreaterThan(1);
    expect(new Set(EVERY_MANNER.map((manner) => manner.over)).size).toBeGreaterThan(1);
    expect(EVERY_MANNER).toContainEqual(DEFAULT_MANNER);
  });

  it('gives a screen that says nothing the one manner, and a screen that says something the rest of it', () => {
    expect(mannerOf({}, false)).toEqual(DEFAULT_MANNER);
    for (const manner of EVERY_MANNER) expect(mannerOf(manner, false)).toEqual(manner);
    expect(mannerOf({ over: 'pane' }, false)).toEqual({ ...DEFAULT_MANNER, over: 'pane' });
  });

  it('centres a screen with nothing left to answer wherever it would have sat under the thumb, and moves no other', () => {
    for (const manner of EVERY_MANNER) {
      const asked = mannerOf(manner, true);
      expect(asked.place, manner.place).toBe(manner.place === 'bottom' ? 'centre' : manner.place);
      expect({ ...asked, place: manner.place }, manner.place).toEqual(manner);
    }
  });

  it('lays every manner out as a positioned layer filling what it is over', () => {
    for (const manner of EVERY_MANNER) {
      const layer = layerOf(manner);
      expect(layer, layer).toMatch(/^(?:fixed|absolute) inset-0 z-50 /);
      expect(layer, layer).toContain('flex flex-col');
    }
  });

  it('darkens what is behind exactly the screens that say to, and nothing else', () => {
    for (const manner of EVERY_MANNER) expect(layerOf(manner).includes('bg-scrim'), JSON.stringify(manner)).toBe(manner.behind === 'dim');
  });

  it('takes the whole app or stays on its page, and one of the two every time', () => {
    for (const manner of EVERY_MANNER) {
      const layer = layerOf(manner);
      expect(layer.startsWith('fixed '), JSON.stringify(manner)).toBe(manner.over === 'app');
      expect(layer.startsWith('absolute '), JSON.stringify(manner)).toBe(manner.over === 'pane');
    }
  });

  it('leaves room around a screen that sits on the surface and none around one that is the surface', () => {
    for (const manner of withPlace('fill')) expect(layerOf(manner), JSON.stringify(manner)).not.toContain('px-4');
    for (const manner of EVERY_MANNER.filter((each) => each.place !== 'fill')) expect(layerOf(manner), JSON.stringify(manner)).toContain('px-4');
  });

  it('closes on a tap beside it wherever there is a way out and something beside it to tap', () => {
    for (const manner of EVERY_MANNER) {
      expect(clickingOffLeaves(manner, false), `${manner.place} with no way out`).toBe(false);
      expect(clickingOffLeaves(manner, true), `${manner.place} with a way out`).toBe(manner.place !== 'fill');
    }
  });

  it('draws the beat it is answering exactly where it took the beat away', () => {
    for (const manner of EVERY_MANNER) {
      expect(showsTheBeat(manner), JSON.stringify(manner)).toBe(manner.behind === 'dim' && manner.place !== 'fill');
      if (showsTheBeat(manner)) expect(layerOf(manner), 'a screen drawing the beat is the one that scrimmed it').toContain('bg-scrim');
    }
  });

  it('reads the departure off what the engine says the screen is about, having no name to read', () => {
    expect(declaredFor(null)).toEqual({});
    expect(mannerOf(declaredFor({ kind: 'plane', instance: 'blade', hex: '0,0' }), false).place).toBe('fill');
    expect(mannerOf(declaredFor({ kind: 'quest', quest: 'finding-your-feet' }), false)).toEqual(DEFAULT_MANNER);
  });
});
