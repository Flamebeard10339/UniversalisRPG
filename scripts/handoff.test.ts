import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { complaintsIn, featureFolders, folderLines, namesInLog } from './handoff';

const folder = (over: Partial<Parameters<typeof folderLines>[0]> = {}) => folderLines({ name: 'a-feature', companions: ['open.md', 'settled.md'], complaints: [], unlinked: [], gone: [], since: 0, lastWrote: 'abc1234 something', ...over });

describe('what a folder has to say before a session hands it over', () => {
  it('names a line that was struck through instead of deleted', () => {
    expect(complaintsIn('open.md', ['# What is still wrong', '', '- ~~the road is missing~~ — closed'].join('\n'))).toEqual([{ file: 'open.md', says: 'line 3 is struck through, and done means deleted' }]);
  });

  it('names a heading that calls itself finished, whatever word it uses', () => {
    const says = complaintsIn('open.md', ['## 1. The region wall — closed', '## 2. The oven is fixed', '## 3. Module size'].join('\n'));

    expect(says.map((each) => each.says.slice(0, 7))).toEqual(['line 1 ', 'line 2 ']);
  });

  it('says nothing about a file that only says what is still wrong', () => {
    expect(complaintsIn('open.md', ['## Blocking the writing pass', '', '**Empty prose is said as silence.** Closes when the engine refuses it.'].join('\n'))).toEqual([]);
  });

  // The folder's shape is whatever the log says it is, so a folder that splits what is still wrong into two files needs no second rule here.
  it('reads a folder\'s files off the log that names them, whatever they are called', () => {
    expect(namesInLog('- `open-agent.md` — headless\n- `open-human.md` — the owner\'s\n- `settled.md` — true now\n\nItem 5 is `docs/specs/a-turn-costs-what-the-last-turn-did.md`.')).toEqual(['open-agent.md', 'open-human.md', 'settled.md']);
  });

  it('says a log that stands alone hands nothing over', () => {
    expect(folder({ companions: [] }).join('\n')).toContain('deliverable-log.md stands alone');
  });

  it('says a log that never names a file beside it leaves a reader stranded', () => {
    expect(folder({ unlinked: ['open.md'] }).join('\n')).toContain('deliverable-log.md never names open.md');
  });

  it('says a log naming a file that is no longer there has gone stale', () => {
    expect(folder({ gone: ['open.md'] }).join('\n')).toContain('deliverable-log.md names open.md, and no such file stands beside it');
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
