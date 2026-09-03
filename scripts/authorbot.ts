import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { DEBUG_SWITCH_NAMES } from '../src/content/sections/test';
import { ENGINE_MODULE_DIR } from '../src/content/engineModules';
import { CORPUS_DIR } from '../src/content/shipped';
import { BRIEF_IS_A_FILE, readBrief } from './lib/brief';

export const repoRoot = path.join(import.meta.dirname, '..');

export const DEFAULT_TURNS = 150;
const DEFAULT_MODEL = 'claude-sonnet-5';

export const GRACE_MINUTES = 2;

const usage = [
  'Usage: npm run authorbot -- <brief> [--target <module>] [--open] [--turns <n>] [--minutes <n>] [--model <id>]',
  '       npm run authorbot -- --watch [<brief>]',
  '',
  '  <brief>    the file saying what to write, named as a loose word or after --brief;',
  ...BRIEF_IS_A_FILE.map((line) => `             ${line}`),
  '  --target   the module under content/ the run may write, which is the only file it may',
  '             write anywhere. With none, the brief\'s own name: a brief at',
  '             planning/A Grand Blade.md writes a-grand-blade.dsl',
  '  --open     let the run read the engine and count every reach, rather than refusing it.',
  '             Without this, src/, scripts/, docs/ and every .ts are refused, and the refusal',
  '             says to ask the oracle',
  `  --turns    how many replies before the run is cut off (default ${String(DEFAULT_TURNS)})`,
  '  --minutes  how many minutes of wall clock the run may take. With a minute left, the run is',
  `             told so beside its next tool result, and ${String(GRACE_MINUTES)} minutes past the clock it is cut off`,
  '             for good, report or no report. Without this the turn cap is the only limit',
  '  --model    which model plays the author (default claude-sonnet-5)',
  '  --watch    do not start anything: say where every authorbot run on this machine stands,',
  '             and go on saying it until they have all ended. With a brief, just that one',
  '',
  'The run works on a copy of content/ in a directory of its own and writes nothing in this',
  'checkout, so it does not count as a second writer in it. It prints where that directory is,',
  'what the run cost, and every reach it made for the engine.',
].join('\n');

export interface Asked {
  brief: string | null;
  target: string | null;
  open: boolean;
  turns: number;
  minutes: number | null;
  model: string;
  watch: boolean;
}

export const moduleNameFor = (brief: string): string =>
  path
    .basename(brief)
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const targetFor = (brief: string): string => `${moduleNameFor(brief)}.dsl`;

const requireValue = (flag: string, value: string | undefined): string => {
  if (value === undefined || value.startsWith('-')) throw new Error(`${flag} wants a value after it\n\n${usage}`);
  return value;
};

const requireCount = (flag: string, value: string): number => {
  const held = Number(value);
  if (!Number.isInteger(held) || held < 1) throw new Error(`${flag} takes a count, and ${JSON.stringify(value)} is not one\n\n${usage}`);
  return held;
};

export function parseArgs(argv: readonly string[]): Asked {
  const asked: Asked = { brief: null, target: null, open: false, turns: DEFAULT_TURNS, minutes: null, model: DEFAULT_MODEL, watch: false };
  const named = (word: string): void => {
    if (asked.brief !== null) throw new Error(`the brief is named once, and ${JSON.stringify(word)} is a second\n\n${usage}`);
    asked.brief = word;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--brief') named(requireValue(arg, argv[++i]));
    else if (arg === '--target') asked.target = requireValue(arg, argv[++i]);
    else if (arg === '--turns') asked.turns = requireCount(arg, requireValue(arg, argv[++i]));
    else if (arg === '--minutes') asked.minutes = requireCount(arg, requireValue(arg, argv[++i]));
    else if (arg === '--model') asked.model = requireValue(arg, argv[++i]);
    else if (arg === '--open') asked.open = true;
    else if (arg === '--watch') asked.watch = true;
    else if (arg.startsWith('-')) throw new Error(`unknown flag ${arg}\n\n${usage}`);
    else named(arg);
  }
  if (asked.brief === null && !asked.watch) throw new Error(`nothing was named to write from: the brief is a file, given as a loose word or after --brief\n\n${usage}`);
  if (asked.brief !== null && asked.target === null) asked.target = targetFor(asked.brief);
  return asked;
}

