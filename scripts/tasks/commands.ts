import { readFileSync } from 'node:fs';
import { ManifestError } from '../lib/systems';
import { StoreError } from '../lib/taskStore';
import { AUDIT_USAGE, cmdAudit, cmdImport } from './audit';
import { cmdAuditPrompt } from './auditPrompt';
import { flagArities, parseArgs, positionalArity, type Flags } from './cli';
import { ACTOR_USAGE, flushSkippedStoreLines, GLOBAL_USAGE } from './context';
import { cmdPlan, cmdConcept, cmdProduces, cmdSystem, cmdWhere } from './architectureCmds';
import { cmdDoctor } from './doctor';
import { cmdCheckCommitMessage, cmdLog, recordStandaloneEvent } from './handoff';
import { cmdMergeReady } from './mergeReady';
import { cmdAdd, cmdAsk, cmdDecline, cmdDefer, cmdDone, cmdEdit, cmdList, cmdNext, cmdPromote, cmdQuestion, cmdRedirect, cmdSearch, cmdShow, cmdStart, cmdStop } from './records';
import { cmdOrchestratePrompt } from './orchestratePrompt';
import { cmdRoadmap } from './roadmapCmd';
import { cmdPlanPrompt } from './planPrompt';
import { cmdSpecAdd, cmdSpecDone, cmdSpecNew, cmdSpecRemove, cmdSpecShow } from './specCmds';
import { cmdTriage } from './triage';
import { cmdWorkPrompt } from './workPrompt';

const USAGE = 'usage: npm run tasks -- <doctor|add|question|edit|show|list|search|next|roadmap|plan|system|where|produces|concept|start|stop|done|decline|promote|defer|redirect|ask|import|triage|note|decision|log|spec|audit|audit-prompt|work-prompt|plan-prompt|orchestrate-prompt|merge-ready> ...';

interface Command {
  usage: string;
  run: (args: Flags, usage: string) => void | Promise<void>;
}

// `tasks spec` names no subcommand and no slug, so it is a misuse; `tasks
// spec --help` and `tasks spec help` are answered before this by the help
// path every command shares.
function refuseBareSpec(_args: Flags, usage: string): void {
  console.error(usage);
  process.exitCode = 1;
}

const SPEC_COMMANDS: Record<string, Command> = {
  new: { usage: 'usage: tasks spec new <slug>', run: cmdSpecNew },
  add: { usage: `usage: tasks spec add <slug> <id>... ${ACTOR_USAGE}`, run: cmdSpecAdd },
  remove: { usage: `usage: tasks spec remove <slug> <id>... ${ACTOR_USAGE}`, run: cmdSpecRemove },
  show: { usage: 'usage: tasks spec show <slug> [--order] [--full]  (default shows clause standings; --full prints the whole ## Deliverable)', run: cmdSpecShow },
  done: { usage: `usage: tasks spec done <slug> [--defer-open] ${ACTOR_USAGE}`, run: cmdSpecDone },
};

const SPEC_USAGE = `usage: tasks spec <new|add|remove|show|done> ...  (\`tasks spec <slug>\` is short for \`tasks spec show <slug>\`)\n${Object.values(SPEC_COMMANDS)
  .map((command) => `  ${command.usage}`)
  .join('\n')}`;

