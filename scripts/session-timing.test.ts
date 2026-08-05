import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePath, findTranscripts, projectPrefix } from './session-timing';

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function projectsDir(build: (root: string) => void): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'session-timing-'));
  temporary.push(root);
  build(root);
  return root;
}

const write = (file: string, text = '{}'): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

describe('finding the transcripts of this repository', () => {
  it('flattens a working directory the way Claude Code names its transcript folder', () => {
    expect(encodePath('C:\\Users\\yonat\\Projects\\UniversalisRPG')).toBe('C--Users-yonat-Projects-UniversalisRPG');
    expect(encodePath('C:\\Users\\yonat\\Projects\\UniversalisRPG\\.claude\\worktrees\\audit-session-timing')).toBe(
      'C--Users-yonat-Projects-UniversalisRPG--claude-worktrees-audit-session-timing',
    );
  });

  it('trims a worktree back to the checkout it hangs off, so one prefix covers them all', () => {
    expect(projectPrefix('C--Users-yonat-Projects-UniversalisRPG--claude-worktrees-audit-session-timing')).toBe('C--Users-yonat-Projects-UniversalisRPG');
    expect(projectPrefix('C--Users-yonat-Projects-UniversalisRPG')).toBe('C--Users-yonat-Projects-UniversalisRPG');
  });

  it('collects worktree sessions alongside the main checkout, and skips other repositories', () => {
    const root = projectsDir((dir) => {
      write(path.join(dir, 'Repo-A', 'one.jsonl'));
      write(path.join(dir, 'Repo-A--claude-worktrees-branch', 'two.jsonl'));
      write(path.join(dir, 'Repo-B', 'other.jsonl'));
    });
    expect(findTranscripts(root, 'Repo-A').map((transcript) => transcript.id).sort()).toEqual(['one', 'two']);
  });

  it('finds the subagent transcripts a session spawned, and names their parent', () => {
    const root = projectsDir((dir) => {
      write(path.join(dir, 'Repo-A', 'parent.jsonl'));
      write(path.join(dir, 'Repo-A', 'parent', 'subagents', 'agent-77.jsonl'));
      write(path.join(dir, 'Repo-A', 'parent', 'tool-results', 'ignored.json'));
    });
    const found = findTranscripts(root, 'Repo-A');
    expect(found).toHaveLength(2);
    expect(found.find((transcript) => transcript.kind === 'subagent')).toMatchObject({ id: 'agent-77', parent: 'parent' });
  });

  it('sorts the newest transcript first, so --last means the session that just ended', () => {
    const root = projectsDir((dir) => {
      write(path.join(dir, 'Repo-A', 'older.jsonl'));
      write(path.join(dir, 'Repo-A', 'newer.jsonl'));
    });
    const found = findTranscripts(root, 'Repo-A');
    expect(found[0].modifiedAt).toBeGreaterThanOrEqual(found[1].modifiedAt);
  });

  it('returns nothing rather than throwing when no session has ever run here', () => {
    expect(findTranscripts(path.join(os.tmpdir(), 'session-timing-absent'), 'Repo-A')).toEqual([]);
    expect(findTranscripts(projectsDir(() => {}), 'Repo-A')).toEqual([]);
  });
});