const LAST_MINUTE_MS = 60_000;

export const inLastMinute = (startedAt: number, minutes: number | null, now: number): boolean => minutes !== null && startedAt + minutes * 60_000 - now <= LAST_MINUTE_MS;

export const LAST_MINUTE = `One minute of wall clock is left on this run, and it is cut off for good ${String(GRACE_MINUTES)} minutes after that. Stop revising and write the report now, from what you already know: a report on what walked is worth everything, and one more attempt is worth nothing.`;

const ENGINE_DIRS = ['src', 'scripts', 'docs', 'node_modules', 'dist'];
const ENGINE_TEXT = /\b(src|scripts|docs)[/\\]|\.tsx?\b/i;

const engineUnder = (repo: string, written: string): boolean => {
  const rel = path.relative(repo, path.resolve(repo, written)).replace(/\\/g, '/');
  return ENGINE_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
};

const WRITES = new Set(['write', 'edit', 'notebookedit']);

export type Verdict = { reaching: false } | { reaching: true; why: 'engine' } | { reaching: true; why: 'elsewhere' };

export function verdictOf(tool: string, input: Record<string, unknown>, repo: string, workdir: string): Verdict {
  const written = input.file_path;
  if (WRITES.has(tool.toLowerCase()) && typeof written === 'string') {
    const inside = path.resolve(written).toLowerCase().startsWith(path.resolve(workdir).toLowerCase());
    if (!inside) return { reaching: true, why: 'elsewhere' };
  }
  if (tool === 'Bash') return ENGINE_TEXT.test(String(input.command ?? '')) ? { reaching: true, why: 'engine' } : { reaching: false };
  const named = [input.file_path, input.path, input.pattern].filter((each): each is string => typeof each === 'string');
  return named.some((each) => engineUnder(repo, each) || ENGINE_TEXT.test(each)) ? { reaching: true, why: 'engine' } : { reaching: false };
}

export const refusalFor = (why: 'engine' | 'elsewhere', draft: string): string =>
  why === 'elsewhere'
    ? `this run writes only ${draft}, and nothing else anywhere.`
    : "the engine's source is off limits in this run. What may be written in the language is printed by `npm run oracle` — ask it instead, and say in your next message what you were hoping to find there.";

