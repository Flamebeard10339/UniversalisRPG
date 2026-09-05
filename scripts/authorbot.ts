import { repoRoot } from './lib/repo';
export { repoRoot } from './lib/repo';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { DEBUG_SWITCH_NAMES } from '../src/content/sections/test';
import { ENGINE_MODULE_DIR } from '../src/content/engineModules';
import { CORPUS_DIR } from '../src/content/shipped';
import { answer, answeredBy, ask, ASK_BEFORE_YOU_DESIGN_AROUND_IT, ASK_LINE, FLOORS_ARE_WALKED, ASKED_FOR_MINUTES, BRIEF_IS_NOT_AUTHORITATIVE, ENGINE_DIRS, ENGINE_IS_OFF_LIMITS, ENGINE_TEXT, enginePaths, nobodyAnswered, questionIn, type Question, stopAsking, waitForAnswer } from './lib/ask';
import { BRIEF_IS_A_FILE, readBrief } from './lib/brief';
import { FLOORS_DIR } from './floors';


export const DEFAULT_TURNS = 150;
const DEFAULT_MODEL = 'claude-sonnet-5';

export const GRACE_MINUTES = 2;

const usage = [
  'Usage: npm run authorbot -- <brief> [--target <module>] [--open] [--turns <n>] [--minutes <n>] [--model <id>] [--ask-for <n>]',
  '       npm run authorbot -- <brief> --answer "<sentence>"',
  '       npm run authorbot -- --watch [--once] [<brief>]',
  '',
  '  <brief>    the file saying what to write, named as a loose word or after --brief;',
  ...BRIEF_IS_A_FILE.map((line) => `             ${line}`),
  '  --target   the module under content/ the run may write, which is the only file it may',
  '             write anywhere. With none, the brief\'s own name: a brief at',
  '             planning/A Grand Blade.md writes a-grand-blade.dsl',
  `  --floors   write a floor route into ${FLOORS_DIR}/ rather than a module into ${CORPUS_DIR}/. The run`,
  '             gets both folders, walks its own with --world, and is told to measure by walking',
  '             rather than to declare, which is the one lane that still iterates',
  '  --open     let the run read the engine and count every reach, rather than refusing it.',
  `             Without this, ${enginePaths()} are refused, and the refusal`,
  '             says to ask the oracle',
  `  --turns    how many replies before the run is cut off (default ${String(DEFAULT_TURNS)})`,
  '  --minutes  how many minutes of wall clock the run may take. With a minute left, the run is',
  `             told so beside its next tool result, and ${String(GRACE_MINUTES)} minutes past the clock it is cut off`,
  '             for good, report or no report. Without this the turn cap is the only limit',
  '  --model    which model plays the author (default claude-sonnet-5)',
  '  --watch    do not start anything: say where every authorbot run on this machine stands,',
  '             and go on saying it until they have all ended. With a brief, just that one',
  '  --once     with --watch, say it once and stop, rather than holding the terminal until',
  '             every run has ended — which is what to reach for to ask where a run stands',
  `  --ask-for  how many minutes a run waits on an answer before going on without one (default ${String(ASKED_FOR_MINUTES)}).`,
  '             A run reaching for the engine is put to the engine worker instead of refused, and',
  '             it stands still until it is answered. The wall clock stops while it waits, so',
  '             --minutes is time the run spent working rather than time it spent asking',
  '  --answer   <sentence> — answer the run named by the brief, and let it go on. This is the',
  '             other end of --ask-for, and --watch returns the moment a run has asked something',
  '',
  'The run works on a copy of content/ in a directory of its own and writes nothing in this',
  'checkout, so it does not count as a second writer in it. It prints where that directory is,',
  'what the run cost, and every reach it made for the engine. Every run also appends one line to',
  '.authorbot/runs.jsonl: what was asked of it, what it took, and how many lines of DSL it moved.',
].join('\n');

export interface Asked {
  brief: string | null;
  target: string | null;
  open: boolean;
  turns: number;
  minutes: number | null;
  model: string;
  watch: boolean;
  once: boolean;
  askFor: number;
  said: string | null;
  floors: boolean;
}

