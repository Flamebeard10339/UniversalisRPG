import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { complaintsIn, featureFolders, folderLines } from './handoff';

const folder = (over: Partial<Parameters<typeof folderLines>[0]> = {}) => folderLines({ name: 'a-feature', open: ['open-agent.md', 'open-human.md'], missing: [], strays: [], items: 4, complaints: [], since: 0, lastWrote: 'abc1234 something', ...over });

const item = (...body: string[]) => ['## The region wall', '', ...body].join('\n');

describe('what a folder has to say before a session hands it over', () => {
  it('names a line that was struck through instead of deleted', () => {
    expect(complaintsIn('open.md', ['# What is still wrong', '', '- ~~the road is missing~~ — closed', '', item('*Closes when:* the road is written.')].join('\n')).map((each) => each.says)).toEqual(['line 3 is struck through, and done means deleted']);
  });

  it('names a heading that calls itself finished, whatever word it uses', () => {
    const says = complaintsIn('open.md', ['## 1. The region wall — closed', '## 2. The oven is fixed', '## 3. Module size'].join('\n'));

    expect(says.filter((each) => each.says.includes('calls itself finished')).map((each) => each.says.slice(0, 7))).toEqual(['line 1 ', 'line 2 ']);
  });

  it('says nothing about an item that names what would close it', () => {
    expect(complaintsIn('open.md', item('**Empty prose is said as silence.**', '', '*Closes when: the engine refuses it.*'))).toEqual([]);
  });

  // Without that clause a reader cannot tell an open question from a decision already taken, which is where invented work comes from.
  it('names an item that says what is wrong and never says what would settle it', () => {
    expect(complaintsIn('open.md', item('**Empty prose is said as silence**, and nobody has ruled on it.'))).toEqual([{ file: 'open.md', says: 'line 1 names nothing that would close it: ## The region wall' }]);
  });

  it('does not read a bolded sentence as that clause', () => {
    expect(complaintsIn('open.md', item('**Closes when: somebody decides.**')).map((each) => each.says.slice(0, 4))).toEqual(['line']);
  });

  it('says a folder missing half the queue is missing it, rather than letting a reader assume', () => {
    expect(folder({ open: ['open-agent.md'], missing: ['open-human.md'] }).join('\n')).toContain('no open-human.md');
  });

  // The third file is the format growing back — a settled.md or a log, which is where the last one of these went.
  it('says a third file beside the open ones does not belong to this format', () => {
    expect(folder({ strays: ['settled.md'] }).join('\n')).toContain('settled.md stands beside them');
  });

  it('counts the open items so a queue nobody can read shows as a number', () => {
    expect(folder({ items: 31 }).join('\n')).toContain('31 open item(s) between them');
  });

  // The one thing a reader cannot see for themselves. Under the threshold it is reported and not complained about, because a doc written a few commits ago is current, not stale.
  it('counts the work that landed since the docs were last written, and only complains once it is a lot', () => {
    expect(folder({ since: 3 }).join('\n')).toContain('  ok 3 commit(s)');
    expect(folder({ since: 20 }).join('\n')).toContain('  -- 20 commit(s)');
  });

  it('finds the folders that hand over, from the tree rather than from a list here', () => {
    expect(featureFolders()).toContain(path.join('docs', 'authoring-loop'));
  });
});
