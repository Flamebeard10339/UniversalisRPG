import { ActionResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { DslError, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { indentLines, RawLine, takeBlock } from '../../grammar/structure';
import { lastSegment, text } from '../../grammar/values';
import { put, results, type Visit } from '../refs';
import { Dialogue, DialogueNode, nodeBody, nodeGrammar, parseNode, visitDialogue } from './dialogue';
import { section } from './define';

// What one NPC is given to say while a stage is the one the player is on.
export interface QuestSpeech {
  owner: string;
  node: DialogueNode;
}

export interface QuestStage {
  name: string;
  // Held as spoken lines rather than as plain strings: a journal entry is said to a player, so it is addressed and translated like every other line the game says.
  log?: ActionResult;
  hint?: ActionResult;
  doneWhen?: Condition;
  goto?: string;
  complete?: boolean;
  speech: QuestSpeech[];
}

export interface Quest {
  id: string;
  title?: string;
  stages: QuestStage[];
  // A flag per stage, which is how the rest of the world names where a quest has got to. Derived from the stages, so nothing declares it twice.
  flags: string[];
}

const TITLE = /^title:[ \t]?(?<said>.*)$/;
const STAGE = /^stage[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const LOG = /^log:[ \t]?(?<said>.*)$/;
const HINT = /^hint:[ \t]?(?<said>.*)$/;
const DONE = /^done when:[ \t]*(?<cond>.+)$/;
const GOTO = /^goto[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const SAYS = /^(?<owner>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)[ \t]+says:$/;

const spoken = (said: string): ActionResult => ({ kind: 'say', text: said });

function parseStage(name: string, source: RawLine): QuestStage {
  const stage: QuestStage = { name, speech: [] };
  for (const line of takeBlock(source)) {
    const log = LOG.exec(line.text)?.groups;
    const hint = HINT.exec(line.text)?.groups;
    const done = DONE.exec(line.text)?.groups;
    const goto = GOTO.exec(line.text)?.groups;
    const says = SAYS.exec(line.text)?.groups;
    if (log) stage.log = spoken(log.said!);
    else if (hint) stage.hint = spoken(hint.said!);
    else if (done) stage.doneWhen = parseWhole(condition, done.cond!, line.span.start, 'a done when');
    else if (goto) stage.goto = goto.name;
    else if (line.text === 'complete') stage.complete = true;
    else if (says) stage.speech.push({ owner: says.owner!, node: parseNode('said', line) });
    else throw new DslError(`unexpected line in a quest stage: ${JSON.stringify(line.text)}`, line.span);
  }
  return stage;
}

const stageLines = (stage: QuestStage): string[] => [
  `stage ${stage.name}:`,
  ...(stage.log === undefined ? [] : [`  log: ${stage.log.kind === 'say' ? stage.log.text : ''}`]),
  ...(stage.hint === undefined ? [] : [`  hint: ${stage.hint.kind === 'say' ? stage.hint.text : ''}`]),
  ...(stage.doneWhen === undefined ? [] : [`  done when: ${condition.print(stage.doneWhen)}`]),
  ...(stage.goto === undefined ? [] : [`  goto ${stage.goto}`]),
  ...(stage.complete ? ['  complete'] : []),
  ...stage.speech.flatMap((each) => [`  ${each.owner} says:`, ...indentLines(nodeBody(each.node), 2)]),
];

const flagOf = (quest: Quest, stage: string): string => `${quest.id}.${stage}`;

const names = (id: string): Condition => ({ kind: 'reference', reference: { path: id.split('.') } });
const not = (held: Condition): Condition => ({ kind: 'not', condition: held });
const all = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'and', conditions: held });

// When a stage is the one the player is standing on: its own flag is set, and nothing it leads to has been reached yet. The first stage stands before the quest has begun, so it asks only that nothing has moved past it.
function whileOn(quest: Quest, at: number): Condition | undefined {
  const stage = quest.stages[at]!;
  const past = quest.stages.slice(at + 1).map((each) => not(names(flagOf(quest, each.name))));
  return all(at === 0 ? past : [names(flagOf(quest, stage.name)), ...past]);
}

// A goto inside a quest names a stage, so the line that takes it sets that stage's flag. Nothing else in the language moves a quest along, and nothing else needs to.
const reaching = (quest: Quest, stage: string): ActionResult => ({ kind: 'set', variable: flagOf(quest, stage) });

function saidAt(quest: Quest, at: number, speech: QuestSpeech, reached: Condition | undefined): Dialogue {
  const node = speech.node;
  const stage = quest.stages[at]!;
  const gone = (target: string | undefined): ActionResult[] => (target === undefined ? [] : [reaching(quest, target)]);
  return {
    id: `${quest.id}.${stage.name}.${lastSegment(speech.owner)}`,
    owner: speech.owner,
    nodes: [
      {
        ...node,
        when: all([...(reached === undefined ? [] : [reached]), ...(node.when === undefined ? [] : [node.when])]),
        steps: node.steps.map((step) =>
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
export const questDialogues = (quest: Quest): Dialogue[] => quest.stages.flatMap((stage, at) => stage.speech.map((speech) => saidAt(quest, at, speech, whileOn(quest, at))));

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
  says: (value) => value.stages.map((stage) => [stage.log, stage.hint].filter((said): said is ActionResult => said !== undefined)),
  grammar: [
    { form: 'title: <text>', example: 'title: Finding Your Feet' },
    {
      form: 'stage <name>:',
      example: 'stage offered:',
      block: (): Written[] => [
        { form: 'log: <text>', example: 'log: Miki offered to show you the ropes.', family: 'what the journal says', note: 'what the journal reads while the quest stands here' },
        { form: 'hint: <text>', example: 'hint: Talk to Miki in the guide house.', family: 'what the journal says' },
        { form: 'done when: <condition>', example: 'done when: rats-killed >= 3', family: 'where it goes', holds: () => ({ condition }), note: 'the quest leaves this stage on its own once this holds' },
        { form: 'goto <stage>', example: 'goto sendoff', family: 'where it goes' },
        { form: 'complete', example: 'complete', family: 'where it goes', note: 'the quest is done when it reaches here' },
        { form: '<entity> says:', example: 'miki says:', family: 'what is said here', names: { entity: 'entity' }, note: 'lines that entity speaks while the quest stands here, written as a dialogue node is', block: nodeGrammar },
      ],
    },
  ],
  validate: questProblem,
  parse: (raw) => {
    if (!raw.id) throw new DslError('# quest requires an id', raw.span);
    const parsed: Quest = { id: raw.id, stages: [], flags: [] };
    for (const line of raw.body) {
      const title = TITLE.exec(line.text)?.groups;
      const stage = STAGE.exec(line.text)?.groups;
      if (title) parsed.title = parseWhole(text, title.said!, line.span.start, 'a quest title');
      else if (stage) parsed.stages.push(parseStage(stage.name!, line));
      else throw new DslError(`unexpected line in # quest: ${JSON.stringify(line.text)}`, line.span);
    }
    parsed.flags = parsed.stages.map((each) => each.name);
    return parsed;
  },
  print: (value, { moduleId }) => [
    `# quest ${moduleLocalId(moduleId, value.id)}`,
    ...(value.title === undefined ? [] : [`title: ${value.title}`]),
    ...value.stages.flatMap((stage) => ['', ...stageLines(stage)]),
  ],
  visit: (value, where, visit: Visit) => {
    for (const stage of value.stages) {
      const at = `${where} stage ${stage.name}`;
      results([stage.log, stage.hint].filter((said): said is ActionResult => said !== undefined), at, visit);
      for (const speech of stage.speech) {
        put(speech as unknown as Record<string, unknown>, 'owner', 'entity', `${at} says`, visit);
        visitDialogue({ id: value.id, nodes: [speech.node] }, at, visit);
      }
    }
  },
});