const COMMANDS: Record<string, Command> = {
  doctor: { usage: `usage: tasks doctor [--fix] ${ACTOR_USAGE}`, run: cmdDoctor },
  add: {
    usage: `usage: tasks add "<title>" [--kind task|finding] [--fault tooling|contract|nobody (required for --kind finding)] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--discharges c3,c6] [--files a.ts:12,b.ts] [--requires id1,id2] [--writes src/a.ts,src/b/] [--grant forecast|commitment] [--produces \"policy module\"] [--deliverable "..." (required for --kind finding)] [--evidence "..."] [--id <id>] ${ACTOR_USAGE}`,
    run: cmdAdd,
  },
  question: {
    usage: `usage: tasks question "<title>" --blocks id1,id2 --decider worker|planner|author --fault tooling|contract|nobody [--severity high|medium|low] [--system "<name>"] [--evidence "..."] ${ACTOR_USAGE}  (files a decision you should not make against the records it holds up, addressed to the role whose decision would hold. Nothing is stored as blocked: the question's id lands in each named record's requires, so \`tasks done\` on it once answered — or \`tasks decline\` once dismissed — releases exactly those and nothing else)`,
    run: cmdQuestion,
  },
  edit: {
    usage: `usage: tasks edit <id> ["<new title>"] [--title "..."] [--deliverable "..."] [--evidence "..."] [--severity high|medium|low] [--system "<name>"] [--fault tooling|contract|nobody] [--decider worker|planner|author] [--discharges c3,c6] [--files a.ts:12,b.ts] [--requires id1,id2] [--writes src/a.ts,src/b/] [--grant forecast|commitment] [--produces \"policy module\"] ${ACTOR_USAGE}  (content only: state, spec, kind and reason are moved by start/stop/done/decline/spec add, never by edit)`,
    run: cmdEdit,
  },
  show: { usage: 'usage: tasks show <id>', run: cmdShow },
  list: {
    usage: 'usage: tasks list [--state unreviewed|open|in-progress|done|declined] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--kind task|finding|undelivered|question] [--deferred] [--triggered]  (--triggered reaches past the not-closed default to every declined record carrying a --trigger condition)',
    run: cmdList,
  },
  search: {
    usage: 'usage: tasks search <term> [--state unreviewed|open|in-progress|done|declined] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--kind task|finding|undelivered|question] [--deferred] [--triggered]',
    run: cmdSearch,
  },
  plan: { usage: 'usage: tasks plan [<id>...] [--spec <slug>]  (grades a dispatch set for overlap, unstated dependencies and duplicated interfaces; runs no workers and refuses nothing)', run: cmdPlan },
  system: { usage: 'usage: tasks system ["<name>"]  (with no name, every system; with one, its owned files, exported surface, dependencies in both directions and registered concepts — all derived from the tree, none of it stored)', run: cmdSystem },
  where: { usage: 'usage: tasks where <path>  (a file or a directory: which system owns it, what it exports, what it imports across a system boundary, and the prior art on it — every concept registered over it and every task whose writes or files have ever claimed it, in any state)', run: cmdWhere },
  produces: { usage: 'usage: tasks produces <term>  (does anything already do this — searched over registered concepts and every `produces` claim any task ever made, closed ones included)', run: cmdProduces },
  concept: { usage: 'usage: tasks concept "<system>" "<name>" --paths a.ts,b/ [--note "where the name came from"]  (registers a capability so `tasks produces` can find it)', run: cmdConcept },
  next: { usage: 'usage: tasks next [--spec <slug>] [--system "<name>"] [--severity high|medium|low] [--full]', run: cmdNext },
  roadmap: { usage: 'usage: tasks roadmap  (the same answer from any branch: what has been decided — every spec with live members, in dependency order, with its clause standing — then the unspecced topics, what is blocked and on what, and the findings that could redden an audit)', run: cmdRoadmap },
  start: { usage: `usage: tasks start <id> ${ACTOR_USAGE}`, run: cmdStart },
  stop: { usage: `usage: tasks stop <id> ${ACTOR_USAGE}`, run: cmdStop },
  done: { usage: `usage: tasks done <id>... [--commit <revspec>] ${ACTOR_USAGE}  (default: none — the closing commit does not exist yet when \`done\` runs; see \`tasks show\` for a derived one)`, run: cmdDone },
  decline: { usage: `usage: tasks decline <id>... --reason "..." [--trigger "..."] ${ACTOR_USAGE}  (several ids share the one reason and trigger; --trigger states a condition for revisiting, filed where \`tasks list --triggered\` finds it)`, run: cmdDecline },
  promote: { usage: `usage: tasks promote <id>... [--spec <slug>] ${ACTOR_USAGE}  (the non-interactive form of triage's promote: moves unreviewed or deferred records into the spec as open members)`, run: cmdPromote },
  defer: { usage: `usage: tasks defer <id>... ${ACTOR_USAGE}  (the non-interactive form of triage's defer, the inverse of promote: opens unreviewed or already-open records outside every spec)`, run: cmdDefer },
  redirect: { usage: `usage: tasks redirect <id>... --deliverable "..." ${ACTOR_USAGE}  (the non-interactive form of triage's redirect: replaces the deliverable, filing the same triage event the walk records)`, run: cmdRedirect },
  ask: { usage: `usage: tasks ask <id>... --question "..." ${ACTOR_USAGE}  (the non-interactive form of triage's ask: appends the dated question to each record's evidence and leaves it unreviewed so the queue keeps offering it; refuses an id that is not already unreviewed rather than moving it back)`, run: cmdAsk },
  import: { usage: `usage: tasks import <audit-doc> --fault tooling|contract|nobody ${ACTOR_USAGE}  (the migration path for legacy audit documents, which carry no fault of their own — the caller classifies the document)`, run: cmdImport },
  triage: { usage: `usage: tasks triage [--spec <slug>] ${ACTOR_USAGE}`, run: cmdTriage },
  note: { usage: `usage: tasks note "<one line>" [--id <id>] [--system "<name>"] [--spec <slug>] ${ACTOR_USAGE}  (appends to the event log; the store is untouched. A message starting with -- goes after a bare \`--\`)`, run: recordStandaloneEvent('note') },
  decision: { usage: `usage: tasks decision "<one line>" [--id <id>] [--system "<name>"] [--spec <slug>] ${ACTOR_USAGE}  (a decision is its own op, so \`tasks log --op decision\` needs no text matching. A message starting with -- goes after a bare \`--\`)`, run: recordStandaloneEvent('decision') },
  log: { usage: 'usage: tasks log [<text>] [--id <id>] [--system "<name>"] [--spec <slug>] [--op add|edit|start|stop|done|decline|triage|import|audit|spec-add|spec-remove|spec-defer|spec-done|doctor-fix|note|decision]  (every filter given is ANDed, and all of them are answered from the log alone)', run: cmdLog },
  spec: { usage: SPEC_USAGE, run: refuseBareSpec },
  audit: { usage: AUDIT_USAGE, run: cmdAudit },
  'audit-prompt': { usage: 'usage: tasks audit-prompt <spec> [--base-branch main]  (the auditor\'s brief, generated — do not hand-write one)', run: cmdAuditPrompt },
  'work-prompt': { usage: 'usage: tasks work-prompt <id-or-spec>  (the worker\'s brief, generated — do not hand-write one. A spec slug briefs that spec\'s next open, unblocked member; an exact task id always wins over a spec of the same name)', run: cmdWorkPrompt },
  'plan-prompt': { usage: 'usage: tasks plan-prompt <slug> [<path>...]  (the planner\'s brief, generated — do not remember the survey by hand. Runs `tasks where` over every named path, prints the clause format literally, and ends with the decompose/plan/dispatch sequence)', run: cmdPlanPrompt },
  'orchestrate-prompt': { usage: 'usage: tasks orchestrate-prompt [<spec>...]  (the orchestrator\'s brief, generated — no spec is required, since an orchestrator is not working one; each spec named prints its clause standing)', run: cmdOrchestratePrompt },
  'merge-ready': { usage: 'usage: tasks merge-ready [--base-branch main]  (runs the merge gate: tsc, npm test, layer-check, audit-status, doctor, and the tracked-text byte check; exits non-zero when a leg fails)', run: cmdMergeReady },
  'check-commit-msg': { usage: 'usage: tasks check-commit-msg <msg-file> [--merge-or-revert] [--files a,b,c]', run: cmdCheckCommitMessage },
};

