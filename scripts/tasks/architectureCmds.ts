import { readFileSync, writeFileSync } from 'node:fs';
import { deriveModules, regionView, repoSourceTree, systemView, type Module, type ModuleSurface, type RegionView, type SourceTree, type SystemEdge, type SystemView } from '../lib/architecture';
import { loadEvents } from '../lib/eventLog';
import { checkPlan } from '../lib/planCheck';
import { findProducers, priorArt, producerIndex, rulingsOn, type PriorArt, type Producer, type Rulings } from '../lib/producers';
import { canonicalPath, checkManifest, isUnowned, loadManifest, ManifestError, overlappingConcepts, parseManifest, type Manifest } from '../lib/systems';
import type { Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { CLOSING_STATES, readStore, recordEvents, resolveActiveSpec, resolveConfig, splitList, systemNames, type Config } from './context';
import { printRow, reportUnknownIds, wrapUnder } from './render';

// The store is what these answers rest on; the registry only widens them. So
// an unreadable manifest costs the concept half of an answer and nothing
// else, and the caller says which half it lost rather than refusing the whole
// question over it. `tasks plan` is a CI step held to answering, and the
// checks that fire from `add`/`edit` must not turn a malformed manifest into
// a failed write.
function manifestOrEmpty(config: Config, lost: string): Manifest {
  try {
    return loadManifest(config.systemsPath);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    console.log(`note: ${error.message}`);
    console.log(lost);
    return { unowned: { note: '', paths: [] }, systems: [] };
  }
}

function knownProducers(config: Config, tasks: Task[]): Producer[] {
  return producerIndex(manifestOrEmpty(config, 'grading against recorded `produces` claims only — registered concepts could not be read'), tasks);
}

// Grades a dispatch set before anyone works it. Everything it reports is
// decidable from the records alone, so the cost of asking is one command and
// the answer arrives while the decomposition is still cheap to change — which
// is the only moment any of these findings is worth having.
//
// It reports and exits 0, like every other read. A planner who sees "3 of 4
// tasks write one file" and dispatches anyway has made an informed call.
export function cmdPlan(args: Flags): void {
  const config = resolveConfig(args.flags);
  const tasks = readStore(config);
  const byId = new Map(tasks.map((task) => [task.id, task]));

  let plan: Task[];
  if (args.positional.length > 0) {
    // Deduped: a plan is a set. Pairing the argument list instead would
    // report a task overlapping itself, producing what it produces twice,
    // and not requiring itself — five defects for one real task.
    const named = [...new Set(args.positional)];
    const unknown = named.filter((id) => !byId.has(id));
    if (unknown.length > 0) reportUnknownIds(unknown, tasks, (line) => console.log(line));
    plan = named.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined);
  } else {
    const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
    if (activeSpec.note) console.log(activeSpec.note);
    if (activeSpec.spec === null) {
      console.log('no active spec for this branch, and no ids or --spec given — `tasks plan <id>...` grades a set directly');
      return;
    }
    // What a planner would actually hand out: the spec's live work, held
    // and unheld alike. A blocked member is included on purpose — "this
    // starts blocked" is one of the answers worth having.
    plan = tasks.filter((task) => task.spec === activeSpec.spec && (task.state === 'open' || task.state === 'in-progress'));
    console.log(`plan taken from spec ${activeSpec.spec}: its ${plan.length} open and in-progress member(s)`);
  }

  if (plan.length === 0) {
    console.log('nothing to grade — name the ids to dispatch, or add members to the spec');
    return;
  }

  const report = checkPlan(plan, tasks, knownProducers(config, tasks));
  const readable = plan.length - report.ungranted;
  console.log(`plan: ${plan.length} task(s), ${readable} with a write grant this check can read, ${report.commitments} of those a commitment`);
  for (const task of plan) printRow(task, byId, { indent: '  ' });
  console.log('');

  if (report.findings.length === 0) {
    console.log('no overlap, no unstated dependency, no duplicated interface.');
    if (report.ungranted > 0) console.log(`${report.ungranted} task(s) have no grant this check could read, so that answer covers less than it looks like it does.`);
    if (readable > report.commitments) console.log(`${readable - report.commitments} readable grant(s) are a forecast or unstated, and an overlap between those is reported as a note rather than a defect.`);
    return;
  }

  for (const finding of report.findings) console.log(`  [${finding.level}] ${finding.message}`);
  console.log('');
  const defects = report.findings.filter((finding) => finding.level === 'defect').length;
  console.log(`${report.findings.length} finding(s) — ${defects} defect, ${report.findings.length - defects} note. Reported, not enforced: whether to dispatch is yours.`);
}

// The architecture questions. All three are reads over data computed at call
// time from the manifest and the tree; none of them writes anything, and
// nothing downstream of them can fail a build.

