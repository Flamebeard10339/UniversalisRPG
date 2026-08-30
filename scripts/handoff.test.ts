import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { besideThem, citedIn, complaintsIn, declaredIn, featureFolders, folderLines, handoffLines, proofComplaints } from './handoff';

const folder = (over: Partial<Parameters<typeof folderLines>[0]> = {}) => folderLines({ name: 'a-feature', open: ['open-agent.md', 'open-human.md'], proofs: [], missing: [], strays: [], items: 4, complaints: [], passing: [], ran: false, since: 0, lastWrote: 'abc1234 something', ...over });

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
    expect(featureFolders()).toContain(path.join('docs', 'open'));
  });
});

describe('a line that hands its evidence over as a proof rather than a paragraph', () => {
  const agent = ['## The roll fires no branch', '', '*Closes when:* `a-roll-settles-on-a-branch` passes.'].join('\n');

  it('reads what a proof file declares out of the file, whichever half it is', () => {
    expect(declaredIn('open-tests.dsl', ['# info open-tests', '', '# test a-roll-settles-on-a-branch', 'goto: camp'].join('\n'))).toEqual(['a-roll-settles-on-a-branch']);
    expect(declaredIn('open-tests.test.ts', ["describe('a-roll-settles-on-a-branch', () => {", "  it('does', () => {});"].join('\n'))).toEqual(['a-roll-settles-on-a-branch']);
  });

  // Only what a line closes on: a proof mentioned in passing is prose about the work, and the citation has to be the clause or the two drift.
  it('reads the citation off the closing clause and nowhere else', () => {
    expect(citedIn(agent)).toEqual(['a-roll-settles-on-a-branch']);
    expect(citedIn('The route in `a-roll-settles-on-a-branch` is worth a read.')).toEqual([]);
  });

  it('says nothing when a proof and the line closing on it name each other', () => {
    expect(proofComplaints([['open-tests.dsl', '# test a-roll-settles-on-a-branch']], [['open-agent.md', agent]])).toEqual([]);
  });

  // A proof outliving the line it was written under is the stale comment this replaced, wearing a test's clothes.
  it('names a proof no open line stands on', () => {
    expect(proofComplaints([['open-tests.dsl', '# test a-roll-nobody-mentions']], [['open-agent.md', agent]]).map((each) => each.says)).toEqual(['a-roll-nobody-mentions stands under no open line — a proof is cited by the line it closes', expect.stringContaining('and no proof declares it')]);
  });

  it('names a line closing on a proof that is not there', () => {
    expect(proofComplaints([], [['open-agent.md', agent]])).toEqual([{ file: 'open-agent.md', says: 'closes on a-roll-settles-on-a-branch passing, and no proof declares it' }]);
  });

  it('names a proof file holding nothing, since the two files are the whole format otherwise', () => {
    expect(proofComplaints([['open-tests.dsl', '# info open-tests']], []).map((each) => each.says)).toEqual([expect.stringContaining('declares no proof')]);
  });

  // The whole point of running them: red is the ordinary state here, and green is the finding.
  it('reports a proof that has gone green as a line that may already be closed', () => {
    const lines = folder({ proofs: ['open-tests.dsl'], ran: true, passing: [{ file: 'open-tests.dsl', id: 'a-roll-settles-on-a-branch', passes: true }] }).join('\n');

    expect(lines).toContain('a-roll-settles-on-a-branch passes now');
    expect(lines).toContain('1 of them passing');
  });

  it('names anything in docs/ that hands nothing over, since a folder nobody is handed grows quietly', () => {
    expect(besideThem('docs')).toEqual([]);
    expect(handoffLines([path.join('docs', 'open')], false, ['audits']).join('\n')).toContain('docs/audits hands nothing over');
  });

  it('leaves a proof file out of the third-file complaint, and nothing else', () => {
    expect(folder({ strays: ['settled.md'] }).join('\n')).toContain('settled.md stands beside them');
    expect(folder({ proofs: ['open-tests.dsl'] }).join('\n')).not.toContain('stands beside them');
  });
});
