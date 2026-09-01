import { describe, expect, it } from 'vitest';
import { callsIn, firstRealEdit, hookEnvelope, read, report } from './friction';

const use = (name: string, input: Record<string, unknown>) => ({ type: 'tool_use', name, input });

const nested = (...parts: object[]): string => JSON.stringify({ message: { content: parts } });
const flat = (...parts: object[]): string => JSON.stringify({ content: parts });

const SCRATCH = 'C:/Users/someone/AppData/Local/Temp/claude/proj/session/scratchpad';
const WORKTREE = 'C:/Users/someone/Projects/Thing/.claude/worktrees/lane';

describe('reading a subagent transcript', () => {
  it('takes tool calls from both the nested and the flat event shape', () => {
    const calls = callsIn([nested(use('Read', { file_path: 'a.ts' })), flat(use('Bash', { command: 'ls' }))].join('\n'));
    expect(calls.map((call) => call.tool)).toEqual(['Read', 'Bash']);
    expect(calls.map((call) => call.n)).toEqual([1, 2]);
  });

  it('walks past a line that is not JSON rather than giving up on the file', () => {
    expect(callsIn(['not json at all', '', nested(use('Read', { file_path: 'a.ts' }))].join('\n'))).toHaveLength(1);
  });

  it('ignores an assistant message that carries no tool call', () => {
    expect(callsIn(nested({ type: 'text', text: 'thinking about it' }))).toEqual([]);
  });
});

describe('where orientation ends', () => {
  it('ends at the first edit of a file that is not scratch', () => {
    const calls = callsIn(
      [
        nested(use('Bash', { command: 'npm run oracle' })),
        nested(use('Write', { file_path: `${SCRATCH}/exp/probe.dsl`, content: '# info exp' })),
        nested(use('Edit', { file_path: `${WORKTREE}/content/town.dsl`, new_string: 'x' })),
      ].join('\n'),
    );
    expect(firstRealEdit(calls)).toBe(3);
  });

  it('sits past the end when nothing real was ever edited, so the whole run counts as orienting', () => {
    const calls = callsIn(nested(use('Bash', { command: 'npm test' })));
    expect(firstRealEdit(calls)).toBe(2);
    expect(report(read(calls), 'agent')[0]).toContain('(100% spent orienting)');
  });
});

describe('what it had to work out for itself', () => {
  const transcript = [
    nested(use('Read', { file_path: `${WORKTREE}/CLAUDE.md` })),
    nested(use('Bash', { command: 'npm run oracle -- --at content' })),
    nested(use('Bash', { command: 'grep -n merge src/content/sections/define.ts' })),
    nested(use('Bash', { command: 'npm run oracle -- town' })),
    nested(use('Write', { file_path: `${SCRATCH}/exp/base.dsl`, content: '// note\n# info base\nversion: 1.0.0' })),
    nested(use('Bash', { command: `npm run probe -- ${SCRATCH}/exp/base.dsl` })),
    nested(use('Edit', { file_path: `${WORKTREE}/content/town.dsl`, new_string: 'real work' })),
    nested(use('Bash', { command: 'grep -n prune src/runtime/save.ts' })),
  ].join('\n');
  const reading = read(callsIn(transcript));

  it('counts engine source read before the first edit and not after it', () => {
    expect(reading.engineReads.map((call) => call.n)).toEqual([3]);
  });

  it('counts a scratch world built and the run that asked it a question', () => {
    expect(reading.scratchWrites.map((call) => call.n)).toEqual([5]);
    expect(reading.scratchRuns.map((call) => call.n)).toEqual([6]);
  });

  it('reports a tool re-run while orienting, counting only the runs that came before the edit', () => {
    expect([...reading.rerunsOf]).toEqual([['npm run oracle', [2, 4]]]);
  });

  it('does not report a tool that was run once', () => {
    expect([...reading.rerunsOf.keys()]).not.toContain('npm run probe');
  });

  it('reads the first lines of what it built, past the comment', () => {
    expect(report(reading, 'agent').join('\n')).toContain('# info base / version: 1.0.0');
  });
});

describe('--help reached for after a tool was already used', () => {
  it('is reported, because the first invocation did not do what was expected', () => {
    const reading = read(
      callsIn([nested(use('Bash', { command: 'npm run probe -- content' })), nested(use('Bash', { command: 'npm run probe -- --help' }))].join('\n')),
    );
    expect(reading.helpAfterUse.map((call) => call.n)).toEqual([2]);
  });

  it('is not reported when help was read before the tool was used', () => {
    const reading = read(
      callsIn([nested(use('Bash', { command: 'npm run probe -- --help' })), nested(use('Bash', { command: 'npm run probe -- content' }))].join('\n')),
    );
    expect(reading.helpAfterUse).toEqual([]);
  });
});

describe('the envelope the stop hook returns', () => {
  const probed = read(
    callsIn(
      [
        nested(use('Write', { file_path: `${SCRATCH}/exp/base.dsl`, content: '# info base' })),
        nested(use('Bash', { command: `npm run probe -- ${SCRATCH}/exp/base.dsl` })),
        nested(use('Edit', { file_path: `${WORKTREE}/content/town.dsl`, new_string: 'x' })),
      ].join('\n'),
    ),
  );

  it('carries nothing that is fed back to a model, because that is what cycled the agent it reports on', () => {
    const envelope = JSON.parse(hookEnvelope(probed, 'agent-probe')) as Record<string, unknown>;

    expect(Object.keys(envelope).sort()).toEqual(['suppressOutput', 'systemMessage']);
    expect(envelope).not.toHaveProperty('hookSpecificOutput');
    expect(envelope).not.toHaveProperty('decision');
    expect(JSON.stringify(envelope)).not.toContain('additionalContext');
  });

  it('says in one line what was found and names the command that prints the rest', () => {
    const { systemMessage } = JSON.parse(hookEnvelope(probed, 'agent-probe')) as { systemMessage: string };

    expect(systemMessage.split('\n')).toHaveLength(1);
    expect(systemMessage).toContain('npm run friction -- probe');
  });

  it('says so plainly when there was nothing to work out', () => {
    const quiet = read(callsIn(nested(use('Edit', { file_path: `${WORKTREE}/content/town.dsl`, new_string: 'x' }))));

    expect(JSON.parse(hookEnvelope(quiet, 'agent-quiet')).systemMessage).toContain('nothing it had to work out first');
  });
});

describe('the report an orchestrator reads', () => {
  const long = Array.from({ length: 400 }, (_, at) => nested(use('Bash', { command: `grep -n thing src/file${at}.ts` }))).join('\n');

  it('stays short enough to reason about however long the run was', () => {
    expect(report(read(callsIn(long)), 'agent').length).toBeLessThan(100);
  });

  it('says how much of the run went on orienting', () => {
    const calls = callsIn(
      [
        ...Array.from({ length: 3 }, () => nested(use('Bash', { command: 'npm run oracle' }))),
        nested(use('Edit', { file_path: `${WORKTREE}/content/town.dsl`, new_string: 'x' })),
      ].join('\n'),
    );
    expect(report(read(calls), 'agent')[0]).toContain('first non-scratch edit at 4');
  });

  it('collapses machine-specific paths so two runs read alike', () => {
    const text = report(read(callsIn(nested(use('Read', { file_path: `${WORKTREE}/content/town.dsl` })))), 'agent').join('\n');
    expect(text).toContain('$WT/content/town.dsl');
    expect(text).not.toContain('someone');
  });
});
