import type { Task } from '../lib/taskStore';
import { departFromSpec, loadStore, unreviewedQueue } from '../lib/taskStore';
import type { Flags } from './cli';
import { recordEvents, resolveActiveSpec, resolveConfig, saveStoreAndWarn, subjectOf, today, type Config } from './context';
import { pass2Promotion, printDecisionPrompt } from './records';
import { activePrompter } from './prompt';
import { printEvidence, printRow, truncateLine } from './render';

interface TriageContext {
  task: Task;
  spec: string | null;
  config: Config;
  tasks: Task[];
  ask: (prompt: string) => Promise<string>;
}

// What every non-terminal action reports back: either a decision line for
// the caller to save, log and announce the same way for all three, or a
// control outcome for an action (redirect, ask) that has already saved and
// logged itself because its loop behaviour differs from theirs.
type TriageResult = { decision: string } | { control: 'break' | 'continue' };

// The five actions `cmdTriage` walks, as one table: both the menu text and
// the dispatch below are read from it, so a sixth action added here without
// a non-interactive route of its own is a table entry with no match in
// `triage.test.ts`'s completeness check, not a silent TUI-only addition.
export interface TriageAction {
  key: string;
  label: string;
  // The `tasks <verb>` command that performs this same action outside the
  // walk — what the completeness test looks up.
  verb: string;
  run: (ctx: TriageContext) => Promise<TriageResult>;
}

async function runPromote({ task, spec }: TriageContext): Promise<TriageResult> {
  if (spec === null) {
    console.log('no active spec to promote into — pass --spec, skipping');
    return { control: 'break' };
  }
  const widening = pass2Promotion(task, spec);
  if (widening) console.log(widening);
  task.state = 'open';
  task.spec = spec;
  return { decision: `promoted into spec ${spec}` };
}

async function runDefer({ task }: TriageContext): Promise<TriageResult> {
  task.state = 'open';
  departFromSpec(task, 'retriage');
  return { decision: 'deferred: opened outside every spec' };
}

async function runDecline({ task, ask }: TriageContext): Promise<TriageResult> {
  const reason = (await ask('reason: ')).trim();
  if (reason === '') {
    console.log('a reason is required to decline — skipping');
    return { control: 'break' };
  }
  task.state = 'declined';
  task.reason = reason;
  task.closed = today();
  return { decision: `declined: ${truncateLine(reason, 120)}` };
}

async function runRedirect({ task, ask, tasks, config }: TriageContext): Promise<TriageResult> {
  const replacement = (await ask('replacement deliverable: ')).trim();
  if (replacement === '') {
    console.log('empty — redirect cancelled');
    return { control: 'continue' };
  }
  task.deliverable = replacement;
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'triage', [subjectOf(task, `redirected the deliverable to: ${truncateLine(replacement, 120)}`)]);
  return { control: 'continue' };
}

// The half-decision triage was missing: the reviewer needs an answer before
// any of the other four keys is right. The question lands on the record
// itself — the next agent reads the record, not the log — and the finding
// stays unreviewed so the queue keeps offering it.
async function runAsk({ task, ask, tasks, config }: TriageContext): Promise<TriageResult> {
  const question = (await ask('question: ')).trim();
  if (question === '') {
    console.log('empty — nothing asked');
    return { control: 'continue' };
  }
  task.evidence = `${task.evidence ? `${task.evidence}\n\n` : ''}triage asked (${today()}): ${question}`;
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'triage', [subjectOf(task, `asked for more information: ${truncateLine(question, 120)}`)]);
  console.log('recorded on the finding; it stays unreviewed until the question is answered');
  return { control: 'break' };
}

export const TRIAGE_ACTIONS: TriageAction[] = [
  { key: '1', label: 'promote', verb: 'promote', run: runPromote },
  { key: '2', label: 'defer', verb: 'defer', run: runDefer },
  { key: '3', label: 'decline', verb: 'decline', run: runDecline },
  { key: '4', label: 'redirect', verb: 'redirect', run: runRedirect },
  { key: 'a', label: 'ask', verb: 'ask', run: runAsk },
];

// A human, not the auditor, assigns state — this is the only place that
// happens interactively; `tasks promote` is the batch form for findings
// whose disposition is already decided. promote/defer/decline all persist
// immediately, not just on quit, so a queue this long survives an
// interrupted session.
export async function cmdTriage(args: Flags): Promise<void> {
  const config = resolveConfig(args.flags);
  const tasks = loadStore(config.storePath);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  const spec = activeSpec.spec;
  if (activeSpec.note) console.log(activeSpec.note);
  const queue = unreviewedQueue(tasks);
  if (queue.length === 0) {
    console.log('no unreviewed findings');
    return;
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const prompter = activePrompter();
  const ask = async (prompt: string): Promise<string> => {
    const answer = await prompter.ask(prompt);
    return prompter.exhausted() ? 'q' : answer;
  };

  const total = queue.length;
  outer: for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    // Redirect re-displays this same task and asks again rather than
    // advancing, so displaying and deciding is a loop, not a single pass.
    while (true) {
      console.log('');
      console.log(`[${i + 1}/${total}]`);
      printRow(task, byId, { indent: '  ', withFiles: true });
      console.log('');
      console.log('evidence — what is broken:');
      printEvidence(task.evidence);
      console.log('');
      console.log('deliverable — the proposed fix:');
      if (task.deliverable) printEvidence(task.deliverable);
      else console.log('          no proposed fix recorded');
      console.log('');
      console.log(`${TRIAGE_ACTIONS.map((action) => `[${action.key}] ${action.label}`).join('   ')}   [s] skip   [q] save and quit`);

      const answer = (await ask('> ')).trim().toLowerCase();
      if (answer === 'q') break outer;
      if (answer === '' || answer === 's') break;

      const action = TRIAGE_ACTIONS.find((candidate) => candidate.key === answer);
      if (action === undefined) {
        console.log('unrecognised input, skipping');
        break;
      }
      const result = await action.run({ task, spec, config, tasks, ask });
      if ('control' in result) {
        if (result.control === 'break') break;
        continue;
      }
      saveStoreAndWarn(tasks, config);
      recordEvents(config, 'triage', [subjectOf(task, result.decision)]);
      printDecisionPrompt(task);
      break;
    }
  }
  prompter.close();

  const remaining = tasks.filter((task) => task.state === 'unreviewed').length;
  console.log(`\n${remaining} unreviewed finding(s) left`);
}