export function architecture(config: Config): { manifest: Manifest; tree: SourceTree; modules: Module[] } {
  const manifest = loadManifest(config.systemsPath);
  const tree = repoSourceTree();
  return { manifest, tree, modules: deriveModules(manifest, tree) };
}

// A count here, names in the single-system view. Clause 2 asked for names at
// the point a planner asks about one region, and this is a different reader
// with a different question — printing every export of every system would
// answer neither. Dropping the count without replacing it left the overview
// with no measure of surface at all.
function printSystemSummary(view: SystemView): void {
  const out = view.dependsOn.map((edge) => edge.to).join(', ') || 'nothing';
  const exports = view.surface.reduce((total, module) => total + module.exports.length, 0);
  console.log(`  ${view.system.name.padEnd(22)} ${String(view.files.length).padStart(3)} file(s), ${String(exports).padStart(3)} export(s), ${view.system.concepts.length} concept(s), depends on ${out}`);
}

// A surface is names. One line per module, the module's own path as the
// label, and a long list continuing under itself rather than under column
// zero, where the terminal's soft wrap would make a continuation look like
// another module.
function printSurface(surface: ModuleSurface[], indent: string): void {
  for (const module of surface) for (const line of wrapUnder(module.exports.join(', '), `${indent}${module.path} — `, `${indent}  `)) console.log(line);
}

