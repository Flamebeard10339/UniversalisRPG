import { describe, expect, it } from 'vitest';
import { formatIndex, formatSession, normalizeCommand, parseTranscript, shortId, summarize } from './sessionTiming';

const at = (second: number): string => new Date(Date.UTC(2026, 7, 4, 21, 0, second)).toISOString();

interface Use {
  id: string;
  name?: string;
  input?: Record<string, unknown>;
}

const uses = (second: number, ...calls: Use[]): string =>
  JSON.stringify({ type: 'assistant', timestamp: at(second), message: { content: calls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name ?? 'Bash', input: call.input ?? { command: `run ${call.id}` } })) } });

const results = (second: number, ...ids: string[]): string =>
  JSON.stringify({ type: 'user', timestamp: at(second), message: { content: ids.map((id) => ({ type: 'tool_result', tool_use_id: id })) } });

const prompt = (second: number, text: string): string => JSON.stringify({ type: 'user', timestamp: at(second), message: { content: text } });

const timingOf = (...lines: string[]) => summarize(parseTranscript(lines.join('\n')));

describe('reading a transcript', () => {
  it('charges the gap between a tool call and its result to waiting', () => {
    const timing = timingOf(uses(0, { id: 'a' }), results(10, 'a'))!;
    expect(timing.waitMs).toBe(10_000);
    expect(timing.generateMs).toBe(0);
    expect(timing.spanMs).toBe(10_000);
    expect(timing.callCount).toBe(1);
  });

  it('charges the gap between one result and the next call to the model', () => {
    const timing = timingOf(uses(0, { id: 'a' }), results(10, 'a'), uses(15, { id: 'b' }), results(20, 'b'))!;
    expect(timing.waitMs).toBe(15_000);
    expect(timing.generateMs).toBe(5_000);
    expect(timing.idleMs).toBe(0);
  });

  it('counts tool calls issued together once over their overlap, not once each', () => {
    const parallel = timingOf(uses(0, { id: 'a' }, { id: 'b' }), results(10, 'a'), results(30, 'b'))!;
    expect(parallel.waitMs).toBe(30_000);
    expect(parallel.callCount).toBe(2);

    const serial = timingOf(uses(0, { id: 'a' }), results(10, 'a'), uses(10, { id: 'b' }), results(30, 'b'))!;
    expect(serial.waitMs).toBe(30_000);
  });

  it('charges a gap a human spoke inside to idle rather than to the model', () => {
    const timing = timingOf(uses(0, { id: 'a' }), results(10, 'a'), prompt(100, 'now do the next thing'), uses(110, { id: 'b' }), results(115, 'b'))!;
    expect(timing.idleMs).toBe(100_000);
    expect(timing.generateMs).toBe(0);
  });

  it('does not mistake a tool result for a human speaking', () => {
    const timing = timingOf(uses(0, { id: 'a' }), results(60, 'a'), uses(70, { id: 'b' }), results(75, 'b'))!;
    expect(timing.idleMs).toBe(0);
    expect(timing.generateMs).toBe(10_000);
  });

  it('skips lines that will not parse and lines carrying no timestamp', () => {
    const timing = timingOf('not json at all', JSON.stringify({ type: 'assistant', message: { content: [] } }), uses(0, { id: 'a' }), results(4, 'a'))!;
    expect(timing.callCount).toBe(1);
    expect(timing.waitMs).toBe(4_000);
  });

  it('reports a session with no tool calls as nothing to account for', () => {
    expect(timingOf(prompt(0, 'hello'))).toBeNull();
  });

  it('counts a call that never reported a result as zero, and says how many', () => {
    const timing = timingOf(uses(0, { id: 'a' }), results(5, 'a'), uses(10, { id: 'b' }))!;
    expect(timing.unfinished).toBe(1);
    expect(timing.waitMs).toBe(5_000);
    expect(formatSession(timing && { id: 's', kind: 'session', timing })).toContain('1 call(s) never reported a result');
  });
});