export function systemFor(asked: Asked, corpus: string, draft: string): string {
  return `You are authoring content for Universalis RPG, a text game. Its content is written in a small line-based DSL: a file is a sequence of sections, each headed \`# <kind> <id>\`.

How this run is set up:

- The world you are writing into is the corpus of .dsl files in ${corpus}. Read any of them.
- The one file you may write is ${draft}.
- Run every command from ${repoRoot}, which is the working directory.
${asked.open ? '- The repository is yours to read: the engine under src/ and scripts/ is there if you want it.' : "- **The engine's source code is off limits.** Nothing under src/, scripts/ or docs/, and no .ts file, may be read. Everything about the language is printed by the oracle, and where the oracle does not answer something, that is a defect worth reporting — say so out loud in your reply, and go on."}

The tools you have:

    npm run oracle                       every line that may be written, under every kind
    npm run oracle -- <kind>...          the same, narrowed to the kinds you name
    npm run oracle -- --at <file>        read a draft: what the engine refuses, and whether it takes the file
    npm run oracle -- --at <file> --walk <line>
                                         one line: where it sits, what it reads as, what may stand there
    npm run oracle -- --at ${corpus}
                                         the whole world you are writing into: every line the engine
                                         has something to say about, whether it loads, whether it
                                         prints back to itself, whether every route in it still
                                         walks, and anything it takes that an author probably did
                                         not mean. This is the gate. There is no other one, and no
                                         test suite anywhere answers for what you are writing
    npm run probe -- ${corpus} --test <id>
                                         run one \`# test\` and report PASSED or FAILED
    npm run simulate-activity -- <save> [<word>] [--ideal]
                                         what every offer in front of a player standing on that save
                                         pays an hour and what it costs them, and whether the loop it
                                         was asked for finished. --ideal reads the most it can pay and
                                         the least it can cost, under the god words
    npm run notes -- ${corpus}
                                         every \`@@@\` held by the corpus you are writing into,
                                         your own included. Bare, it reads the shipped corpus
                                         instead and will not show you your own

**Balance is not yours to settle.** Whether a number you wrote is a rat or a dragon is answered by
running the world, in a pass of its own that is not this one. Write figures that read sensibly beside
what the corpus already holds and go on; nobody will hold you to them, and no test may assert one.

What your \`# test\` proves instead is that the path is walkable: that this sequence of actions, taken
in order, reaches the end it names. So a route that would otherwise stand or fall on a fight says so
in one word — ${DEBUG_SWITCH_NAMES.map((name) => `\`${name}\``).join(', ')}, each on a line of its own in a \`# test\`, described where the rest of the
kind is by \`npm run oracle -- test\`. Reach for those rather than buying past a fight with a \`# save\`
full of experience, and use as many of them as the route needs.

You are done when the engine takes your file and a \`# test\` you wrote in it walks the thing you were
asked for from end to end, and you have shown the output of both. If you get stuck, say exactly what
you could not find out and where you looked.`;
}

export interface Reach {
  turn: number;
  tool: string;
  target: string;
  decision: 'allow' | 'deny' | 'engine';
  at: number;
}

export interface Cost {
  turns: number;
  seconds: number;
  calls: number;
  usage?: Record<string, number>;
}

export function summaryLines(reaches: readonly Reach[], cost: Cost, workdir: string): string[] {
  const engine = reaches.filter((each) => each.decision !== 'allow');
  return [
    '',
    `run of ${cost.turns} reply(s) in ${cost.seconds.toFixed(1)}s, ${cost.calls} tool call(s)`,
    cost.usage === undefined
      ? '  nothing billed'
      : `  ${cost.usage.input_tokens ?? 0} in, ${cost.usage.cache_read_input_tokens ?? 0} cached read, ${cost.usage.cache_creation_input_tokens ?? 0} cached write, ${cost.usage.output_tokens ?? 0} out`,
    '',
    engine.length === 0
      ? 'it never reached for the engine: every question it had was answered by the oracle or by the corpus'
      : `${engine.length} reach(es) for the engine, each one a question the oracle did not answer:`,
    ...engine.map((each) => `  reply ${each.turn}: ${each.decision === 'deny' ? 'refused — ' : ''}${each.tool} ${each.target.replace(/\n/g, ' ; ')}`),
    '',
    `what it wrote, and the run's own account of it, are under ${workdir}`,
  ];
}

const WORKDIR_PREFIX = 'universalis-authorbot-';
const CALLS_FILE = 'calls.jsonl';
const ENDED_FILE = 'ended';

export const workdirFor = (brief: string): string => path.join(os.tmpdir(), `${WORKDIR_PREFIX}${moduleNameFor(brief)}`);

export const signatureOf = (reach: Reach): string => `${reach.tool} ${reach.target.replace(/\s+/g, ' ').trim().slice(0, 90)}`;

export const CIRCLING_WINDOW = 40;
export const CIRCLING_DISTINCT = 5;

export interface RunStatus {
  name: string;
  reply: number;
  calls: number;
  quiet: number;
  engine: number;
  ended: boolean;
  window: { distinct: number; top: string; count: number; circling: boolean } | null;
}

