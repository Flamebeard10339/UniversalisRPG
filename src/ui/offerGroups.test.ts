import { describe, expect, it } from 'vitest';
import type { Offer } from '../content/completion';
import { gathered, shownIn } from './offerGroups';

const offer = (form: string, family?: string, kind?: string): Offer => ({ form, insert: form, ...(family === undefined ? {} : { family }), ...(kind === undefined ? {} : { kind }) });

const only = (offers: readonly Offer[]) => gathered(offers)[0].groups;

describe('what the grammar offers', () => {
  it('gathers the shapes one keyword takes under that keyword', () => {
    const groups = only([offer('give: <item>'), offer('give: <count> <item>'), offer('take: <count> <item>')]);
    expect(groups.map((group) => group.head)).toEqual(['give:', null]);
    expect(groups[0].offers.map((each) => shownIn(groups[0], each))).toEqual(['<item>', '<count> <item>']);
  });

  it('lifts the keyword that opens a block into the heading itself', () => {
    const groups = only([offer('stations: <id>, …'), offer('stations:')]);
    expect(groups[0].opens?.form).toBe('stations:');
    expect(groups[0].offers.map((each) => shownIn(groups[0], each))).toEqual(['<id>, …']);
  });

  it('leaves a lone shape ungathered', () => {
    expect(only([offer('title: <text>')]).map((group) => group.head)).toEqual([null]);
  });

  it('sorts the shapes into the parts of the thing they belong to', () => {
    const families = gathered([offer('requires: <condition>', 'offered when'), offer('time: <seconds>', 'how long'), offer('give: <item>', 'what happens')]);
    expect(families.map((family) => family.name)).toEqual(['offered when', 'how long', 'what happens']);
  });

  it('brings a part together wherever its shapes were written', () => {
    const families = gathered([offer('time: <seconds>', 'how long'), offer('requires: <condition>', 'offered when'), offer('attempts: <count>', 'how long')]);
    expect(families.map((family) => family.name)).toEqual(['how long', 'offered when']);
    expect(families[0].groups.flatMap((group) => group.offers.map((each) => each.form))).toEqual(['time: <seconds>', 'attempts: <count>']);
  });

  it('sorts ids by the kind of thing each names', () => {
    const families = gathered([offer('forest.oak', undefined, 'location'), offer('forest.rat', undefined, 'entity')]);
    expect(families.map((family) => family.name)).toEqual(['location', 'entity']);
    expect(families[0].groups.map((group) => group.head)).toEqual([null]);
  });
});