// Every usage string, for the arity sweep: a flag written `[--x]` with a
// prose note after it was silently classified value-taking, and only a
// sweep over the real table can keep the next documented flag honest.
export function allUsages(): string[] {
  return [...Object.values(COMMANDS), ...Object.values(SPEC_COMMANDS)].map((command) => command.usage);
}

// Every verb's usage, keyed the way a caller types it, so a refusal can be
// answered out of the same table the parser enforces. Nothing here is a
// second list to keep in sync: both halves read COMMANDS.
function everyVerb(): Array<[name: string, usage: string]> {
  return [...Object.entries(COMMANDS).map(([name, command]): [string, string] => [name, command.usage]), ...Object.entries(SPEC_COMMANDS).map(([name, command]): [string, string] => [`spec ${name}`, command.usage])];
}

// A refusal that already knows the vocabulary should spend it. Both misses
// measured came from the CLI's own words: `tasks spec add <slug> --id <id>`,
// where ids are positionals and `--id` is a flag of `add`; and `tasks add
// "<title>" --note`, where the field wanted is `--evidence` and `--note`
// belongs to `concept`. So the answer is the placeholder this flag matches,
// the verbs that do take it, and the flags this verb does — all read off the
// usage strings rather than a hand-kept map of likely mistakes.
// The token a usage string writes after a flag, which is the only thing here
// that says what kind of value the flag wants.
function placeholderOf(usage: string, flag: string): string | null {
  const tokens = usage.split(/\s+/);
  const at = tokens.findIndex((token) => /^\[?--([a-z][a-z0-9-]*)\]?$/.exec(token)?.[1] === flag);
  const next = at === -1 ? undefined : tokens[at + 1];
  return next === undefined || next.startsWith('--') || next.startsWith('[--') || next.startsWith(']') || next.startsWith('(') ? null : next;
}