function windowOf(reaches: readonly Reach[]): RunStatus['window'] {
  if (reaches.length === 0) return null;
  const held = reaches.slice(-CIRCLING_WINDOW);
  const counted = new Map<string, number>();
  for (const reach of held) {
    const key = signatureOf(reach);
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }
  const [top, count] = [...counted].sort((a, b) => b[1] - a[1])[0]!;
  return { distinct: counted.size, top, count, circling: held.length === CIRCLING_WINDOW && counted.size <= CIRCLING_DISTINCT };
}

export function statusOf(name: string, reaches: readonly Reach[], ended: boolean, now: number): RunStatus {
  const last = reaches[reaches.length - 1];
  return {
    name,
    reply: last === undefined ? 0 : last.turn,
    calls: reaches.length,
    quiet: last === undefined ? 0 : Math.max(0, (now - last.at) / 1000),
    engine: reaches.filter((each) => each.decision !== 'allow').length,
    ended,
    window: windowOf(reaches),
  };
}

export function statusLines(status: RunStatus): string[] {
  const head = status.ended
    ? `${status.name} — ended, ${status.reply} reply(s), ${status.calls} call(s)`
    : `${status.name} — reply ${status.reply}, ${status.calls} call(s), last ${status.quiet.toFixed(0)}s ago`;
  if (status.window === null) return [head, '  nothing yet: no tool call has been made'];
  const { distinct, top, count, circling } = status.window;
  return [
    head,
    ...(status.engine === 0 ? [] : [`  ${status.engine} reach(es) for the engine`]),
    `  ${circling ? 'going in circles: ' : ''}${distinct} distinct call(s) in the last ${Math.min(status.calls, CIRCLING_WINDOW)}, most repeated ${count}× ${top}`,
  ];
}

const reachesIn = (workdir: string): readonly Reach[] => {
  const file = path.join(workdir, CALLS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Reach];
      } catch {
        return [];
      }
    });
};

export const runsInFlight = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(WORKDIR_PREFIX))
    .map((entry) => path.join(dir, entry.name));

function statusNow(workdirs: readonly string[]): readonly RunStatus[] {
  const now = Date.now();
  return workdirs.map((workdir) => statusOf(path.basename(workdir).slice(WORKDIR_PREFIX.length), reachesIn(workdir), existsSync(path.join(workdir, ENDED_FILE)), now));
}

const WATCH_INTERVAL_MS = 15_000;

async function watch(brief: string | null): Promise<number> {
  const workdirs = brief === null ? runsInFlight(os.tmpdir()) : [workdirFor(brief)];
  if (workdirs.length === 0 || !workdirs.some((each) => existsSync(each))) {
    console.log('no authorbot run has left a directory on this machine');
    return 1;
  }
  for (;;) {
    const held = statusNow(workdirs.filter((each) => existsSync(each)));
    console.log([new Date().toISOString(), ...held.flatMap(statusLines), ''].join('\n'));
    if (held.every((each) => each.ended)) return 0;
    await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
  }
}