export const moduleNameFor = (brief: string): string =>
  path
    .basename(brief)
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const fileFor = (name: string): string => (name.endsWith('.dsl') ? name : `${name}.dsl`);

export const targetFor = (brief: string): string => fileFor(moduleNameFor(brief));

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
  const asked: Asked = { brief: null, target: null, open: false, turns: DEFAULT_TURNS, minutes: null, model: DEFAULT_MODEL, watch: false, once: false, askFor: ASKED_FOR_MINUTES, said: null, floors: false };
  const named = (word: string): void => {
    if (asked.brief !== null) throw new Error(`the brief is named once, and ${JSON.stringify(word)} is a second\n\n${usage}`);
    asked.brief = word;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--brief') named(requireValue(arg, argv[++i]));
    else if (arg === '--target') asked.target = fileFor(requireValue(arg, argv[++i]));
    else if (arg === '--turns') asked.turns = requireCount(arg, requireValue(arg, argv[++i]));
    else if (arg === '--minutes') asked.minutes = requireCount(arg, requireValue(arg, argv[++i]));
    else if (arg === '--model') asked.model = requireValue(arg, argv[++i]);
    else if (arg === '--open') asked.open = true;
    else if (arg === '--floors') asked.floors = true;
    else if (arg === '--watch') asked.watch = true;
    else if (arg === '--once') asked.once = true;
    else if (arg === '--ask-for') asked.askFor = requireCount(arg, requireValue(arg, argv[++i]));
    else if (arg === '--answer') asked.said = requireValue(arg, argv[++i]);
    else if (arg.startsWith('-')) throw new Error(`unknown flag ${arg}\n\n${usage}`);
    else named(arg);
  }
  if (asked.said !== null && asked.brief === null) throw new Error(`--answer answers one run, so name the brief it is running from

${usage}`);
  if (asked.brief === null && !asked.watch) throw new Error(`nothing was named to write from: the brief is a file, given as a loose word or after --brief\n\n${usage}`);
  if (asked.brief !== null && asked.target === null) asked.target = targetFor(asked.brief);
  return asked;
}

const ASK_EVERY_MS = 2_000;

const LAST_MINUTE_MS = 60_000;

export const inLastMinute = (startedAt: number, minutes: number | null, now: number): boolean => minutes !== null && startedAt + minutes * 60_000 - now <= LAST_MINUTE_MS;

export const LAST_MINUTE = `One minute of wall clock is left on this run, and it is cut off for good ${String(GRACE_MINUTES)} minutes after that. Stop revising and write the report now, from what you already know: a report on what walked is worth everything, and one more attempt is worth nothing.`;

const engineUnder = (repo: string, written: string): boolean => {
  const rel = path.relative(repo, path.resolve(repo, written)).replace(/\\/g, '/');
  return ENGINE_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
};

const WRITES = new Set(['write', 'edit', 'notebookedit']);

export type Verdict = { reaching: false } | { reaching: true; why: 'engine' } | { reaching: true; why: 'elsewhere' } | { reaching: true; why: 'checkout' };