type ValueShape = 'prose' | 'list' | 'choice' | 'name' | 'none';

// `"..."` is free prose, `"<name>"` is an identifier that happens to need
// quoting, `a,b` is a list and `x|y` is a choice. Derived from the
// placeholder rather than declared, so a flag added to a usage string is
// classified by the same text that documents it.
function shapeOf(placeholder: string | null): ValueShape {
  if (placeholder === null) return 'none';
  if (placeholder.includes('|')) return 'choice';
  if (placeholder.includes(',')) return 'list';
  return placeholder.startsWith('"') && !placeholder.includes('<') ? 'prose' : 'name';
}

function reportUnknownFlags(name: string, usage: string, unknown: string[]): void {
  const head = usage.split('\n')[0];
  for (const flag of unknown) {
    if (new RegExp(`<${flag}>`).test(head.split(/\s\[?--/)[0])) {
      console.error(`  --${flag}: \`${name}\` takes <${flag}> as a positional, not as a flag`);
      continue;
    }
    const owners = everyVerb().filter(([verb, other]) => verb !== name && flagArities(other).has(flag));
    if (owners.length > 0) console.error(`  --${flag}: not a flag of \`${name}\` — it belongs to ${owners.map(([verb]) => `\`${verb}\``).join(', ')}`);

    // The near miss inside the verb that was called, by the shape of the
    // value this flag wants where it does exist: a prose flag misses a prose
    // flag. Naming the owning verb and then fourteen undifferentiated flags
    // still left a caller to pick.
    const wanted = shapeOf(owners.map(([, other]) => placeholderOf(other, flag)).find((placeholder) => placeholder !== null) ?? null);
    const known = [...flagArities(usage).keys()].filter((candidate) => candidate !== 'help');
    const alike = wanted === 'none' ? [] : known.filter((candidate) => shapeOf(placeholderOf(usage, candidate)) === wanted);
    if (alike.length > 0) console.error(`  \`${name}\` takes ${wanted === 'prose' ? 'prose' : `a ${wanted}`} in: ${alike.map((candidate) => `--${candidate}`).join(', ')}`);
    else if (known.length > 0) console.error(`  \`${name}\` takes: ${known.map((candidate) => `--${candidate}`).join(', ')}`);
  }
}

