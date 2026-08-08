import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagArities, positionalArity, type FlagArity } from './tasks/cli';
import { allUsages, everyVerb } from './tasks/commands';
import { enclosingGitFixture, fixture } from './tasks/cliFixtures';

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
  // through two audits. The two prompts that take junk as paths and run the
  // whole architecture survey over it are swept one per test, so each pays
  // its own share of the test clock.
  const junkArgs = ['j1', 'j2', 'j3', 'j4', 'j5'] as const;

  // The subject set is read off `commands.ts`'s own registry rather than
  // retyped here, the way `TRIAGE_ACTIONS` is what `triage.test.ts`'s own
  // completeness check reads. A verb registered with a bounded usage string
  // is swept whether or not this file was touched when it was added — which
  // is the property a hardcoded list cannot have, and the reason `defer`,
  // `ask` and `redirect` went three verbs deep before anyone noticed none of
  // them were here.
  it('refuses five junk arguments on every bounded command surface', () => {
    fixture(({ tasks }) => {
      const registry = everyVerb();
      const bounded = registry.filter(([, usage]) => positionalArity(usage) !== null).map(([name]) => name.split(' '));
      // A golden lower bound, not the registry's exact size: the hardcoded
      // list this replaced named 23 surfaces and missed 3 real ones, so a
      // count that can only grow proves the sweep gained ground rather than
      // merely reproducing the old list under a new name.
      expect(bounded.length).toBeGreaterThan(23);
      expect(bounded.length).toBeLessThan(registry.length);
      for (const surface of bounded) {
        const name = surface.join(' ');
        const result = tasks(...surface, ...junkArgs);
        expect(result.status, name).toBe(1);
        expect(result.stderr, name).toContain('unexpected argument');
      }
    });
  });

  it('takes five junk arguments without an arity complaint on every unbounded surface', () => {
    fixture(({ tasks }) => {
      for (const surface of [['spec', 'add'], ['spec', 'remove'], ['plan'], ['done'], ['decline'], ['promote'], ['defer'], ['redirect'], ['ask'], ['retriage']]) {
        const result = tasks(...surface, ...junkArgs);
        expect(result.stderr, surface.join(' ')).not.toContain('unexpected argument');
      }
    });
  });

  // c5's specific callout: `defer` takes ids only, so five junk arguments
  // are five unresolved ids — a refusal from `resolveTaskIds`, not from the
  // arity check above, and the unbounded sweep only proves the latter never
  // fires. Both are "refuses"; only this one shows the record actually
  // moved nowhere.
  it('tasks defer refuses five junk arguments as unresolved ids, so it does not exit 0 for want of an arity complaint', () => {
    fixture(({ tasks }) => {
      const result = tasks('defer', ...junkArgs);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such task');
    });
  });

  it.each([['plan-prompt'], ['orchestrate-prompt']])('%s takes five junk arguments as paths and surveys them without an arity complaint', (prompt) => {
    enclosingGitFixture(({ tasks }) => {
      const result = tasks(prompt, ...junkArgs);
      expect(result.stderr).not.toContain('unexpected argument');
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

  // The declarative half of a usage string: what is left once every
  // parenthetical is removed. Written here rather than imported, so the
  // property is checked against the text a reader sees rather than against
  // the scanner that produced the vocabulary.
  function outsideParentheses(usage: string): string {
    let depth = 0;
    let declared = '';
    for (const char of usage) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (depth === 0) declared += char;
    }
    return declared;
  }

  // The other half of the same sweep: a flag is accepted because the usage
  // declares it, never because its prose mentions it. `list` accepted
  // `--trigger` — `decline`'s flag, named only in `list`'s trailing note —
  // discarded the value, answered the whole unfiltered list at exit 0, and
  // then advertised the flag by name on its own refusal path.
  it('accepts only the flags every usage string declares, never one its prose mentions', () => {
    const registry = everyVerb();
    expect(registry.length).toBeGreaterThan(30);
    for (const [name, usage] of registry) {
      const declared = outsideParentheses(usage);
      for (const flag of flagArities(usage).keys()) {
        expect(new RegExp(`--${flag}(?![a-z0-9-])`).test(declared), `--${flag} in \`${name}\``).toBe(true);
      }
    }
    const flagsOf = (verb: string): Map<string, FlagArity> => flagArities(registry.find(([name]) => name === verb)![1]);
    expect(flagsOf('list').has('trigger')).toBe(false);
    expect(flagsOf('decline').has('trigger')).toBe(true);
    expect(flagsOf('decision').has('op')).toBe(false);
    expect(flagsOf('log').has('op')).toBe(true);
  });

  // `audit` is the one verb whose flags genuinely repeat — a pass carries a
  // --proof per clause and a --finding per finding, and `--args-from` is the
  // only filing route for a branch audit. That is declared by the `...` its
  // usage already writes, so nothing beside the usage string has to be kept
  // in step with it; everywhere else a flag is given once, which is what
  // makes `--state open --state declined` a refusal rather than a plausible,
  // complete-looking answer built from the last value.
  it('reads repetition off the ... a usage string writes, which only tasks audit does', () => {
    const repeated = everyVerb()
      .map(([name, usage]) => [name, [...flagArities(usage)].filter(([, arity]) => arity === 'repeated').map(([flag]) => flag)] as const)
      .filter(([, flags]) => flags.length > 0);
    expect(repeated).toEqual([['audit', ['proof', 'evidence', 'file', 'finding', 'severity', 'system', 'fault', 'deliverable']]]);
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

  // Derived the same way the arity sweep above is: `--help` short-circuits
  // before a command body runs (even plan-prompt's filesystem survey), so
  // every registered surface is safe to ask, not just the ones a prior list
  // remembered to name.
  it('answers --help on every command and subcommand, and names the flags it will accept', () => {
    fixture(({ tasks }) => {
      const commands = everyVerb().map(([name]) => name.split(' '));
      expect(commands.length).toBeGreaterThan(30);
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
