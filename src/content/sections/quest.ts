import { ActionResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { DslError, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { indentLines, RawLine, requireNoBlock, takeBlock } from '../../grammar/structure';
import { lastSegment, text } from '../../grammar/values';
import { overlay } from '../merge';
import { condition as visitCondition, put, results, type Visit } from '../refs';
import { Dialogue, DialogueNode, nodeBody, nodeGrammar, parseNode, visitDialogue } from './dialogue';
import { section } from './define';

export const QUEST_STANDINGS = ['unstarted', 'started', 'complete'] as const;

export type QuestStanding = (typeof QUEST_STANDINGS)[number];

export interface QuestSpeech {
  owner: string;
  node: DialogueNode;
}

export interface QuestStage {
  name: string;
  removed?: true;
  log?: ActionResult;
  doneWhen?: Condition;
  goto?: string;
  complete?: boolean;
  speech: QuestSpeech[];
}

export interface Quest {
  id: string;
  title?: string;
  endless?: true;
  log?: ActionResult;
  stages: QuestStage[];
  flags: string[];
}

const TITLE = /^title:[ \t]?(?<said>.*)$/;
const STAGE = /^stage[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const UNSTAGE = /^-[ \t]*stage[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const LOG = /^log:[ \t]?(?<said>.*)$/;
const DONE = /^done when:[ \t]*(?<cond>.+)$/;
const GOTO = /^goto[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const SAYS = /^(?<owner>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)[ \t]+says:$/;

const NEVER_ENDS = 'never ends';

const spoken = (said: string): ActionResult => ({ kind: 'say', text: said });

const spokenHere = (held: { log?: ActionResult }): ActionResult[] => (held.log === undefined ? [] : [held.log]);

function takeLog(line: RawLine, held: { log?: ActionResult }): boolean {
  const log = LOG.exec(line.text)?.groups;
  if (!log) return false;
  if (held.log !== undefined) throw new DslError('log: is defined more than once', line.span);
  held.log = spoken(log.said!);
  return true;
}

function parseStage(name: string, source: RawLine): QuestStage {
  const stage: QuestStage = { name, speech: [] };
  for (const line of takeBlock(source)) {
    if (takeLog(line, stage)) continue;
    const done = DONE.exec(line.text)?.groups;
    const goto = GOTO.exec(line.text)?.groups;
    const says = SAYS.exec(line.text)?.groups;
    if (done) stage.doneWhen = parseWhole(condition, done.cond!, line.span.start, 'a done when');
    else if (goto) stage.goto = goto.name;
    else if (line.text === 'complete') stage.complete = true;
    else if (says) stage.speech.push({ owner: says.owner!, node: parseNode(SAID_NODE, line) });
    else throw new DslError(`unexpected line in a quest stage: ${JSON.stringify(line.text)}`, line.span);
  }
  return stage;
}

const said = (result: ActionResult): string => (result.kind === 'say' ? result.text : '');

const stageLines = (stage: QuestStage): string[] => [
  `stage ${stage.name}:`,
  ...(stage.log === undefined ? [] : [`  log: ${said(stage.log)}`]),
  ...(stage.doneWhen === undefined ? [] : [`  done when: ${condition.print(stage.doneWhen)}`]),
  ...(stage.goto === undefined ? [] : [`  goto ${stage.goto}`]),
  ...(stage.complete ? ['  complete'] : []),
  ...stage.speech.flatMap((each) => [`  ${each.owner} says:`, ...indentLines(nodeBody(each.node), 2)]),
];

const flagOf = (quest: { id: string }, stage: string): string => `${quest.id}.${stage}`;

const names = (id: string): Condition => ({ kind: 'reference', reference: { path: id.split('.') } });
const not = (held: Condition): Condition => ({ kind: 'not', condition: held });
const all = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'and', conditions: held });

const any = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'or', conditions: held });

function byItself(quest: Quest, at: number, held: Map<number, Condition | undefined>): Condition[] {
  const stage = quest.stages[at]!;
  return quest.stages.flatMap((each, from) => {
    if (each.goto !== stage.name || each.doneWhen === undefined) return [];
    const before = reachedWhen(quest, from, held);
    return [all([...(before === undefined ? [] : [before]), each.doneWhen])!];
  });
}

function reachedWhen(quest: Quest, at: number, held: Map<number, Condition | undefined>): Condition | undefined {
  if (at === 0) return undefined;
  if (held.has(at)) return held.get(at);
  held.set(at, names(flagOf(quest, quest.stages[at]!.name)));
  const answer = any([names(flagOf(quest, quest.stages[at]!.name)), ...byItself(quest, at, held)]);
  held.set(at, answer);
  return answer;
}

export function reachedByItself(quest: Quest, stage: string): Condition | undefined {
  const at = quest.stages.findIndex((each) => each.name === stage);
  return at <= 0 ? undefined : any(byItself(quest, at, new Map()));
}

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

export function stageNow(quest: Quest, holds: (asked: Condition) => boolean): QuestStage | undefined {
  return quest.stages.find((_, at) => {
    const when = whileOn(quest, at);
    return when === undefined || holds(when);
  });
}

export function stagesReached(quest: Quest, holds: (asked: Condition) => boolean): QuestStage[] {
  const held = new Map<number, Condition | undefined>();
  return quest.stages.filter((_, at) => {
    const when = reachedWhen(quest, at, held);
    return when === undefined || holds(when);
  });
}

export const begun = (quest: Quest, at: QuestStage | undefined, set: (flag: string) => boolean): boolean => (at !== undefined && at !== quest.stages[0]) || quest.stages.some((stage) => set(flagOf(quest, stage.name)));

const reaching = (quest: Quest, stage: string): ActionResult => ({ kind: 'set', variable: flagOf(quest, stage) });

const otherwise = (stage: QuestStage, speech: QuestSpeech): Condition[] =>
  speech.node.when !== undefined
    ? []
    : stage.speech.filter((each) => each !== speech && each.owner === speech.owner && each.node.when !== undefined).map((each) => not(each.node.when!));

function saidAt(quest: Quest, at: number, speech: QuestSpeech, said: number, reached: Condition | undefined): Dialogue {
  const node = speech.node;
  const stage = quest.stages[at]!;
  const gone = (target: string | undefined): ActionResult[] => (target === undefined ? [] : [reaching(quest, target)]);
  const opening = at === 0 ? [{ kind: 'effect' as const, result: reaching(quest, stage.name) }] : [];
  return {
    id: questThread(quest.id, stage.name, lastSegment(speech.owner), said),
    owner: speech.owner,
    fromQuest: quest.id,
    nodes: [
      {
        ...node,
        when: all([...(reached === undefined ? [] : [reached]), ...(node.when === undefined ? [] : [node.when]), ...otherwise(stage, speech)]),
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

export const questDialogues = (quest: Quest): Dialogue[] => quest.stages.flatMap((stage, at) => stage.speech.map((speech, said) => saidAt(quest, at, speech, said, whileOn(quest, at))));

const leavesOf = (stage: QuestStage): string[] =>
  [stage.goto, ...stage.speech.flatMap((each) => each.node.steps.flatMap((step) => (step.kind === 'goto' ? [step.target] : step.kind === 'menu' ? step.choices.map((choice) => choice.goto) : [])))].filter((each): each is string => each !== undefined);

const stageProblem = (quest: Quest, stage: QuestStage): string | undefined => {
  const named = new Set(quest.stages.map((each) => each.name));
  const leaves = leavesOf(stage);
  for (const target of leaves) if (!named.has(target)) return `stage ${stage.name} goes to ${target}, which is no stage of this quest`;
  if (stage.doneWhen !== undefined && stage.goto === undefined) return `stage ${stage.name} says when it is done and not where that leaves the quest, so write a goto beside it`;
  if (stage.complete) return leaves.length === 0 ? undefined : `stage ${stage.name} completes the quest and also goes somewhere, and it cannot do both`;
  return leaves.length === 0 ? `nothing leaves stage ${stage.name}: give it a goto, a line that goes somewhere, or \`complete\`` : undefined;
};

const onwardFrom = (quest: Quest, at: number): number[] => leavesOf(quest.stages[at]!).map((target) => quest.stages.findIndex((each) => each.name === target)).filter((to) => to > at);

function finishableFrom(quest: Quest): boolean[] {
  const can: boolean[] = [];
  for (let at = quest.stages.length - 1; at >= 0; at -= 1) can[at] = quest.stages[at]!.complete === true || onwardFrom(quest, at).some((to) => can[to] === true);
  return can;
}

const stuckAt = (quest: Quest, at: number): string | undefined => {
  const stage = quest.stages[at]!;
  const target = leavesOf(stage).find((each) => quest.stages.findIndex((one) => one.name === each) < at);
  return target === undefined ? undefined : `stage ${stage.name} goes back to ${target}, which is written before it, and a quest only ever moves on to a stage written after the one it stands on, so reaching ${target} would leave it standing on ${stage.name}. Write ${target} after ${stage.name}`;
};

export const SAID_NODE = 'said';

export const questThread = (quest: string, stage: string, entity: string, said: number | string): string => `${quest}.${stage}.${entity}.${String(said)}`;

const THREAD = `${questThread('<quest>', '<stage>', '<entity>', '<n>')}.${SAID_NODE}`;

const STAGE_NOTE = `a step of the quest, which declares the flag \`${flagOf({ id: '<quest>' }, '<stage>')}\`. The first stage written stands from the outset and nothing has to start the quest — speaking a line under that stage is what begins it. A quest only ever moves on to a stage written after the one it stands on, so write the stages in the order they happen`;

const SAYS_NOTE = `what that entity says while the quest stands here; where a stage gives one entity more than one, the line with no \`when:\` of its own is what they say while none of the others applies. Each mints a thread addressed \`${THREAD}\`, counting from 0 in the order they are written, which is the name a \`choose:\` in a # test calls for when a quest thread is open beside the entity's own`;

const DONE_WHEN_NOTE = 'the quest leaves this stage on its own once this holds';

function questProblem(quest: Quest): string | undefined {
  if (quest.stages.length === 0) return 'a quest is its stages, and this one has none';
  const named = quest.stages.map((stage) => stageProblem(quest, stage)).find((problem) => problem !== undefined);
  if (named !== undefined) return named;
  const stuck = quest.stages.map((_, at) => stuckAt(quest, at)).find((problem) => problem !== undefined);
  if (stuck !== undefined) return stuck;
  const ends = quest.stages.filter((stage) => stage.complete);
  if (quest.endless) return ends.length === 0 ? undefined : `the quest says it \`${NEVER_ENDS}\` and stage ${ends[0]!.name} completes it, and it cannot do both`;
  const can = finishableFrom(quest);
  const dead = quest.stages.find((_, at) => !can[at]);
  return dead === undefined ? undefined : `the quest cannot be completed from stage ${dead.name}: nothing it goes on to reaches a \`complete\`. Write \`${NEVER_ENDS}\` on the quest if it is meant to stand forever`;
}

const withFlags = (quest: Quest): Quest => ({ ...quest, flags: quest.stages.filter((stage) => stage.removed === undefined).map((stage) => stage.name) });

function merged(into: Quest | undefined, from: Quest): Quest {
  const held = into ?? { id: from.id, stages: [], flags: [] };
  let stages = [...held.stages];
  for (const stage of from.stages) {
    if (stage.removed) {
      stages = stages.filter((each) => each.name !== stage.name);
      continue;
    }
    const at = stages.findIndex((each) => each.name === stage.name);
    if (at === -1) stages.push(stage);
    else stages[at] = overlay(stages[at] as unknown as Record<string, unknown>, stage as unknown as Record<string, unknown>) as unknown as QuestStage;
  }
  return withFlags({ ...held, ...(from.title === undefined ? {} : { title: from.title }), ...(from.log === undefined ? {} : { log: from.log }), ...(from.endless === undefined ? {} : { endless: from.endless }), stages });
}

export const quest = section<Quest>()({
  kind: 'quest',
  ids: 'owned',
  vocabulary: 'declared',
  text: ['title'],
  maps: {
    quests: (value) => [[value.id, value]],
    dialogues: (value) => questDialogues(value).map((each) => [each.id, each] as const),
  },
  says: (value) => [spokenHere(value), ...value.stages.map(spokenHere)],
  grammar: [
    { form: 'title: <text>', example: 'title: Finding Your Feet' },
    { form: 'log: <text>', example: 'log: They say a guide keeps this house, and takes newcomers in hand.', family: 'before it begins', note: 'what the journal reads before the quest has begun' },
    { form: NEVER_ENDS, example: NEVER_ENDS, note: 'the quest has no `complete` because it is meant to stand open forever. A quest no stage completes is otherwise refused' },
    {
      form: 'stage <name>:',
      example: 'stage offered:',
      over: 'by name',
      note: STAGE_NOTE,
      block: (): Written[] => [
        { form: 'log: <text>', example: 'log: A guide called Miki offered to show me the ropes.', family: 'what the journal says', note: "the player's own note of what happened while the quest stood here" },
        { form: 'done when: <condition>', example: 'done when: rats-killed >= 3', family: 'where it goes', holds: () => ({ condition }), note: DONE_WHEN_NOTE },
        { form: 'goto <stage>', example: 'goto sendoff', family: 'where it goes' },
        { form: 'complete', example: 'complete', family: 'where it goes', note: 'the quest is done when it reaches here' },
        { form: '<entity> says:', example: 'miki says:', family: 'what is said here', names: { entity: 'entity' }, note: SAYS_NOTE, block: () => nodeGrammar({ hole: 'stage', like: 'sendoff' }) },
      ],
    },
  ],
  validate: questProblem,
  merge: (into, from) => merged(into as Quest | undefined, from as Quest),
  parse: (raw) => {
    if (!raw.id) throw new DslError('# quest requires an id', raw.span);
    const parsed: Quest = { id: raw.id, stages: [], flags: [] };
    for (const line of raw.body) {
      if (takeLog(line, parsed)) continue;
      const title = TITLE.exec(line.text)?.groups;
      const stage = STAGE.exec(line.text)?.groups;
      const unstage = UNSTAGE.exec(line.text)?.groups;
      if (line.text === NEVER_ENDS) {
        requireNoBlock(line);
        parsed.endless = true;
      }
      else if (title) parsed.title = parseWhole(text, title.said!, line.span.start, 'a quest title');
      else if (stage) {
        if (parsed.stages.some((each) => each.removed === undefined && each.name === stage.name)) throw new DslError(`stage ${stage.name} is written twice`, line.span);
        parsed.stages.push(parseStage(stage.name!, line));
      }
      else if (unstage) {
        requireNoBlock(line);
        parsed.stages.push({ name: unstage.name!, removed: true, speech: [] });
      }
      else throw new DslError(`unexpected line in # quest: ${JSON.stringify(line.text)}`, line.span);
    }
    return withFlags(parsed);
  },
  print: (value, { moduleId }) => [
    `# quest ${moduleLocalId(moduleId, value.id)}`,
    ...(value.title === undefined ? [] : [`title: ${value.title}`]),
    ...(value.log === undefined ? [] : [`log: ${said(value.log)}`]),
    ...(value.endless ? [NEVER_ENDS] : []),
    ...value.stages.flatMap((stage) => ['', ...stageLines(stage)]),
  ],
  visit: (value, where, visit: Visit) => {
    results(spokenHere(value), where, visit);
    for (const stage of value.stages) {
      const at = `${where} stage ${stage.name}`;
      visitCondition(stage.doneWhen, `${at} done when:`, visit);
      results(spokenHere(stage), at, visit);
      for (const speech of stage.speech) {
        put(speech as unknown as Record<string, unknown>, 'owner', 'entity', `${at} says`, visit);
        visitDialogue({ id: value.id, nodes: [speech.node] }, at, visit);
      }
    }
  },
});
