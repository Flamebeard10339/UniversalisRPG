import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { DEBUG_SWITCH_NAMES } from '../src/content/sections/test';
import { CORPUS_DIR } from '../src/content/shipped';

// scripts/authorbot.ts hands one brief to a coding agent and counts what it reached for. The
// playbot beside it plays the world through the game's own command line; this one writes the
// world's source, and the question it exists to answer is which of an author's questions the
// oracle does not answer — every reach into the engine is one of them.

export const repoRoot = path.join(import.meta.dirname, '..');

const usage = [
  'Usage: npm run authorbot -- --brief <file> [--target <module>] [--open] [--turns <n>] [--model <id>]',
  '',
  '  --brief    the file saying what to write. A file rather than an argument: a brief that',
  '             arrives as one line is indistinguishable from a brief that was one line',
  '  --target   the module under content/ the run may write, which is the only file it may',
  '             write anywhere (default: local-changes.dsl, made empty in the copy)',
  '  --open     let the run read the engine and count every reach, rather than refusing it.',
  '             Without this, src/, scripts/, docs/ and every .ts are refused, and the refusal',
  '             says to ask the oracle',
  '  --turns    how many replies before the run is cut off (default 80)',
  '  --model    which model plays the author (default claude-sonnet-5)',
  '',
  'The run works on a copy of content/ in a directory of its own and writes nothing in this',
  'checkout, so it does not count as a second writer in it. It prints where that directory is,',
  'what the run cost, and every reach it made for the engine.',
].join('\n');

export interface Asked {
  brief: string | null;
  target: string;
  open: boolean;
  turns: number;
  model: string;
}

const DEFAULT_TARGET = 'local-changes.dsl';
const DEFAULT_TURNS = 80;
const DEFAULT_MODEL = 'claude-sonnet-5';

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
  const asked: Asked = { brief: null, target: DEFAULT_TARGET, open: false, turns: DEFAULT_TURNS, model: DEFAULT_MODEL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--brief') asked.brief = requireValue(arg, argv[++i]);
    else if (arg === '--target') asked.target = requireValue(arg, argv[++i]);
    else if (arg === '--turns') asked.turns = requireCount(arg, requireValue(arg, argv[++i]));
    else if (arg === '--model') asked.model = requireValue(arg, argv[++i]);
    else if (arg === '--open') asked.open = true;
    else throw new Error(`${arg.startsWith('-') ? `unknown flag ${arg}` : `nothing is read off a loose word here: ${JSON.stringify(arg)}`}\n\n${usage}`);
  }
  if (asked.brief === null) throw new Error(`--brief names the file saying what to write, and is not optional\n\n${usage}`);
  return asked;
}

// What this run treats as the engine's own. An author's questions are answered by `npm run oracle`
// and by the corpus; a reach for one of these is a question neither of them answered, which is the
// whole measurement and is why it is counted whether or not it is refused.
const ENGINE_DIRS = ['src', 'scripts', 'docs', 'node_modules', 'dist'];
const ENGINE_TEXT = /\b(src|scripts|docs)[/\\]|\.tsx?\b/i;

const engineUnder = (repo: string, written: string): boolean => {
  const rel = path.relative(repo, path.resolve(repo, written)).replace(/\\/g, '/');
  return ENGINE_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
};

// The tools that change a file rather than read one, held in the case a host is free to hand them
// over in: what a tool is called is that host's word and not this one's.
const WRITES = new Set(['write', 'edit', 'notebookedit']);

export type Verdict = { reaching: false } | { reaching: true; why: 'engine' } | { reaching: true; why: 'elsewhere' };

// Whether a call is reaching for the engine, or writing somewhere it may not. A tool that runs a
// command is read as its command and a tool that names a file as its file, since the two are the
// only ways in and a `grep` over `src/` is the same reach as a `Read` of one file in it.
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
    npm run probe -- ${corpus} --test <id>
                                         run one \`# test\` and report PASSED or FAILED
    npm run balance -- <save> [<word>]   what every offer in front of a player standing on that save
                                         pays an hour, and whether the loop it was asked for finished
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
}

export interface Cost {
  turns: number;
  seconds: number;
  calls: number;
  usage?: Record<string, number>;
}

// What the run cost and what it reached for, which is the report this script exists to print. The
// reaches are listed rather than counted: which questions sent an author into the engine is the
// answer, and a number alone is not one.
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

async function run(asked: Asked): Promise<number> {
  const brief = readFileSync(asked.brief!, 'utf8');
  const workdir = path.join(os.tmpdir(), `universalis-authorbot-${path.basename(asked.brief!).replace(/\W+/g, '-')}`);
  if (existsSync(workdir)) rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });
  const corpus = path.join(workdir, 'content').replace(/\\/g, '/');
  cpSync(path.join(repoRoot, CORPUS_DIR), path.join(workdir, 'content'), { recursive: true });
  const draft = path.join(corpus, asked.target).replace(/\\/g, '/');
  if (!existsSync(draft)) writeFileSync(draft, '');

  const transcript = path.join(workdir, 'transcript.md');
  const calls = path.join(workdir, 'calls.jsonl');
  const say = (line: string): void => {
    appendFileSync(transcript, `${line}\n`);
    console.log(line);
  };

  const reaches: Reach[] = [];
  let turn = 0;
  const seen = (tool: string, target: string, decision: Reach['decision']): void => {
    reaches.push({ turn, tool, target, decision });
    appendFileSync(calls, `${JSON.stringify({ turn, tool, target, decision })}\n`);
  };

  // Every call is gated here rather than through `canUseTool`: read-only tools are approved before
  // that callback is consulted, so a run gated there sees the commands and none of the reads — and
  // the reads are the question.
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

  const system = systemFor(asked, corpus, draft);
  writeFileSync(transcript, `# authorbot\n\nmodel: ${asked.model}, turns: ${asked.turns}, engine ${asked.open ? 'open' : 'off limits'}\n\n## system\n\n${system}\n\n## brief\n\n${brief}\n\n## run\n\n`);

  const options: Options = {
    systemPrompt: system,
    cwd: repoRoot,
    model: asked.model,
    maxTurns: asked.turns,
    // Nothing is named in `allowedTools`: a bare allow entry approves the tool before the hook is
    // consulted, and then nothing is gated and nothing is counted.
    hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
    settingSources: [],
    disallowedTools: ['Task', 'WebSearch', 'WebFetch'],
  };

  const started = Date.now();
  let usage: Record<string, number> | undefined;
  let ended = '(the run produced no result)';
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

  say(`\n${ended}`);
  say(summaryLines(reaches, { turns: turn, seconds: (Date.now() - started) / 1000, calls: reaches.length, usage }, workdir).join('\n'));
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  let asked: Asked;
  try {
    asked = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
    return;
  }
  process.exit(await run(asked));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) void main();