const BARE_CORPUS_ARG = /(?:^|[\s"'=])content(?:[\s"'/\\]|$)/;

const spellings = (of: string): string[] => [of, of.replace(/\\/g, '/')].map((each) => each.toLowerCase());

const namesCheckoutCorpus = (command: string, repo: string, workdir: string): boolean => {
  const lowered = command.toLowerCase();
  if (spellings(path.resolve(repo, CORPUS_DIR)).some((each) => lowered.includes(each))) return true;
  if (spellings(path.resolve(workdir)).some((each) => lowered.includes(each))) return false;
  return BARE_CORPUS_ARG.test(command);
};

export function verdictOf(tool: string, input: Record<string, unknown>, repo: string, workdir: string): Verdict {
  const written = input.file_path;
  if (WRITES.has(tool.toLowerCase()) && typeof written === 'string') {
    const inside = path.resolve(written).toLowerCase().startsWith(path.resolve(workdir).toLowerCase());
    if (!inside) return { reaching: true, why: 'elsewhere' };
  }
  if (tool === 'Bash') {
    const command = String(input.command ?? '');
    if (namesCheckoutCorpus(command, repo, workdir)) return { reaching: true, why: 'checkout' };
    return ENGINE_TEXT.test(command) ? { reaching: true, why: 'engine' } : { reaching: false };
  }
  const named = [input.file_path, input.path, input.pattern].filter((each): each is string => typeof each === 'string');
  return named.some((each) => engineUnder(repo, each) || ENGINE_TEXT.test(each)) ? { reaching: true, why: 'engine' } : { reaching: false };
}

export const refusalFor = (why: 'engine' | 'elsewhere' | 'checkout', draft: string): string =>
  why === 'elsewhere'
    ? `this run writes only ${draft}, and nothing else anywhere.`
    : why === 'checkout'
      ? `the world this run works on is ${path.dirname(draft)}, a copy of its own. The checkout's content/ is not this run's to read or write through a shell: point every command at the copy — \`npm run oracle -- --at ${path.dirname(draft)}\` is the gate, and \`npm run probe -- ${path.dirname(draft)} --test <id>\` walks a route.`
      : ENGINE_IS_OFF_LIMITS;

export function systemFor(asked: Asked, corpus: string, draft: string): string {
  return `You are authoring content for Universalis RPG, a text game. Its content is written in a small line-based DSL: a file is a sequence of sections, each headed \`# <kind> <id>\`.

How this run is set up:

- The world you are writing into is the corpus of .dsl files in ${corpus}. Read any of them.
${asked.floors ? `- The floors beside it are in ${path.dirname(draft)}. Read those too: they are the shape to copy.` : ''}
- The one file you may write is ${draft}.
- Run every command from ${repoRoot}, which is the working directory.
${asked.open ? '- The repository is yours to read: the engine under src/ and scripts/ is there if you want it.' : `- ${ASK_LINE}`}
- ${BRIEF_IS_NOT_AUTHORITATIVE}

The tools, and how each is pointed at the world you are writing. **Every one of them takes more
than is shown here, and prints what with \`--help\`** — run that rather than guessing at a flag or
believing a brief about one. What is written out below is the part no \`--help\` can know, which is
which directory is yours.

    npm run oracle                       what may be written, under every kind; name kinds to narrow it
    npm run oracle -- --at ${corpus}
                                         **the gate.** Every line the engine has something to say
                                         about, whether the world loads, whether it prints back to
                                         itself, whether every route in it still walks, and anything
                                         it takes that an author probably did not mean. There is no
                                         other gate, and no test suite anywhere answers for what you
                                         are writing
    npm run oracle -- --at <file>        the same for one draft file on its own
    npm run probe -- ${corpus} --test <id>
                                         walk one \`# test\` and report PASSED or FAILED
    npm run simulate-activity -- --world ${corpus} <save>
                                         what every offer in front of a player standing there pays an
                                         hour and what it costs them, read off a run rather than
                                         reckoned. **--world is what points it at your world**, and
                                         without it none of your saves or entities exist
${asked.floors ? `    npm run floors -- --world ${path.dirname(corpus)}
                                         **your gate.** Walks every route under your floors folder
                                         and prints, per route, the level it reached, the
                                         game-minutes it took and the minutes the curve allows.
                                         Nothing about the minutes is asserted: the sheet is read
` : ''}    npm run ladder-check -- --world ${corpus}
                                         what the world can put on a character of a level against what
                                         the declared ladder asks of them. Short means gear the world
                                         has not got yet: it is a brief for content, never a pass or a
                                         fail, and driving it to zero by adding a line to a general
                                         store is how a world gets sanded flat
    npm run notes -- ${corpus}           every \`@@@\` the world holds, your own included

${asked.floors ? FLOORS_ARE_WALKED : `**Balance is declared, not measured.** A body that fights names \`tier:\`, \`profile:\` and \`level:\` and
the engine cuts every stat under them; a \`# passive\` names \`grants:\` as a multiple of what one level
is worth. Those tags are the balance, and a body naming them needs no \`stats:\` line at all. Write a
stat only where it is load-bearing for the encounter, and write it as a modifier so it survives a
rebalance. \`npm run ladder-check\` says whether a body reads as the tags it names; one that does not
is mis-tagged or met at the wrong level, and both are one word to change.

**So do not spend this run on \`simulate-activity\` or on a tuning pass.** A number typed by hand goes
stale the next time a ladder moves, and turns spent measuring what the tags already decide are the
commonest way a run reaches its cap with the work half done.`}

${ASK_BEFORE_YOU_DESIGN_AROUND_IT}

**No \`# test\` may assert a number a balance pass would move.** That is not a rule about care, it is
what the routes are for: a rebalance next month must not redden a single one of them.

What a \`# test\` proves instead is that the path is walkable: that this sequence of actions, taken
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
  decision: 'allow' | 'deny' | 'engine' | 'asked';
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
      : `${engine.length} reach(es) for the engine, each one a question the oracle did not answer${engine.some((each) => each.decision === 'asked') ? `, ${String(engine.filter((each) => each.decision === 'asked').length)} of them answered by the engine worker` : ''}:`,
    ...engine.map((each) => `  reply ${each.turn}: ${each.decision === 'deny' ? 'refused — ' : each.decision === 'asked' ? 'answered — ' : ''}${each.tool} ${each.target.replace(/\n/g, ' ; ')}`),
    '',
    `what it wrote, and the run's own account of it, are under ${workdir}`,
  ];
}

