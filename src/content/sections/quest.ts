import { ActionResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { DslError, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { indentLines, RawLine, takeBlock } from '../../grammar/structure';
import { lastSegment, text } from '../../grammar/values';
import { condition as visitCondition, put, results, type Visit } from '../refs';
import { Dialogue, DialogueNode, nodeBody, nodeGrammar, parseNode, visitDialogue } from './dialogue';
import { section } from './define';

// What one NPC is given to say while a stage is the one the player is on.
export interface QuestSpeech {
  owner: string;
  node: DialogueNode;
}

// What to do next, and when that is what there is to do. A stage is left by a line an entity says as often as by a `done when:`, so one stage spans more than one beat — do the thing, then go back and tell them — and no single string is right in both.
export interface QuestHint {
  when?: Condition;
  said: ActionResult;
}

export interface QuestStage {
  name: string;
  // Held as spoken lines rather than as plain strings: a journal entry is said to a player, so it is addressed and translated like every other line the game says.
  log?: ActionResult;
  hints: QuestHint[];
  doneWhen?: Condition;
  goto?: string;
  complete?: boolean;
  speech: QuestSpeech[];
}

export interface Quest {
  id: string;
  title?: string;
  // What the journal reads before the quest has begun, and what to do to begin it. A stage's own log says what has happened; these say what has not.
  log?: ActionResult;
  hints: QuestHint[];
  stages: QuestStage[];
  // A flag per stage, which is how the rest of the world names where a quest has got to. Derived from the stages, so nothing declares it twice.
  flags: string[];
}

const TITLE = /^title:[ \t]?(?<said>.*)$/;
const STAGE = /^stage[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const LOG = /^log:[ \t]?(?<said>.*)$/;
const HINT = /^hint:[ \t]?(?<said>.*)$/;
// The condition sits before the colon because everything after a colon in this language is the value, and a hint's value is the words. No condition holds a colon, so the first one splits the line.
const HINT_WHEN = /^hint when[ \t]+(?<cond>[^:]+):[ \t]?(?<said>.*)$/;
const DONE = /^done when:[ \t]*(?<cond>.+)$/;
const GOTO = /^goto[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const SAYS = /^(?<owner>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)[ \t]+says:$/;

const spoken = (said: string): ActionResult => ({ kind: 'say', text: said });

// Every line the journal can read off a quest or off one of its stages, in the order it is written, which is the order they are keyed and reviewed in.
const spokenHere = (held: { log?: ActionResult; hints: readonly QuestHint[] }): ActionResult[] => [...(held.log === undefined ? [] : [held.log]), ...held.hints.map((hint) => hint.said)];

// A hint line, wherever it is written: the quest's own and a stage's are the same line and answer the same question, one about a quest nobody has begun and one about where it stands.
function takeHint(line: RawLine, into: QuestHint[]): boolean {
  const plain = HINT.exec(line.text)?.groups;
  if (plain) {
    into.push({ said: spoken(plain.said!) });
    return true;
  }
  const gated = HINT_WHEN.exec(line.text)?.groups;
  if (!gated) return false;
  into.push({ when: parseWhole(condition, gated.cond!.trim(), line.span.start, 'a hint when'), said: spoken(gated.said!) });
  return true;
}

function parseStage(name: string, source: RawLine): QuestStage {
  const stage: QuestStage = { name, hints: [], speech: [] };
  for (const line of takeBlock(source)) {
    if (takeHint(line, stage.hints)) continue;
    const log = LOG.exec(line.text)?.groups;
    const done = DONE.exec(line.text)?.groups;
    const goto = GOTO.exec(line.text)?.groups;
    const says = SAYS.exec(line.text)?.groups;
    if (log) stage.log = spoken(log.said!);
    else if (done) stage.doneWhen = parseWhole(condition, done.cond!, line.span.start, 'a done when');
    else if (goto) stage.goto = goto.name;
    else if (line.text === 'complete') stage.complete = true;
    else if (says) stage.speech.push({ owner: says.owner!, node: parseNode('said', line) });
    else throw new DslError(`unexpected line in a quest stage: ${JSON.stringify(line.text)}`, line.span);
  }
  return stage;
}

const said = (result: ActionResult): string => (result.kind === 'say' ? result.text : '');

const hintLines = (hints: readonly QuestHint[]): string[] => hints.map((hint) => (hint.when === undefined ? `hint: ${said(hint.said)}` : `hint when ${condition.print(hint.when)}: ${said(hint.said)}`));

const stageLines = (stage: QuestStage): string[] => [
  `stage ${stage.name}:`,
  ...(stage.log === undefined ? [] : [`  log: ${stage.log.kind === 'say' ? stage.log.text : ''}`]),
  ...indentLines(hintLines(stage.hints), 2),
  ...(stage.doneWhen === undefined ? [] : [`  done when: ${condition.print(stage.doneWhen)}`]),
  ...(stage.goto === undefined ? [] : [`  goto ${stage.goto}`]),
  ...(stage.complete ? ['  complete'] : []),
  ...stage.speech.flatMap((each) => [`  ${each.owner} says:`, ...indentLines(nodeBody(each.node), 2)]),
];

const flagOf = (quest: Quest, stage: string): string => `${quest.id}.${stage}`;

const names = (id: string): Condition => ({ kind: 'reference', reference: { path: id.split('.') } });
const not = (held: Condition): Condition => ({ kind: 'not', condition: held });
const all = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'and', conditions: held });

const any = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'or', conditions: held });