async function run(asked: Asked): Promise<number> {
  const brief = readBrief('--brief', asked.brief!);
  const workdir = workdirFor(asked.brief!);
  if (existsSync(workdir)) rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });
  const corpus = path.join(workdir, 'content').replace(/\\/g, '/');
  cpSync(path.join(repoRoot, CORPUS_DIR), path.join(workdir, 'content'), { recursive: true });
  cpSync(path.join(repoRoot, ENGINE_MODULE_DIR), path.join(workdir, 'content'), { recursive: true });
  const draft = path.join(corpus, asked.target!).replace(/\\/g, '/');
  if (!existsSync(draft)) writeFileSync(draft, '');

  const transcript = path.join(workdir, 'transcript.md');
  const calls = path.join(workdir, CALLS_FILE);
  const say = (line: string): void => {
    appendFileSync(transcript, `${line}\n`);
    console.log(line);
  };

  const reaches: Reach[] = [];
  let turn = 0;
  const seen = (tool: string, target: string, decision: Reach['decision']): void => {
    const reach: Reach = { turn, tool, target, decision, at: Date.now() };
    reaches.push(reach);
    appendFileSync(calls, `${JSON.stringify(reach)}\n`);
  };

  const started = Date.now();
  let warned = false;

  const preToolUse = async (input: unknown): Promise<Record<string, unknown>> => {
    const { tool_name: tool, tool_input: held } = input as { tool_name: string; tool_input: Record<string, unknown> };
    const args = held ?? {};
    const target = String(args.file_path ?? args.path ?? args.pattern ?? args.command ?? JSON.stringify(args)).slice(0, 300);
    const verdict = verdictOf(tool, args, repoRoot, workdir);
    const refuse = verdict.reaching && (verdict.why === 'elsewhere' || !asked.open);
    seen(tool, target, !verdict.reaching ? 'allow' : refuse ? 'deny' : 'engine');
    say(`  ${!verdict.reaching ? '[tool]  ' : refuse ? '[refused]' : '[engine]'} ${tool} ${target.replace(/\n/g, ' ; ')}`);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: refuse ? 'deny' : 'allow',
        ...(refuse ? { permissionDecisionReason: refusalFor((verdict as { why: 'engine' | 'elsewhere' }).why, draft) } : {}),
      },
    };
  };

  const postToolUse = async (): Promise<Record<string, unknown>> => {
    if (warned || !inLastMinute(started, asked.minutes, Date.now())) return {};
    warned = true;
    say('  [clock]  one minute left, and the run has been told so');
    return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: LAST_MINUTE } };
  };

  const system = systemFor(asked, corpus, draft);
  const limit = asked.minutes === null ? '' : `, ${asked.minutes} minute(s)`;
  writeFileSync(transcript, `# authorbot\n\nmodel: ${asked.model}, turns: ${asked.turns}${limit}, engine ${asked.open ? 'open' : 'off limits'}\n\n## system\n\n${system}\n\n## brief\n\n${brief}\n\n## run\n\n`);
  say(`authorbot ${asked.model}: ${asked.brief!} → ${draft}, up to ${asked.turns} replies${limit}`);
  say(`while it runs: npm run authorbot -- --watch ${JSON.stringify(asked.brief!)}`);

  const abort = new AbortController();
  const cutOff = asked.minutes === null ? undefined : setTimeout(() => abort.abort(), (asked.minutes + GRACE_MINUTES) * 60_000);
  const options: Options = {
    systemPrompt: system,
    cwd: repoRoot,
    model: asked.model,
    maxTurns: asked.turns,
    hooks: { PreToolUse: [{ hooks: [preToolUse] }], PostToolUse: [{ hooks: [postToolUse] }] },
    settingSources: [],
    disallowedTools: ['Task', 'WebSearch', 'WebFetch'],
    abortController: abort,
  };

  let usage: Record<string, number> | undefined;
  let ended = '(the run produced no result)';
  try {
    for await (const message of query({ prompt: brief, options })) {
      if (message.type === 'assistant') {
        turn += 1;
        for (const block of message.message.content as { type: string; text?: string }[]) {
          if (block.type === 'text' && block.text?.trim()) say(`\n[${turn}] ${block.text.trim()}`);
        }
        continue;
      }
      if (message.type === 'result') {
        usage = message.usage as unknown as Record<string, number>;
        ended = message.subtype === 'success' ? message.result : `the run did not finish: ${message.subtype}`;
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) throw error;
    ended = `the run was cut off ${String(GRACE_MINUTES)} minutes past its ${String(asked.minutes)}-minute clock, still working`;
  } finally {
    if (cutOff !== undefined) clearTimeout(cutOff);
  }

  say(`\n${ended}`);
  say(summaryLines(reaches, { turns: turn, seconds: (Date.now() - started) / 1000, calls: reaches.length, usage }, workdir).join('\n'));
  writeFileSync(path.join(workdir, ENDED_FILE), '');
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  try {
    const asked = parseArgs(argv);
    process.exit(asked.watch ? await watch(asked.brief) : await run(asked));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) void main();