export const RUN_LOG = '.authorbot/runs.jsonl';

export interface RunRecord {
  at: string;
  brief: string;
  target: string;
  model: string;
  open: boolean;
  askedTurns: number;
  askedMinutes: number | null;
  briefLines: number;
  replies: number;
  calls: number;
  reaches: number;
  seconds: number;
  usage?: Record<string, number>;
  linesBefore: number;
  linesAfter: number;
  linesAdded: number;
  linesRemoved: number;
}

const linesOf = (text: string): string[] => text.split('\n').filter((line) => line.trim() !== '');

function tally(lines: readonly string[]): Map<string, number> {
  const held = new Map<string, number>();
  for (const line of lines) held.set(line, (held.get(line) ?? 0) + 1);
  return held;
}

export function movedBetween(before: string, after: string): { added: number; removed: number } {
  const was = tally(linesOf(before));
  const now = tally(linesOf(after));
  let added = 0;
  let removed = 0;
  for (const [line, count] of now) added += Math.max(0, count - (was.get(line) ?? 0));
  for (const [line, count] of was) removed += Math.max(0, count - (now.get(line) ?? 0));
  return { added, removed };
}

export function runRecord(asked: Asked, cost: Cost, reaches: readonly Reach[], brief: string, before: string, after: string, at: Date): RunRecord {
  const moved = movedBetween(before, after);
  return {
    at: at.toISOString(),
    brief: path.basename(asked.brief ?? ''),
    target: asked.target ?? '',
    model: asked.model,
    open: asked.open,
    askedTurns: asked.turns,
    askedMinutes: asked.minutes,
    briefLines: linesOf(brief).length,
    replies: cost.turns,
    calls: cost.calls,
    reaches: reaches.filter((each) => each.decision !== 'allow').length,
    seconds: Math.round(cost.seconds * 10) / 10,
    ...(cost.usage === undefined ? {} : { usage: cost.usage }),
    linesBefore: linesOf(before).length,
    linesAfter: linesOf(after).length,
    linesAdded: moved.added,
    linesRemoved: moved.removed,
  };
}