// When a stage has been reached: its flag is set, or a stage that leads to it on its own is reached and its `done when:` holds. The first stage is reached from the outset, which is what makes a quest readable before anything of it has happened, and is written here as no condition at all.
function reachedWhen(quest: Quest, at: number, held: Map<number, Condition | undefined>): Condition | undefined {
  if (at === 0) return undefined;
  if (held.has(at)) return held.get(at);
  held.set(at, names(flagOf(quest, quest.stages[at]!.name)));
  const stage = quest.stages[at]!;
  const byItself = quest.stages.flatMap((each, from) => {
    if (each.goto !== stage.name || each.doneWhen === undefined) return [];
    const before = reachedWhen(quest, from, held);
    return [all([...(before === undefined ? [] : [before]), each.doneWhen])!];
  });
  const answer = any([names(flagOf(quest, stage.name)), ...byItself]);
  held.set(at, answer);
  return answer;
}

// When a stage is the one the player is standing on: it has been reached, it is not done, and nothing further along has been reached either.
function whileOn(quest: Quest, at: number): Condition | undefined {
  const held = new Map<number, Condition | undefined>();
  const here = reachedWhen(quest, at, held);
  const stage = quest.stages[at]!;
  const past = quest.stages.slice(at + 1).flatMap((_, after) => {
    const reached = reachedWhen(quest, at + 1 + after, held);
    return reached === undefined ? [] : [not(reached)];
  });
  return all([...(here === undefined ? [] : [here]), ...(stage.doneWhen === undefined ? [] : [not(stage.doneWhen)]), ...past]);
}

// Where a quest stands, out of every stage it declares. Exactly one holds where the quest has begun and is not finished; the rule is the same one the lines are gated by, asked here rather than compiled into a dialogue.
export function stageNow(quest: Quest, holds: (asked: Condition) => boolean): QuestStage | undefined {
  return quest.stages.find((_, at) => {
    const when = whileOn(quest, at);
    return when === undefined || holds(when);
  });
}

// Every stage the quest has actually been through, in the order it declares them. A quest that branches has not been through the branch it did not take, so this asks each stage whether it was reached rather than counting up to the one standing.
export function stagesReached(quest: Quest, holds: (asked: Condition) => boolean): QuestStage[] {
  const held = new Map<number, Condition | undefined>();
  return quest.stages.filter((_, at) => {
    const when = reachedWhen(quest, at, held);
    return when === undefined || holds(when);
  });
}

// What there is left to do, out of every hint written where the game is standing: the last one whose condition holds, so a plain `hint:` is the default and each `hint when` under it is an exception to it. Asked the same way `stageNow` is asked, because it is the same question about a smaller thing.
export const hintNow = (hints: readonly QuestHint[], holds: (asked: Condition) => boolean): ActionResult | undefined =>
  hints.reduce<ActionResult | undefined>((held, hint) => (hint.when === undefined || holds(hint.when) ? hint.said : held), undefined);