export function cmdSystem(args: Flags): void {
  const config = resolveConfig(args.flags);
  const { manifest, tree, modules } = architecture(config);
  const name = args.positional[0];

  if (name === undefined) {
    console.log(`${manifest.systems.length} system(s) declared in ${config.systemsPath}; every count below is derived from the tree, never stored`);
    for (const system of manifest.systems) printSystemSummary(systemView(manifest, tree, modules, system.name)!);
    console.log('\n`tasks system "<name>"` opens one; `tasks where <path>` answers the other direction');
    return;
  }

  const view = systemView(manifest, tree, modules, name);
  if (view === null) {
    console.error(`error: no system named ${JSON.stringify(name)} in ${config.systemsPath}\nknown: ${systemNames(config).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${view.system.name} — ${view.files.length} owned file(s), ${view.modules.length} module(s)`);
  // The manifest's note is audit standing, not architecture, and it runs to
  // paragraphs. `npm run audit-status` is where it belongs whole; repeating
  // it here would bury the answer this command was asked for.
  if (view.system.note) console.log(`\nlast audit: ${view.system.lastAudit ?? 'never swept'}${view.system.lastAuditDoc ? ` (${view.system.lastAuditDoc})` : ''} — \`npm run audit-status\` prints its standing in full`);

  console.log('\nexported surface, production modules only:');
  if (view.surface.length === 0) console.log('  nothing — no production module it owns exports a name');
  printSurface(view.surface, '  ');

  console.log('\ndepends on:');
  if (view.dependsOn.length === 0) console.log('  nothing — no file it owns imports across a system boundary');
  for (const edge of view.dependsOn) console.log(`  ${edge.to.padEnd(22)} ${describeEdge(edge)}`);

  console.log('\ndepended on by:');
  if (view.dependedOnBy.length === 0) console.log('  nothing');
  for (const edge of view.dependedOnBy) console.log(`  ${edge.from.padEnd(22)} ${describeEdge(edge)}`);

  console.log('\nconcepts:');
  if (view.concepts.length === 0) console.log(`  none registered — \`tasks produces\` cannot answer for this system yet`);
  for (const entry of view.concepts) {
    console.log(`  ${entry.concept.name} — ${entry.files.length} file(s): ${entry.files.join(', ') || '(none matching)'}`);
    if (entry.concept.note) console.log(`    ${entry.concept.note}`);
  }

  if (view.unclaimed.length > 0) {
    console.log(`\n${view.unclaimed.length} production file(s) no concept claims:`);
    for (const file of view.unclaimed) console.log(`  ${file}`);
  }

  const overlaps = overlappingConcepts(manifest).filter((entry) => entry.system === view.system.name);
  for (const entry of overlaps) console.log(`\n  [note] ${entry.path} is claimed by ${entry.concepts.join(' and ')} — one file doing two jobs is where a seam belongs`);
}

const describeEdge = (edge: SystemEdge): string => {
  const production = edge.imports.filter((entry) => !entry.test).length;
  const only = production === 0 ? ', all of them in tests' : production === edge.imports.length ? '' : `, ${production} of them in production code`;
  return `${edge.imports.length} import(s)${only} — e.g. ${edge.imports[0].from} -> ${edge.imports[0].to}`;
};

// Ownership is single-valued per file, so more than one name here means the
// query named a region rather than a file, and every diff under it is
// charged to whichever system owns the file it touched.
export function ownership(manifest: Manifest, view: RegionView): string {
  if (view.owners.length === 0) return `none — it is ${isUnowned(manifest, view.path) ? 'declared unowned' : 'owned by nobody, which `npm run audit-status` fails on'}`;
  return view.owners.length === 1 ? view.owners[0] : `${view.owners.join(', ')} — this region spans ${view.owners.length} systems, and a diff under it is charged to each`;
}

// The one rendering of "what has already claimed these paths", so a caller
// asking by hand and a check that fires on `--writes` cannot answer the same
// question in two shapes.
// A reader asking about one path wants every claim, closed ones included — a
// closed claim is a decision already made. A reader handed a whole branch's
// diff wants the collisions, and would otherwise scroll past a hundred lines
// of them. `collapseClosed` is that second reader; the count still says the
// history is there.
export function printPriorArt(art: PriorArt, { collapseClosed = false } = {}): void {
  const where = art.paths.join(', ');
  if (art.concepts.length === 0 && art.claims.length === 0) {
    console.log(`nothing has claimed ${where}: no registered concept covers it, and no task's writes or files name it in any state.`);
    return;
  }

  console.log(`prior art on ${where}:`);
  for (const { system, concept, on } of art.concepts) {
    console.log(`  [concept] ${concept.name} — registered to ${system} over ${on.join(', ')}`);
    if (concept.note) console.log(`            ${concept.note}`);
  }
  const shown = collapseClosed ? art.claims.filter(({ task }) => !CLOSING_STATES.includes(task.state)) : art.claims;
  for (const { task, on } of shown) {
    console.log(`  [${task.state}] ${task.id} — ${task.title}`);
    console.log(`            ${[...new Set(on.map((match) => `${match.field} ${match.declared}`))].join(', ')}`);
    if (task.produces.length > 0) console.log(`            produces ${task.produces.join(', ')}`);
  }
  const closed = art.claims.length - shown.length;
  if (closed > 0) console.log(`  ${closed} closed claim(s) not listed — each is a decision already made rather than a collision.`);
  console.log('\nA claim in any state is prior art: a closed one is a decision already made, and an open one is a collision.');
}

// "Someone has written here" and "someone has ruled on this" are different
// facts, so this prints under its own header with its own `[ruling]` tag
// rather than folding into `printPriorArt`'s `[state] id` lines — a reader
// scanning the left column tells the two apart without reading the prose.
export function printRulings(rulings: Rulings): void {
  const where = rulings.paths.join(', ');
  if (rulings.reasons.length === 0 && rulings.decisions.length === 0) {
    console.log(`no ruling names ${where} or its basename: no closed record's reason and no event-log decision mentions it. Only those two fields are searched — \`tasks log "<term>"\` reads the whole log.`);
    return;
  }

  console.log(`rulings on ${where}:`);
  for (const { task, on } of rulings.reasons) {
    console.log(`  [ruling] ${task.id} (${task.state}) reason — ${task.reason}`);
    if (on.length > 1 || on[0] !== where) console.log(`            names ${on.join(', ')}`);
  }
  for (const { event, on } of rulings.decisions) {
    console.log(`  [ruling] decision ${event.t.slice(0, 19)}Z (${event.id ?? `${event.system ?? 'no system'}/${event.spec ?? 'no spec'}`}) — ${event.note}`);
    if (on.length > 1 || on[0] !== where) console.log(`            names ${on.join(', ')}`);
  }
  console.log('\nA ruling is a decision already made about this path, not a claim on it — read it before proposing the same remedy again.');
}

// The same query `tasks where` answers when asked, fired by the act of
// declaring a write grant. A check that has to be remembered is skipped
// exactly when a session is deep in something else: this one was run once in
// a whole planning session, and that once is the one duplication it caught.
// The record's own claim is excluded from both sections — a task always
// claims what it just granted, and reporting that would bury the answer
// under itself.
export function reportPriorArtOnWrites(config: Config, tasks: Task[], task: Task): void {
  if (task.writes.length === 0) return;
  const manifest = manifestOrEmpty(config, 'answering from recorded claims only — registered concepts could not be read');
  const others = tasks.filter((candidate) => candidate.id !== task.id);
  console.log('');
  printPriorArt(priorArt(manifest, others, task.writes));
  console.log('');
  printRulings(rulingsOn(others, loadEvents(config.eventsPath).events, task.writes));
}

// The body of `tasks where`, factored out so `plan-prompt` can run the same
// survey over paths named on its own command line — the deliverable it
// exists for is running step 1's survey rather than trusting a planner to
// remember the command, so it reaches this the way `cmdWhere` does rather
// than printing advice about it.
export function printWhere(config: Config, target: string, arch = architecture(config)): void {
  const { manifest, tree, modules } = arch;
  const view = regionView(manifest, tree, modules, target);

  console.log(`${view.path}`);
  if (view.files.length !== 1) console.log(`  ${view.files.length} tracked file(s) under it`);
  console.log(`  system:   ${ownership(manifest, view)}`);
  if (view.coveredBy.length > 1) console.log(`  audited by: ${view.coveredBy.join(', ')} — coverage is many-to-many, ownership is not`);
  if (view.surface.length > 0) {
    console.log('  exports:');
    printSurface(view.surface, '    ');
  }
  if (view.importsOut.length > 0) {
    console.log('  imports across a system boundary:');
    for (const entry of view.importsOut) console.log(`    ${entry.path} (${entry.system})`);
  }
  if (view.importedBy.length > 0) {
    console.log('  imported from outside its system by:');
    for (const entry of view.importedBy) console.log(`    ${entry.path} (${entry.system})`);
  }

  const tasks = readStore(config);
  console.log('');
  printPriorArt(priorArt(manifest, tasks, [view.path]));

  console.log('');
  printRulings(rulingsOn(tasks, loadEvents(config.eventsPath).events, [view.path]));
}

export function cmdWhere(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const target = args.positional[0];
  if (!target) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  printWhere(config, target);
}

// The check a worker runs before building: is this already somebody's job?
// Answered against every concept a system has registered and every claim any
// task ever made, closed ones included — which is the half `tasks plan` could
// never see, because a claim went inert the moment its task closed.
export function cmdProduces(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const query = args.positional[0];
  if (!query) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const manifest = loadManifest(config.systemsPath);
  const matches = findProducers(query, producerIndex(manifest, readStore(config)));

  if (matches.length === 0) {
    console.log(`nothing produces ${JSON.stringify(query)}.`);
    console.log('That is a weak "no": only registered concepts and recorded `produces` claims are searched, and most of the tree carries neither.');
    console.log(`Widen it with \`tasks search ${JSON.stringify(query)}\`, and grep before you build.`);
    return;
  }

  console.log(`${matches.length} producer(s) of ${JSON.stringify(query)}:`);
  for (const { producer, strength, on } of matches) {
    const held = producer.kind === 'concept' ? `owned by ${producer.owner}` : `claimed by ${producer.owner} (${producer.state})`;
    const how = strength === 'word' ? `, sharing the word "${on}" and nothing more` : strength === 'contains' ? ', one name inside the other' : '';
    console.log(`  [${strength}] ${producer.name} — ${held}, in ${producer.where}${how}`);
  }
  if (matches.some((match) => match.strength === 'exact')) console.log('\nAn exact match means the capability exists. Use it, or record why a second one is right.');
}

export function cmdConcept(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const [systemName, name] = args.positional;
  const paths = splitList(args.flags.paths).map(canonicalPath);
  if (!systemName || !name?.trim() || paths.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  // Read through parseManifest first, so a malformed manifest is refused as
  // a labelled ManifestError; then mutate the raw JSON rather than
  // re-serialising the parsed model, so a field this version of the tool
  // does not know about survives the write — the manifest's version of the
  // store's `extra`.
  const manifest = loadManifest(config.systemsPath);
  const raw = JSON.parse(readFileSync(config.systemsPath, 'utf8')) as { systems: Array<{ name: string; concepts?: unknown[] }> };
  const system = raw.systems.find((candidate) => candidate.name === systemName);
  if (system === undefined) {
    console.error(`error: no system named ${JSON.stringify(systemName)} in ${config.systemsPath}\nknown: ${systemNames(config).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const existing = findProducers(name, producerIndex(manifest, readStore(config))).filter((match) => match.strength === 'exact' && match.producer.kind === 'concept');
  if (existing.length > 0) {
    console.error(`error: ${existing[0].producer.owner} already registers a concept named ${JSON.stringify(existing[0].producer.name)} — a name with two owners answers every lookup with the wrong one`);
    process.exitCode = 1;
    return;
  }

  system.concepts = [...(system.concepts ?? []), { name, paths, note: args.flags.note ?? null }];

  const candidate = parseManifest(JSON.stringify(raw), config.systemsPath);
  const blocking = checkManifest(candidate).filter((issue) => issue.level === 'error');
  if (blocking.length > 0) {
    for (const issue of blocking) console.error(`error: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(config.systemsPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  recordEvents(config, 'note', [{ id: null, system: systemName, spec: null, note: `registered concept "${name}" over ${paths.join(', ')}` }]);
  console.log(`registered "${name}" to ${systemName} over ${paths.join(', ')}`);
  for (const issue of checkManifest(candidate)) console.log(`  [${issue.level}] ${issue.message}`);
  console.log(`next: \`tasks produces "${name}"\` now answers, and \`tasks system "${systemName}"\` lists it`);
}