// The scripts this repo runs, read from its own package.json. `tasks
// audit-status` is refused by a verb list that already knows the name is not
// one of its own; what it could not say is that `npm run audit-status` is
// where that name lives.
function npmScriptNames(): string[] {
  try {
    return Object.keys((JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {});
  } catch {
    return [];
  }
}

interface Resolved {
  command: Command;
  args: string[];
}

// `spec` is the one command with subcommands, and an unrecognised one is a
// slug: `tasks spec <slug>` is short for `tasks spec show <slug>`, so the
// token stays a positional rather than being consumed.
function resolveCommand(name: string, rest: string[]): Resolved | null {
  if (name !== 'spec') {
    const command = COMMANDS[name];
    return command === undefined ? null : { command, args: rest };
  }
  const sub = rest[0];
  if (sub === 'help') return { command: COMMANDS.spec, args: ['--help', ...rest.slice(1)] };
  if (sub === undefined || sub.startsWith('--')) return { command: COMMANDS.spec, args: rest };
  const command = SPEC_COMMANDS[sub];
  return command === undefined ? { command: SPEC_COMMANDS.show, args: rest } : { command, args: rest.slice(1) };
}

function printRootHelp(): void {
  console.log(USAGE);
  for (const command of Object.values(COMMANDS)) console.log(`  ${command.usage.split('\n')[0]}`);
  console.log(GLOBAL_USAGE);
  console.log('`tasks <command> --help` prints that command\'s flags; a flag not named there is an error, never a silent no-op');
}

// Malformed input, reported as `path:line` and a non-zero exit by every
// command, from one boundary here rather than a try/catch in each reading
// command. The store and the systems manifest are the two files a command
// parses, so both refusals arrive the same way.
function reportReadErrors<T>(work: () => T): T | void {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof StoreError) && !(error instanceof ManifestError)) throw error;
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

// Nothing runs until the arguments are understood. An unrecognised flag is
// an error naming it, a flag that needs a value and was given none is
// refused rather than defaulted, and `--help` answers on every command and
// subcommand — all before the command body, so no command can answer a
// question it did not understand. A bare `--` ends flag parsing: everything
// after it is positional, which is how a message that starts with a dash is
// writable at all.
export function run(argv: string[]): void | Promise<void> {
  const [name, ...restRaw] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    printRootHelp();
    return;
  }
  if (name === 'check') {
    console.error('error: `check` is now `doctor` — the same scan, reporting what it finds instead of exiting 1 over it. It fails only on a store that will not parse.');
    process.exitCode = 1;
    return;
  }

  const resolved = resolveCommand(name, restRaw);
  if (resolved === null) {
    console.error(`unknown command: ${name}`);
    if (npmScriptNames().includes(name)) console.error(`\`${name}\` is an npm script of this repository, not a tasks verb — run \`npm run ${name}\``);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const { command } = resolved;

  const terminator = resolved.args.indexOf('--');
  const flagArgs = terminator === -1 ? resolved.args : resolved.args.slice(0, terminator);
  const literalTail = terminator === -1 ? [] : resolved.args.slice(terminator + 1);

  const arities = new Map([...flagArities(GLOBAL_USAGE), ...flagArities(command.usage)]);
  const { parsed, errors, unknown } = parseArgs(flagArgs, arities, null);
  parsed.positional.push(...literalTail);
  // `audit` rescans the argument list itself; hand it the whole thing, not
  // the flag half of the terminator split.
  parsed.raw = resolved.args;
  const maxPositional = positionalArity(command.usage);
  if (maxPositional !== null) {
    for (const extra of parsed.positional.slice(maxPositional)) errors.push(`unexpected argument: ${JSON.stringify(extra)}`);
  }
  if (errors.length > 0) {
    for (const message of errors) console.error(`error: ${message}`);
    reportUnknownFlags(name === 'spec' ? `spec ${restRaw[0]}` : name, command.usage, unknown);
    console.error(command.usage);
    process.exitCode = 1;
    return;
  }
  if (parsed.flags.help === 'true') {
    console.log(command.usage);
    console.log(GLOBAL_USAGE);
    return;
  }

  return reportReadErrors(() => {
    const result = command.run(parsed, command.usage);
    if (result instanceof Promise) return result.catch((error) => reportReadErrors(() => { throw error; })).finally(flushSkippedStoreLines);
    flushSkippedStoreLines();
    return result;
  });
}
