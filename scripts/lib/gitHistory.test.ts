import { describe, expect, it } from 'vitest';
import { headingsChangedIn } from './gitHistory';

// A patch is text, so nothing here runs git either. What is under test is the one reading this file
// does — which heading moved, in which file, carrying which words — and the log it came out of is
// written down rather than produced.

const MARK = String.fromCharCode(1);

const patch = (...lines: string[]): string => lines.join('\n');

const commit = (sha: string, subject: string): string => `${MARK}${sha} ${subject}`;

const inFile = (file: string): string[] => ['diff --git a/' + file + ' b/' + file, 'index 4c082df3..034a9fae 100644', '--- a/' + file, '+++ b/' + file];

const RENAME = patch(
  commit('56a7768bee312c8f5c191628a7efb706124bc7c1', 'thieving.dsl review'),
  '',
  ...inFile('content/thieving.dsl'),
  '@@ -166,5 +86,3 @@ tools, +4 thieving',
  '-# item a-quiet-hour-jewel',
  '-title: A Quiet Hour',
  '-examine: A blank iron token on a thong.',
  '+# item thieving-ability-jewel',
  '+title: Quiet Hour',
);

describe('what a patch says about headings', () => {
  it('reads a heading under the module its file is, so a heading and a save body name one id', () => {
    const [change] = headingsChangedIn(RENAME);

    expect(change!.removed).toEqual([{ file: 'content/thieving.dsl', kind: 'item', id: 'thieving.a-quiet-hour-jewel', title: 'A Quiet Hour' }]);
    expect(change!.added).toEqual([{ file: 'content/thieving.dsl', kind: 'item', id: 'thieving.thieving-ability-jewel', title: 'Quiet Hour' }]);
  });

  it('carries the commit it was written in', () => {
    expect(headingsChangedIn(RENAME)[0]).toMatchObject({ sha: '56a7768bee312c8f5c191628a7efb706124bc7c1', subject: 'thieving.dsl review' });
  });

  it('leaves a heading that already names a module under the module it names', () => {
    const [change] = headingsChangedIn(patch(commit('a1', 'x'), ...inFile('content/tiers.dsl'), '@@ -1 +1 @@', '-# save thieving.tier-1'));

    expect(change!.removed[0]!.id).toBe('thieving.tier-1');
  });

  it('takes no title across a hunk boundary, where the two were never adjacent in the file', () => {
    const [change] = headingsChangedIn(patch(commit('a1', 'x'), ...inFile('content/t.dsl'), '@@ -1 +1 @@', '-# item old', '@@ -9 +9 @@', '-title: Somewhere Else'));

    expect(change!.removed[0]!.title).toBeUndefined();
  });

  it('takes no title off the other side of the diff', () => {
    const [change] = headingsChangedIn(patch(commit('a1', 'x'), ...inFile('content/t.dsl'), '@@ -1 +1 @@', '-# item old', '+title: Arrived With Something Else'));

    expect(change!.removed[0]!.title).toBeUndefined();
  });

  it('attributes each heading to the file it stands in, across a commit that touched several', () => {
    const [change] = headingsChangedIn(
      patch(commit('a1', 'x'), ...inFile('content/one.dsl'), '@@ -1 +1 @@', '-# item gone', ...inFile('content/two.dsl'), '@@ -1 +1 @@', '+# item arrived'),
    );

    expect(change!.removed[0]!.file).toBe('content/one.dsl');
    expect(change!.added[0]!.id).toBe('two.arrived');
  });

  it('splits one log into the commits it holds, newest first as the log gives them', () => {
    const two = patch(commit('bbb2', 'second'), ...inFile('content/t.dsl'), '@@ -1 +1 @@', '-# item b', commit('aaa1', 'first'), ...inFile('content/t.dsl'), '@@ -1 +1 @@', '-# item a');

    expect(headingsChangedIn(two).map((change) => change.sha)).toEqual(['bbb2', 'aaa1']);
  });

  it('has nothing to say about a patch that moved no heading', () => {
    expect(headingsChangedIn(patch(commit('a1', 'x'), ...inFile('content/t.dsl'), '@@ -1 +1 @@', '-value: 10', '+value: 20'))[0]).toMatchObject({ removed: [], added: [] });
  });
});
