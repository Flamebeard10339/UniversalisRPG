import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from '../lib/tsxCli';
import { fixture, repoRoot, script } from './cliFixtures';

describe('tasks CLI', () => {
  it('triage promotes, defers and declines findings, saving after every decision', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'promote me', '--id', 'promote-me', '--kind', 'finding', '--severity', 'high', '--system', 'Runtime', '--evidence', 'evidence text', '--deliverable', 'fix it');
      tasks('add', 'defer me', '--id', 'defer-me', '--kind', 'finding', '--severity', 'medium', '--deliverable', 'fix it');
      tasks('add', 'decline me', '--id', 'decline-me', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');

      const result = triage('1\n2\n3\nstale, superseded by later work\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');

      expect(tasks('show', 'promote-me').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'defer-me').stdout).toContain('spec: (deferred)');
      const declined = tasks('show', 'decline-me').stdout;
      expect(declined).toContain('reason: stale, superseded by later work');
    });
  });

  it('triage displays evidence and deliverable labelled, saying so explicitly when there is no proposed fix', () => {
    fixture(({ dir, triage }) => {
      // A finding with no deliverable can no longer be created via `add`
      // (the store predates that rule — 58 open tasks do exactly this, and
      // triage still has to display them), so this one is written directly.
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'no-fix-yet', title: 'no fix yet', kind: 'finding', state: 'unreviewed', severity: 'high', system: null, spec: null, requires: [], files: [], deliverable: null, evidence: 'it breaks like this', source: null, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = triage('s\n');
      expect(result.stdout).toContain('evidence — what is broken:');
      expect(result.stdout).toContain('it breaks like this');
      expect(result.stdout).toContain('deliverable — the proposed fix:');
      expect(result.stdout).toContain('no proposed fix recorded');
    });
  });

  it('triage shows a recorded deliverable next to its evidence', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'has a fix', '--id', 'has-a-fix', '--kind', 'finding', '--severity', 'high', '--evidence', 'broken thing', '--deliverable', 'the proposed repair');
      const result = triage('s\n');
      expect(result.stdout).toContain('the proposed repair');
      expect(result.stdout).not.toContain('no proposed fix recorded');
    });
  });

  it('printEvidence wraps long text onto multiple indented lines, instead of one unbroken line, for both evidence and deliverable', () => {
    fixture(({ tasks, triage }) => {
      const longText = "loadSave gives activeAction, player and activeBuffs no check past isObject, so a body whose ids are all real but whose cadences is absent crashes the validator that exists to prevent it.";
      tasks('add', 'checkSave crashes', '--id', 'checksave-crashes', '--kind', 'finding', '--severity', 'high', '--evidence', longText, '--deliverable', longText);
      const result = triage('s\n');
      expect(result.stdout).not.toContain(longText);

      const indented = result.stdout.split('\n').filter((line) => line.startsWith('          ') && line.trim().length > 0);
      expect(indented.length).toBeGreaterThan(2); // multiple wrapped lines each for evidence and deliverable
      for (const line of indented) expect(line.length).toBeLessThanOrEqual(78);
    });
  });

  it('triage redirect replaces the deliverable, saves it, then re-asks for a decision on the same task', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--severity', 'high', '--deliverable', 'the wrong fix');
      const result = triage('4\nthe right fix\n1\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');
      const shown = tasks('show', 'wrong-fix').stdout;
      expect(shown).toContain('deliverable: the right fix');
      expect(shown).toContain('spec: demo-spec');
    });
  });

  it('triage redirect is cancelled by an empty response, leaving the deliverable and the queue unchanged', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--severity', 'high', '--deliverable', 'original fix');
      const result = triage('4\n\ns\n');
      expect(result.stdout).toContain('empty — redirect cancelled');
      expect(result.stdout).toContain('1 unreviewed finding(s) left');
      expect(tasks('show', 'wrong-fix').stdout).toContain('deliverable: original fix');
    });
  });

  it('triage quits early and leaves the rest unreviewed', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'first', '--id', 'first', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      tasks('add', 'second', '--id', 'second', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');

      const result = triage('q\n');
      expect(result.stdout).toContain('2 unreviewed finding(s) left');
      expect(tasks('show', 'first').stdout).toContain('unreviewed');
    });
  });

  it('triage [a] records a question on the finding and leaves it unreviewed', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--severity', 'high', '--evidence', 'the original evidence', '--deliverable', 'fix it');
      const result = triage('a\nwhich universe was this measured against?\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('it stays unreviewed until the question is answered');
      expect(result.stdout).toContain('1 unreviewed finding(s) left');
      const shown = tasks('show', 'needs-context').stdout;
      expect(shown).toContain('the original evidence');
      expect(shown).toContain('triage asked');
      expect(shown).toContain('which universe was this measured against?');
    });
  });

  it('triage [a] with an empty question asks nothing and re-offers the same finding', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--severity', 'high', '--evidence', 'original', '--deliverable', 'fix it');
      const result = triage('a\n\ns\n');
      expect(result.stdout).toContain('empty — nothing asked');
      expect(tasks('show', 'needs-context').stdout).not.toContain('triage asked');
    });
  });

  it("triage promotes into the inferred spec when the branch matches no spec file", () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'fix-now anchor', '--id', 'anchor', '--spec', 'demo-spec');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'];
      const result = spawnSync(process.execPath, [tsxCli, script, 'triage', ...globals], { cwd: repoRoot, encoding: 'utf8', input: '1\n' });
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
      const shown = spawnSync(process.execPath, [tsxCli, script, 'show', 'a-finding', ...globals], { cwd: repoRoot, encoding: 'utf8' });
      expect(shown.stdout).toContain('spec: demo-spec');
    });
  });

  it('triage promotes a finding sourced from an audit pass 2 or later, saying that it extends the spec', () => {
    fixture(({ tasks, triage }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'late finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = triage('1\n');
      expect(result.stdout).toContain('promoting a pass 2 finding, which extends what demo-spec owes');
      const shown = tasks('show', 'demo-spec-pass2-late-finding');
      expect(shown.stdout).toContain('spec: demo-spec');
    });
  });
});
