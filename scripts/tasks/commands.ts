import { ManifestError } from '../lib/systems';
import { StoreError } from '../lib/taskStore';
import { AUDIT_USAGE, cmdAudit, cmdAuditPrompt, cmdImport } from './audit';
import { flagArities, parseArgs, positionalArity, type Flags } from './cli';
import { ACTOR_USAGE, flushSkippedStoreLines, GLOBAL_USAGE } from './context';
import { cmdPlan, cmdConcept, cmdProduces, cmdSystem, cmdWhere } from './architectureCmds';
import { cmdDoctor } from './doctor';
import { cmdCheckCommitMessage, cmdHandoff, cmdLog, recordStandaloneEvent } from './handoff';
import { cmdMergeReady } from './mergeReady';
import { cmdAdd, cmdDecline, cmdDone, cmdEdit, cmdList, cmdNext, cmdPromote, cmdSearch, cmdShow, cmdStart, cmdStop } from './records';
import { cmdSpecAdd, cmdSpecDone, cmdSpecNew, cmdSpecRemove, cmdSpecShow } from './specCmds';
import { cmdTriage } from './triage';

const USAGE = 'usage: npm run tasks -- <doctor|add|edit|show|list|search|next|plan|system|where|produces|concept|start|stop|done|decline|promote|import|triage|note|decision|log|spec|audit|audit-prompt|handoff|merge-ready> ...';

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
  show: { usage: 'usage: tasks spec show <slug> [--order]', run: cmdSpecShow },
  done: { usage: `usage: tasks spec done <slug> [--defer-open] ${ACTOR_USAGE}`, run: cmdSpecDone },
};

const SPEC_USAGE = `usage: tasks spec <new|add|remove|show|done> ...  (\`tasks spec <slug>\` is short for \`tasks spec show <slug>\`)\n${Object.values(SPEC_COMMANDS)
  .map((command) => `  ${command.usage}`)
  .join('\n')}`;

