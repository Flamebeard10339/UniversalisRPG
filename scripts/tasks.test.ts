import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagArities } from './tasks/cli';
import { allUsages } from './tasks/commands';
import { fixture } from './tasks/cliFixtures';

describe('tasks CLI', () => {
  it('prints help without treating --help or help as unknown commands', () => {
    fixture(({ tasks }) => {
      const flag = tasks('--help');
      expect(flag.status).toBe(0);
      expect(flag.stdout).toContain('usage: npm run tasks --');
      expect(flag.stderr).toBe('');

      const verb = tasks('help');
      expect(verb.status).toBe(0);
      expect(verb.stdout).toContain('usage: npm run tasks --');
      expect(verb.stderr).toBe('');
    });
  });

  // c9. `list --blocked` was the founding case: a planner asking what is
  // blocked got the whole unfiltered list and a zero exit, which reads as a
  // confident answer to a question the command never understood.
  it('refuses an unrecognised flag by name instead of answering the command without it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      for (const flag of ['--blocked', '--totallyfakeflag', '--merge']) {
        const result = tasks('list', flag);
        expect(result.status, flag).toBe(1);
        expect(result.stderr, flag).toContain(`unknown flag: ${flag}`);
        expect(result.stderr, flag).toContain('usage: tasks list');
        expect(result.stdout, flag).not.toContain('a-member');
      }
    });
  });

  // A flag a command never reads is the same defect wherever it appears:
  // `edit --state open` used to drop the flag and then report `nothing to
  // change`, which is a confident no-op.
  it('refuses a flag another verb owns rather than dropping it and reporting no change', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('edit', 'a-member', '--state', 'done');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown flag: --state');
      expect(result.stdout).not.toContain('nothing to change');
      expect(tasks('show', 'a-member').stdout).toContain('[task/open]');
    });
  });

  // A flag with no value used to become the string 'true', so `start x
  // --actor` recorded a holder named "true" — a fabricated fact, not a
  // missing one. Fixed where the flag is parsed, so the actor genuinely
  // named "true" is still recordable.
  it('refuses a value-taking flag given no value, rather than inventing one', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');

      const bare = tasks('start', 'a-member', '--actor');
      expect(bare.status).toBe(1);
      expect(bare.stderr).toContain('--actor needs a value');
      expect(tasks('show', 'a-member').stdout).toContain('[task/open]');

      tasks('start', 'a-member', '--actor', 'true');
      expect(tasks('show', 'a-member').stdout).toContain('claimed by true since');
    });
  });

  it('does not let a valueless flag swallow the positional that follows it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker task', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'held-up task', '--id', 'held-up', '--spec', 'demo-spec', '--requires', 'blocker');
      const result = tasks('spec', 'show', '--order', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout.indexOf('blocker')).toBeLessThan(result.stdout.indexOf('held-up'));
    });
  });

  it('refuses an argument past a command\'s positional arity instead of discarding it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'alpha task', '--id', 'alpha');
      // The natural typo: an unquoted title. `fix` was recorded and `the
      // thing` dropped, so the id was slugified from a truncated title.
      const unquoted = tasks('add', 'fix', 'the', 'thing');
      expect(unquoted.status).toBe(1);
      expect(unquoted.stderr).toContain('unexpected argument: "the"');
      expect(unquoted.stderr).toContain('unexpected argument: "thing"');
      expect(tasks('list').stdout).not.toContain('fix');

      // The event log's own corruption: an id passed positionally landed in
      // the note slot and the note in a slot nothing read.
      const note = tasks('note', 'alpha', 'the real note');
      expect(note.status).toBe(1);
      expect(note.stderr).toContain('unexpected argument: "the real note"');

      expect(tasks('show', 'alpha', 'beta').status).toBe(1);
      expect(tasks('doctor', 'extraneous').status).toBe(1);
      expect(tasks('show', 'alpha').status).toBe(0);
    });
  });

  // The arity is derived by regex from each usage string, so a derivation
  // that reads too high is silent — the command just keeps discarding. This
  // sweeps every surface rather than the ones somebody thought to check:
  // `spec` derived 3 from prose in its own usage line and went unnoticed
  // through two audits.
  it('refuses five junk arguments on every bounded command surface', () => {
    fixture(({ tasks }) => {
      const unbounded = new Set(['spec add', 'spec remove', 'plan', 'done', 'decline', 'promote']);
      const surfaces = [['doctor'], ['add'], ['edit'], ['show'], ['list'], ['search'], ['next'], ['start'], ['stop'], ['done'], ['decline'], ['promote'], ['import'], ['triage'], ['audit'], ['audit-prompt'], ['work-prompt'], ['handoff'], ['check-commit-msg'], ['plan'], ['spec'], ['spec', 'new'], ['spec', 'add'], ['spec', 'remove'], ['spec', 'show'], ['spec', 'done'], ['note'], ['decision'], ['log'], ['merge-ready']];
      for (const surface of surfaces) {
        const name = surface.join(' ');
        const result = tasks(...surface, 'j1', 'j2', 'j3', 'j4', 'j5');
        if (unbounded.has(name)) {
          expect(result.stderr, name).not.toContain('unexpected argument');
          continue;
        }
        expect(result.status, name).toBe(1);
        expect(result.stderr, name).toContain('unexpected argument');
      }
    });
  });

  // The flag-arity twin of the junk-argument sweep: a `[--x]` written
  // self-closed is boolean by construction, and `spec show`'s `[--full]`
  // was silently classified value-taking because a prose parenthetical
  // followed it — dead as documented, a no-op as accepted.
  it('classifies every self-closed [--flag] in every usage as boolean, whatever prose follows it', () => {
    const usages = allUsages();
    expect(usages.length).toBeGreaterThan(20);
    for (const usage of usages) {
      const arities = flagArities(usage);
      for (const [, name] of usage.matchAll(/\[--([a-z][a-z0-9-]*)\]/g)) {
        expect(arities.get(name), `--${name} in: ${usage.split('\n')[0]}`).toBe('boolean');
      }
    }
  });

  it('leaves a command whose usage ends in ... unbounded', () => {
    fixture(({ tasks }) => {
      tasks('spec', 'new', 'demo-spec');
      tasks('add', 'one', '--id', 'one');
      tasks('add', 'two', '--id', 'two');
      tasks('add', 'three', '--id', 'three');
      const result = tasks('spec', 'add', 'demo-spec', 'one', 'two', 'three');
      expect(result.status).toBe(0);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('three');
    });
  });

  it('answers --help on every command and subcommand, and names the flags it will accept', () => {
    fixture(({ tasks }) => {
      const commands = [['doctor'], ['add'], ['edit'], ['show'], ['list'], ['search'], ['next'], ['start'], ['stop'], ['done'], ['decline'], ['promote'], ['import'], ['triage'], ['audit'], ['audit-prompt'], ['work-prompt'], ['handoff'], ['check-commit-msg'], ['plan'], ['spec'], ['spec', 'new'], ['spec', 'add'], ['spec', 'remove'], ['spec', 'show'], ['spec', 'done'], ['note'], ['decision'], ['log'], ['merge-ready']];
      for (const command of commands) {
        const result = tasks(...command, '--help');
        expect(result.status, command.join(' ')).toBe(0);
        expect(result.stdout, command.join(' ')).toContain(`usage: tasks ${command.join(' ')}`);
        expect(result.stderr, command.join(' ')).toBe('');
      }
      expect(tasks('spec', 'help').status).toBe(0);
      expect(tasks('spec', 'help').stdout).toContain('usage: tasks spec');
    });
  });

  it('check names its replacement rather than reading as an unknown command', () => {
    fixture(({ tasks }) => {
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('`check` is now `doctor`');
    });
  });

  it('every store-writing command reports a conflicted store as a diagnostic, not a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), '<<<<<<< HEAD\n', 'utf8');

      const commands: Array<{ name: string; args: string[] }> = [
        { name: 'add', args: ['add', 'a task'] },
        { name: 'edit', args: ['edit', 'ok', '--title', 'x'] },
        { name: 'start', args: ['start', 'ok'] },
        { name: 'stop', args: ['stop', 'ok'] },
        { name: 'done', args: ['done', 'ok'] },
        { name: 'decline', args: ['decline', 'ok', '--reason', 'x'] },
        { name: 'spec add', args: ['spec', 'add', 'demo-spec', 'ok'] },
        { name: 'spec remove', args: ['spec', 'remove', 'demo-spec', 'ok'] },
      ];

      for (const { name, args } of commands) {
        const result = tasks(...args);
        expect(result.status, `${name} exit status`).toBe(1);
        expect(result.stderr, `${name} stderr`).toContain('malformed JSONL task record');
        expect(result.stderr, `${name} stderr`).toContain('tasks.jsonl:1');
        expect(result.stderr, `${name} stderr`).not.toContain('    at ');
        expect(result.stderr, `${name} stderr`).not.toContain('SyntaxError');
      }
    });
  });

  it('every store-reading command answers over an unparseable line, skipping it and noting the skip in a footer', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a readable task', '--id', 'readable', '--spec', 'demo-spec');
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `<<<<<<< HEAD\n${readFileSync(store, 'utf8')}`, 'utf8');

      const commands: Array<{ name: string; args: string[] }> = [
        { name: 'next', args: ['next'] },
        { name: 'list', args: ['list'] },
        { name: 'show', args: ['show', 'readable'] },
        { name: 'search', args: ['search', 'readable'] },
        { name: 'handoff', args: ['handoff'] },
        { name: 'spec show', args: ['spec', 'show', 'demo-spec'] },
      ];

      for (const { name, args } of commands) {
        const result = tasks(...args);
        expect(result.status, `${name} exit status`).toBe(0);
        expect(result.stdout, `${name} stdout`).toContain('readable');
        expect(result.stdout, `${name} stdout`).toContain('skipped 1 unparseable store line(s)');
        expect(result.stdout, `${name} stdout`).toContain('tasks.jsonl:1');
        expect(result.stderr, `${name} stderr`).not.toContain('    at ');
      }
    });
  });

  it('the skip footer follows the answer rather than replacing it, and names the write consequence', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a readable task', '--id', 'readable', '--spec', 'demo-spec');
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `${readFileSync(store, 'utf8')}{"id":"half-written"\n`, 'utf8');

      const listed = tasks('list');
      expect(listed.stdout.indexOf('readable')).toBeLessThan(listed.stdout.indexOf('skipped 1 unparseable'));
      expect(listed.stdout).toContain('write commands refuse until these parse');

      const write = tasks('edit', 'readable', '--title', 'renamed');
      expect(write.status).toBe(1);
      expect(readFileSync(store, 'utf8')).toContain('half-written');
    });
  });

  it('a bare -- ends flag parsing, so a decision may start with a dash', () => {
    fixture(({ tasks }) => {
      const result = tasks('decision', '--', '--each added mid-branch: the survey shape won');
      expect(result.status).toBe(0);
      const log = tasks('log', '--op', 'decision');
      expect(log.stdout).toContain('--each added mid-branch: the survey shape won');
    });
  });
});

