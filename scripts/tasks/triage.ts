import { loadStore, unreviewedQueue } from '../lib/taskStore';
import type { Flags } from './cli';
import { recordEvents, resolveActiveSpec, resolveConfig, saveStoreAndWarn, subjectOf, today } from './context';
import { pass2Promotion, printDecisionPrompt } from './records';
import { stdinPrompter } from './prompt';
import { printEvidence, printRow, truncateLine } from './render';

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

  const prompter = stdinPrompter();
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
      console.log('[1] promote   [2] defer   [3] decline   [4] redirect   [a] ask   [s] skip   [q] save and quit');

      const answer = (await ask('> ')).trim().toLowerCase();
      if (answer === 'q') break outer;
      if (answer === '' || answer === 's') break;

      let decision: string;
      if (answer === '1') {
        if (spec === null) {
          console.log('no active spec to promote into — pass --spec, skipping');
          break;
        }
        const widening = pass2Promotion(task, spec);
        if (widening) console.log(widening);
        task.state = 'open';
        task.spec = spec;
        decision = `promoted into spec ${spec}`;
      } else if (answer === '2') {
        task.state = 'open';
        task.spec = null;
        decision = 'deferred: opened outside every spec';
      } else if (answer === '3') {
        const reason = (await ask('reason: ')).trim();
        if (reason === '') {
          console.log('a reason is required to decline — skipping');
          break;
        }
        task.state = 'declined';
        task.reason = reason;
        task.closed = today();
        decision = `declined: ${truncateLine(reason, 120)}`;
      } else if (answer === '4') {
        const replacement = (await ask('replacement deliverable: ')).trim();
        if (replacement === '') {
          console.log('empty — redirect cancelled');
          continue;
        }
        task.deliverable = replacement;
        saveStoreAndWarn(tasks, config);
        recordEvents(config, 'triage', [subjectOf(task, `redirected the deliverable to: ${truncateLine(replacement, 120)}`)]);
        continue;
      } else if (answer === 'a') {
        // The half-decision triage was missing: the reviewer needs an answer
        // before any of the other four keys is right. The question lands on
        // the record itself — the next agent reads the record, not the log —
        // and the finding stays unreviewed so the queue keeps offering it.
        const question = (await ask('question: ')).trim();
        if (question === '') {
          console.log('empty — nothing asked');
          continue;
        }
        task.evidence = `${task.evidence ? `${task.evidence}\n\n` : ''}triage asked (${today()}): ${question}`;
        saveStoreAndWarn(tasks, config);
        recordEvents(config, 'triage', [subjectOf(task, `asked for more information: ${truncateLine(question, 120)}`)]);
        console.log('recorded on the finding; it stays unreviewed until the question is answered');
        break;
      } else {
        console.log('unrecognised input, skipping');
        break;
      }
      saveStoreAndWarn(tasks, config);
      recordEvents(config, 'triage', [subjectOf(task, decision)]);
      printDecisionPrompt(task);
      break;
    }
  }
  prompter.close();

  const remaining = tasks.filter((task) => task.state === 'unreviewed').length;
  console.log(`\n${remaining} unreviewed finding(s) left`);
}
