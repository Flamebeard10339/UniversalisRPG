import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Call {
  n: number;
  tool: string;
  target: string;
  body: string;
}

export interface Reading {
  calls: readonly Call[];
  total: number;
  orientation: number;
  engineReads: readonly Call[];
  scratchWrites: readonly Call[];
  scratchRuns: readonly Call[];
  rerunsOf: ReadonlyMap<string, readonly number[]>;
  helpAfterUse: readonly Call[];
}

const SCRATCH = /(^|[\\/])(scratchpad|tmp|temp)([\\/]|$)/i;
const ENGINE = /(^|[\s"'`([{=/])(src|scripts)[\\/][\w./-]+\.tsx?/;

const flatten = (input: Record<string, unknown>): string =>
  [input.command, input.file_path, input.pattern, input.query, input.path]
    .filter((each): each is string => typeof each === 'string')
    .join(' ');

export function callsIn(transcript: string): Call[] {
  const calls: Call[] = [];
  for (const line of transcript.split('\n')) {
    if (line.trim() === '') continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = ((event as { message?: { content?: unknown } }).message ?? event) as { content?: unknown };
    if (!Array.isArray(content.content)) continue;
    for (const part of content.content as { type?: string; name?: string; input?: Record<string, unknown> }[]) {
      if (part.type !== 'tool_use' || part.name === undefined) continue;
      const input = part.input ?? {};
      calls.push({
        n: calls.length + 1,
        tool: part.name,
        target: flatten(input).replace(/\s+/g, ' ').trim(),
        body: typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : '',
      });
    }
  }
  return calls;
}

const WRITING_TOOL = /^(Write|Edit|NotebookEdit)$/;

const writes = (call: Call): boolean => WRITING_TOOL.test(call.tool);

export const firstRealEdit = (calls: readonly Call[]): number => {
  const found = calls.find((call) => writes(call) && !SCRATCH.test(call.target));
  return found?.n ?? calls.length + 1;
};

const invocation = (call: Call): string | null => {
  const run = /(?:^|&&|\|\||;)\s*(?:cd\s+\S+\s*&&\s*)?((?:npm run|npx|node|tsx)\s+[\w:-]+)/.exec(call.target);
  return run === null ? run : run[1].replace(/\s+/g, ' ');
};

export function read(calls: readonly Call[]): Reading {
  const orientation = firstRealEdit(calls);
  const opening = calls.filter((call) => call.n < orientation);

  const runsAt = new Map<string, number[]>();
  for (const call of calls) {
    const command = invocation(call);
    if (command === null) continue;
    runsAt.set(command, [...(runsAt.get(command) ?? []), call.n]);
  }

  const helpAfterUse = calls.filter((call) => {
    if (!/--help|-h\b/.test(call.target)) return false;
    const command = invocation(call);
    return command !== null && (runsAt.get(command) ?? []).some((at) => at < call.n);
  });

  return {
    calls,
    total: calls.length,
    orientation,
    engineReads: opening.filter((call) => !writes(call) && ENGINE.test(call.target)),
    scratchWrites: opening.filter((call) => writes(call) && SCRATCH.test(call.target)),
    scratchRuns: opening.filter((call) => call.tool === 'Bash' && SCRATCH.test(call.target)),
    rerunsOf: new Map(
      [...runsAt].map(([command, at]) => [command, at.filter((n) => n < orientation)] as const).filter(([, at]) => at.length > 1),
    ),
    helpAfterUse,
  };
}

const shorten = (text: string, room: number): string => (text.length <= room ? text : `${text.slice(0, room - 1)}…`);

const anonymise = (text: string): string =>
  text
    .replace(/^cd\s+\S*\s*&&\s*/i, '')
    .replace(/[A-Za-z]:[\\/][^\s"']*[\\/]scratchpad[\\/]?/gi, '$SP/')
    .replace(/[A-Za-z]:[\\/][^\s"']*[\\/]worktrees[\\/][\w.-]+[\\/]?/gi, '$WT/')
    .replace(/[A-Za-z]:[\\/]Users[\\/][\w.-]+[\\/]/gi, '~/');

const OPENING_SHOWN = 44;
const PROBES_SHOWN = 6;

export function report(reading: Reading, name: string): string[] {
  const { total, orientation } = reading;
  const share = total === 0 ? 0 : Math.round((100 * (orientation - 1)) / total);
  const lines = [`${name} — ${total} calls; first non-scratch edit at ${orientation} (${share}% spent orienting)`, ''];

  const counts: [string, number, string][] = [
    ['engine source read', reading.engineReads.length, reading.engineReads.map((call) => call.n).join(' ')],
    ['scratch files written', reading.scratchWrites.length, reading.scratchWrites.map((call) => call.n).join(' ')],
    ['scratch runs', reading.scratchRuns.length, reading.scratchRuns.map((call) => call.n).join(' ')],
    ['tools re-run while orienting', reading.rerunsOf.size, [...reading.rerunsOf].map(([command, at]) => `${at.length}× ${command}`).join(', ')],
    ['--help after first use', reading.helpAfterUse.length, reading.helpAfterUse.map((call) => call.n).join(' ')],
  ];
  for (const [label, count, at] of counts) lines.push(`  ${String(count).padStart(3)}  ${label.padEnd(30)}${shorten(at, 40)}`);

  if (reading.scratchWrites.length > 0) {
    lines.push('', 'what it built to find out:');
    for (const call of reading.scratchWrites.slice(0, PROBES_SHOWN)) {
      const gist = call.body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('//'))
        .slice(0, 4)
        .join(' / ');
      lines.push(`  ${String(call.n).padStart(3)}  ${shorten(anonymise(call.target), 34).padEnd(34)}${shorten(gist, 60)}`);
    }
  }

  lines.push('', `opening ${Math.min(orientation - 1, OPENING_SHOWN)} calls:`);
  for (const call of reading.calls.slice(0, Math.min(orientation - 1, OPENING_SHOWN))) {
    lines.push(`  ${String(call.n).padStart(3)}  ${call.tool.padEnd(6)}${shorten(anonymise(call.target), 82)}`);
  }
  if (orientation - 1 > OPENING_SHOWN) lines.push(`  … ${orientation - 1 - OPENING_SHOWN} more before the first edit`);

  return lines;
}

const slugOf = (directory: string): string => directory.replace(/[^A-Za-z0-9]/g, '-');

export function transcriptsUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const sessions = readdirSync(root)
    .map((entry) => path.join(root, entry, 'subagents'))
    .filter((directory) => existsSync(directory));
  return sessions
    .flatMap((directory) => readdirSync(directory).filter((file) => file.endsWith('.jsonl')).map((file) => path.join(directory, file)))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

const idFromStdin = (): string | null => {
  if (process.stdin.isTTY) return null;
  try {
    const event = JSON.parse(readFileSync(0, 'utf8')) as Record<string, unknown>;
    const named = [event.agent_id, event.subagent_id, event.session_id].find((each) => typeof each === 'string');
    return (named as string | undefined) ?? null;
  } catch {
    return null;
  }
};

function asHookOutput(root: string): string {
  const found = transcriptsUnder(root);
  const named = idFromStdin();
  const chosen = (named === null ? [] : found.filter((file) => path.basename(file).includes(named)))[0] ?? found[0];
  if (chosen === undefined) return '{}';

  const reading = read(callsIn(readFileSync(chosen, 'utf8')));
  const lines = report(reading, path.basename(chosen, '.jsonl'));
  const probes = reading.scratchWrites.length + reading.rerunsOf.size + reading.helpAfterUse.length;

  return JSON.stringify({
    systemMessage: `${lines[0]}${probes > 0 ? ` — ${probes} thing(s) it had to work out for itself` : ''}`,
    hookSpecificOutput: {
      hookEventName: 'SubagentStop',
      additionalContext: [
        'What that subagent had to work out before it could start. Experimentation is not by itself waste — a lane whose',
        'brief was engine work reads engine source because that is the job. It is a signal: each line is a question the',
        'docs did not answer, and a scratch world built by a lane that was told to ask the oracle names a hole that will',
        'cost the next lane the same time. Judge it, and say so; if it names a hole, that is worth fixing at the source.',
        '',
        ...lines,
      ].join('\n'),
    },
  });
}

const usage = [
  'Usage: npm run friction [-- <agent id | transcript path> | --all | --hook]',
  '',
  'What a subagent had to work out for itself before it could start. Reads the',
  'transcript of a finished subagent and reports its opening moves — engine source',
  'read, scratch worlds built, tools re-run to learn their output — up to its first',
  'edit of a real file. Experimentation happens at the beginning of a run, so',
  'everything after that first edit is ignored.',
  '',
  'Every line is a question the docs did not answer. Whether that is waste or the',
  'job is yours to judge; this only says where the time went.',
  '',
  'With no argument, reports on the most recent subagent of this project.',
].join('\n');

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const root = path.join(os.homedir(), '.claude', 'projects', slugOf(process.cwd()));
  if (args.includes('--hook')) {
    console.log(asHookOutput(root));
    return;
  }
  const found = transcriptsUnder(root);
  const named = args.find((arg) => !arg.startsWith('--'));

  const chosen = args.includes('--all')
    ? found
    : named === undefined
      ? found.slice(0, 1)
      : existsSync(named)
        ? [named]
        : found.filter((file) => path.basename(file).includes(named));

  if (chosen.length === 0) {
    console.error(found.length === 0 ? `No subagent transcripts under ${root}` : `No subagent transcript matches ${named}`);
    process.exit(1);
  }

  console.log(chosen.map((file) => report(read(callsIn(readFileSync(file, 'utf8'))), path.basename(file, '.jsonl')).join('\n')).join('\n\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
