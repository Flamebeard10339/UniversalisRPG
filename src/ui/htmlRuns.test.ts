import { describe, expect, it } from 'vitest';
import { htmlRuns } from './htmlRuns';

describe('the runs rendered markup puts in front of a reader', () => {
  it('reads a tag with no words as a break and nothing else', () => {
    expect(htmlRuns('<p class="loud">Up the stair</p><hr/>')).toEqual(['Up the stair']);
  });

  it('reads an aria-label as the words the tag carrying it says', () => {
    expect(htmlRuns('<button aria-label="Open the chest"></button>')).toEqual(['Open the chest']);
  });

  it('reads a label where the tag carrying it stands, not after the text beside it', () => {
    expect(htmlRuns('<span>Before</span><button aria-label="Between"/><span>After</span>')).toEqual(['Before', 'Between', 'After']);
  });

  it('reads an escaped entity as the character it stands for', () => {
    expect(htmlRuns('<p>Rowan&#x27;s &amp; Miki&#x27;s</p>')).toEqual(["Rowan's & Miki's"]);
  });

  it('reads no label off an attribute that merely ends in one', () => {
    expect(htmlRuns('<div data-aria-label="Not a label">Said</div>')).toEqual(['Said']);
  });
});
