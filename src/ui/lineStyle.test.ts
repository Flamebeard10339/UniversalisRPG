import { describe, expect, it } from 'vitest';
import { fillOf, TONE_CLASS, VOICE_CLASS } from './lineStyle';

// The subjects are whatever the two records hold, so a line kind or a tone added next month is held
// to the same separation with nothing edited here.
const voices = Object.entries(VOICE_CLASS);
const tones = Object.entries(TONE_CLASS);

const words = (written: string): string[] => written.split(/\s+/).filter((word) => word !== '');

const fills = (written: string): string[] => words(written).filter((word) => word.startsWith('bg-'));

const colours = (written: string): string[] => words(written).filter((word) => word.startsWith('text-') && !/^text-(xs|sm|base|lg|xl|left|right|center)$/.test(word));

describe('the two channels a transcript line carries colour on', () => {
  it('are asked of every line kind and every tone there is, so nothing below is vacuous', () => {
    expect(voices.length).toBeGreaterThan(3);
    expect(tones.length).toBeGreaterThan(3);
  });

  it('never lets a voice fill anything, since a fill is the group and a group is not a voice', () => {
    expect(voices.flatMap(([kind, written]) => fills(written).map((word) => `${kind} fills with ${word}`))).toEqual([]);
  });

  it('never lets a tone stand in for the voice it decorates, or for a fill', () => {
    expect(tones.flatMap(([tone, written]) => [...colours(written), ...fills(written)].map((word) => `${tone} takes ${word}`))).toEqual([]);
  });

  it('gives the engine speaking to the player a colour of its own rather than its tone\'s', () => {
    const spoken = voices.filter(([, written]) => colours(written).length > 0);
    expect(spoken.map(([kind]) => kind)).toContain('message');
    expect(new Set(spoken.map(([, written]) => colours(written).join(' '))).size).toBe(spoken.length);
  });

  it('leaves a place change to the break above it rather than to a colour', () => {
    expect(colours(VOICE_CLASS.place)).toEqual([]);
    expect(fills(VOICE_CLASS.place)).toEqual([]);
  });
});

describe('what a cell is filled with', () => {
  it('is the group and nothing else, both the wash and the edge', () => {
    const style = fillOf({ colour: '#22d3ee' });
    expect(String(style.backgroundColor)).toContain('#22d3ee');
    expect(style.borderColor).toBe('#22d3ee');
    expect(Object.keys(style).sort()).toEqual(['backgroundColor', 'borderColor']);
  });

  it('is nothing at all where nothing says what the thing is', () => {
    expect(fillOf(undefined)).toEqual({});
  });
});