describe('attributing the waiting', () => {
  it('groups repeats of one command and ranks commands by total wait', () => {
    const timing = timingOf(
      uses(0, { id: 'a', input: { command: 'npm test' } }),
      results(10, 'a'),
      uses(10, { id: 'b', input: { command: 'npm test' } }),
      results(30, 'b'),
      uses(30, { id: 'c', input: { command: 'git status' } }),
      results(31, 'c'),
    )!;
    expect(timing.hottest[0]).toMatchObject({ label: 'npm test', waitMs: 30_000, count: 2 });
    expect(timing.hottest[1]).toMatchObject({ label: 'git status', count: 1 });
  });

  it('measures how concentrated the waiting is in its three costliest commands', () => {
    const timing = timingOf(
      uses(0, { id: 'a', input: { command: 'slow one' } }),
      results(90, 'a'),
      uses(90, { id: 'b', input: { command: 'fast' } }),
      results(100, 'b'),
    )!;
    expect(timing.concentration).toBe(1);
    expect(formatSession({ id: 's', kind: 'session', timing })).toContain('100% of all waiting');
  });

  it('labels a call by what it ran, with the working-directory prefix taken off', () => {
    expect(normalizeCommand('cd "C:/a b/c" && npm run mutate -- m1.json')).toBe('npm run mutate -- m1.json');
    expect(normalizeCommand("cd '/tmp/x' &&   npm   test  ")).toBe('npm test');
    expect(normalizeCommand('cd /tmp/x && ls')).toBe('ls');
    expect(normalizeCommand('git log --oneline')).toBe('git log --oneline');
  });

  it('falls back to the file a non-shell tool touched when there is no command', () => {
    const timing = timingOf(uses(0, { id: 'a', name: 'Read', input: { file_path: 'docs/specs/x.md' } }), results(1, 'a'))!;
    expect(timing.hottest[0].label).toBe('docs/specs/x.md');
    expect(timing.byTool[0]).toMatchObject({ name: 'Read', count: 1 });
  });

  it('names the tool for anything that is not a shell command, so a bare path is never ambiguous', () => {
    const timing = timingOf(uses(0, { id: 'a', name: 'Agent', input: { prompt: 'audit the branch' } }), results(60, 'a'))!;
    expect(formatSession({ id: 's', kind: 'session', timing })).toContain('Agent: audit the branch');
    expect(formatIndex([{ id: 's', kind: 'session', timing }])).toContain('Agent: audit the branch');
  });
});

describe('the report', () => {
  it('names waiting, generating and idle as shares of the session', () => {
    const timing = timingOf(uses(0, { id: 'a', input: { command: 'npm run mutate' } }), results(60, 'a'), uses(90, { id: 'b' }), results(100, 'b'))!;
    const report = formatSession({ id: 'agent-1', kind: 'subagent', parent: 'session-9', timing });
    expect(report).toContain('subagent of session-9');
    expect(report).toContain('waiting on tools');
    expect(report).toContain('model generating');
    expect(report).toContain('npm run mutate');
  });

  it('lists sessions with the command each spent longest waiting on', () => {
    const timing = timingOf(uses(0, { id: 'a', input: { command: 'npm run mutate -- m1.json' } }), results(600, 'a'))!;
    const index = formatIndex([{ id: 'agent-1', kind: 'subagent', timing }]);
    expect(index).toContain('agent-1 (sub)');
    expect(index).toContain('npm run mutate -- m1.json');
  });

  it('says so plainly when nothing was found', () => {
    expect(formatIndex([])).toContain('no transcripts found');
  });

  it('shortens a session id to something a person can read back and retype', () => {
    expect(shortId('6ffe5665-c95c-4d81-96ca-5ba319ee7ee6')).toBe('6ffe5665');
    expect(shortId('agent-abc1ea5f5bdb053e6')).toBe('agent-abc1ea5f');
  });
});