// Both misses measured came from the CLI's own vocabulary, so the refusal
// can answer them out of the same usage strings the parser enforces.
describe('a refusal that names the near miss', () => {
  it('tells `spec add --id` that ids go here as positionals', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'add', 'demo-spec', '--id', 'a-task');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('`spec add` takes <id> as a positional, not as a flag');
    });
  });

  // Naming the owning verb and then fourteen undifferentiated flags still
  // left a caller to pick, and the clause's own text is that `--note` wants
  // `--evidence`. The near miss is derived from the shape of the value the
  // flag wants where it does exist: prose misses prose.
  it('tells `add --note` which verb owns that flag and which of this verb takes prose', () => {
    fixture(({ tasks }) => {
      const result = tasks('add', 'a title', '--note', 'some prose');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--note: not a flag of `add` — it belongs to `concept`');
      // The list flags, the choices and the identifiers are not the near
      // miss and are not offered as one — checked on the near-miss line
      // itself, since the usage printed below it names every flag.
      const nearMiss = result.stderr.split('\n').find((line) => line.includes('takes prose in'));
      expect(nearMiss).toBe('  `add` takes prose in: --produces, --deliverable, --evidence');
    });
  });

  it('points an npm script refused as a verb at npm run', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit-status');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('`audit-status` is an npm script of this repository, not a tasks verb — run `npm run audit-status`');
    });
  });
});
