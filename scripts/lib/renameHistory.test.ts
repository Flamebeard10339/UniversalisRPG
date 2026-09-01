import { describe, expect, it } from 'vitest';
import { inferRename, settled, type Change, type Heading, type RenameHistory } from './renameHistory';

const FILE = 'content/thieving.dsl';

const heading = (kind: string, id: string, title?: string): Heading => ({ file: FILE, kind, id, ...(title === undefined ? {} : { title }) });

const commit = (sha: string, subject: string, removed: Heading[], added: Heading[]): Change => ({ sha, subject, removed, added });

const history = (...changes: readonly Change[]): RenameHistory => ({
  removalsOf: (id) => changes.filter((change) => change.removed.some((each) => each.id === id)),
});

const world = (...ids: string[]) => (id: string): boolean => ids.includes(id);

describe('c1: what history is willing to stand behind', () => {
  it('takes a section that was the only one of its kind to move as renamed in place', () => {
    const found = inferRename('t.old', history(commit('abc123def', 'a rename', [heading('item', 't.old')], [heading('item', 't.new')])), world('t.new'));

    expect(found.to).toBe('t.new');
    expect(settled(found)).toBe(true);
    expect(found.evidence).toContain('abc123def a rename');
  });

  it('picks the one that kept its title out of a commit that swapped a file full of sections', () => {
    const swap = commit('56a7768be', 'thieving.dsl review', [heading('item', 't.a-quiet-hour-jewel', 'A Quiet Hour'), heading('item', 't.a-light-touch-jewel', 'A Light Touch')], [
      heading('item', 't.thieving-ability-jewel', 'Quiet Hour'),
      heading('item', 't.thieving-rate-jewel', 'Light Touch'),
    ]);

    const found = inferRename('t.a-quiet-hour-jewel', history(swap), world('t.thieving-ability-jewel', 't.thieving-rate-jewel'));

    expect(found.to).toBe('t.thieving-ability-jewel');
    expect(found.standing).toBe('the one that kept its title');
    expect(settled(found)).toBe(true);
  });

  it('reads a title through the article and the punctuation two authors differ over', () => {
    const swap = commit('a1', 'x', [heading('item', 't.gone', "A Fence's Eye"), heading('item', 't.other', 'Something Else')], [heading('item', 't.luck-jewel', "Fence's Eye"), heading('item', 't.spare', 'Nothing Alike')]);

    expect(inferRename('t.gone', history(swap), world('t.luck-jewel', 't.spare')).to).toBe('t.luck-jewel');
  });

  it('picks the one written out of the old name when no title survived the rewrite', () => {
    const swap = commit('a1', 'x', [heading('item', 't.lockpicks', 'Lockpicks'), heading('item', 't.other', 'Other')], [heading('item', 't.steel-lockpicks', 'Steel Lockpicks'), heading('item', 't.luck-jewel', 'Luck')]);

    const found = inferRename('t.lockpicks', history(swap), world('t.steel-lockpicks', 't.luck-jewel'));

    expect(found.to).toBe('t.steel-lockpicks');
    expect(found.standing).toBe('the one written out of its name');
  });

  it('lets a kept title outrank a name one segment of the old id happens to be written into', () => {
    const swap = commit('a1', 'x', [heading('item', 't.iron-key', 'Brass Key'), heading('item', 't.spare', 'Spare')], [heading('item', 't.iron-key-again', 'Nothing Alike'), heading('item', 't.brass-key', 'Brass Key')]);

    expect(inferRename('t.iron-key', history(swap), world('t.iron-key-again', 't.brass-key')).to).toBe('t.brass-key');
  });

  it('reads a name as written into another only at a whole segment, so every jewel is not every other jewel', () => {
    const swap = commit('a1', 'x', [heading('item', 't.quiet-jewel'), heading('item', 't.loud-jewel')], [heading('item', 't.first-jewel'), heading('item', 't.second-jewel')]);

    expect(inferRename('t.quiet-jewel', history(swap), world('t.first-jewel', 't.second-jewel')).to).toBeNull();
  });
});

describe('c2: what it will not guess at', () => {
  it('says nothing when no commit ever took a heading of the id out', () => {
    const found = inferRename('t.never-existed', history(), world('t.new'));

    expect(found.to).toBeNull();
    expect(settled(found)).toBe(false);
    expect(found.standing).toBe('no commit ever took a heading of this id out');
  });

  it('refuses to choose between candidates nothing tells apart', () => {
    const swap = commit('a1', 'x', [heading('item', 't.gone'), heading('item', 't.also-gone')], [heading('item', 't.one'), heading('item', 't.two')]);

    const found = inferRename('t.gone', history(swap), world('t.one', 't.two'));

    expect(found.to).toBeNull();
    expect(found.standing).toBe('more than one could be meant');
    expect(found.candidates).toEqual(['t.one', 't.two']);
    expect(found.evidence).toContain('Name the rename yourself');
  });

  it('will not stand behind the only arrival when several of its kind left beside it', () => {
    const swap = commit('a1', 'x', [heading('item', 't.gone'), heading('item', 't.also-gone'), heading('item', 't.third')], [heading('item', 't.one')]);

    const found = inferRename('t.gone', history(swap), world('t.one'));

    expect(found.to).toBe('t.one');
    expect(settled(found)).toBe(false);
  });

  it('says nothing arrived when the commit put nothing of that kind in its place', () => {
    const swap = commit('a1', 'x', [heading('cluster-jewel', 't.a-quiet-hour')], [heading('item', 't.thieving-ability-jewel')]);

    expect(inferRename('t.a-quiet-hour', history(swap), world('t.thieving-ability-jewel')).standing).toBe('nothing of its kind arrived in its place');
  });

  it('does not take a heading that arrived in another file as what this one became', () => {
    const swap: Change = { sha: 'a1', subject: 'x', removed: [heading('item', 't.gone')], added: [{ file: 'content/elsewhere.dsl', kind: 'item', id: 'e.new' }] };

    expect(inferRename('t.gone', history(swap), world('e.new')).standing).toBe('nothing of its kind arrived in its place');
  });

  it('does not offer a candidate the world has since stopped declaring', () => {
    const swap = commit('a1', 'x', [heading('item', 't.gone')], [heading('item', 't.also-since-deleted')]);

    expect(inferRename('t.gone', history(swap), world()).standing).toBe('nothing of its kind arrived in its place');
  });
});

describe('c3: which commit is the one that lost it', () => {
  it('reads the newest removal rather than the oldest', () => {
    const found = inferRename(
      't.old',
      history(commit('newest', 'the second time', [heading('item', 't.old')], [heading('item', 't.newest')]), commit('oldest', 'the first time', [heading('item', 't.old')], [heading('item', 't.stale')])),
      world('t.newest', 't.stale'),
    );

    expect(found.to).toBe('t.newest');
  });

  it('walks past a commit that put the heading back, which moved it rather than losing it', () => {
    const found = inferRename(
      't.old',
      history(
        commit('moved', 'a move between files', [heading('item', 't.old')], [heading('item', 't.old'), heading('item', 't.decoy')]),
        commit('lost', 'the rename', [heading('item', 't.old')], [heading('item', 't.new')]),
      ),
      world('t.new', 't.decoy'),
    );

    expect(found.to).toBe('t.new');
    expect(found.evidence).toContain('lost the rename');
  });
});