// Whether anything about this quest has happened yet. A quest nobody has touched is not a journal entry; its first stage stands from the outset, so standing anywhere else is enough, and so is any stage having been reached outright — which is how a quest driven by nothing but its own `done when:` lines comes to be in the journal at all.
export const begun = (quest: Quest, at: QuestStage | undefined, set: (flag: string) => boolean): boolean => (at !== undefined && at !== quest.stages[0]) || quest.stages.some((stage) => set(flagOf(quest, stage.name)));

// A goto inside a quest names a stage, so the line that takes it sets that stage's flag. Nothing else in the language moves a quest along, and nothing else needs to.
const reaching = (quest: Quest, stage: string): ActionResult => ({ kind: 'set', variable: flagOf(quest, stage) });

function saidAt(quest: Quest, at: number, speech: QuestSpeech, said: number, reached: Condition | undefined): Dialogue {
  const node = speech.node;
  const stage = quest.stages[at]!;
  const gone = (target: string | undefined): ActionResult[] => (target === undefined ? [] : [reaching(quest, target)]);
  // The first stage stands before anything has happened, so nothing has set its flag; speaking its lines is what starts the quest, and that is where the journal gets its first entry.
  const opening = at === 0 ? [{ kind: 'effect' as const, result: reaching(quest, stage.name) }] : [];
  return {
    // The place in the stage as well as who says it: one stage may give one entity more than one thing to say — a line for arriving and a line for coming back with the bread — and two dialogues under one id would be one dialogue.
    id: `${quest.id}.${stage.name}.${lastSegment(speech.owner)}.${said}`,
    owner: speech.owner,
    nodes: [
      {
        ...node,
        when: all([...(reached === undefined ? [] : [reached]), ...(node.when === undefined ? [] : [node.when])]),
        steps: [...opening, ...node.steps].map((step) =>
          step.kind === 'goto'
            ? { kind: 'effect' as const, result: reaching(quest, step.target) }
            : step.kind === 'menu'
              ? { ...step, choices: step.choices.map((choice) => ({ ...choice, goto: undefined, effects: [...choice.effects, ...gone(choice.goto)] })) }
              : step,
        ),
      },
    ],
  };
}

// Every dialogue a quest gives away. A stage's lines belong to the entity the stage names, so the entity says them without anything editing the entity or the dialogue it already had.
export const questDialogues = (quest: Quest): Dialogue[] => quest.stages.flatMap((stage, at) => stage.speech.map((speech, said) => saidAt(quest, at, speech, said, whileOn(quest, at))));

const stageProblem = (quest: Quest, stage: QuestStage): string | undefined => {
  const named = new Set(quest.stages.map((each) => each.name));
  const leaves = [stage.goto, ...stage.speech.flatMap((each) => each.node.steps.flatMap((step) => (step.kind === 'goto' ? [step.target] : step.kind === 'menu' ? step.choices.map((choice) => choice.goto) : [])))].filter(
    (each): each is string => each !== undefined,
  );
  for (const target of leaves) if (!named.has(target)) return `stage ${stage.name} goes to ${target}, which is no stage of this quest`;
  if (stage.doneWhen !== undefined && stage.goto === undefined) return `stage ${stage.name} says when it is done and not where that leaves the quest, so write a goto beside it`;
  if (stage.complete) return leaves.length === 0 ? undefined : `stage ${stage.name} completes the quest and also goes somewhere, and it cannot do both`;
  return leaves.length === 0 ? `nothing leaves stage ${stage.name}: give it a goto, a line that goes somewhere, or \`complete\`` : undefined;
};

// One line, said in both places a hint can be written, because it is the same rule in both.
const HINT_WHEN_NOTE = 'the last hint whose condition holds is the one shown, so a plain `hint:` written above is the default and each of these is an exception to it';

function questProblem(quest: Quest): string | undefined {
  if (quest.stages.length === 0) return 'a quest is its stages, and this one has none';
  const seen = new Set<string>();
  for (const stage of quest.stages) {
    if (seen.has(stage.name)) return `stage ${stage.name} is written twice`;
    seen.add(stage.name);
  }
  return quest.stages.map((stage) => stageProblem(quest, stage)).find((problem) => problem !== undefined);
}

