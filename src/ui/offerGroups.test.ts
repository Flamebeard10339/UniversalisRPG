import { describe, expect, it } from 'vitest';
import type { Offer } from '../content/completion';
import { grouped, shownIn } from './offerGroups';

const offer = (form: string, kind?: string): Offer => ({ form, insert: form, ...(kind === undefined ? {} : { kind }) });

describe('what the grammar offers', () => {
  it('gathers the shapes one keyword takes under that keyword', () => {
    const groups = grouped([offer('give: <item>'), offer('give: <count> <item>'), offer('take: <count> <item>')]);
    expect(groups.map((group) => group.head)).toEqual(['give:', null]);
    expect(groups[0].offers.map((each) => shownIn(groups[0], each))).toEqual(['<item>', '<count> <item>']);
  });

  it('says so when a keyword stands on its own line as well', () => {
    const groups = grouped([offer('stations: <id>, …'), offer('stations:')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].offers.map((each) => shownIn(groups[0], each))).toEqual(['<id>, …', '(on its own)']);
  });

  it('leaves a lone shape ungathered', () => {
    expect(grouped([offer('title: <text>')]).map((group) => group.head)).toEqual([null]);
  });

  it('leaves ids alone, each naming a different thing', () => {
    expect(grouped([offer('tutorial-island.beach', 'location'), offer('tutorial-island.basement', 'location')]).map((group) => group.head)).toEqual([null, null]);
  });
});
