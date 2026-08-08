import { existsSync, readFileSync } from 'node:fs';
import { checkCommitMessage, isExempt } from '../lib/commitContract';
import { EVENT_OPS, filterEvents, loadEvents, multilineNote, type EventOp, type TaskEvent } from '../lib/eventLog';
import { loadManifest } from '../lib/systems';
import type { Flags } from './cli';
import { readStore, recordEvents, resolveConfig, specFile, splitList, validateContentFields, type EventSubject } from './context';

// The two writes that touch no task state. A decision is its own op rather
// than a note by convention, because "what was decided about this" has to be
// answerable without a text-matching heuristic.
export function recordStandaloneEvent(op: 'note' | 'decision') {
  return (args: Flags, usage: string): void => {
    const config = resolveConfig(args.flags);
    const note = args.positional[0];
    if (!note) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }
    // The one refusal, and it is malformed input: prose in a record is what
    // made `next` cost thirty lines to call.
    const lines = multilineNote(note);
    if (lines !== null) {
      console.error(`error: a ${op} is one line — this one has ${lines}. Record the summary here and leave the prose in the commit message or the spec`);
      process.exitCode = 1;
      return;
    }
    const validationError = validateContentFields(config, args.flags);
    if (validationError) {
      console.error(validationError);
      process.exitCode = 1;
      return;
    }

    const id = args.flags.id ?? null;
    const tasks = id === null ? [] : readStore(config);
    const task = id === null ? undefined : tasks.find((candidate) => candidate.id === id);
    const subject: EventSubject = {
      id,
      system: args.flags.system ?? task?.system ?? null,
      spec: args.flags.spec ?? task?.spec ?? null,
      note,
    };
    recordEvents(config, op, [subject]);

    console.log(`recorded a ${op} against ${id ?? `${subject.system ?? 'no system'}/${subject.spec ?? 'no spec'}`} in ${config.eventsPath}`);
    // An event about a record that does not exist yet is still a fact
    // somebody asserted, so it is recorded and reported, never refused.
    if (id !== null && task === undefined) console.log(`no record answers to ${id} — the ${op} is recorded against that id anyway, and \`tasks log --id ${id}\` finds it`);
    // The spec file may since have been renamed or deleted, and an event
    // about a spec that no longer exists is exactly what a log is for; a
    // system name is drawn from a manifest that is authoritative right now,
    // which is why validateContentFields refuses that one.
    if (subject.spec !== null && !existsSync(specFile(config, subject.spec))) console.log(`no spec file at ${specFile(config, subject.spec)} — recorded against that slug anyway`);
  };
}

function renderEventLine(event: TaskEvent): string {
  return [`${event.t.slice(0, 19)}Z`, event.op, event.id ?? '(no task)', `${event.system ?? '(no system)'} / ${event.spec ?? '(no spec)'}`, event.by ?? '(unnamed)', event.note].join('  ');
}

// Answered from the log alone: joining to present-day state would rewrite
// history every time a record is re-pointed, which is the whole reason each
// event snapshots its own system and spec.
export function cmdLog(args: Flags): void {
  const config = resolveConfig(args.flags);
  const op = args.flags.op;
  if (op !== undefined && !EVENT_OPS.includes(op as EventOp)) {
    console.error(`error: --op must be one of ${EVENT_OPS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const { events, skipped } = loadEvents(config.eventsPath);
  const filter = { id: args.flags.id, system: args.flags.system, spec: args.flags.spec, op, text: args.positional[0] };
  const matched = filterEvents(events, filter);
  for (const event of matched) console.log(renderEventLine(event));

  const asked = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => (key === 'text' ? `"${value as string}"` : `--${key} ${value as string}`));
  // An empty log and a filter that matched nothing are different answers to
  // different questions, and collapsing them tells a caller their query was
  // wrong when the log is simply new.
  if (events.length === 0) console.log(`no events recorded yet in ${config.eventsPath}`);
  else if (matched.length === 0) console.log(`no event matches ${asked.join(' ')} — ${events.length} event(s) in ${config.eventsPath}`);
  else console.log(`${matched.length} of ${events.length} event(s)${asked.length > 0 ? ` matching ${asked.join(' ')}` : ''}`);

  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length} unreadable event line(s) — everything above is the rest of the log:`);
    for (const message of skipped) console.log(`  ${message}`);
  }
}

// Driven by .claude/hooks/commit-msg, which supplies what only git knows:
// whether MERGE_HEAD/REVERT_HEAD exist, and the staged file list.
export function cmdCheckCommitMessage(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const msgFile = args.positional[0];
  if (!msgFile) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const message = readFileSync(msgFile, 'utf8');
  const subject = message.split('\n')[0] ?? '';
  const manifest = loadManifest(config.systemsPath);
  const exempt = isExempt(subject, { isMergeOrRevert: args.flags['merge-or-revert'] === 'true', changedFiles: splitList(args.flags.files) }, manifest);
  if (exempt) return;

  const reason = checkCommitMessage(message);
  if (reason) {
    console.error(`commit-msg: ${reason}`);
    console.error('every commit needs a body saying what was done. Use `tasks next` for resumability. --no-verify to bypass.');
    process.exitCode = 1;
  }
}