export function logRun(root: string, record: RunRecord): void {
  const at = path.join(root, RUN_LOG);
  mkdirSync(path.dirname(at), { recursive: true });
  appendFileSync(at, `${JSON.stringify(record)}\n`);
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

export const askedLines = (name: string, question: Question): string[] => [
  `${name} — has asked the engine worker and is standing still`,
  `  it reached with ${question.tool} for: ${question.asked.replace(/\n/g, ' ; ')}`,
  '  answer it with: npm run authorbot -- <brief> --answer "<one sentence>"',
];

async function watch(brief: string | null, once: boolean): Promise<number> {
  const workdirs = brief === null ? runsInFlight(os.tmpdir()) : [workdirFor(brief)];
  if (workdirs.length === 0 || !workdirs.some((each) => existsSync(each))) {
    console.log('no authorbot run has left a directory on this machine');
    return 1;
  }
  for (;;) {
    const standing = workdirs.filter((each) => existsSync(each));
    const held = statusNow(standing);
    const pending = standing.flatMap((each) => {
      const question = questionIn(each);
      return question === undefined ? [] : [{ name: path.basename(each).slice(WORKDIR_PREFIX.length), question }];
    });
    console.log([new Date().toISOString(), ...held.flatMap(statusLines), ...pending.flatMap((each) => askedLines(each.name, each.question)), ''].join('\n'));
    if (once || held.every((each) => each.ended) || pending.length > 0) return 0;
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
  if (asked.floors) cpSync(path.join(repoRoot, FLOORS_DIR), path.join(workdir, FLOORS_DIR), { recursive: true });
  const draft = path.join(asked.floors ? path.join(workdir, FLOORS_DIR) : corpus, asked.target!).replace(/\\/g, '/');
  if (!existsSync(draft)) writeFileSync(draft, '');
  const before = readFileSync(draft, 'utf8');

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

  let started = Date.now();
  let warned = false;
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const putToTheEngineWorker = async (tool: string, target: string): Promise<{ because: string; answered: boolean }> => {
    ask(workdir, tool, target);
    say(`  [asked]  the engine worker, and standing still for up to ${String(asked.askFor)} minute(s)`);
    const waitedFrom = Date.now();
    const said = await waitForAnswer(workdir, asked.askFor, ASK_EVERY_MS, sleep);
    started += Date.now() - waitedFrom;
    stopAsking(workdir);
    say(said === undefined ? '  [asked]  nobody answered, and the run goes on without one' : `  [answered]  ${said}`);
    return said === undefined ? { because: `${nobodyAnswered(asked.askFor)} ${refusalFor('engine', draft)}`, answered: false } : { because: answeredBy(said), answered: true };
  };

  const preToolUse = async (input: unknown): Promise<Record<string, unknown>> => {
    const { tool_name: tool, tool_input: held } = input as { tool_name: string; tool_input: Record<string, unknown> };
    const args = held ?? {};
    const target = String(args.file_path ?? args.path ?? args.pattern ?? args.command ?? JSON.stringify(args)).slice(0, 300);
    const verdict = verdictOf(tool, args, repoRoot, workdir);
    const refuse = verdict.reaching && (verdict.why !== 'engine' || !asked.open);
    say(`  ${!verdict.reaching ? '[tool]  ' : refuse ? '[refused]' : '[engine]'} ${tool} ${target.replace(/\n/g, ' ; ')}`);
    const why = (verdict as { why: 'engine' | 'elsewhere' | 'checkout' }).why;
    const put = !refuse ? undefined : why === 'engine' ? await putToTheEngineWorker(tool, target) : { because: refusalFor(why, draft), answered: false };
    seen(tool, target, !verdict.reaching ? 'allow' : !refuse ? 'engine' : put?.answered === true ? 'asked' : 'deny');
    const because = put?.because;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: refuse ? 'deny' : 'allow',
        ...(because === undefined ? {} : { permissionDecisionReason: because }),
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
    disallowedTools: ['Task', 'WebSearch', 'WebFetch', 'Artifact'],
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
  const cost: Cost = { turns: turn, seconds: (Date.now() - started) / 1000, calls: reaches.length, usage };
  say(summaryLines(reaches, cost, workdir).join('\n'));
  logRun(repoRoot, runRecord(asked, cost, reaches, brief, before, readFileSync(draft, 'utf8'), new Date()));
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
    if (asked.said !== null) {
      const workdir = workdirFor(asked.brief!);
      if (questionIn(workdir) === undefined) {
        console.error(`${asked.brief!} has not asked anything, so there is nothing to answer.`);
        process.exit(1);
      }
      answer(workdir, asked.said);
      console.log(`answered: ${asked.said}`);
      process.exit(0);
    }
    process.exit(asked.watch ? await watch(asked.brief, asked.once) : await run(asked));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) void main();
