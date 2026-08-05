import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clauseStandings, outstandingSummary, parseSpecDoc } from '../lib/specDoc';
import { clausesOf, loadStore, unreviewedFiledBy, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { readStore, recordEvents, refuseUnknownSpec, reportUnknownSpec, resolveActiveSpec, resolveConfig, saveStoreAndWarn, specFile, subjectOf } from './context';
import { clauseStandingLines, printRow, refuseUnknownIds } from './render';

const SPEC_SCAFFOLD = (slug: string): string => `# ${slug}

## Deliverable

<one paragraph: what this branch promises>

Proof:

- <a checkable clause>

## Decisions

## Open questions

None.
`;

export function cmdSpecNew(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (existsSync(path_)) {
    console.error(`error: spec already exists: ${path_}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(config.specsDir, { recursive: true });
  writeFileSync(path_, SPEC_SCAFFOLD(slug), 'utf8');
  console.log(`created ${path_} — fill in ## Deliverable before opening the branch's first audit`);
  printSurveyReminder(slug);
}

// The one moment the whole capability landscape is in view, and the moment a
// planner is least likely to stop and ask. `tasks plan-prompt` is what runs
// the survey now — prior art and rulings both, not just a list of commands
// to remember — so this points back at it rather than repeating a shorter,
// claims-only version of the same list. Which capabilities the branch adds,
// extends, takes over or retires is the judgement, and making it is the
// point of the step, same shape as the `tasks concept` nudge `done` prints
// for an unregistered claim.
function printSurveyReminder(slug: string): void {
  console.log('');
  console.log(`The scaffold is not the survey. If \`tasks plan-prompt ${slug} <path>...\` has not already been run for this branch, run it now — it prints prior art (writes, files, produces) and rulings (event-log decisions and closed-record reasons) for every region named, by path rather than by name, because a capability name is authored prose and two authors will not choose the same words.`);
  console.log("Then record in this spec's `## Decisions` which capabilities the branch adds, extends,");
  console.log('takes over and retires. A survey that finds an owner is a success: reuse it, or write down');
  console.log('why a second one is right.');
}

export function cmdSpecAdd(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const ids = args.positional.slice(1);
  if (!slug || ids.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    refuseUnknownSpec(config, slug);
    return;
  }
  const tasks = loadStore(config.storePath);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    refuseUnknownIds(missing, tasks);
    return;
  }
  const latePass = ids.map((id) => byId.get(id)!).filter((task) => (task.source?.pass ?? 0) >= 2);
  const from = new Map(ids.map((id) => [id, byId.get(id)!.spec]));
  for (const id of ids) byId.get(id)!.spec = slug;
  saveStoreAndWarn(tasks, config);
  recordEvents(
    config,
    'spec-add',
    ids.map((id) => subjectOf(byId.get(id)!, `moved into spec ${slug} from ${from.get(id) ?? '(deferred)'}`)),
  );
  console.log(`added ${ids.length} task(s) to ${slug}`);
  if (latePass.length > 0) console.log(`${latePass.length} of those came from a pass 2 or later audit, which extends what ${slug} owes: ${latePass.map((task) => `${task.id} (pass ${task.source!.pass})`).join(', ')}`);
}

export function cmdSpecShow(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  // The same inference `next` runs, for the same reason: a read that can
  // resolve the branch's own spec and answers with usage instead is asking
  // its caller to name something it already knows.
  let slug = args.positional[0];
  if (!slug) {
    const active = resolveActiveSpec(config, readStore(config), args.flags.spec);
    if (active.note) console.log(active.note);
    if (active.spec === null) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }
    slug = active.spec;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    reportUnknownSpec(config, slug, (line) => console.log(line));
    return;
  }
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  const latest = doc.auditPasses[doc.auditPasses.length - 1];
  const tasks = readStore(config);
  const owners = clauseOwners(tasks, slug);
  // The clauses with their standings, not the whole ## Deliverable: a
  // planner's context is the scarce resource a store read spends, and the
  // section's prose never changes between reads. `--full` prints it.
  if (args.flags.full === 'true') {
    console.log(doc.deliverableSection);
  } else {
    const standings = clauseStandings(doc.proofClauses, latest?.verdicts);
    for (const standing of standings) {
      for (const line of clauseStandingLines(standing, doc.proofClauses)) console.log(line);
      // Which slice of the decomposition promised this clause. A standing
      // graded without knowing who owes it is the blindness the audit
      // inherits, and "which clause has no owner" has nowhere else to be
      // answered from.
      const owed = owners.get(standing.clause) ?? [];
      console.log(owed.length === 0 ? '       owed by: nobody — `tasks edit <id> --discharges c' + standing.clause + '` names the slice that does' : `       owed by: ${owed.map((task) => `${task.id} (${task.state})`).join(', ')}`);
    }
    if (standings.length === 0) console.log('  (no proof clauses — `--full` prints the whole ## Deliverable)');
  }
  console.log('');
  console.log(`${doc.auditPasses.length} audit pass(es) recorded`);
  for (const pass of doc.auditPasses) {
    console.log(`  pass ${pass.pass} (${pass.date}): ${outstandingSummary(pass.verdicts)}`);
  }
  // The passes above are what each pass said; this is where the spec stands
  // now, which differs whenever a clause was added after the last one.
  console.log(`clause standing (${latest ? `latest pass ${latest.pass}` : 'no audit pass recorded'}): ${outstandingSummary(clauseStandings(doc.proofClauses, latest?.verdicts))}`);
  console.log('');

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const members = specMembers(tasks.filter((task) => task.spec === slug), args.flags.order === 'true');
  console.log(`${members.length} member(s):`);
  for (const member of members) printRow(member, byId, { indent: '  ' });

  const filed = unreviewedFiledBy(tasks, slug);
  if (filed.length > 0) {
    console.log('');
    console.log(`${filed.length} unreviewed finding(s) filed by this spec's audits, awaiting triage (not members):`);
    for (const task of filed) printRow(task, byId, { indent: '  ' });
  }
}

// Clause number to the members that promised it. An `undelivered` record is
// a promise about its own clause and belongs here too — it is the one record
// type that already carried the number, and leaving it out would report a
// clause as unowned while a record about it sits open in the spec.
export function clauseOwners(tasks: Task[], spec: string): Map<number, Task[]> {
  const owners = new Map<number, Task[]>();
  for (const task of tasks) {
    if (task.spec !== spec) continue;
    for (const clause of clausesOf(task)) {
      owners.set(clause, [...(owners.get(clause) ?? []), task]);
    }
  }
  return owners;
}

function specMembers(members: Task[], ordered: boolean): Task[] {
  if (!ordered) return members;
  const byId = new Map(members.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: Task[] = [];

  function visit(task: Task): void {
    if (visited.has(task.id) || visiting.has(task.id)) return;
    visiting.add(task.id);
    for (const requirement of task.requires) {
      const dep = byId.get(requirement);
      if (dep) visit(dep);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
  }

  for (const task of members) visit(task);
  return result;
}

export function cmdSpecDone(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    refuseUnknownSpec(config, slug);
    return;
  }
  const tasks = loadStore(config.storePath);
  const members = tasks.filter((task) => task.spec === slug);
  const stragglers = members.filter((task) => task.state !== 'done' && task.state !== 'declined');

  if (stragglers.length > 0 && args.flags['defer-open'] === 'true') {
    for (const straggler of stragglers) straggler.spec = null;
    saveStoreAndWarn(tasks, config);
    // The spec named is the one the record just left, not the null it now
    // carries: `tasks log --spec <slug>` has to be the whole membership
    // history of that spec, and a departure is part of it.
    recordEvents(
      config,
      'spec-defer',
      stragglers.map((straggler) => ({ ...subjectOf(straggler, `deferred out of spec ${slug} when it closed, still ${straggler.state}`), spec: slug })),
    );
    console.log(`deferred ${stragglers.length} straggler(s) out of ${slug}: ${stragglers.map((task) => task.id).join(', ')}`);
  }

  const reloaded = loadStore(config.storePath);
  const stillOpen = reloaded.filter((task) => task.spec === slug && task.state !== 'done' && task.state !== 'declined');
  if (stillOpen.length > 0) {
    console.log(`${slug} is not done — ${stillOpen.length} member(s) are neither done nor declined:`);
    const byId = new Map(reloaded.map((task) => [task.id, task]));
    for (const task of stillOpen) printRow(task, byId, { indent: '- ' });
    return;
  }
  // The one event with no store write behind it: the transition is derived
  // from member states, but "when did this spec close" is the question a
  // later reader most asks the log, so the answer is recorded.
  recordEvents(config, 'spec-done', [{ id: null, system: null, spec: slug, note: `spec closed: every member is done or declined` }]);
  console.log(`${slug} is done: every member is done or declined`);
}

// The demotion counterpart to `spec add`: nothing else sets `spec` back to
// null for named ids. `spec done --defer-open` sweeps every open member at
// once; this targets specific ones without waiting for the spec to close.
export function cmdSpecRemove(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const ids = args.positional.slice(1);
  if (!slug || ids.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    refuseUnknownSpec(config, slug);
    return;
  }
  const tasks = loadStore(config.storePath);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    refuseUnknownIds(missing, tasks);
    return;
  }
  const notMembers = ids.filter((id) => byId.get(id)!.spec !== slug);
  const undelivered = ids.filter((id) => byId.get(id)!.kind === 'undelivered');
  const from = new Map(ids.map((id) => [id, byId.get(id)!.spec]));
  for (const id of ids) byId.get(id)!.spec = null;
  saveStoreAndWarn(tasks, config);
  recordEvents(
    config,
    'spec-remove',
    ids.map((id) => ({ ...subjectOf(byId.get(id)!, `removed from spec ${slug}, and now names none`), spec: from.get(id) ?? slug })),
  );
  console.log(`removed ${ids.length} task(s) from ${slug}`);
  if (notMembers.length > 0) console.log(`${notMembers.length} of those named a different spec, or none, and now name none: ${notMembers.join(', ')}`);
  if (undelivered.length > 0) console.log(`${undelivered.length} of those were ${slug}'s outstanding promises — the clauses they name are now tracked by no spec: ${undelivered.join(', ')}`);
}