const COMMANDS: Record<string, Command> = {
  doctor: { usage: `usage: tasks doctor [--fix] ${ACTOR_USAGE}`, run: cmdDoctor },
  add: {
    usage: `usage: tasks add "<title>" [--kind task|finding|question] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--files a.ts:12,b.ts] [--requires id1,id2] [--writes src/a.ts,src/b/] [--produces \"policy module\"] [--deliverable "..." (required for --kind finding)] [--evidence "..."] [--id <id>] ${ACTOR_USAGE}`,
    run: cmdAdd,
  },
  edit: {
    usage: `usage: tasks edit <id> ["<new title>"] [--title "..."] [--deliverable "..."] [--evidence "..."] [--severity high|medium|low] [--system "<name>"] [--files a.ts:12,b.ts] [--requires id1,id2] [--writes src/a.ts,src/b/] [--produces \"policy module\"] ${ACTOR_USAGE}  (content only: state, spec, kind and reason are moved by start/stop/done/decline/spec add, never by edit)`,
    run: cmdEdit,
  },
  show: { usage: 'usage: tasks show <id>', run: cmdShow },
  list: {
    usage: 'usage: tasks list [--state unreviewed|open|in-progress|done|declined] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--kind task|finding|undelivered|question] [--deferred]',
    run: cmdList,
  },
  search: {
    usage: 'usage: tasks search <term> [--state unreviewed|open|in-progress|done|declined] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--kind task|finding|undelivered|question] [--deferred]',
    run: cmdSearch,
  },
  plan: { usage: 'usage: tasks plan [<id>...] [--spec <slug>]  (grades a dispatch set for overlap, unstated dependencies and duplicated interfaces; runs no workers and refuses nothing)', run: cmdPlan },
  system: { usage: 'usage: tasks system ["<name>"]  (with no name, every system; with one, its owned files, exported surface, dependencies in both directions and registered concepts — all derived from the tree, none of it stored)', run: cmdSystem },
  where: { usage: 'usage: tasks where <path>  (which system owns it, which concept claims it, and what it imports across a system boundary)', run: cmdWhere },
  produces: { usage: 'usage: tasks produces <term>  (does anything already do this — searched over registered concepts and every `produces` claim any task ever made, closed ones included)', run: cmdProduces },
  concept: { usage: 'usage: tasks concept "<system>" "<name>" --paths a.ts,b/ [--note "where the name came from"]  (registers a capability so `tasks produces` can find it)', run: cmdConcept },
  next: { usage: 'usage: tasks next [--spec <slug>] [--system "<name>"] [--severity high|medium|low] [--full]', run: cmdNext },
  start: { usage: `usage: tasks start <id> ${ACTOR_USAGE}`, run: cmdStart },
  stop: { usage: `usage: tasks stop <id> ${ACTOR_USAGE}`, run: cmdStop },
  done: { usage: `usage: tasks done <id>... [--commit <revspec>] ${ACTOR_USAGE}  (default: none — the closing commit does not exist yet when \`done\` runs; see \`tasks show\` for a derived one)`, run: cmdDone },
  decline: { usage: `usage: tasks decline <id>... --reason "..." ${ACTOR_USAGE}  (several ids share the one reason)`, run: cmdDecline },
  promote: { usage: `usage: tasks promote <id>... [--spec <slug>] ${ACTOR_USAGE}  (the non-interactive form of triage's promote: moves unreviewed or deferred records into the spec as open members)`, run: cmdPromote },
  import: { usage: `usage: tasks import <audit-doc> ${ACTOR_USAGE}`, run: cmdImport },
  triage: { usage: `usage: tasks triage [--spec <slug>] ${ACTOR_USAGE}`, run: cmdTriage },
  note: { usage: `usage: tasks note "<one line>" [--id <id>] [--system "<name>"] [--spec <slug>] ${ACTOR_USAGE}  (appends to the event log; the store is untouched. A message starting with -- goes after a bare \`--\`)`, run: recordStandaloneEvent('note') },
  decision: { usage: `usage: tasks decision "<one line>" [--id <id>] [--system "<name>"] [--spec <slug>] ${ACTOR_USAGE}  (a decision is its own op, so \`tasks log --op decision\` needs no text matching. A message starting with -- goes after a bare \`--\`)`, run: recordStandaloneEvent('decision') },
  log: { usage: 'usage: tasks log [<text>] [--id <id>] [--system "<name>"] [--spec <slug>] [--op add|edit|start|stop|done|decline|triage|import|audit|spec-add|spec-remove|spec-defer|spec-done|doctor-fix|note|decision]  (every filter given is ANDed, and all of them are answered from the log alone)', run: cmdLog },
  spec: { usage: SPEC_USAGE, run: refuseBareSpec },
  audit: { usage: AUDIT_USAGE, run: cmdAudit },
  'audit-prompt': { usage: 'usage: tasks audit-prompt <spec> [--base-branch main]  (the auditor\'s brief, generated — do not hand-write one)', run: cmdAuditPrompt },
  handoff: { usage: 'usage: tasks handoff [--spec <slug>] [--base-branch main] [--scan-cap <commits>]', run: cmdHandoff },
  'merge-ready': { usage: 'usage: tasks merge-ready  (runs the merge gate: tsc, npm test, layer-check, audit-status, doctor, and the tracked-text byte check; exits non-zero when a leg fails)', run: cmdMergeReady },
  'check-commit-msg': { usage: 'usage: tasks check-commit-msg <msg-file> [--merge-or-revert] [--files a,b,c]', run: cmdCheckCommitMessage },
};

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
    console.error(`unknown command: ${name}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const { command } = resolved;

  const terminator = resolved.args.indexOf('--');
  const flagArgs = terminator === -1 ? resolved.args : resolved.args.slice(0, terminator);
  const literalTail = terminator === -1 ? [] : resolved.args.slice(terminator + 1);

  const arities = new Map([...flagArities(GLOBAL_USAGE), ...flagArities(command.usage)]);
  const { parsed, errors } = parseArgs(flagArgs, arities, null);
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