export const quest = section<Quest>()({
  kind: 'quest',
  ids: 'owned',
  text: ['title'],
  maps: {
    quests: (value) => [[value.id, value]],
    dialogues: (value) => questDialogues(value).map((each) => [each.id, each] as const),
  },
  says: (value) => [spokenHere(value), ...value.stages.map(spokenHere)],
  grammar: [
    { form: 'title: <text>', example: 'title: Finding Your Feet' },
    { form: 'log: <text>', example: 'log: A guide on the island is said to take newcomers in hand.', family: 'before it begins', note: 'what the journal reads before the quest has begun' },
    { form: 'hint: <text>', example: 'hint: Talk to Miki in the guide house.', family: 'before it begins', note: 'what to do to begin it' },
    { form: 'hint when <condition>: <text>', example: 'hint when has core.lockpick: The front door is locked, and you have something that opens locks.', family: 'before it begins', holds: () => ({ condition }), note: HINT_WHEN_NOTE },
    {
      form: 'stage <name>:',
      example: 'stage offered:',
      block: (): Written[] => [
        { form: 'log: <text>', example: 'log: Miki offered to show you the ropes.', family: 'what the journal says', note: 'what the journal reads while the quest stands here' },
        { form: 'hint: <text>', example: 'hint: Talk to Miki in the guide house.', family: 'what the journal says' },
        { form: 'hint when <condition>: <text>', example: 'hint when has core.bread: Take the loaf back to Miki.', family: 'what the journal says', holds: () => ({ condition }), note: HINT_WHEN_NOTE },
        { form: 'done when: <condition>', example: 'done when: rats-killed >= 3', family: 'where it goes', holds: () => ({ condition }), note: 'the quest leaves this stage on its own once this holds' },
        { form: 'goto <stage>', example: 'goto sendoff', family: 'where it goes' },
        { form: 'complete', example: 'complete', family: 'where it goes', note: 'the quest is done when it reaches here' },
        { form: '<entity> says:', example: 'miki says:', family: 'what is said here', names: { entity: 'entity' }, note: 'lines that entity speaks while the quest stands here, written as a dialogue node is', block: () => nodeGrammar({ hole: 'stage', like: 'sendoff' }) },
      ],
    },
  ],
  validate: questProblem,
  parse: (raw) => {
    if (!raw.id) throw new DslError('# quest requires an id', raw.span);
    const parsed: Quest = { id: raw.id, hints: [], stages: [], flags: [] };
    for (const line of raw.body) {
      if (takeHint(line, parsed.hints)) continue;
      const title = TITLE.exec(line.text)?.groups;
      const log = LOG.exec(line.text)?.groups;
      const stage = STAGE.exec(line.text)?.groups;
      if (title) parsed.title = parseWhole(text, title.said!, line.span.start, 'a quest title');
      else if (log) parsed.log = spoken(log.said!);
      else if (stage) parsed.stages.push(parseStage(stage.name!, line));
      else throw new DslError(`unexpected line in # quest: ${JSON.stringify(line.text)}`, line.span);
    }
    parsed.flags = parsed.stages.map((each) => each.name);
    return parsed;
  },
  print: (value, { moduleId }) => [
    `# quest ${moduleLocalId(moduleId, value.id)}`,
    ...(value.title === undefined ? [] : [`title: ${value.title}`]),
    ...(value.log === undefined ? [] : [`log: ${value.log.kind === 'say' ? value.log.text : ''}`]),
    ...hintLines(value.hints),
    ...value.stages.flatMap((stage) => ['', ...stageLines(stage)]),
  ],
  visit: (value, where, visit: Visit) => {
    for (const hint of value.hints) visitCondition(hint.when, `${where} hint when`, visit);
    results(spokenHere(value), where, visit);
    for (const stage of value.stages) {
      const at = `${where} stage ${stage.name}`;
      visitCondition(stage.doneWhen, `${at} done when:`, visit);
      for (const hint of stage.hints) visitCondition(hint.when, `${at} hint when`, visit);
      results(spokenHere(stage), at, visit);
      for (const speech of stage.speech) {
        put(speech as unknown as Record<string, unknown>, 'owner', 'entity', `${at} says`, visit);
        visitDialogue({ id: value.id, nodes: [speech.node] }, at, visit);
      }
    }
  },
});
