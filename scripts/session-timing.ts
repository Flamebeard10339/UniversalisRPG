import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatIndex, formatSession, parseTranscript, summarize, type SessionRow } from './lib/sessionTiming';

// Claude Code names a transcript directory after the working directory it was
// launched from, with every character that is not alphanumeric flattened. This
// is the one fact here owned by an external tool; everything downstream is a
// consequence of it.
export const encodePath = (target: string): string => target.replace(/[^a-zA-Z0-9]/g, '-');

// Every worktree gets its own transcript directory, and a worktree is where the
// interesting sessions run. Trimming back to the checkout the worktrees hang off
// gives one prefix that covers all of them.
export const projectPrefix = (encoded: string): string => encoded.split('--claude-worktrees-')[0];

export interface Transcript {
  id: string;
  kind: 'session' | 'subagent';
  parent?: string;
  file: string;
  modifiedAt: number;
}

const jsonlIn = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.jsonl')) : []);

export function findTranscripts(projectsDir: string, prefix: string): Transcript[] {
  if (!existsSync(projectsDir)) return [];
  const found: Transcript[] = [];
  for (const project of readdirSync(projectsDir)) {
    if (!project.startsWith(prefix)) continue;
    const dir = path.join(projectsDir, project);
    for (const name of jsonlIn(dir)) {
      const id = name.replace(/\.jsonl$/, '');
      found.push({ id, kind: 'session', file: path.join(dir, name), modifiedAt: statSync(path.join(dir, name)).mtimeMs });
      const subagents = path.join(dir, id, 'subagents');
      for (const sub of jsonlIn(subagents)) {
        found.push({ id: sub.replace(/\.jsonl$/, ''), kind: 'subagent', parent: id, file: path.join(subagents, sub), modifiedAt: statSync(path.join(subagents, sub)).mtimeMs });
      }
    }
  }
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

const rowFor = (transcript: Transcript): SessionRow | null => {
  const timing = summarize(parseTranscript(readFileSync(transcript.file, 'utf8')));
  return timing === null ? null : { id: transcript.id, kind: transcript.kind, parent: transcript.parent, timing };
};

const usage = [
  'Usage: npm run session-timing [-- <session-id | path> | --last] [--limit N]',
  '',
  'Reports where a session spent its wall clock: waiting on tools, generating, or',
  'waiting on a human. Reads the transcripts Claude Code already writes, so nothing',
  'has to be asked of the session being measured.',
  '',
  'With no argument it lists recent sessions for this repository and its worktrees,',
  'subagents included — an audit runs as a subagent, so that is where audits appear.',
].join('\n');

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const limitAt = argv.indexOf('--limit');
  const limit = limitAt === -1 ? 15 : Number(argv[limitAt + 1]);
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error('--limit takes a positive number');
    process.exitCode = 2;
    return;
  }
  const target = argv.find((argument) => !argument.startsWith('-') && argument !== String(limit));

  const repoRoot = path.resolve(import.meta.dirname, '..');
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const transcripts = findTranscripts(projectsDir, projectPrefix(encodePath(repoRoot)));

  if (transcripts.length === 0) {
    console.error(`no transcripts under ${projectsDir} for ${repoRoot}`);
    process.exitCode = 1;
    return;
  }

  if (target === undefined && !argv.includes('--last')) {
    const rows = transcripts.slice(0, limit).map(rowFor).filter((row): row is SessionRow => row !== null);
    console.log(formatIndex(rows));
    return;
  }

  const chosen = argv.includes('--last')
    ? transcripts[0]
    : (transcripts.find((transcript) => transcript.id === target || transcript.id.startsWith(String(target)) || transcript.file === path.resolve(String(target))) ??
      (existsSync(String(target)) ? { id: path.basename(String(target), '.jsonl'), kind: 'session' as const, file: path.resolve(String(target)), modifiedAt: 0 } : undefined));

  if (chosen === undefined) {
    console.error(`no transcript named ${target}. Run with no argument to list them.`);
    process.exitCode = 1;
    return;
  }

  const row = rowFor(chosen);
  if (row === null) {
    console.error(`${chosen.id} recorded no tool calls, so there is no time to account for.`);
    process.exitCode = 1;
    return;
  }
  console.log(formatSession(row));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
